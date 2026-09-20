# Think: exact-host native admission matrix

Date: 2026-09-20. Tracks #195 / #167; follows T1 #220 and native host admission #221 at `b60327391ac337af3aa72755cef87124651d7a05`.

## Scope

This gate executes the **same** `tests/think-host-admission.spec.ts` on every host in `compatibility.json`, instead of treating ordinary plugin installation as Think acceptance. The test and its relative implementation imports are bundled once. Identical bundle bytes are copied into each disposable exact-version installation. The test framework is reused from the frozen development installation; DSH and pi-ai runtime code must resolve inside the selected temporary host. An additional in-process identity assertion checks actual module resolution/import identity. No user profile, service or real credential store is opened.

The 31 functional cases cover disabled defaults; native question approve/refuse; pending versus recorded effort; cancellation, disable, disposal and manual-selection races; exact consent; live-root versus child ownership; concurrent roots; upgrade/downgrade; prepared adapter replay; canonical history; and missing/altered first notices. `THINK_HOST_CASES` requires every named case, not merely a minimum count. A passing run also needs the identity case, no skipped/todo/failed tests, independent test processes and one common bundle digest.

`readThinkHostIdentity` uses Node's ESM import-condition resolver to locate the real entry and checks ancestor package metadata inside that same installation. A package need not publicly export `package.json` or offer a CommonJS entry. Unknown/mixed versions and escaped symlinks fail rather than falling back to the developer's host.

The registry installer may fetch public packages; it does not run package install scripts. During the actual test process, a setup-file tripwire blocks fetch and Node HTTP/TLS/socket dispatch. Per-case fetch replacements return synthetic SSE. The tripwire count is independently written and read back, rather than inferred from an absence of log messages. The npm download cache is project-local under ignored `node_modules/.cache/think-matrix`; runtime directories and their synthetic state are always disposable. Cached downloads are not borrowed runtime modules.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run tests/think-matrix-contract.spec.ts
node scripts/check-think-matrix.mjs --report docs/experiments/think-host-matrix-acceptance.json
```

Both Node validation jobs also run the matrix as a required CI step. The existing ordinary installation and browser checks remain separate. `think-host-matrix-acceptance.json` is written only after all selected hosts and report contracts pass.

## Current evidence

The final local matrix completed successfully on Node 22.22.3 in Job `wc_job_Mwwi2dqeVjB5ubvK`: all four hosts each passed 31 functional cases plus the independent in-process identity case (124 functional executions + 4 identity checks). The selected pi-ai versions were 0.84.4 for the baseline and 0.85.1 for all three newer hosts. Each test process recorded zero actual network attempts. The accepted report is `think-host-matrix-acceptance.json`, SHA-256 `50a17d092257d6f6c7115530be35248c03b9984ff8dabe7c36dda6cb6566af33`; its common test/implementation bundle digest is `8bd32b61e85de63886fda443ded04221b4fc8e560ab66e8dd9692388e229e069`.

Final-code local `pnpm run check` passed 106 files / 1,092 tests in Job `wc_job_wYpt-1Ju7SrokbkX`, including the 19 evidence/identity/CI contracts. Runtime source, generated product files, dependency manifests and locks, supported-host metadata and feature defaults are unchanged from #221. Exact-head remote CI is a separate required delivery readback; no older installation result is substituted for it.

The first two new matrix attempts stopped after installation, before functional cases, because pi-ai does not export its package metadata subpath and its root uses ESM import conditions. Native ESM resolution and bounded ancestor inspection corrected these fixture errors without weakening runtime path/version checks. A separate local runner smoke passed all 31 native-admission cases with zero actual network attempts; that smoke reused the development baseline and is not isolated four-host acceptance.

The next actual matrix passed the baseline and exposed one alpha.1 fixture error: the child test created another root, so its initial `isOwnedBy` assertion failed before testing authorization. Integrity-verified alpha.1 Agent/AgentLoop source showed that factory creation uses `options.parentAgent`, whereas the baseline infers ownership from the caller scope. The fixture now supplies the exact live parent while retaining the scoped creator. It additionally asserts exclusion from roots and successful Agent/Session removal after owned cleanup; no authorization assertion was removed. Baseline and alpha.1 then passed all 31 cases plus identity. A subsequent npm manifest transport failure prevented that attempt from reaching rc.1; it is infrastructure failure, not rc.1 functional evidence. Complete final-host results remain separate below.

## What this does not prove

Answers to the real native-question service are test callbacks, not browser clicks or a human-authentication test. Provider replies are synthetic SSE, not live endpoint acceptance. JSON restoration uses a new root/Context inside a test process; it does not establish durable permission/quarantine restoration across OS-process restart. The four-host gate does not enable Think, register a public tool, add a product setting, change defaults, or establish Think/Remember/Split composition or task-quality/latency/quota benefits.

The next product gate remains the explicit opt-in UI, saved versus staged settings, native browser question/selector behavior and cancellation/disabling through the actual settings lifecycle. The existing Split acceptance service on 3081 is outside this work.
