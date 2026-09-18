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
