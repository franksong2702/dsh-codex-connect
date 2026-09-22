# Task-level Phase 1 validation

Candidate branch: `franksong2702/adaptive-task-phase1`, based on unchanged M3 `535b8f50f0eb48c9decd152a903f9a13115871d4`. This file records local evidence before the review commit; the associated PR's exact-head checks and follow-up comment are authoritative for CI. It is not a release or an independent review approval.

## Local evidence

- `pnpm run check`: 126 files / 1,381 tests passed, including lint, TypeScript, build, environment-proxy import, CLI, compatibility and package validation. The final cleanup removes unused live-Agent tracking and retains disposal cancellation; the complete check was rerun afterward.
- `pnpm run test:browser`: 9 files / 43 Chromium tests passed, including five Phase 1 English/Chinese, narrow-screen, lost-response and session-switch cases.
- `node scripts/check-adaptive-task-ui.mjs`: five tests passed: actual signed-cookie HTTP authorization plus actual Chromium control -> product endpoint -> native host loop -> model-requested Sol/Medium to Luna/Max handoff -> manual exit. Its page carrier and user-message form are isolated fixtures, not a daily Gateway/profile acceptance claim.
- `node scripts/check-adaptive-task-persistence.mjs`: four independent Node processes across plain and Zstandard JSONL; writer used two requests, restored task was interrupted, no request occurred before explicit resume, and continuation retained the original requirement and increased the same counter to three.
- `tests/adaptive-task-host.spec.ts`: 25 required cases including no mandatory routing, all four model candidates, no fixed commander, actual request admission, absent/invalid authority, browser owner/revision, manual/Default exit, compaction composition and shared auxiliary accounting.
- `tests/adaptive-task-store.spec.ts`: ten cases covering private/atomic storage, parallel independent store updates, malformed state, links, sizes and strict command schema.

The exact-host runner now requires **98 functional cases + one runtime identity check per host**, comprising 42 Think/M2, 31 M3 and 25 task cases. Its new task flag and strict case set reject old reports. Node 22.19.0 and 24.x CI also run the cold-process checker; browser CI runs the actual authenticated task control. Do not claim a four-host/current-head pass merely from this configured gate; inspect the final PR run.

## Findings corrected during implementation

1. Missing complete Agent registry in a standalone search fixture must not be treated as a live task. Attribution requires the actual host initiator and live object; the shared-count regression runs through the real AgentLoop rather than granting attribution to a bare out-of-turn ToolRuntime call.
2. Host compaction deliberately omits effort. Preserve its default behavior on the task route, check allowed capabilities, and charge its actual requests without inventing a selected effort.
3. Reopening the drawer initially exposed old model/count state before the new read. It now clears actionable state synchronously; authenticated Chromium reproduces and verifies the corrected flow.
4. Task state disappearing after restart cannot reset authority or budget. A standard host journal/inbox marker requires the separately verified grant; the marker is never itself permission.
5. Portable handoff cannot rehydrate all history forever. Expand only source-correlated old/foreign checkpoints, preserve the exact requested range, and let new target-route compaction reduce context again.
6. Manual takeover revokes unexecuted choices and cancels automatic work; the normal selector can subsequently change model or use Default, with compatible portable facts rather than opaque foreign replay state.

## Explicit limitations

All credentials, model replies and tasks are synthetic. No real account, model, quota probe, daily service, deployment or public release was used. Catalog capability does not prove account eligibility. The task ceiling is managed Codex request reservations, not money, token billing or subscription quota; unrelated third-party/background activity is not fabricated into this task. Handoff is the next request in the same host Agent/session, not a new isolated controller. Browser identity is the exact signed credential, not a named-person ACL; cross-device/new-cookie grant recovery remains unsupported. Native opaque checkpoints outside proven combinations may fail closed. Old Astra-only Think history is not migrated by the new-task entry. Subagents remain outside this phase, and no live performance, savings or optimal model-selection claim is made.

The twelve-task comparison specification is in `docs/experiments/adaptive-task-evaluation.md`; it is not an executed benchmark. Full daily Session-page human acceptance, current-head independent source review and separately authorized live protocol/value evaluation remain follow-up gates. Keep the PR draft and all user defaults unchanged.
