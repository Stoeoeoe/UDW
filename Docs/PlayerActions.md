# Player action lifecycle

`CharacterPerformPrimaryActionAbility` starts `ActionExecutor.RunAsync` and
observes failures at the input callback boundary. The executor owns one attempt,
including its cancellation token, preparation-release signal, character freeze,
action duration and cooldown. Repeated input while it is busy does nothing.

Action hooks (`OnPrepare`, `OnExecute`, `OnFinish`, `OnFailure` and
`OnPostPrepareFailure`) return Unity `Awaitable` and receive the attempt's
`CancellationToken`. Hooks that finish immediately return `Completed()`. Await
each returned operation once. Timed hooks pass the token to their Unity waits;
multi-target effects check it between mutations so interrupted work cannot
continue on another tile. The executor checks cancellation between phases.

Button release signals preparation completion. Release may arrive while the
preparation hook is still waiting; execution waits for both. The executor captures
the final interaction context after preparation, checks eligibility again, then
starts execution. This preserves the final aiming target for tools.

`InterruptCurrentAction` invokes the action's interruption hook, cancels pending
waits and releases resources synchronously. Location leave, ability disable and
overnight transitions use this path. An old attempt cannot clean up a replacement,
including a new attempt using the same action component.

`OnEnd` releases action-owned resources exactly once on success, rejection,
interruption or failure. Character freezing ends before cooldown; the attempt
remains busy until cooldown ends. State notifications remain available to the
character animator. Expected cancellation completes normally; other exceptions
propagate after cleanup.

Native Unity delays are tested in the real gameplay loop. Edit Mode tests cover
phase ordering, rejection, context changes, cancellation and synchronous effects.
