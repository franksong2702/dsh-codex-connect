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
- Loader's optional `node-addon-require-builtin` floor moves from ^0.1.6 to ^0.1.9. The frozen candidate does not install that optional peer for loader. An older 0.1.6 remains elsewhere in the graph; it is not claimed as a validated ^0.1.9 peer. Loader's internal-module discovery is unchanged and optional. Synthetic startup/checks cover the installed graph, not every native/HMR environment.

The original Dependabot branch is preserved. Latest main `66cce0142a59be68b048d356e9c43f7f198663e7` was merged normally into the isolated candidate. The compatibility checker is also aligned to the new exact Schemastery 3.18.5 manifest pin; it continues rejecting ranges and other versions. Rebuilding changes only pnpm dependency-path comments in `lib/bin.js`. No force update, support-range expansion or product implementation edit is needed.

## Validation

The first complete check passed 2,454 tests (2 skipped), then correctly failed at the separate obsolete Schemastery 3.18.4 pin. Four production-checker fixture cases reproduced that mismatch before the exact-pin correction. Final `pnpm run check` on Node 24.13.0 passed 173 files / 2,458 tests (2 skipped), build, compatibility and the 72-file package inventory. The exact-version guard tests passed 18 cases. Browser regression passed 97 cases. Exact-head GitHub CI remains a separate gate; its Linux/Node 22 and 24 host matrices must finish before merge consideration. Focused actual DSH JSONL/controlled-case/runtime tests passed 58 cases after the repair; the original exact-head failure remains recorded above. All provider responses and credentials are synthetic. No live models, credentials, daily services or GUI interactions are exercised.
