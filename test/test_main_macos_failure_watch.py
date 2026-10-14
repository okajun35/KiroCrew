"""Contract tests for .github/workflows/main-macos-failure-watch.yml.

The merge queue verifies every test workflow on the merge group before a PR
lands, except the two hosted macOS legs, which run on main's post-merge push. A
red one reaches nobody on its own: GitHub e-mails the push actor, which for a
queued merge is the queue. The watcher is the pager for those two legs. Four
properties are pinned rather than assumed:

* WIRING -- the two watched names are the real ``name:`` of ``ci.yml`` and
  ``build.yml`` (a ``workflow_run`` trigger on a misspelt name never fires and
  never says so), and both still run a ``macos-*`` leg on the push path.
* GATING -- the job runs only for a PUSH to ``main`` that failed or timed out
  (never a cancelled one: the push path evicts its own pending run by design),
  with exactly the three permissions the step needs and no checkout.
* PAGING -- executed for real with ``gh`` stubbed: a red macOS job comments on
  the squash commit's PR tagging its author and opens a tracking issue assigned
  to that author; a run whose only red jobs are not macOS writes nothing; a
  commit without a trailing ``(#N)`` still files the issue, unassigned.
* DEDUPE -- a repeat bumps the open issue instead of filing a second, the bump
  is throttled to one per 6 hours counting only the watcher's own, and the
  selector picks the fixed title by equality, not by phrase.

Skipped where the POSIX toolchain the script needs is unavailable, matching the
guards in test_scheduled_failure_watch.py.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"
WATCHER = WORKFLOWS / "main-macos-failure-watch.yml"

# One ``gh`` invocation per record in the stub's log; bodies carry newlines.
_RECORD_SEPARATOR = "\x1e"

RUN_URL = "https://example.invalid/actions/runs/1"


def _load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _triggers(document: dict) -> dict:
    # PyYAML reads a bare ``on:`` key as the boolean True.
    return document.get("on") or document.get(True) or {}


def _watched_names() -> list[str]:
    return list(_triggers(_load(WATCHER))["workflow_run"]["workflows"])


def _job() -> dict:
    (job,) = _load(WATCHER)["jobs"].values()
    return job


def _step_script() -> str:
    (step,) = _job()["steps"]
    return step["run"]


# ── Wiring: the two names are real and still own a macOS leg ────────────────


def test_the_watched_names_are_the_two_workflows_with_a_macos_push_leg() -> None:
    names = {_load(WORKFLOWS / name)["name"] for name in ("ci.yml", "build.yml")}
    assert set(_watched_names()) == names
    assert len(_watched_names()) == len(names)


@pytest.mark.parametrize("name", ["ci.yml", "build.yml"])
def test_each_watched_workflow_runs_on_a_push_to_main(name: str) -> None:
    push = _triggers(_load(WORKFLOWS / name))["push"]
    assert push["branches"] == ["main"]


@pytest.mark.parametrize("name", ["ci.yml", "build.yml"])
def test_each_watched_workflow_still_has_a_macos_leg(name: str) -> None:
    """The watcher pages on jobs that asked for a ``macos-*`` runner. If both
    workflows stopped running one, the watcher would be dead code and this test
    says so before a red leg does."""
    assert "macos-15" in (WORKFLOWS / name).read_text(encoding="utf-8")


def test_the_watcher_fires_only_on_completion() -> None:
    assert _triggers(_load(WATCHER))["workflow_run"]["types"] == ["completed"]


# ── Gating and least privilege ───────────────────────────────────────────────


def test_the_job_is_gated_on_a_red_or_timed_out_push_to_main() -> None:
    condition = " ".join(str(_job()["if"]).split())
    assert "github.event.workflow_run.event == 'push'" in condition
    assert "github.event.workflow_run.head_branch == 'main'" in condition
    assert "github.event.workflow_run.conclusion == 'failure'" in condition
    # A workflow-level `timeout-minutes` reports `timed_out`, not `failure`.
    assert "github.event.workflow_run.conclusion == 'timed_out'" in condition
    assert "'success'" not in condition
    # The push path evicts its own pending run when the queue variable is unset;
    # a cancelled push run is a collapse, not a mac red.
    assert "cancelled" not in condition


def test_the_step_counts_only_macos_jobs_by_runner_label() -> None:
    script = _step_script()
    assert "actions/runs/$RUN_ID/jobs" in script
    assert 'startswith("macos")' in script
    assert ".labels" in script


def test_the_permissions_are_exactly_what_the_step_needs() -> None:
    document = _load(WATCHER)
    assert document["permissions"] == {
        "actions": "read",
        "issues": "write",
        "pull-requests": "read",
    }
    assert "permissions" not in _job()


def test_the_watcher_never_checks_out_or_runs_source_code() -> None:
    job = _job()
    for step in job["steps"]:
        assert "uses" not in step, step
    assert job["runs-on"] == "ubuntu-latest"
    assert job["timeout-minutes"] <= 10


def test_the_commit_message_is_read_from_the_environment_not_interpolated() -> None:
    """A PR title is attacker-influenced text; it must reach the script as an
    environment variable, never as a ``${{ }}`` expansion inside ``run:``."""
    (step,) = _job()["steps"]
    assert step["env"]["HEAD_MESSAGE"] == "${{ github.event.workflow_run.head_commit.message }}"
    assert "${{" not in step["run"]


def test_a_running_watcher_is_never_killed_by_the_next_completion() -> None:
    concurrency = _load(WATCHER)["concurrency"]
    assert concurrency["cancel-in-progress"] is False
    assert "github.event.workflow_run.name" in concurrency["group"]


def test_the_dedupe_lookup_never_goes_through_the_search_index() -> None:
    script = _step_script()
    assert "--search" not in script
    assert "--label main-macos-failure" in script


# ── Paging and dedupe, executed for real ─────────────────────────────────────


def _has_gnu_date() -> bool:
    if shutil.which("date") is None:
        return False
    probe = subprocess.run(
        ["date", "-u", "-d", "6 hours ago", "+%Y-%m-%dT%H:%M:%SZ"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return probe.returncode == 0


pytestmark_posix = pytest.mark.skipif(
    os.name == "nt"
    or shutil.which("bash") is None
    or shutil.which("jq") is None
    or not _has_gnu_date(),
    reason="requires a POSIX bash, jq and GNU date to execute the step script",
)


def _jobs(*rows: tuple[str, str, str]) -> str:
    return json.dumps(
        {"jobs": [{"name": n, "conclusion": c, "labels": [label]} for n, c, label in rows]}
    )


MAC_RED = _jobs(
    ("Build Desktop (macos-15)", "failure", "macos-15"),
    ("Build Desktop (ubuntu-22.04)", "success", "ubuntu-22.04"),
    ("Resolve desktop matrix", "success", "ubuntu-latest"),
)
LINUX_ONLY_RED = _jobs(
    ("Build Desktop (macos-15)", "success", "macos-15"),
    ("Build Desktop (ubuntu-22.04)", "failure", "ubuntu-22.04"),
)


def _run_step(
    tmp_path: Path,
    *,
    jobs_json: str = MAC_RED,
    head_message: str = "fix(desktop): keep the dock icon (#4242)\n\nbody text",
    open_reply: str = "",
    closed_reply: str = "",
    list_exit: int = 0,
    comments_json: str = "[]",
    pr_author: str = "octocat",
    conclusion: str = "failure",
) -> tuple[subprocess.CompletedProcess, list[str]]:
    """Run the step with a ``gh`` stub that answers every call the step makes.

    ``api .../jobs`` answers ``jobs_json`` through the step's own ``--jq``
    filter; ``api .../pulls/N`` answers ``pr_author``; ``issue list`` answers
    ``open_reply`` / ``closed_reply`` with ``list_exit`` as the ALREADY-SELECTED
    value (the title selector is evaluated on its own, below, with ``jq``);
    ``api .../comments?``
    answers ``comments_json`` through the step's own filter; ``issue create``
    prints an issue URL. Every invocation is recorded as one ``"$*"`` string.
    """
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    log = tmp_path / "gh.log"
    (tmp_path / "jobs.json").write_text(jobs_json, encoding="utf-8")
    (tmp_path / "comments.json").write_text(comments_json, encoding="utf-8")
    gh = stubs / "gh"
    gh.write_text(
        "#!/usr/bin/env bash\n"
        f'printf \'%s{_RECORD_SEPARATOR}\' "$*" >> "{log}"\n'
        "jq_filter() {\n"
        '  while [ "$#" -gt 0 ]; do\n'
        '    if [ "$1" = "--jq" ]; then printf \'%s\' "$2"; return; fi\n'
        "    shift\n"
        "  done\n"
        "}\n"
        'if [ "$1 $2" = "label create" ]; then exit 0; fi\n'
        'if [ "$1 $2" = "issue list" ]; then\n'
        '  case " $* " in\n'
        f"    *\" --state open \"*) printf '%s' '{open_reply}' ;;\n"
        f"    *\" --state closed \"*) printf '%s' '{closed_reply}' ;;\n"
        "  esac\n"
        f"  exit {list_exit}\n"
        "fi\n"
        'if [ "$1 $2" = "issue create" ]; then\n'
        "  printf '%s\\n' \"https://example.invalid/example/repo/issues/77\"; exit 0\n"
        "fi\n"
        'if [ "$1 $2" = "issue comment" ] || [ "$1 $2" = "issue edit" ]; then exit 0; fi\n'
        'if [ "$1" = "api" ]; then\n'
        '  case "$2" in\n'
        f'    */actions/runs/*/jobs*) jq -r "$(jq_filter "$@")" < "{tmp_path / "jobs.json"}" ;;\n'
        f"    */pulls/*) printf '%s\\n' '{pr_author}' ;;\n"
        f'    */issues/*/comments?since=*) jq -r "$(jq_filter "$@")" < "{tmp_path / "comments.json"}" ;;\n'
        "    */issues/*/comments) exit 0 ;;\n"
        '    *) echo "unexpected gh api $2" >&2; exit 9 ;;\n'
        "  esac\n"
        "fi\n",
        encoding="utf-8",
    )
    gh.chmod(0o755)
    env = dict(os.environ)
    env.update(
        {
            "PATH": f"{stubs}{os.pathsep}{os.environ['PATH']}",
            "GH_TOKEN": "stub",
            "REPO": "example/repo",
            "SOURCE_NAME": "Build",
            "SOURCE_PATH": ".github/workflows/build.yml",
            "SOURCE_CONCLUSION": conclusion,
            "RUN_ID": "1",
            "RUN_URL": RUN_URL,
            "HEAD_SHA": "0123456789abcdef0123456789abcdef01234567",
            "HEAD_MESSAGE": head_message,
        }
    )
    out = subprocess.run(
        ["bash", "-c", _step_script()],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    raw = log.read_text(encoding="utf-8") if log.exists() else ""
    calls = [record for record in raw.split(_RECORD_SEPARATOR) if record]
    return out, calls


def _calls(calls: list[str], prefix: str) -> list[str]:
    return [call for call in calls if call.startswith(prefix)]


def _bot_bump(body: str = "Still failing (failure) at `abc`: https://example.invalid/0") -> dict:
    return {"user": {"login": "github-actions[bot]"}, "body": body}


def _human_comment(body: str = "looking at this") -> dict:
    return {"user": {"login": "someone"}, "body": body}


@pytestmark_posix
def test_a_red_macos_job_pages_the_pr_author_and_files_an_assigned_issue(
    tmp_path: Path,
) -> None:
    out, calls = _run_step(tmp_path)
    assert out.returncode == 0, out.stderr
    (pr_comment,) = _calls(calls, "api repos/example/repo/issues/4242/comments")
    assert "@octocat" in pr_comment
    assert "Build Desktop (macos-15)" in pr_comment
    assert RUN_URL in pr_comment
    # The Linux job that passed is not named as a failure.
    assert "ubuntu-22.04" not in pr_comment
    (create,) = _calls(calls, "issue create")
    assert "--title Build macOS leg is failing on main" in create
    assert "--label main-macos-failure" in create
    assert "--assignee" not in create, "assign after create so a bot author cannot stop the filing"
    (assign,) = _calls(calls, "issue edit 77")
    assert "--add-assignee octocat" in assign
    assert not _calls(calls, "issue comment")


@pytestmark_posix
def test_a_run_whose_only_red_jobs_are_not_macos_writes_nothing(tmp_path: Path) -> None:
    out, calls = _run_step(tmp_path, jobs_json=LINUX_ONLY_RED)
    assert out.returncode == 0, out.stderr
    assert "no macOS job failed" in out.stdout
    assert [call for call in calls if not call.startswith("api repos/example/repo/actions")] == []


@pytestmark_posix
def test_a_timed_out_macos_job_counts_as_red(tmp_path: Path) -> None:
    jobs = _jobs(("E2E Gateway Boot (macos-15)", "timed_out", "macos-15"))
    out, calls = _run_step(tmp_path, jobs_json=jobs, conclusion="timed_out")
    assert out.returncode == 0, out.stderr
    (pr_comment,) = _calls(calls, "api repos/example/repo/issues/4242/comments")
    assert "E2E Gateway Boot (macos-15)" in pr_comment
    assert _calls(calls, "issue create")


@pytestmark_posix
def test_a_commit_without_a_pr_number_files_the_issue_unassigned(tmp_path: Path) -> None:
    out, calls = _run_step(tmp_path, head_message="ci: hand edit on main\n\n(#12) in the body only")
    assert out.returncode == 0, out.stderr
    assert "No trailing (#N)" in out.stdout
    assert not _calls(calls, "api repos/example/repo/issues/")
    assert not _calls(calls, "api repos/example/repo/pulls/")
    assert _calls(calls, "issue create")
    assert not _calls(calls, "issue edit")


@pytestmark_posix
def test_a_long_squash_message_still_pages_the_author(tmp_path: Path) -> None:
    """A squash body can be larger than a pipe buffer (64 KiB on Linux); reading
    its first line must not abort the step under ``pipefail``. Kept under the
    kernel's 128 KiB cap on one environment string."""
    message = "fix(desktop): keep the dock icon (#4242)\n\n" + ("x" * 120 + "\n") * 800
    out, calls = _run_step(tmp_path, head_message=message)
    assert out.returncode == 0, out.stderr
    assert _calls(calls, "api repos/example/repo/issues/4242/comments")


