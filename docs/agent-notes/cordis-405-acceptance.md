# Cordis 4.0.5 dependency candidate (#391)

This is a maintenance candidate, not a release, daily installation, real-account or Desktop acceptance. Experimental defaults and supported DSH versions are unchanged.

## Reproduction and cause

On original PR head `e885d0ad93609ea453f70b9c79e03421c63371ba`, a frozen pnpm installation resolves Cordis 4.0.5, Schemastery 3.18.5, include 1.0.10 and loader 1.0.6. `node scripts/native-compaction-durable-smoke.mjs --offline` stops with `DURABLE_RUNTIME_MISMATCH`, zero dispatches and zero completed fresh processes. The existing JSONL persistence test fails at its expected exit status. The direct-runtime guard accepts only Cordis 4.0.4, before any credentials or transport.

The repair adds only the exact 4.0.5 direct-runtime set alongside the retained 4.0.4 set. DSH stays exactly 0.1.7-rc.1 and pi-ai exactly 0.85.1 for this narrower probe. Unknown Cordis versions, missing/extra metadata and mixed DSH versions remain rejected. Write/resume still independently read runtime identity and require identical metadata between processes; persistence, cancellation, fallback and replay checks are unchanged.

## Official package and installed-graph evidence

[Source audit](cordis-405-source-audit.json) records the ten exact official archives and verified integrity values. Every extracted file was compared:

- Cordis 4.0.4→4.0.5, Schemastery 3.18.4→3.18.5, include 1.0.9→1.0.10 and Cosmokit 1.8.5→1.8.6 change only package metadata; their implementation and declarations are identical.
- Loader 1.0.5→1.0.6 retains the raw imported module namespace after successful plugin registration. Its published JS, TypeScript source and declaration agree. Import/export normalization, registration and error handling remain in the same order. README and declaration source-map changes are also recorded.
- Updated peers bind the new Cordis/include/loader set, and loader requires Schemastery ~3.18.5. The frozen graph resolves these to the candidate versions. Every direct DSH component used by the durable probe resolves the same Cordis module; the regression checks this using the actual installed packages.
- Loader's optional `node-addon-require-builtin` floor moves from ^0.1.6 to ^0.1.9. The frozen candidate has no matching optional peer in loader's peer slot. Its ancestor module-resolution fallback can still resolve an older 0.1.6 elsewhere in the graph; this does not satisfy ^0.1.9 and that native-internals path is not independently validated. Loader's internal-module discovery and caught-error fallback are unchanged and optional. Synthetic startup/checks cover the installed graph, not every native/HMR environment.

The original Dependabot branch is preserved. Latest main `66cce0142a59be68b048d356e9c43f7f198663e7` was merged normally into the isolated candidate. The compatibility checker is also aligned to the new exact Schemastery 3.18.5 manifest pin; it continues rejecting ranges and other versions. Rebuilding changes only pnpm dependency-path comments in `lib/bin.js`. No force update, support-range expansion or product implementation edit is needed.

## Validation

The first complete check passed 2,454 tests (2 skipped), then correctly failed at the separate obsolete Schemastery 3.18.4 pin. Four production-checker fixture cases reproduced that mismatch before the exact-pin correction. Final `pnpm run check` on Node 24.13.0 passed 173 files / 2,458 tests (2 skipped), build, compatibility and the 72-file package inventory. The exact-version guard tests passed 18 cases. Browser regression passed 97 cases. Exact-head GitHub CI remains a separate gate; its Linux/Node 22 and 24 host matrices must finish before merge consideration. Focused actual DSH JSONL/controlled-case/runtime tests passed 58 cases after the repair; the original exact-head failure remains recorded above. All provider responses and credentials are synthetic. No live models, credentials, daily services or GUI interactions are exercised.

## Main synchronization — 2026-11-11

The candidate was merged normally with main `b343c1fd5052dd5f6138fd885d0dae7ccae2aeed`. The only textual conflict was the lockfile: pnpm regenerated the peer graph from main while retaining exactly the four candidate dependency upgrades. Zod 4.6.7, production Undici 8.12.3, jsdom Undici 7.30.1, fast-uri 3.1.9, Alpha13 metadata, Reserve retirement and the effort-control repair are preserved. No dependency from the separate #429 development-tool batch was added.

On Node 22.22.3 / pnpm 10.30.3, frozen installation and the complete check passed: 175 files, 2,480 tests passed and 2 existing skips, including runtime identity positive/negative cases and exact manifest rejection. Build output matched the merged tracked artifacts; the 74-file package inventory passed. Browser regression passed 15 files / 101 tests with Playwright 1.64.1. The offline durable probe completed two fresh processes, persisted/restored the identical checkpoint, and made zero real provider requests. Production audit reported zero vulnerabilities across 97 dependencies.

The first local test invocation had ten stderr/JSON assertions fail because the execution environment injected an experimental proxy warning. The unchanged full suite passed under the approved native execution path; assertions, security checks and network settings were not relaxed. Historical native/HMR and live-account/Desktop acceptance limitations above remain. Exact-head remote CI is still a separate gate; this synchronization does not merge or release the PR.
