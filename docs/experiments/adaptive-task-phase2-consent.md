# Phase 2 D: explicit consent and safe transitions

Authority: user requested the next step on 2026-09-22 after local `fae0a2d`. Same isolated branch; no push, GitHub mutation, merge, release, deployment, real credentials or real provider calls.

Goal: safely migrate/downgrade an idle task without resetting counters or losing delegation provenance; implement authenticated optional consent and status within the existing task-model control. Reuse the existing signed-cookie HTTP boundary, root ledger, private artifacts and real host executor.

Scope: transition primitives, opt-in control composition, shared browser contract and existing conversation component, real-host/authenticated HTTP and UI tests. The product entry point remains on Phase 1 until exact-host acceptance. The new composition must work end-to-end when explicitly assembled in disposable integration tests, not merely with mocked UI responses. No parallel Think/Split/Remember switch.

Completion: explicit migration preserves owner/session/capabilities/count and starts interrupted with child grant disabled; consent is idle, revision/operation fenced, model/effort/file-specific; revocation/stop/manual remain available without catalog availability; responses contain bounded status and never evidence contents or credentials; downgrade saves and verifies provenance before atomic conversion and refuses unresolved child/delivery; lost responses never replay execution or restore lower counters. Existing Phase 1 UI remains unchanged when the new capability is absent.

Plan:

1. Inspect and specify transition/provenance boundaries and existing HTTP/UI behavior.
2. Implement strict idle migration/downgrade and retained recovery artifacts; test failure and replay.
3. Compose v1/v2 control with a single root owner and explicit consent operations.
4. Add optional source/model/effort consent and bounded child state to the existing dialog.
5. Verify real host/authentication, browser behavior, crash regression and full check; independently review; write back implementation and remaining E gates.

Verification: focused Vitest/type checks; authenticated integration over the existing HTTP route; browser tests; `pnpm run check`; existing crash checker; `git diff --check`. Use Node 24 and baseline DSH locally; no claim of all-host acceptance before the later E matrix. Existing README/design/contracts/status provide the document roles; no duplicate management skeleton.

## Implemented boundary

- `AdaptiveTaskControlRuntime` explicitly composes the existing v1 runtime and internal v2 executor, never two competing owners. The production entry point still constructs v1; this composition is instantiated only in disposable acceptance fixtures.
- Migration runs under native idle maintenance and the existing root-file lock. It retains owner, session, authorized routes, request maximum, spent counters and original-history markers; enters interrupted with a new epoch; and never grants child access. Resume remains explicit.
- Consent requires the existing signed-cookie owner, exact revision, operation identity, installed/root-permitted model/effort routes, explicit workspace-relative files and disclosure acknowledgement. File identity validation and immutable evidence use the existing private artifact mechanism. No source content or credentials appear in status responses.
- The existing model-choice dialog gains a capability-advertised section, hidden on Phase 1-only hosts. Consent starts unchecked, failed/lost replies disable further changes until a fresh read, session changes discard drafts, and child outcomes/cleanup/delivery are visible. No Think/Split/Remember product setting is added.
- Safe downgrade requires idle manual mode, no grant/live child/unresolved cleanup, original parent tool-result reconciliation, and verified referenced artifacts. The immutable private archive is persisted and read back before atomically replacing the root with representable v1 manual state. The archive digest lives in v1's retained runtime field, so old v1 receipt eviction cannot lose the archive pointer. Re-upgrade restores only child provenance from that archive: current counters/history win, child permission stays off.
- Plain v1 manual/stopped records without a valid downgrade archive are deliberately not auto-migrated; missing/corrupt provenance fails closed. Unknown delivery (including interrupted children with no provable delivery) blocks downgrade. No deletion/reset-based fallback is provided.
- Operation receipts are retained up to 64. At capacity, new authority/resume/upgrade fail closed. Stop/manual, permission removal and otherwise-safe downgrade still work without evicting old receipts; these capacity-exception operations do not append a receipt. A lost response is resolved by a fresh state read; old-revision replay fails without effects. This avoids allowing bookkeeping capacity to disable safe withdrawal.

## Review and verification

Independent review covered ownership, CAS/operation replay, migration/archive provenance, shared counters, recovery and cancellation. The final boundary audit found a real blocker: full receipts could prevent stop/manual. This was corrected and re-reviewed with active-child cancellation and catalog-unavailable/full-capacity controls. No remaining blocking finding was identified; this is not all-host acceptance.

Local final evidence uses Node 24.13.0, baseline DSH 0.1.2-rc.1 and pi-ai 0.84.4:

| Command | Observable coverage |
| --- | --- |
| `pnpm run check` | Exit 0; 114 files / 1,221 core tests; workflow/source checks, both type checks, build, offline proxy/capability checks, declared baseline compatibility and package contents |
| `pnpm run test:browser` | 10 files / 50 tests, including 7 new capability/consent/lost-response/session-isolation cases |
| `node scripts/check-adaptive-task-delegation-ui.mjs` | 13 cases including actual Chromium at 390×844 → signed host login → upgrade → explicit grant → resume → actual parent/child host loop → manual/revoke/downgrade; four synthetic model requests and zero external browser requests |
| `node scripts/check-adaptive-task-ui.mjs` | Existing 6-case authenticated Phase 1 control path remains working |
| `node scripts/check-adaptive-task-delegation-crashes.mjs` | 18 recovery cases / 36 fresh processes, plain and zstd journals, zero recovery fetches/spawns and stale epoch refusal |
| `git diff --check` | Whitespace/diff hygiene |

The new authenticated checker is wired into the existing browser CI job but has only been run locally in this slice. Built shared decoder/legacy ownership hooks and client bytes changed; the dormant v2 composition/executor is not included in the production entry. Dependencies, supported versions and product defaults did not change.

Intermediate full runs exposed a pre-existing contention-test assumption (7 reservations observed vs 8 expected). The enhanced diagnostic assertion confirmed the baseline host's bounded two-second writer-lock timeout; standalone 42-test ledger execution passed. Both original failure outputs are retained. The final test keeps fourteen concurrent contenders but matches every fulfilled child/auxiliary permit to exact ledger debits, accepts only cap rejection or the specific bounded lock timeout, and separately fills with new uncontended attempts to prove the six-child/eight-total cap. Product locking/timeouts are unchanged; there is no transport retry or refund. This tests safety without requiring a particular filesystem throughput.

## Remaining E gate

Run the focused composition/lifecycle/recovery cases on all four declared hosts and both Node targets, verifying actual resolved runtime identity. Then wire the reviewed default-off composition into the product and prove it in an installed authenticated full Session page, including stop during a child and restored manual model selection. The current styled carrier screenshot is only a fixture, not daily-profile UI acceptance. Real credentials/provider usefulness/cost/quality, cross-device takeover, merge/release/deploy remain separate and unperformed.

Status: local D implementation; final command counts and commit are recorded in the dated runtime checkpoint and delivery note. No push or GitHub state mutation.
