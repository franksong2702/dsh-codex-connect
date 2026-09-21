# Adaptive Runtime M2 candidate — 2026-09-21

Branch `franksong2702/adaptive-runtime-m2` builds on M1 PR #232 at `2f135e7`; main remains the separately released Alpha 4.39 baseline. M2 adds a thin internal Observe → Recommend → Admit → Apply flow to the existing Think host integration. Explicit `keep` and same-effort proposals produce no confirmation or configuration change. Actual changes still require the exact native human answer, a current host observation and the validated journal/request header; local application is not remote request success.

Content-free, per-live-Agent memory observations retain at most 64 decision transitions and 64 adapter-stream results (elapsed time, bounded outcome and available usage fields). There is no extra model call, persistence/telemetry upload, price estimate or new default. Missing usage is not zero, stream endings are not task correctness, and synthetic fixtures do not establish savings. M1's journal/compaction/restart authority and the #227 backend governor are unchanged.

See [M2 scope and measurement limits](../experiments/adaptive-runtime-m2.md) and `.github/ADAPTIVE_RUNTIME_M2_VALIDATION.md` for exact candidate evidence. M1 and M2 remain unmerged engineering candidates; complete authenticated Session-page human experience and live Astra acceptance remain separate. M3 is the approved next milestone: one bounded read-only Split action under the same decision vocabulary, without bypassing its independent host permission/source/budget/cleanup contract. The original #220–224 and #199/#200 branches are preserved. No daily service, release, credential or live model call is changed here.

---

# Adaptive Runtime M1 candidate — 2026-09-21

Isolated branch `franksong2702/adaptive-runtime-m1` reconciles Think #224 `c279420` (including #220/#221/#222) with released main `1748bec`; the original draft PR branches are unchanged. The integration merge is `c00755f`.

M1 now derives admitted reasoning state from the original host journal and validates correlated prefix-compaction checkpoints instead of requiring every approval to stay in model-visible history. Ordinary/native-summary fallback, disabled replay, lower-effort continuation, cancellation, pending invalidation and manual priority have dedicated synthetic tests. Provider serialization, backend governance and real DSH persistence remain the execution path. Cross-process/four-host acceptance is a mandatory candidate gate; consult the exact-head PR and `.github/ADAPTIVE_RUNTIME_M1_VALIDATION.md` when available rather than reusing historical passes. No live Astra acceptance or savings are established.

M2 (thin Observe → Recommend → Admit → Apply interface, reasoning first) and M3 (bounded read-only Split integration) remain approved follow-ups, not completed, merged or enabled. The goal is task quality per unit of resource/time, not independent switches; M1 establishes composition, not an optimizer. No release, deployment, real credential/model call, default change or 3080/3081 service operation belongs to this candidate. See [M1 design and validation boundaries](../experiments/adaptive-runtime-m1.md).

---

# Alpha 4.39 published checkpoint — 2026-09-21

Alpha `0.1.0-alpha.4.39` was published from `e78f934b77685fd653a91d0109a043b489d52116` through successful workflow `35552461838`; exact-main CI `35552132368` passed first. npm `alpha` now points to 4.39 while `latest` remains separately managed at 4.34. The public npm archive, tag and GitHub prerelease were independently read back and match the release commit and tested artifact. See [publication verification](../../.github/ALPHA_439_PUBLICATION.md). #227 centralizes authenticated `chatgpt.com/backend-api` request governance across Model/pi-ai, Search, quota, image generation, Auto-review and native compaction. It preserves pi-ai's model identity, uses honest plugin identity on plugin-owned direct routes, adds per-attempt correlation, bounded admission, cancellation/deadline composition, proxy lifetime and server-directed lane cooldown. It does not establish the unverified risk-control hypothesis from #219.

The second review of #227 found and fixed response-lifetime/cancellation leaks, cooldown admission races, queued deadline gaps, Request-signal propagation and authenticated redirect risks before merge. All eight exact-head GitHub checks passed on the corrected head. The overlapping #226 is now closed as superseded and must not be revived independently.

## Current Adaptive Runtime tracks

