# Consolidated Phase 1 validation

Runtime/source: `7bb8e280763e337db0001a89c73dd92b236a420e`, whose sole parent is main `1748bec2d7cfd6ec72ef64ed6bf341bb47be0424`. Subsequent matrix-fixture/evidence changes do not alter product source or built bytes. PR #236 targets main directly. #232–#235 remain open at the inspected original heads.

## Local final runtime checks

macOS, Node `24.13.0`, pnpm `10.30.3`.

| Command / check | Result |
| --- | --- |
| `pnpm run check` | Exit 0; 108 files / 1,094 tests; release/canary contracts, source lint, host/client types, build, proxy import, CLI, compatibility and package checks passed. |
| `pnpm run test:browser` plus corrected task-suite rerun | 38 tests across 9 files covered. One newly added test initially called unsupported `uncheck`; changed to a real click, then all 6 task-control browser tests passed. The unchanged other 32 had already passed; PR CI also runs the complete suite. |
| `node scripts/check-adaptive-task-ui.mjs` | Exit 0; JSON report requires all 6 HTTP/auth/browser cases passed, no pending/todo. Actual signed-cookie Connection auth, product registration/adapter and real control; enclosing page and provider/account are synthetic. |
| `node scripts/check-adaptive-task-persistence.mjs` | Exit 0; 4 distinct processes; both plain and Zstandard write/resume retain original requirement and reservations 2 → 3. Final fixture bundle SHA-256 `bcea5079ab2f046792efa0a687031bc72687d32121b06cc8b68c71b445a659aa`. |
| `node scripts/check-adaptive-task-matrix.mjs` | Exit 0; four declared hosts, each 36 functional cases + 1 exact ESM runtime identity. 144 functional executions, 4 identities, zero test network attempts or real provider dispatches. See `ADAPTIVE_TASK_CONSOLIDATED_MATRIX.json`. |
| `git diff --check` | Passed. |

The dedicated task matrix installs only its 16 actual runtime roots and keeps the complete DSH dependency override closure at the chosen version. ESM resolution, package versions, same test bundle, complete case list and distinct process identities are checked. The full DSH CLI/profile package installation remains the separate existing `check:dsh-matrix` gate. The two tests cover different boundaries and cannot substitute for one another.

An early local full-install matrix ran while documentation/build work was still changing. All four host subprocesses passed, but the aggregate correctly rejected unequal package digests. That run is **not** claimed as same-artifact acceptance. Exact-commit remote CI repeats the complete installation matrix on a frozen checkout; use PR #236 Checks for its outcome.

## Independent review and corrections

A separate read-only reviewer inspected the runtime, store, HTTP identity, request scope and checkpoint handoff, then reran host/store/matrix-contract checks. Concrete corrections were validated for canonical cookie authority, interrupted activation until journal flush, host stop revocation, queued stop/manual/dispose, exact effort authorization, catalog-independent revocation, malformed checkpoint source/range/content, and native/ordinary compaction handoff. No remaining reproducible source blocker was reported. Review did not call a live model or modify user services. HTTP/browser execution and the four-host matrix were run by the coordinating agent, not attributed to the reviewer.

Two initial review claims were corrected after inspecting evidence: HTTP fixtures do load the actual Product plugin; raw Host handling was a reproducible canonicalization compatibility issue, not a demonstrated authorization bypass. Auxiliary professional-tool models retain separately configured authority; they share task request accounting and do not inherit the main-model scope.

## Environment and corrected harness failures

- Default local Node 26 rejects an old experimental flag in pre-existing compaction probes, producing 25 startup failures. Full verification used the existing Node 24 binary; no test was disabled or product logic changed for this environment difference.
- The first dedicated matrix installation failed in npm 11.6.2 dependency resolution. A broad newer-npm install was explicitly stopped and cleaned by the runner when the fixture was narrowed to actual task imports. The first narrowed fixture exposed the missing `dsh-home-paths` dependency before cases ran; it was added to both installation and identity checks. The final four-host run passed without `--force` or `--legacy-peer-deps`.
- The authenticated UI script's inherited human-output substring check did not match the runner's output despite all 6 cases passing. It now validates the structured report and rejects skipped cases.

## Scope remaining unaccepted

All new provider responses and credentials are synthetic. Full installed daily Gateway/Session-page human acceptance, real account/model availability, real handoff quality and economic comparison remain unaccepted. The evaluation corpus is a plan, not results. Browser authorization is bound to the exact signed credential; cross-device/new-cookie recovery is not implemented. Request counts are not price or subscription-quota caps. No merge, release, publish, deployment, default activation, real account use or old-PR closure occurred.
