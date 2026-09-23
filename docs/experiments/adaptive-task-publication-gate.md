# Pause public task orchestration pending maintainer acceptance

Status: **source-only draft; not merge-ready, published, deployed or a claim that existing public installations are disabled**.
Baseline: main `41f0fa50b41b129a57c761744fef5db0a80f5031`, inspected on 2026-09-23. This is independent of the channel-documentation-only PR #247.

## Requested product boundary

Temporarily withdraw the public activation entry and options for task-level automatic model choice and read-only delegation until maintainer acceptance. Preserve their implementation and tests. Do not remove ordinary GPT-6/Astra/manual model selection, native compaction, accounts, or unrelated settings. No package publication, channel change, daily service operation or live-provider request is authorized by this PR.

## Source implementation

- A shared, hard-closed source release decision (`ADAPTIVE_TASK_PUBLIC_RELEASE = false`), not another saved user setting. Browser input, old grants, URL parameters, environment variables and model output cannot open it. It is a distribution decision, not a substitute for the existing permission checks.
- The authenticated public HTTP route rejects `start`, `resume`, `upgrade` and `delegate-enable` before calling the runtime. This also covers stale browser bundles. Reads cannot advertise `canStart: true` while paused.
- Host authentication, principal binding, command decoding and runtime ownership checks remain in place. `manual`, `stop`, `delegate-disable` and `downgrade` still reach the existing authorization/lifecycle implementation. These are not unconditional grants to execute an exit.
- The published conversation contribution selects a recovery-only component while paused. A confirmed ordinary conversation renders no collaboration entry, model/effort selectors, request-limit input, Start, Resume or delegation consent. Existing tasks retain readback, Stop and manual takeover. A failed read retains only a recovery path and is not reported as confirmed off.
- Recovery performs one bounded initial read and explicit user-requested readbacks, with at most two additional GET attempts for the existing live-root-readiness error. There is no periodic polling and no POST retry. Session changes abort and discard stale responses. No task ledger, history, counter or prior grant is deleted or rewritten merely to hide the UI.
- The original full control and runtime remain available for a separately authorized internal validation build. Reopening public access requires a separate reviewed source change/build; it still does not create a task grant. No general-purpose production escape hatch is added.

## Existing installations and activation state

A source PR cannot revoke a published npm archive or change an already running process. Merge, regenerated artifacts, a new approved release and user upgrade/restart are separate steps. Previously running 4.40/4.41 installations remain unchanged by this draft. Do not present UI removal as a remote kill switch.

Retain the existing runtime's interrupted-restoration/explicit-resume behavior; the public route now refuses that resume while paused. Upgrade/reload, old v1/v2 grants, already-running children, and manual takeover must be exercised on the actual installed new artifact before release. Do not assume that hiding controls proves runtime quiescence.

## Verification performed in this editing environment

- 33 isolated assertions passed against the actual new policy module on Node 22.16.0 using Node type stripping: closed default, four rejected activation actions, four retained exits, strict boolean handling, unknown-command refusal, six preserved lifecycle states, immutable projection and preserved stopping diagnostics.
- TypeScript transpilation/syntax checks are recorded separately in the PR. They are not a repository typecheck.
- Added Vitest policy and real-handler unit tests with a stub Connection/runtime. These do not certify signed-cookie verification or full host behavior and have not been executed here.
- No credentials or real models were used. No user machine, 3080 or 3081 was modified.

The current conversation could not discover the previously used WebCodex execution tools. The isolated editing container has no repository dependencies and cannot resolve GitHub for clone/install. GitHub connector reads/writes remain available. These limitations are not test passes.

## Mandatory work before leaving draft

1. Regenerate and commit the matching `lib/` outputs with the repository's normal build; do not hand-patch generated bundles. Existing committed build bytes are deliberately still the baseline and are not a gate-closed distributable.
2. Run the new Vitest suite, host/client typecheck, lint and full `pnpm run check`. Existing HTTP/installed-session scenarios that expect public activation must be split into default-closed admission/recovery checks and explicitly scoped internal acceptance; do not skip or globally enable tests to obtain green results.
3. Add/run browser coverage for no entry on fresh conversations, only safety exits on v1/v2 sessions, delayed session readbacks, unknown state, lost POST replies/no replay, narrow-screen and bilingual controls. Run full browser regression and installed native Session checks against actual rebuilt bytes.
4. Verify old grants and crash/reload recovery cannot auto-resume, retained counters/history and normal manual models work, and stock compatible hosts can install/start. Do not change existing host workarounds or daily profiles as part of this PR.
5. Update prospective user-facing release/migration documentation without rewriting historical 4.40/4.41 facts. Preserve README bilingual consistency. Read exact-head CI before review/merge.

## Reopening gate

After separately approved internal/live-account acceptance, use a second PR to propose reopening. Attach exact artifact/environment identity, default-closed non-regression, bounded real-model/handoff/delegation checks, stop/manual/restart results and user comprehension evidence. Quality or savings claims require their own task comparisons. Never equate a green synthetic test count with live acceptance.