| Track | Current state | Next gate |
| --- | --- | --- |
| Remember #65 / #196 | Native compaction mechanism is merged, released and default-off; bounded real A/B and preview evidence exist. | Real-provider durable restart/fork/fault/accounting/long-task acceptance remains broader than current synthetic and bounded live controls. |
| Think #220 → #221 → #222 → #224 | Four stacked draft PRs cover replay isolation, native admission/cancellation, four-host lifecycle, saved default-off opt-in and native UI controls. #167 is now historical/conflicting. | Rebase/replay the stack onto current main after #227, then verify authenticated Session-page transport and human experience before considering merge. |
| Split #199 → #200 | Draft design plus bounded read-only worker; exact-host and Chromium/Gateway/Conversation synthetic acceptance are substantial. | Human usefulness, persistent permission/budget reconstruction, restart/resume and real-task value remain unaccepted. |

The umbrella remains #195. Think/Split are not included in Alpha 4.39. Do not infer composability merely because Remember is already on main.

## Compatibility and open acceptance

Declared DSH hosts remain exactly `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, and `0.1.5-rc.2`. #211 remains an upstream DSH 0.1.6-alpha.2 peer-resolution repair tracker; the proposed host-side repair was delivered to the upstream Discussion but is not a stock release. #207/#183 retain their separate broader acceptance scopes.

#219 remains open for the external reporter to confirm whether the original persistent overloaded condition recurs under comparable normal use. #215 remains primarily blocked on the reporter's missing local profile archive evidence. #194 waits for natural Luna Reserve eligibility rather than manufactured exhaustion. #208 remains an independent opt-in “new session Fast Mode default” enhancement.

Alpha 4.39 is released; the post-publication documentation update changes repository guidance only and does not republish npm. No daily service, live credential/model, `latest` promotion, or experimental default changed. Candidate evidence remains in [.github/ALPHA_439_RELEASE_READINESS.md](../../.github/ALPHA_439_RELEASE_READINESS.md); immutable publication identity is in [.github/ALPHA_439_PUBLICATION.md](../../.github/ALPHA_439_PUBLICATION.md).

The dated checkpoints below are historical and retain their original scope.

---

# Alpha 4.37 published checkpoint — 2026-09-19

Alpha `0.1.0-alpha.4.37` was published from `5cbd0d330d12c81f0bf37515b65bc799e480aa78` through successful workflow `35439115133`. The npm archive equals the final tested artifact; the Git tag and published GitHub prerelease match the release commit. `alpha` is 4.37; `latest` remains 4.34. See [publication verification](../../.github/ALPHA_437_PUBLICATION.md). No service or default changed, and no new live-model request was made. The local DSH repair, Think and Split are not included.

## Historical preparation checkpoint — 2026-09-19

#216 was normally squash-merged at `525e01b6e1c2b7d23ba70e29510ef1fd31fb0168`; the merge tree equals the reviewed `1e05677` tree. Main CI `35436177342` passed. This branch prepares 0.1.0-alpha.4.37. The maintainer subsequently authorized publication through the normal candidate-review/main-CI/OIDC workflow on 2026-09-19; a prepared branch is not publication evidence. `latest`, running services and live model calls remain outside scope. See [release readiness](../../.github/ALPHA_437_RELEASE_READINESS.md) and [draft release notes](../release-notes/alpha-4.37.md).

Remember's bounded real A/B restart controls are on main. The user preview on DSH 0.1.5-rc.1 also produced a real automatic native checkpoint and completed subsequent tool-assisted work. Its checkpoint survived a normal preview restart; the deployment check sent no post-restart model continuation. Broader #196/#65 acceptance remains open.

The checkpoint-only retry repair at local source `2e5469e` was applied only to the preview host. It is NOT installed by this plugin candidate. Stock alpha.2 support remains undeclared (#211).

Split #199 (`b0bbbbb`) and #200 (`8883bc5`) remain unmerged drafts; #200's seven checks passed, including supplemental CodeQL and separate Split host matrices. Think #167 remains unmerged. None is included in this release. #215 remains open for reporter recovery. The maintainer-supplied excerpt and an offline control identify a missing local archive in the web-profile dependency set, not a declared plugin dependency; this is not currently a confirmed 4.37 regression blocker. UND_ERR_DESTROYED causality and the reporter's environment remain unverified. See [the bounded triage](issue-215-install-triage-2026-09-19.md). #182 was closed as superseded/not planned, not verified support. #208 remains an enhancement; #194, #183 and #207 retain separate acceptance scopes.

The dated checkpoints below are historical and retain their original scope.

---

# Remember delivery checkpoint — 2026-09-19

Remote main was rechecked at `574d55f2f990053c64fabd3fb8867318875183a4`: #212 and #213 are merged. This Remember test/evidence delivery is based on that main and does not change product `src/`, built `lib/`, dependencies, supported-host metadata or experimental defaults. The September 18 checkpoint below is historical, including its then-open PR and unaccepted-live statements.

At test source `ad7c93481096b4750ede77dc93a19b241b7f11e0`, the separately authorized [real A/B controls](../experiments/remember-controlled-live-m15-2026-09-18-9n7e.md) both passed on plain Luna / DSH `0.1.2-rc.1`. A verified retained-user persistence; B verified assistant-origin recall with no target in non-compaction replay input. Each used four requests and distinct writer/resume processes. The [acceptance entry](../experiments/remember-acceptance.md) is the current scope reference.

The [earlier oversized-user failure](../experiments/native-compaction-durable-m15-2026-09-18-1317.md) remains failed and unexplained. Astra, actual UI/fork behavior, repeated/automatic live compaction, tools/images, fault recovery, accounting and long-task quality are not accepted by these controls. #196, #65 and #195 remain open; Think/Split are not incorporated. The [limited user experience plan](../experiments/remember-user-acceptance-plan.md) has no provisioned service or further model budget.

Current delivery authorization covers review, local commit, branch push, one PR and status synchronization only. No merge, package release, deployment, daily upgrade, new credential access or additional real model call is authorized. Exact-head PR checks remain separate from the historical live evidence. The #211 host-side repair evidence was delivered through #212; this PR does not certify stock alpha.2 or close #211.

---

# Adaptive runtime checkpoint — 2026-09-18

Repository: `franksong2702/dsh-codex-connect`. This is a dated checkpoint, not a live dashboard.
Source baseline: `eae9430f16f1707d8cefb76dec6e8344871d7684` (main, #210).
GitHub prerelease: `v0.1.0-alpha.4.36`, published 2026-09-17T14:15:19Z at that SHA.
The Astra/Remember delivery branch `franksong2702/astra-remember-delivery` is independently based on that main commit and is not part of that release. No current npm readback or deployment is implied. The original combined work remains preserved at `3de1b69`; compatibility tooling is delivered separately in [PR #212](https://github.com/franksong2702/dsh-codex-connect/pull/212).

## Current tracks

| Track | Implemented / merged / release state | Remaining gate |
| --- | --- | --- |
| Remember #65 / #196 | #197 merged as `78c8f71`; included in the 4.36 release record; native creation remains default-off | Real provider plus JSONL/process restart in one run remains unaccepted. See [the bounded acceptance contract](../experiments/remember-acceptance.md). |
| Think #167 | Open, head `7315795`; conflicts with main. September 17 history-format repairs are present. | Separate mechanism from proposal policy; refresh complete current-head validation. CodeQL success alone is not full CI. Compaction/multi-agent composition is not supported by this prototype. |
| Split #199 | Draft design, head `8b52da6`; mergeable but behind main at review time | Review the narrow contract against the current baseline. |
| Split #200 | Draft implementation, head `694b58e`; targets #199's design branch, not main | Current checks do not include CodeQL. Synthetic Gateway/Chat approval flows exist; human acceptance, persistence and real task-value comparisons remain open. |

The umbrella is #195. These are separate experiments, not three composable switches. No Think/Split source was incorporated in this follow-up.

## Compatibility

Declared hosts remain exactly `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, `0.1.5-rc.2`.

