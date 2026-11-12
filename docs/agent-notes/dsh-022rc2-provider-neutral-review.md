# Provider-neutral recovery fence follow-up (2026-11-12)

This follow-up supersedes the earlier candidate's completeness claim. The
previous 17-Host matrices did not test a managed non-Codex child created *after*
the retained v2 root had already been bound. Independent Astra review identified
that missing composition case before merge.

## Reproduced defect

On the original candidate and actual official rc.2:

1. Load synthetic retained v2 state, then call state() to bind its recovery root.
2. Register a synthetic non-Codex adapter and a local subagent backend whose
   prepareContinuable() returns detached empty seed data.
3. Call the real subagents.startActivation() with that root and the other provider.
4. Verify the official rootOf(child) returns the exact root instance.

The fake provider was called once and the child completed, although the retained
ledger remained unchanged. External network attempts were zero. The same case
using real parentAgent/isOwnedBy on official rc.1 also dispatched once. Unchanged
main b343c1fd source on rc.1 reproduces it too: this was a pre-existing
cross-provider fence gap, not a new rc.2-only behavior.

The prepended control hook established management but continued dispatch. The
execution request hook rejected only roots, while descendant refusal lived in
the Codex-only stream wrapper. An unrelated adapter did not enter that wrapper.

## Minimal fix

The shared execution agent/request hook now checks non-root requests using the
final downstream request configuration:

- Unknown descendants of bound Task roots are refused before provider dispatch.
- An exact active evidence-child handle must pass the existing automation and
  live/deadline checks, and its final provider/model/effort must match its route.
- Existing stream/fetch revocation, cancellation, budgeting and receipt checks
  remain unchanged; this new entry check does not replace those fences.
- Unrelated ordinary non-Codex requests remain ordinary. Manual root takeover and
  Stop behavior remain unchanged. No Task admission or automation is reopened.

## Verification completed

- Actual rc.1: 26 recovery cases, 12 crash cases / 24 fresh processes.
- Actual rc.2: 33 recovery/ownership cases, 12 crash cases / 24 fresh processes.
- The new composition cases bind interrupted and manual roots before creating
  officially owned non-Codex children. Both require zero child provider calls,
  unchanged retained ledger and a failed child turn. An unrelated non-Codex
  ordinary turn must still complete in each case.
- The legacy active-child regression switches an exact owned child to an
  unwrapped provider using real Host model selection; no child request or debit
  is allowed. Existing valid evidence children continue to pass.
- Full check: 175 files, 2,505 passed, two existing skips; lint/types/build,
  compatibility and package inventory passed. Browser baseline: 101 passed.
- New packed SHA-256:
  `8190a1922166a30e0cc3c9fa8acb51e26a40b4ef490bc32067ae6624ac2049f6`.

## Still running / not established

The updated 17-Host Task, delegation/recovery and same-artifact installation
matrices are running. Their old bundle/tarball hashes are not evidence for this
changed runtime. Remote CI and final independent re-review remain pending.
No Desktop/OAuth/live-model acceptance, merge, publication, deployment or daily
service restart is claimed.
