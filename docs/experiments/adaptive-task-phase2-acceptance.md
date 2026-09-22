# Phase 2 E: exact-host and installed Session acceptance

Authority: user approved the next step on 2026-09-22 after local `dcd5cab`. Source of truth: Phase 2 design, A–D contracts, current isolated branch and declared compatibility. Existing README/design/contracts/checkpoint satisfy the documentation roles; no duplicate project skeleton.

Goal: verify identical Phase 2 cases on all four declared hosts and Node 22.19.0/24.13.0, then integrate the reviewed default-off composition into the product and verify the installed authenticated full Session journey.

Scope: dedicated matrix/checker contract, exact runtime identity and synthetic-network guards; installed-page synthetic provider/control harness; narrow product composition/artifact ownership; tests and evidence. Main-task selection and child consent remain separately opt-in. No model/provider permissions or defaults are broadened.

Out of scope: existing daily profiles or ports 3080/3081, real credentials/provider requests, GitHub writes/push, merge, release, publish, deployment, account eligibility or cost/quality claims. Public registry/runtime downloads for disposable tests are allowed; they do not transmit project data.

Plan:
1. Verify clean D commit and relevant project/compatibility contracts.
2. Build one Phase 2 test bundle and validate four exact isolated host closures on both Node targets, including package identity and no skipped/failed cases.
3. After the matrix passes, wire a single default-off composition and per-root private artifacts in the product entry; rerun relevant old/new regressions and full check.
4. Install committed candidate bytes in a fresh exact host profile; use native shell/Session/Composer/picker/Stop, with synthetic credentials/provider and denied external dispatch.
5. Verify explicit grant, bounded parent/child workflow, shared counts, recovery without replay, stop during child, manual model choice, safe downgrade and owned-resource cleanup; independently review and write back.

Verification: dedicated matrix contract tests and both runtime reports; `pnpm run check`; browser and authenticated control regression; full installed Session checker with package hashes and actual host identity; `git diff --check`. Failed runs retained, no green-count substitution for full-page evidence. Product integration must not precede a passing exact-host gate; final release readiness is not implied.

Status: in progress. No unresolved product decision; cross-device ownership and real-provider usefulness remain explicitly outside this slice.

## Findings during the gate

- npm 11.6.2 rejected the exact peer closure with conflicting override sets, including with every peer-only root explicit. The same closure installs with npm 10.9.3 and full peer checks. The checker records installer identity; local Node 24 and CI use the pinned acceptance installer, not `--force` or `--legacy-peer-deps`. This is an acceptance-installation limitation, not evidence of a provider or running-host defect.
- A transient public registry read failed after the first successful host. Exact public manifests now have a name/version-validated cache and at most two read attempts; dependency resolution still pins every DSH package.
- The first real alpha.1 host run rejected `agentCtx.agent` during unpublished setup. Removing that unused read exposed the second compatibility difference: alpha.1 requires `options.parentAgent`, whereas baseline derives ownership from the caller context. The bridge supplies both and still rejects a returned child with mismatched live ownership before any run. Runtime `isLive` checks continue to compare agent/session instances and parent ownership. Failed runs are retained; baseline-only greens did not authorize product integration.
- The pre-integration gate passed all eight host/Node combinations at bundle `3f26325a9b2132585f59b2032cfd6045c984817ffc5da9d3f0e7a33d0f06d136`: 128 named checks and 18 crash cases/36 fresh processes per combination. Only then was `src/index.ts` changed to construct one default-off composition, with owner/session-keyed artifacts.
- Integration exposed an optional-service boundary that privileged root-context fixtures did not test: the product only injects `llm`. Task code now resolves agent/session capabilities through the host's optional-service API, fails closed for incomplete live-task contexts, and preserves ordinary standalone streams/auxiliary work. Consent fixtures now use an actual llm-only plugin context; two regression cases add absent/incomplete-service coverage. The final matrix therefore has 130 checks per host and is rerun against the changed bundle.
- A fresh baseline full profile resolved Cordis 4.0.4 / loader 1.0.5 / HMR 1.0.19 / timer 1.1.6 and exited before page readiness. Removing this candidate from the temporary profile reproduced the same stock failure. Loader 1.0.5 no longer awaits the created plugin fiber in `Entry.init()`, but this DSH launcher immediately expects the HMR service. The installed-page fixture pins the Cordis versions explicitly declared at the selected DSH release's caret floors (baseline: 4.0.2 / loader 1.0.3 / include 1.0.7 / HMR 1.0.17 / timer 1.1.4), keeps HMR enabled, and records/asserts actual versions. This does not repair or certify the newer stock vendor combination.
- The full page then exposed a real child failure before provider dispatch: the inherited deployment persona required `{{cwd}}`, while the evidence-only child intentionally has no workspace. The child now installs a complete scoped evidence-helper persona and suppresses ambient runtime context through the host's public scoped prompt API. Tools and enforcement remain host-owned. Regression verifies successful execution without cwd, absent parent ambient content, and unchanged parent prompt/context. The native title request is retained and counted, not suppressed to match the smaller fixture's request count.
