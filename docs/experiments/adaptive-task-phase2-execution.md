# Phase 2 B/C — restricted execution implementation contract

Authority: user requested the next step on 2026-09-22 after accepting A. Local clean baseline `6d21243`; requirements are in `adaptive-task-phase2-design.md`, and the implemented root contract in `adaptive-task-phase2-ledger.md`. This slice does not change #236 or infer permission to push, merge, publish, deploy or call real models.

Goal: implement the restricted evidence and owned-child execution boundary, using the existing root ledger and transport governor. Verify against synthetic fixtures and installed host APIs. No new product switch, consent UI, automatic migration or live-profile enablement. Existing v1 behavior must remain unchanged.

Scope: new evidence/artifact and delegation lifecycle modules, narrow internal dispatch hooks if necessary, focused tests and this evidence record. The current product entry point remains disabled until D/E and migration/recovery gates pass. Requirements/design/code map/checklist/decisions remain in the existing project documents rather than a duplicate management skeleton.

Plan:

1. Inspect actual owned-agent setup/commit/disposal, tool execution and ordinary durable tool-result interfaces.
2. Validate explicit approved text manifests; create bounded immutable snapshots and private digest-checked artifacts; validate findings only against observed ranges.
3. Prepare durably before creating a child; bind exact live ownership and route, retain lifetime cancellation, debit through the existing dispatch scope, and reject all non-evidence tools.
4. Persist result separately from delivery; verify cleanup; reconcile original tool-call results without respawning or refunding uncertain dispatches.
5. Test failure/race/replay/isolation cases, perform independent review and full local regression, record exactly what remains unintegrated.

Verification: focused Vitest tests, `pnpm run typecheck`, `pnpm run check`, existing two-process ledger recovery, `git diff --check`. An installed-host synthetic fixture is required for claims about the real owned-agent lifecycle; abstract fake-host tests alone do not establish it. Four-host/UI and real-account usefulness remain later gates.

## Implemented local candidate

- `adaptive-task-evidence.ts`: explicit host-approved manifest, stable source IDs/digest, private manifest restoration, canonical bounded UTF-8 snapshots, per-run observed ranges and strict single final submission. File/path/type/identity/size checks and known secret-path/PEM exclusions fail closed. Source approval is still necessary: filters cannot identify all secrets and same-process plugins/filesystem owners are trusted, not sandboxed.
- `adaptive-task-artifacts.ts`: owner-private atomic synced content-addressed manifest/snapshot/result storage. Missing, tampered, public-mode, hardlinked or symlinked artifacts refuse. Artifacts never grant authorization and are not silently deleted to recover a task.
- `adaptive-task-delegation-host.ts`: create through `parent.ctx.agents.create`, unpublished setup and commit check, exact Agent/session/runtime owner, two child-local tools, empty inherited allow-list and native presentation even under a PTC parent. Owned disposal drains the loop; cleanup failures remain failures.
- `adaptive-task-delegation.ts`: optional internally installed parent tool; exact ordinary parent call plus argument binding; durable preparation before child creation; fixed authorized route; existing adapter task scope/shared governor debit; parent reserve floor; stop/manual/deadline/dispose cancellation; result persistence before cleanup; normal tool-call/result correlation and successful host flush before delivery acknowledgment. Descendant traversal follows durable and live ownership, including retired child IDs; unknown descendants and child auxiliaries are refused.
- Recovery restores the approved manifest from its ledger-bound artifact, fences the old epoch, proves no live children before cleanup, and reconciles an already committed result without spawning or issuing model requests. Recovery installs no tool and never resumes a grant itself.

The product entry point, v1 runtime, package configuration and dependencies are unchanged. These modules are not exported or constructed there; a build leaves the existing `lib` files unchanged. Tests explicitly compose the new internal executor with the real adapter.

## Validation record

Local Node v24.13.0, installed baseline DSH packages `0.1.2-rc.1`, pi-ai `0.84.4`. Real host-loop/provider-adapter/governor interfaces were used with synthetic OAuth strings, fully stubbed HTTP/WebSocket transport and disposable private profiles; no real provider requests or real credentials.

- Final `PATH=/usr/local/bin:$PATH pnpm run check`: exit 0, 112 files / 1,186 tests (51 new tests across three files); lint, type checks, contract checks, build, CLI/import and package checks passed. The earlier 1,184-test pass preceded two additional manifest/secret-exclusion regressions.
- Focused execution tests cover two authorized child routes, shared wire/debit equality, parent reserve, strict ordinary call correlation, missing persistence, create/publication failures, publication-stop race, running stop/manual/dispose/deadline, cleanup failure, lost replies, root-child-grandchild rejection, and persisted parent unload/resume with both plain and zstd logs. No fabricated Session authority event is used.
- Host tests cover actual ownership, schema visibility and execution denial for inherited shell and PTC code transport. Evidence tests cover scope, path aliases, hardlinks, sizes, UTF-8, snapshots, observations, artifacts and manifest restoration.
- `node scripts/check-adaptive-task-delegation-ledger.mjs`: exit 0, two fresh processes (75449/75451) preserve count 3, no replay; fixture SHA-256 `a93980b6872de264ac250fe0fbc349787e5b95ca5be134c0726b8725643776b1`. This existing A test is not credited as full child-runtime crash injection.
- Independent review found a deeper-descendant dispatch/auxiliary bypass; traversal and explicit synthetic regression were added and independently rechecked. Further host review tightened PTC presentation and exact ownership. No remaining blocker was reported for the dormant local candidate.

During development, initial fixtures had an empty v1 receipt list, the wrong context-disposal/resume API fields, and a provider call-ID normalization mismatch. They were corrected against installed interfaces. A stop/publication test initially released its barrier before the revision-fenced stop committed; it now releases on cancellation, testing the intended ordering. These are not omitted or presented as previously passing evidence.

## Original remaining gates — updated by the subsequent C slice

The [C process-recovery and v2 root-integration record](adaptive-task-phase2-recovery.md) supersedes the first two bullets below for the new local candidate: real-loop process termination, root compaction/title accounting, main handoff and manual portability are now locally verified. The bullets retain the boundary of this earlier B/C delivery; UI, safe migration/downgrade and compatibility acceptance still remain.

- C still needs process-kill/fault injection at every child preparation/publication/dispatch/result/delivery boundary and real-process delivery reconciliation. This slice tests real host unload/resume and injected call failures, not arbitrary power loss.
- V2 dispatch currently accepts ordinary exact-route requests only and rejects compaction/session-title purpose requests. Phase 1 compaction remains unchanged. Integrating those host-owned auxiliary scopes, v2 main-model change/manual portability and safe quiescent migration/downgrade is required before product enablement.
- D/E remain: authenticated optional consent/status UI, default-off production wiring, four-host/two-Node acceptance matrix, installed-session visual acceptance. Real-account usefulness/cost comparison is separately unverified.
- Filesystem checks detect observed changes but are not an OS isolation boundary against a hostile same-user process. No automatic retention cleanup or cross-device takeover is offered.
- No push, PR mutation, old PR/issue closure, merge, release, deployment or daily-profile change occurred.
