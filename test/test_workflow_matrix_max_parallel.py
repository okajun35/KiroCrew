"""Every matrix job in .github/workflows/ states an explicit max-parallel cap.

The rule is that each job with a ``strategy:`` block declares a cap, at most
``MAX_PARALLEL``. A job may set a lower cap (for example to bound a matrix of
costly runners). This test reads every workflow instead of a fixed list, so a
new matrix job that leaves the cap out fails here.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"
MAX_PARALLEL = 100


def _strategy_jobs() -> list[tuple[str, str, dict]]:
    found = []
    for path in sorted(WORKFLOWS.glob("*.y*ml")):
        doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        for job_id, job in (doc.get("jobs") or {}).items():
            strategy = (job or {}).get("strategy")
            if strategy is not None:
                found.append((path.name, job_id, strategy))
    return found


def test_some_matrix_jobs_exist():
    # Guards the parametrized test below against passing vacuously.
    assert _strategy_jobs()


@pytest.mark.parametrize(
    ("workflow", "job_id", "strategy"),
    _strategy_jobs(),
    ids=lambda v: v if isinstance(v, str) else "",
)
def test_matrix_job_sets_max_parallel(workflow, job_id, strategy):
    cap = strategy.get("max-parallel")
    # bool is an int subclass; `max-parallel: true` is not a cap.
    is_cap = isinstance(cap, int) and not isinstance(cap, bool)
    assert is_cap and 1 <= cap <= MAX_PARALLEL, (
        f"{workflow}: job {job_id!r} needs `max-parallel: <1..{MAX_PARALLEL}>` "
        f"under `strategy:`, got {cap!r}"
    )
