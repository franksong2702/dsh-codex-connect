# Adaptive Runtime M1 engineering validation — 2026-09-21

This is an unreleased integration candidate, not a product-acceptance or savings claim.
The branch retains the existing Think stack through #224 and reconciles it with released
main `1748bec2d7cfd6ec72ef64ed6bf341bb47be0424`; the integration merge is `c00755f`.
Runtime implementation is `1ef25e65d255a853ae8aceba27cdf0e9cbe1f0a1`.
The installed-default correction is `e38afc679f56ab1f985eb0dbe6581fbc1052ead0`
(tree `1e1e0d82c0f58d937cbfe8d0a45e7292153b1919`). Subsequent evidence-only changes
under `.github/` do not change runtime or packed-package bytes.

## Local checks actually completed

Environment: macOS, Node `22.22.3`, development DSH `0.1.2-rc.1`, pi-ai `0.84.4`.

| Check | Result and scope |
| --- | --- |
| `pnpm run check` | Exit 0, 115 files / 1,192 tests, including source/metadata lint, host/client typecheck, build, release/canary contracts, proxy import, CLI, compatibility and package checks. Repeated after the installed-default correction. |
| `pnpm run test:browser` | Exit 0, 8 Chromium files / 38 tests on the same runtime/UI source. |
| `node scripts/check-think-controls.mjs` | Exit 0, approve, reject, disable-pending and cancel flows. Actual published native question/selector controls, but a test-only RPC bridge: `gatewayTransport: false`, external browser requests 0. The approved sequence goes High then Medium; approval alone does not advance the recorded selector. |
| `node scripts/check-think-matrix.mjs` | Exit 0, 35 functional cases on each of four exact hosts (140 total), plus four actual ESM runtime-identity checks; all test-network attempts and real provider dispatches 0. |
| `node scripts/check-canary-workflow.mjs` | Exit 0, 82/82 assertions after the new negative default checks were demonstrated failing before the checker fix. |
| Focused bundle/Think settings contracts | Exit 0, 3 files / 7 tests after the installation patch correction. |
| `git diff --check` | Passed. |

The Think host matrix used one identical source-test bundle:
`ae98b5bc3ea6a9afbf294d1d1c14227dcdabe106881b7251044a2c3591d3c7bf`.
Hosts were `0.1.2-rc.1` (pi-ai `0.84.4`), `0.1.5-alpha.1`, `0.1.5-rc.1`
and `0.1.5-rc.2` (pi-ai `0.85.1`). This is a dedicated native-admission/settings
matrix, distinct from the installed-artifact Think/Remember lifecycle matrix below.

## Review finding and causal regression

The initial installation matrix did not assert the new Think default. Adding checks for
an enabled or missing `enableReasoningUpdates` produced two expected contract failures.
The checker was then strengthened. Its first fresh installed-host run failed because
`cordis.patch.yml` omitted the explicit Think row; runtime schema/settings defaults were
already false. A focused bundle regression independently reproduced the missing row.
The install patch now explicitly sets `enableReasoningUpdates: false`, and both the
actual dumped configuration and the matrix report require literal false. No failure was
converted to a passing observation, and no user installation was modified.

## Installed-artifact composition gate

Fresh four-host revalidation of the corrected install patch completed with exit 0 on
source `e38afc679f56ab1f985eb0dbe6581fbc1052ead0`. The machine-readable companion
record is [ADAPTIVE_RUNTIME_M1_MATRIX.json](ADAPTIVE_RUNTIME_M1_MATRIX.json).
All four hosts used one identical packed artifact, SHA-256
`6921b3eeef3ace60059f73ad65a878d089d7945e501590f7f4e5399250b0a729`.
Each actually installed configuration retained `enableReasoningUpdates: false` and
all other optional defaults false. Eight models prepared, disposal and Reserve
transitions passed, and synthetic image tests made zero real provider requests.

The required gate uses the actual installed plugin, DSH AgentLoop, native question
service, compaction engine and physical JSONL storage. Each host runs 16 distinct
processes across native/fallback modes and plain/Zstandard encoding: writer, fresh
restore plus downgrade, another fresh restore, and six fault/cancellation/manual
selection scenarios. The pre-existing 10-process Remember suite and image/Reserve
checks remain separate. Across four hosts this is 64 distinct Think/Remember
processes plus 40 existing Remember processes. The fault phase includes cancelled
compaction, an approved-but-unadmitted change before compaction, manual selection
after compaction, refusal, automatic pressure and canonical system-head refresh.
All provider replies and credentials in these tests are synthetic. The candidate's
unchanged version string does not make this artifact the published Alpha 4.39 package.

## Remaining gates and delivery boundaries

- Full authenticated Session-page transport and human experience are not established
  by component testing or a synthetic RPC bridge.
- Live Astra behavior for checkpoint-adjacent configuration updates, actual quality,
  latency, usage/cache efficiency and quota savings remain unmeasured.
- Cross-account/model/child/fork histories, arbitrary journal pruning and complete
  interrupted-write recovery remain unsupported or unaccepted. The trusted original
  host journal remains necessary; a detached summary is not reasoning authority.
- M2's shared decision interface and M3's bounded Split composition are approved next
  stages, not delivered by M1. Original #220–224 and #199/#200 remain unchanged.
- The delegated M2 coding-agent start returned HTTP 403 with no Run id or execution
  result. It was not retried through another execution channel; no independent review
  approval or delegated implementation is claimed. Independent M1 checks continued.
- Exact-head GitHub CI is separate and must be read back from the resulting PR.
  No merge, publication, deployment, live credentials/model calls, default enablement,
  changes to npm channels, or daily 3080/3081 services are included.
