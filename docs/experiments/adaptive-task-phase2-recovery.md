# Phase 2 C — process termination and v2 root integration

Authority: user requested the next step after local `a26a6d6` on 2026-09-22. Continue the isolated `franksong2702/task-delegation-ledger` branch; no product default/entry-point change, real account, push, PR mutation, merge, publish, deployment or daily-profile change.

Goal: prove conservative recovery across child lifecycle process termination; connect v2 main-model selection, host-owned auxiliary request counting, explicit resume and manual takeover without losing existing Phase 1 history guarantees. Keep the strict root ledger as sole authority and the ordinary host log as delivery evidence.

Scope: delegation ledger/executor and narrow v2 root integration modules, synthetic real-host tests, bounded subprocess fixtures and existing CI validation step. Existing README, Phase 1/2 contracts, execution record and runtime status cover requirements/code map/decisions; this contract covers the current iteration and acceptance. No duplicate documentation skeleton is needed.

Plan:

1. Inspect current request/compaction/history boundaries and define explicit v2 lifecycle ownership.
2. Test externally killed writer processes at preparation, host creation, publication, debit, result, cleanup and delivery checkpoints, using fresh recovery processes and both host encodings.
3. Fix exposed durability/replay gaps; never mark delivery without ordinary host evidence or refund a reserved request.
4. Add main route changes, exact auxiliary accounting, idle/resume and manual portability on the v2 ledger; preserve v1 behavior and child restrictions.
5. Run focused real-host tests, the crash matrix, full regression and independent review; record remaining UI/migration/host gates.

Verification: `pnpm run check`, focused Vitest files, `node scripts/check-adaptive-task-delegation-crashes.mjs`, existing ledger fresh-process checker, `git diff --check`. The process-kill fixture terminates only its own child handles; it is not a hardware power-loss or full disk-corruption certification.

## Implemented boundaries

- The original parent tool call must successfully flush through host persistence before a child receipt is prepared. An in-memory-only host cannot start child work. A ledger receipt without its durable original call is not recoverable delivery evidence.
- V2 main routing uses the existing optional `codex_connect_change_work_model` tool and current installed catalog. Route changes check grant, epoch, revision, native picker sequence, unresolved children, remaining requests and portable original history. Main transport rejects a queued request for an obsolete route; unavailable models do not silently fall back.
- Root main requests, host compaction/session-title requests and attributable direct auxiliary fetches use the existing shared governor and persistent root count. Auxiliary host-default effort remains within approved capabilities. Child compaction/title/direct auxiliary work is still refused in this slice.
- Both ordinary and native compaction retain the Phase 1 history boundary: expand old-model checkpoints from the original journal, allow useful new-model compaction, and expand again for manual handoff. No encrypted foreign checkpoint is forwarded as portable context.
- Native picker changes withdraw automatic control. Child dispatch rechecks the root before each reservation, including a picker change during child creation. Explicit manual takeover cancels owned work, removes both autonomous tools, preserves spent counts and returns subsequent ordinary requests to the native picker. No child grant is needed merely to continue an already-authorized v2 main task.
- Recovery never resumes work. Same-owner explicit resume reserves an idle host, verifies no live children, flushes the original journal and restores only the approved tools. Changed manual selection refuses resume; registration failure withdraws authority and durably stops the task. Disposed instances remove their request interceptor.

## Final local validation

Local Node v24.13.0, baseline DSH `0.1.2-rc.1`, pi-ai `0.84.4`. All provider responses and OAuth strings are synthetic; no real credentials or provider calls.

- Focused ledger/executor check: 75 tests passed; typecheck passed. Coverage includes native-picker change during child creation, current-route recompaction and manual portability, no child consent, unavailable models, same-owner idle resume, interrupted picker changes and failed tool registration.
- Final `PATH=/usr/local/bin:$PATH pnpm run check`: exit 0, 112 files / 1,200 tests, plus lint/type/build/CLI/import/package/compatibility checks. The earlier 1,199-test pass preceded the child-creation picker regression. The standalone crash fixture also passes strict TypeScript checking; this exposed and fixed an overly narrow fixture call-ID type and a missing explicit host event type import that the full project had supplied incidentally.
- Existing ledger fresh-process check: exit 0, two processes preserve count 3; bundle SHA-256 `16b706e5125b0ff576cb947ac9fdc2b6364e8eddd38b7259a22d7f01e5a0c8a8`. This is ledger-only evidence, not the child execution crash matrix.
- `PATH=/usr/local/bin:$PATH node scripts/check-adaptive-task-delegation-crashes.mjs`: exit 0, 18 cases / 36 fresh processes. Nine barriers run with plain and zstd host logs: preparation, actual child creation before publication, publication, reserved attempt before fetch, result artifact before settlement, settlement before cleanup, cleanup before parent result, flushed parent result before delivery acknowledgment, and recorded delivery. Bundle SHA-256 `c19a7c0ebecda8e62417e62a56a4e2270c16ff7c3d428f8afbbf55f78c59cfa4`.
- The matrix actually runs parent `followup` → `delegate_task` → child read/cited submit via the host loop, pi-ai adapter and shared governor. It kills only its own writer after a public operation releases its lock, then uses `agents.resume` and executor recovery in a fresh process. It observes rather than repairs state at barriers. Every recovery preserves exact counts and attempts, rejects the old epoch, and records zero fetches and zero child-create attempts. Recovery installs no tool and remains interrupted.
- Before cleanup, interrupted runs remain undelivered. After cleanup but before a parent result, delivery is exactly `unknown`. With a successfully flushed matching ordinary parent result, delivery is exactly `recorded`. These are distinct assertions; the test does not accept either state interchangeably. A pre-fetch debit remains spent even though no corresponding transport occurred.
- CI now contains the crash checker in its existing Node 22.19.0 / 24.x validation jobs. The workflow was edited locally, not dispatched; only the local Node 24 baseline was executed this turn.
- Independent read-only review covered the implementation and the final replacement crash scripts; no unresolved blocker was reported. Primary review found the missing durable-parent gate and child native-picker race and added regressions. An initial crash fixture based on manual state transitions was rejected and replaced; its earlier passing report is not evidence for this slice.
- An extended compaction assertion initially expected the host to remove its retained latest assistant response. The fixture now distinguishes compacted earlier evidence from the intentionally retained brief response. No production change was needed for this expectation correction.

## Remaining gates

This C recovery/root-integration slice is implemented and locally verified, not an enabled Phase 2 product. The product entry point, v1 runtime, built `lib`, dependencies and defaults remain unchanged.

Next: safe idle migration/downgrade behavior, authenticated optional delegation consent and status UI, default-off production integration, four-host/two-Node execution acceptance and installed-session visual acceptance. These must not turn Think/Split/Remember into parallel product switches. Existing Phase 1 #236 is not modified by this local slice. No push, GitHub mutation, merge, release, deployment, daily-profile change or real-account experiment occurred.

SIGKILL at selected completed operations is not arbitrary instruction-level crash coverage, actual hardware power-loss certification or disk-corruption recovery. Same-user hostile processes are not an OS sandbox boundary. Real model quality, cost and usefulness remain unverified.
