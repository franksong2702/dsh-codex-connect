# Consolidated Phase 1 candidate — 2026-09-22

This branch starts directly from main `1748bec`. Its current product contract is [task-level model selection](../experiments/adaptive-task-phase1.md): default-off, Sol/Medium, one task grant, bounded main-model/effort changes and handoffs, shared request accounting, safe stop/manual takeover and interrupted restore. #232–#235 are source/reference experiments superseded by this proposed integration route; their PRs remain open and unchanged. No Think/Split product setting or M2/M3 runtime is included. No merge, release, deployment or live account acceptance is implied. The dated checkpoints below are historical.

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
