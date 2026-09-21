# Adaptive Runtime M3 candidate verification — 2026-09-21

## Identity and scope

- Base: M2 #233, `725cd930dc6b74a1d8df4d6f7f9ce7e30c49e77b`, stacked on unmerged M1 #232. Released main remained `1748bec2d7cfd6ec72ef64ed6bf341bb47be0424` at delivery preflight.
- Initial M3 implementation: `059e935f12adaf9e42daa378e42b1cf1eccee03f`.
- Final reviewed source: `d53576a49730d234276233d8b8ed73aab5b85abf`, which corrects the output-token-limit disclosure and tests the actual native consent detail.
- Existing `0.1.0-alpha.4.39` package identity is a development baseline, not a new release or the immutable public 4.39 archive. The candidate is identified by commit and artifact hash.
- New Split files/tests originate from #200 at `83f6a021a754e18e076a7d003d6ae98ca58dbd20`. The original branch is unchanged. The M3 entry is internal host staging, not a public installed feature or a migration of #200's separate browser transport.

## Final local source checks

Node `22.22.3`, pnpm `10.30.3`, baseline DSH `0.1.2-rc.1`, pi-ai `0.84.4`.

- Offline dependency installation with lifecycle scripts disabled succeeded. Only two exact development spawn dependencies were added; no runtime dependency, public export, version, support range, or feature default changed.
- Final `pnpm run check`: **123 test files / 1,341 tests**, exit 0; includes lint, both typechecks, build, release/canary contracts, environment-proxy import, capability CLI, compatibility and package checks. This reran after the output-token disclosure correction.
- New composition gate: **31 real-host/synthetic-provider scenarios** in the full test run. The earlier focused subset passed 85 tests across five files after the explicit argument guard.
- Chromium regression: **8 files / 38 tests**, exit 0 on the initial M3 implementation. The later correction changes internal Split consent detail/tests/docs only, not browser code; final PR CI repeats the browser regression.
- `node scripts/check-think-controls.mjs`: four actual native question/selector component flows passed, zero external requests. Its bridge explicitly reports `gatewayTransport: false`; this is not full M3 authenticated Session-page acceptance.
- Final package dry-run/pack: 100 files, 1,311,901 packed bytes, 2,349,232 unpacked bytes. SHA-256 **`8d935ab184080a7cd86164306479ef03e36c44ed2511583747aff1423dfeb260`**. The generated public `lib` remained clean after build. The evidence files under `.github` are excluded from the package.
- `git diff --check` passed. Default settings, `src/index.ts`, client code, native-compaction implementation, declared compatibility and existing verified-compatibility records were unchanged relative to M2.

See `ADAPTIVE_RUNTIME_M3_ARTIFACT.json` for the final local artifact identity.

## Preliminary local four-host evidence (not relabeled as final source)

The saved local matrices deliberately retain their actual source **`059e935`**, before the output-token disclosure/test correction:

- `ADAPTIVE_RUNTIME_M3_THINK_MATRIX.json`: all four exact DSH hosts passed **73 functional cases plus one imported-runtime identity check each**. These include all 42 prior Think/M2 cases and all 31 M3 cases: 292 functional executions plus four identity checks. The test processes attempted zero external network connections and made zero real provider requests. Bundle digest: `b60a2681f59c635d492b5fe02a8d88094e7a484cade0ea480b58fd9320f66a6f`.
- Hosts: `0.1.2-rc.1` with pi-ai `0.84.4`; `0.1.5-alpha.1`, `0.1.5-rc.1`, `0.1.5-rc.2` with pi-ai `0.85.1`. All imported DSH runtime identities matched their exact host, not neighboring installations.
- `ADAPTIVE_RUNTIME_M3_MATRIX.json`: four isolated installs used identical preliminary package bytes, SHA-256 `be4c4b8f9c91dab53964312095b26d5ba255684dbe98ba0b6686c07d19645061`, all defaults false, eight models prepared, disposal/Reserve/image regressions passed.
- Installation regression included **64 fresh Think/Remember processes** and **40 prior Remember processes**. This is not worker persistence: the M3 worker continues to refuse a mounted persistence service.

