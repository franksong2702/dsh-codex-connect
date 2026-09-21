# Adaptive Runtime M2 verification — 2026-09-21

## Identity and scope

- Repository: `franksong2702/dsh-codex-connect`.
- M1 base: PR #232, `2f135e7bea485e38edf97545050d433bca7c59bf`.
- M2 runtime/source commit: `bbd02a389a5efd276d21ae0bcbc45c325d8be24b`.
- Branch: `franksong2702/adaptive-runtime-m2`; intended PR base is the M1 branch, not an implicit merge of M1 into main.
- Local verification: Node `22.22.3`; pinned development pi-ai `0.84.4` / DSH `0.1.2-rc.1`. Independent matrices resolve each exact declared host and its actual provider dependencies.
- The package version remains the development baseline `0.1.0-alpha.4.39`; the commit identifies this UNPUBLISHED candidate, not the published 4.39 npm package.

M2 adds the internal reasoning-first decision flow and bounded content-free adapter observations. It keeps M1 journal/compaction authority and the released request governor unchanged. No M3 worker, automatic permission, new public endpoint, version bump, release, deployment or live provider call is included.

## Completed local verification

| Gate | Actual result |
| --- | --- |
| Host/client typecheck | Passed. |
| Focused decision, native host, settings, request-scope and Think/Remember tests | 7 files / 124 tests passed. |
| Complete `pnpm run check` | 116 files / 1,223 tests passed; release/canary checks, source/metadata lint, typecheck, build, CLI/proxy import, compatibility and package verification passed. |
| Chromium regression | 8 files / 38 tests passed. |
| `check-think-controls.mjs` | Four approve/reject/disable-pending/cancel flows passed with the real product/native controls and a test-only transport; `gatewayTransport=false`, external browser requests=0. |
| Exact Think/M2 host matrix | Four hosts each passed all 42 functional cases and one runtime-identity check (168 functional executions + 4 identity checks). Test-network attempts and real provider dispatches were zero. |
| Exact installed-package matrix | All four hosts passed using identical package bytes; eight models prepared, defaults unchanged, disposal and Reserve transitions passed. |
| Think/Remember installed composition | 16 fresh processes per host, 64 total; native and ordinary-fallback paths, plain/Zstandard storage, writer/resume/verify/fault phases. |
| Existing Remember regression | 10 fresh processes per host, 40 total, plus the existing synthetic image/direct/PTC lifecycle. |
| Diff and boundary checks | No changes to dependencies/lockfile, feature defaults, public declaration file, host adapter, native-compaction mechanism, journal replay validator or backend governor. `git diff --check` passed. |

Same package SHA-256 across the installed-host matrix:

`f749c6eb35ba659ac5673c9ebae19d6af960a59b13a38d5c4fd673257a89740f`

Same bundled Think/M2 test digest across the dedicated host matrix:

`c8d791afe3238c52c5529349a36fa6a758273ede8710988f6bd60f4750418b1b`

Machine-readable evidence is in `ADAPTIVE_RUNTIME_M2_MATRIX.json` and `ADAPTIVE_RUNTIME_M2_THINK_MATRIX.json` beside this record. All three evidence files are outside the npm package. Adding them does not change the tested runtime or its package bytes; current-head remote checks remain separately required.

## Review and negative evidence

The 24 new decision/measurement tests cover immutable observations, explicit no-op, unknown/extra-field rejection, copied/cross-flow tickets, strict state transitions, stale generation/selection, terminal refusal/cancellation, bounded retention, missing/malformed counters, cumulative usage replacement, concurrent stream isolation, exception propagation and early-consumer cleanup.

Seven additional real-host cases cover explicit keep without confirmation/notice, queued-versus-applied state, refusal/cancellation, applied configuration followed by provider failure, per-root isolation and journal-only restoration without telemetry restoration. These cases are required in the dedicated four-host matrix, not only the development host.

The first focused run had two failures in the matrix CONTRACT fixture: it still asserted the historical 35 functional cases / 36 including identity after the list grew to 42 / 43. Those expectations and the fixture were updated to the new exact case list; missing/duplicate/skipped/renamed/old-report rejection remains strict. The same focused command then passed all 124 tests. No product assertion or safety boundary was removed to pass it.

A malformed multi-edit tool request was rejected before writing. The unchanged source hash was checked by the subsequent exact-unique contextual patch, which applied the intended edits transactionally. No permission or execution-channel workaround was used. Source review in this task was performed directly against the implementation and tests; it is not an independent delegated-agent approval.

## What these results do not establish

The samples count adapter streams, not necessarily HTTP attempts or all retry costs. Stream duration is not complete task duration. Adapter usage fields remain optional and are not converted into money or subscription quota. A stream ending is not a correctness grade. Recommendation quality, real Astra configuration-update acceptance, full authenticated Session-page human experience, interruption cost and actual savings remain unaccepted.

M1 and M2 remain engineering candidates. M3 is the approved next implementation milestone: integrate one bounded read-only Split action without borrowing permissions from a reasoning approval. Later economic evaluation needs fixed-effort/single-agent controls and independent task acceptance criteria; synthetic usage is not evidence of savings.