@pytestmark_posix
def test_shell_text_in_the_commit_title_is_never_executed(tmp_path: Path) -> None:
    marker = tmp_path / "pwned"
    out, calls = _run_step(
        tmp_path, head_message=f"fix: $(touch {marker}) `touch {marker}` (#4242)"
    )
    assert out.returncode == 0, out.stderr
    assert not marker.exists()
    assert _calls(calls, "api repos/example/repo/issues/4242/comments")


@pytestmark_posix
def test_a_repeat_failure_bumps_the_open_issue_instead_of_filing_a_second(
    tmp_path: Path,
) -> None:
    out, calls = _run_step(
        tmp_path,
        open_reply="9",
        head_message="feat: another change (#4343)",
        pr_author="hubot",
    )
    assert out.returncode == 0, out.stderr
    # The PR comment is per commit: the second author is paged on their own PR.
    (pr_comment,) = _calls(calls, "api repos/example/repo/issues/4343/comments")
    assert "@hubot" in pr_comment
    assert not _calls(calls, "issue create")
    (bump,) = _calls(calls, "issue comment 9")
    assert "Still failing (failure)" in bump
    assert RUN_URL in bump
    (assign,) = _calls(calls, "issue edit 9")
    assert "--add-assignee hubot" in assign


@pytestmark_posix
def test_a_bump_within_six_hours_is_skipped_but_the_pr_is_still_paged(tmp_path: Path) -> None:
    out, calls = _run_step(
        tmp_path,
        open_reply="9",
        comments_json=json.dumps([_bot_bump()]),
    )
    assert out.returncode == 0, out.stderr
    assert _calls(calls, "api repos/example/repo/issues/4242/comments")
    assert not _calls(calls, "issue comment")
    assert not _calls(calls, "issue create")
    assert "bumped within the last 6 hours" in out.stdout