[#211](https://github.com/franksong2702/dsh-codex-connect/issues/211) stays open: alpha.2 changed ordinary startup from disk links to a process-local resolver without preparing peers for the separate `plugin exec` process. A local host-side repair passed a fresh isolated installation and was submitted in [upstream Discussion #5537](https://github.com/deepseek-ai/deepseek-harness/discussions/5537#discussioncomment-18498638). This is not an official alpha.2 fix. The diagnostic changes, upstream patch and pre-split evidence belong to PR #212, not this branch; neither PR depends on the other to run its tests.

Original CI run `35322318396` retained only the JSON-framing symptom. Concrete missing-package evidence came from later local reproductions; it was not recovered from the original CI streams. #207 and #183 keep their separate full-acceptance scope. #182 is an older undeclared candidate, not an implicit supported-version range.

## Authorized follow-up and boundaries

This delivery covers the [Astra context audit](astra-context-audit.md), scoped denial guidance and bounded Remember acceptance preparation. Preparing and pushing the two delivery PRs is authorized; merge, release, deployment, enabled experimental defaults, live credentials and new model requests are outside this task. The previously blocked real durable probe is not retried or routed elsewhere.

Capture fresh local validation separately from historical PR checks. A successful synthetic fixture does not establish user value, token savings or live provider acceptance. The [pre-split record](adaptive-runtime-validation-2026-09-18.md) preserves historical scope; use the delivery PR's exact head and Checks for its current remote CI.


---

## Historical Think-stack evidence (before integration)

# Think T2b saved opt-in and native controls — 2026-09-20

Branch `franksong2702/think-user-controls` builds on #222 `93d3b0f402075322f04b385a63b1de961ab663a6`. Read [the product behavior, evidence scopes and remaining gates](../experiments/think-user-controls.md). The product now registers host-owned replay guards while new proposals require the saved, default-off `enableReasoningUpdates` flag. Each target still requires an exact native human answer. Bilingual peer-level settings distinguish staged and saved choices; failed save, cancellation, disabling and admitted-history replay are covered. No other feature switch or model default is changed.

The final expanded schema-2 matrix passed all four hosts locally: **35 functional cases plus one runtime identity check per host**, including actual product settings, failed enable/disable and plugin remount, with zero test-network attempts. Evidence is in `docs/experiments/think-user-controls-host-acceptance.json`; bundle digest `bb02b1fe987cd9d4e7b4a50a3a11a4b06bc3f115fae1574a489b1d7dc1714743`. Final-code `pnpm run check` passed **108 files / 1,099 tests**; Chromium passed **38 regressions plus four native-control flows**. The prior schema-1 report below remains historical. Exact-head remote CI must be read independently after finalization.

The native-control Chromium checker uses actual product/host code and published question/selector components, but a bounded test-only Playwright transport, not the authenticated Gateway/session page. It proves approval/refusal/disable/dismissal and recorded-request selector behavior, not full deployed-browser, process-restart or live provider acceptance. Six additional settings browser cases cover English/Chinese and narrow/desktop layout. Native question controls are exercised in English. The two added development dependencies do not change runtime dependencies or supported-host declarations.

No merge, release, deployment, real credential access or real model traffic. The separate Split worktree and 3080/3081 services remain outside this task. Remaining: authenticated session-page transport and human experience, durable fault/restart recovery, Think/Remember/Split composition, then separately authorized usefulness measurement. Disabling suggestions does not reset admitted effort or lift the experimental-history limits.

---

# Think dedicated exact-host lifecycle gate — 2026-09-20

Branch `franksong2702/think-exact-host-matrix` is stacked on #221 at `b60327391ac337af3aa72755cef87124651d7a05`. Read [the dedicated matrix and remaining product gate](../experiments/think-exact-host-matrix.md). The same native admission spec and implementation bundle now run on all four declared hosts, independently of ordinary installation regression. The tested third-party framework may come from the development installation; runtime modules, versions and actual in-process identities must come from each selected host.

The new matrix first exposed fixture ESM/manifest resolution defects and then an actual test-composition difference: newer Agent factories require an explicit `parentAgent`. The fixture now creates a genuine owned child and verifies rejection plus complete owned cleanup, rather than misclassifying another root as a child. Think permission code is unchanged. A transient registry transport failure remains historical infrastructure evidence.

Final local full check passed **106 files / 1,092 tests**; the final exact-host matrix passed **31 functional cases + 1 runtime identity check on each of four hosts**, all with zero actual test-network attempts. Accepted report: `docs/experiments/think-host-matrix-acceptance.json`; bundle SHA-256 `8bd32b61e85de63886fda443ded04221b4fc8e560ab66e8dd9692388e229e069`. Both Node CI jobs now require this gate. New exact-head remote CI must be independently read back after delivery.

No product source/bundle/dependency/default or support-range changes, no new live model/credential access, and no merge/release/deployment. The #200 Split worktree and 3081 acceptance process (10758), and 3080 (1755), were rechecked unchanged. Next remains the explicit saved opt-in and real browser question/selector lifecycle, then separately scoped durability/composition/usefulness work. These synthetic host tests do not establish browser, disk/restart or real-provider acceptance.

---

# Think T2a native host admission — 2026-09-20

The `franksong2702/think-host-admission` branch is stacked on T1 #220 `4cf94eab9da5f3ed16e140b3921e669ae7913294`, not on Split. Read [the T2a contract and remaining gates](../design/think-host-admission.md). It composes real root ownership, native human questions, pending/durable request admission, cancellation/disable/disposal and subsequent manual effort selection with T1's exact-history replay. A narrow optional adapter seam is inactive unless explicitly supplied by the internal host integration. No product entry or user setting registers it.

Final-code local `pnpm run check` passed **105 files / 1,073 tests** on Node 22.22.3, including **31 new real-host/synthetic-SSE admission cases**, the 57 T1 cases and supplemental CI contracts (`wc_job_FELGOj_s16j1DVJD`). The runtime test host is DSH 0.1.2-rc.1 / pi-ai 0.84.4. It exercises native question service and configured request headers, not an actual browser answerer or real provider. The newly reproduced dropped-first-notice fault now fails before model dispatch; altered notices and later requests in the same integrity-failed runtime also fail closed without repairing the log. Fault-quarantine persistence/restart remains unaccepted.

The adapter source and its generated files change; production registration, frontend, feature defaults, release version, runtime dependencies and declared hosts do not. The lockfile adds only the exact native-question development package. Supplemental read-only CodeQL and its tested SARIF gate are reused from #200 because this PR targets another feature branch; final-head remote results must be read independently after delivery.

Remaining: T2b product opt-in and real browser question/selector flow, a dedicated newer-host Think matrix, durable fault/restart acceptance, T3 Remember/Split composition and separately authorized real-model usefulness. Do not call the ordinary install matrix four-host Think acceptance. #167 and #220 remain unmerged; no merge, release, deployment, real credential access or real model traffic is authorized here. The separate Split worktree and both 3080/3081 services remain untouched.

---

# Think T1 mechanism extraction — 2026-09-20

This independent `franksong2702/think-replay-mechanism` branch starts from exact post-4.37 main `e5772cd8a5c47f30b5ab14fe73d2901914348463`, not the deployed Split worktree. The user requested parallel development while accepting Split on 3081. See [the T1 contract and subsequent slices](../design/think-replay-mechanism.md).

T1 extracts canonical notice parsing, original-position wire replay and per-request provider scope from #167 `7315795`, with a separate exact admitted-history guard. The eager-provider-construction regression was reproduced against the extracted old code and repaired; three notice-movement/background-edit cases drove full-surface validation. There is no production registration, proposal policy/UI, history migration, changed default, dependency/version change or changed generated `lib/` output. The old #167 remains open and conflicting; this slice does not silently replace its full scope.

Final-code local `pnpm run check` passed **102 files / 1,032 tests**, including **57 mechanism/projection/scope tests**, on Node 22.22.3 / DSH 0.1.2-rc.1 / pi-ai 0.84.4 (`wc_job_05928S9Rez_oHGQM`). All source lint, TypeScript, build, CLI, package and workflow checks passed. The tests use real in-memory Session append/JSON restoration and synthetic provider hooks; no disk/process-restart, four-host Think or live-provider acceptance is implied. Remote delivery CI must be read back for the eventual exact PR head rather than inherited from these local results.

Split #200 remains at `83f6a021a754e18e076a7d003d6ae98ca58dbd20`; #199 remains `cc979bc`. Their branch files, the 3081 synthetic acceptance process and 3080 are outside this task. No new live-model requests, real credential access, merge, release, deployment or service restart. Next: T2 host-owned admission/cancellation/manual selection plus explicit default-off activation; Remember/Split composition and real task-value measurements remain separate.

---
