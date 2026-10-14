"""The state one dashboard chat turn shares across its phases: :class:`_ChatTurn`.

``kiro_crew.dashboard.chat_runner._run_chat`` builds one ``_ChatTurn`` per call, as its first
statement, and every part of the turn that another part reads or writes later lives on it rather
than in a local of one function: the turn's inputs, and each value the turn's closures write or
read after the turn rebinds it. A closure that writes such a value (the steer cut writes the
reply text from the steer handler's task) writes the attribute; the turn reads the attribute;
so every reader and writer shares one storage cell, as the closure cell it replaces did.

An attribute is declared on the class and set where the turn first binds the value, never
earlier, so reading one before the turn bound it raises ``UnboundLocalError``, with the message
reading the unbound local raised. A closure's read of a cell nothing had bound raised
``NameError``; ``UnboundLocalError`` is a ``NameError``, so a handler of either still catches it.
The declarations are strings: the class body evaluates nothing, so a test that rebinds a name on
the runner still reaches every reader.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable
    from typing import Any

    from kiro_crew.dashboard.chat_runner import (
        DashboardState,
        MonitorCompletionHook,
        RefusalInfo,
        ReplayFamily,
        _ChatSlot,
        _TurnExit,
    )


class _ChatTurn:
    """One turn's inputs and the state its phases share; see the module docstring."""

    # The turn's inputs: ``_run_chat``'s parameters.
    state: "DashboardState"
    slot: "_ChatSlot"
    turn_exit: "_TurnExit"
    message: "str"
    _prompt_depth: "int"
    _attachments: "tuple[str, ...] | list[str]"
    _attachment_meta: "dict[str, list[str]] | None"
    _synthetic_payload: "bool"
    _replay: "frozenset[ReplayFamily]"
    _synthetic_recovery_turn: "bool"
    _replays_completion: "bool"
    _steer_possibly_delivered: "bool"
    _directive_user_origin: "bool"
    _turn_provenance_restored: "bool"
    _directive_self_wake: "bool"
    _directive_loop_id: "str"
    _directive_loop_gen: "int"
    _directive_channel_origin: "bool"
    _commands_off: "bool"
    _turn_actor: "str"
    regenerate_hint: "str"
    _on_consumed: "Callable[[bool], None] | None"
    _on_irreversibly_consumed: "Callable[[], Awaitable[None] | None] | None"
    monitor_completion: "MonitorCompletionHook | None"
    _current_message: "dict | None"

    # State the turn's closures write, or read after the turn rebinds it.
    _consumed_reported: "bool"
    _crew_log_sid: "str"
    _crew_log_step: "int"
    _crew_log_turn_no: "int"
    _dispatch_lock_held: "bool"
    _irreversible_consumption_reported: "bool"
    _is_refusal_retry_turn: "bool"
    _produced_visible_output: "bool"
    _reply_flushed: "bool"
    _spec_hooks: "list[Any]"
    _spec_hooks_cwd: "str | None"
    _spec_hooks_unreadable: "bool"
    _stop_reason: "str"
    _terminal_directive_applied: "bool"
    _terminal_directive_kind: "str"
    _ttft_quiet_text: "bool"
    _turn_boundary_set: "bool"
    _turn_cost_usd: "float"
    _turn_credits: "float"
    _turn_elapsed_ms: "int"
    _turn_model: "str"
    _turn_msg_boundary: "int"
    _turn_refusal: "RefusalInfo | None"
    _turn_stats0: "object"
    _turn_stats_captured: "bool"
    _turn_t0: "float"
    _turn_tool_calls: "int"
    _turn_usage_persisted: "bool"
    _wt_coded_this_turn: "bool"
    _wt_deciding_coding: "bool"
    _wt_last_cadence: "float"
    assistant_text: "str"
    chunk_seq: "int"
    client: "Any"
    selected_binding: "tuple[Any, ...]"

    def __init__(
        self,
        state: "DashboardState",
        slot: "_ChatSlot",
        turn_exit: "_TurnExit",
        message: "str",
        *,
        _prompt_depth: "int",
        _attachments: "tuple[str, ...] | list[str]",
        _attachment_meta: "dict[str, list[str]] | None",
        _synthetic_payload: "bool",
        _replay: "frozenset[ReplayFamily]",
        _synthetic_recovery_turn: "bool",
        _replays_completion: "bool",
        _steer_possibly_delivered: "bool",
        _directive_user_origin: "bool",
        _turn_provenance_restored: "bool",
        _directive_self_wake: "bool",
        _directive_loop_id: "str",
        _directive_loop_gen: "int",
        _directive_channel_origin: "bool",
        _commands_off: "bool",
        _turn_actor: "str",
        regenerate_hint: "str",
        _on_consumed: "Callable[[bool], None] | None",
        _on_irreversibly_consumed: "Callable[[], Awaitable[None] | None] | None",
        monitor_completion: "MonitorCompletionHook | None",
        _current_message: "dict | None",
    ) -> None:
        self.state = state
        self.slot = slot
        self.turn_exit = turn_exit
        self.message = message
        self._prompt_depth = _prompt_depth
        self._attachments = _attachments
        self._attachment_meta = _attachment_meta
        self._synthetic_payload = _synthetic_payload
        self._replay = _replay
        self._synthetic_recovery_turn = _synthetic_recovery_turn
        self._replays_completion = _replays_completion
        self._steer_possibly_delivered = _steer_possibly_delivered
        self._directive_user_origin = _directive_user_origin
        self._turn_provenance_restored = _turn_provenance_restored
        self._directive_self_wake = _directive_self_wake
        self._directive_loop_id = _directive_loop_id
        self._directive_loop_gen = _directive_loop_gen
        self._directive_channel_origin = _directive_channel_origin
        self._commands_off = _commands_off
        self._turn_actor = _turn_actor
        self.regenerate_hint = regenerate_hint
        self._on_consumed = _on_consumed
        self._on_irreversibly_consumed = _on_irreversibly_consumed
        self.monitor_completion = monitor_completion
        self._current_message = _current_message

    if not TYPE_CHECKING:

        def __getattr__(self, name: str) -> object:
            # Only reached for an attribute that was never set. A declared one is a
            # value the turn has not bound yet: raise what reading that local raised.
            if name in _ChatTurn.__annotations__:
                raise UnboundLocalError(
                    f"cannot access local variable {name!r} where it is not associated with a value"
                )
            raise AttributeError(name)