@pytestmark_posix
def test_a_human_comment_does_not_silence_the_bump(tmp_path: Path) -> None:
    out, calls = _run_step(
        tmp_path,
        open_reply="9",
        comments_json=json.dumps([_human_comment()]),
    )
    assert out.returncode == 0, out.stderr
    assert _calls(calls, "issue comment 9")


@pytestmark_posix
def test_an_issue_closed_within_six_hours_is_not_refiled(tmp_path: Path) -> None:
    # The stub answers with what the step's closed-window selector would pick.
    out, calls = _run_step(tmp_path, closed_reply="5")
    assert out.returncode == 0, out.stderr
    assert not _calls(calls, "issue create")
    assert "closed within the last 6 hours" in out.stdout
    # The pager still fires: the close throttles the issue, not the PR comment.
    assert _calls(calls, "api repos/example/repo/issues/4242/comments")


@pytestmark_posix
def test_a_failed_dedupe_query_aborts_instead_of_filing_blind(tmp_path: Path) -> None:
    out, calls = _run_step(tmp_path, list_exit=1)
    assert out.returncode != 0
    assert not _calls(calls, "issue create")


def _dedupe_selector() -> str:
    match = re.search(r"--jq 'map\(select\(\.title == env\.TITLE\)\)[^']*'", _step_script())
    assert match, "the dedupe step no longer selects the fixed title; update this test"
    return match.group(0)[len("--jq '") : -1]


@pytest.mark.skipif(shutil.which("jq") is None, reason="requires jq to evaluate the selector")
@pytest.mark.parametrize(
    ("candidates", "expected"),
    [
        (
            [
                {"number": 7, "title": "Build macOS leg is failing on main since Tuesday"},
                {"number": 9, "title": "Build macOS leg is failing on main"},
            ],
            "9",
        ),
        ([{"number": 7, "title": "Build macOS leg is failing on main since Tuesday"}], ""),
        ([], ""),
    ],
)
def test_the_dedupe_selector_matches_the_exact_title_only(
    candidates: list[dict[str, object]], expected: str
) -> None:
    out = subprocess.run(
        ["jq", "-r", _dedupe_selector()],
        input=json.dumps(candidates),
        env={**os.environ, "TITLE": "Build macOS leg is failing on main"},
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    assert out.stdout.strip() == expected
