# Alpha 4.37 preparation checkpoint — 2026-09-19

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