The preliminary package hash differs from the final artifact because the disclosure documentation changed. It must not be used as a final-head installation claim. Final exact-head PR CI runs both full four-host matrices again on Node 22.19.0 and 24.x, plus browser, Windows, dependency review and stacked CodeQL. Current CI outcomes belong to the PR checks and readback comment; this preparation record does not predeclare their success.

## Review findings and corrections

1. Added a negative extra-scope case. The native tool's `additionalProperties: false` declaration did not itself reject extra arguments on the baseline host. The values were not used to enlarge authority, but accepting them contradicted the contract. The worker now rejects nonempty/malformed arguments before any approval or child creation. The test failed before the guard and passed afterward.
2. Kept a refused native delegation distinguishable from a temporary provider failure using a nominal, allowlisted admission error. Arbitrary callback/provider error text remains redacted; no new retry path is introduced.
3. Distinguished failed cleanup from ordinary cancellation. The decision must not become completed, and the shared adaptive-action lock remains quarantined after failed disposal even when the registry no longer shows the child.
4. The inspected pi-ai 0.84.4 Codex serializer does not put `maxTokens` on the wire as `max_output_tokens`. The native review now labels 2,048 as **requested**, includes `serverOutputTokenLimitVerified: false`, and warns that it is not a service-enforced token/subscription-spending cap. Tests inspect that exact review. Request count, cooperative deadline cancellation and local payload/response/source/result byte limits are enforced; no undocumented service parameter was invented.

Initial missing-import/test-type errors were corrected before the passing final full check. One `apply_text_edits` call was rejected for invalid wire arguments before mutation; subsequent guarded contextual patches completed. These process failures are not permission denials or evidence of live model behavior. No delegated coding-agent launch was attempted or routed around.

This is implementing-agent source review plus executable negative/regression gates, **not** an independent human or separate-agent approval.

## CI-discovered test readiness correction

The first PR CI run `35592667958` on head `f3a8dc1` failed its Node 22.19.0 ordinary test step: 1,340/1,341 passed, with the existing gallery focus test asserting a dialog while its thumbnail still displayed `Loading image`. Its test and product component were byte-unchanged relative to M2. Waiting for the loader mock to have been called did not wait for its Promise to settle or React to render the loaded image.

The follow-up changes only `tests/codex-image-gallery.client.spec.tsx`: a controlled unresolved Promise now proves that an early click does not open the lightbox; the test explicitly resolves it, waits for the actual image, and retains every portal/style/Escape/focus/single-load assertion. Two neighboring opening tests also await the actual image instead of invocation count. No product component, timeout, skip, retry allowance or assertion was weakened. Final-head CI must pass anew; the initial failed run remains historical evidence. This test/evidence-only correction does not change the packed artifact hash above.

## Remaining acceptance and delivery boundaries

- Public staging/workspace selection, the full authenticated M3 conversation UI, and production registration are not implemented by this candidate. The host must stage a fixed task and evidence explicitly; the parent model does not autonomously invent subtask scope or budgets.
- Durable worker grants, budget reconstruction, cold restart/resume and installed persistent-profile operation remain unsupported. No global persistence guard was removed to make the experiment appear usable.
- The synthetic parent can raise effort, compact natively or through ordinary fallback, delegate a fresh context-isolated Luna/low child, consume structured evidence, and separately lower effort. This does not establish live Astra protocol acceptance, optimal recommendation quality, task correctness gains, shorter task time or subscription savings.
- Usage samples are bounded and content-free, keep missing counters unknown and do not count stream termination as successful task completion. M3 adds no extra per-request planning call, price estimator or telemetry upload.
- No merge, release, deployment, daily profile/service/port change, real credential access or live model request is included. Original Think/Split branches and released main remain independent.
