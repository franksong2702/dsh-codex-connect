# Issue #270: source review and regression fixes — 2026-09-25

Historical review and first bounded live run. The final adapter selection gate was subsequently confirmed using the explicitly requested **GPT-6 Sol** route: see [final live-selection confirmation](issue-270-sol-live-confirmation.md). Preserve the failures, budget accounting and scope below as evidence for the earlier round. This is not a release.

## Identity and review boundary

Repository: `franksong2702/dsh-codex-connect`. Branch: `franksong2702/issue-270-image-edit`. Reviewed candidate: `291c35609f02a1f0cc627651e28bdf214ea83998`, after transport foundation `70668f68fe0460f0b03f373739ae6d20210d5847`, based on main `b1b6efcd93be434bc4b7dd8b9da692803102844e`.

This was a fresh source review by the assistant continuing the task, backed by failing reproductions before fixes. It was not an independent human or second-agent approval. The containing commit identifies the resulting reviewed tree. Other worktrees, real credentials and daily services were untouched.

## Confirmed findings and fixes

### R1 — complete attachment references lost their occurrence identity

A normalized, content-addressed image can appear twice with different valid display names. The single-value inventory overwrote the earlier record, so a complete earlier attachment reference was incorrectly rejected. It could also promote an explicitly selected upload to a generated original sharing those normalized bytes.

The inventory now retains canonical occurrence references per attachment ID and every preview-to-original relation. Complete selectors match an actual recorded occurrence; bare IDs still refuse ambiguous original mappings. Unknown occurrence metadata remains refused, and the selected complete upload is not promoted to a different generated occurrence.

Evidence: a failing two-upload/different-name test before the fix, plus final tests for original upload selection and rejection of an unrecorded name.

### R2 — inherited nested edits could be editable but not downloadable

The separate original-download helper did not trim recorded tool arguments, while the editing tool and history parser did. A successful v2 nested edit with surrounding prompt whitespace therefore failed its download provenance comparison. Both supported nested event names were affected.

Original downloads now reuse `inheritedImageOriginal`, the same successful-result, normalized-prompt and immutable-fork-prefix logic used for editing. Two pre-fix tests returned 404 instead of 200; both now pass. The packaged check additionally creates a real nested edit, forks its session and downloads the edited original.

### R3 — failed native-result metadata was accepted as inheritance evidence

The pre-existing download helper decoded native result metadata without requiring a successful result. A deliberately constructed failed host event retaining valid original metadata therefore returned 200 rather than refusing an inherited download. The editing history reader already checked success.

Sharing the history reader makes both operations reject failed-result metadata while retaining normal owner and successful inherited access. The negative test now passes. This is a reproduced defensive authorization inconsistency using a synthetic host record; it is not evidence of an observed private-image disclosure or an externally reachable exploit.

### R4 — a draft could carry over to another original with the same preview

The form's React identity used only the session and preview IDs. Replacing the result with a different original sharing the preview retained instructions intended for the first original.

The form key now includes the original asset identities. Option, download and detail keys distinguish separate occurrences. A late submission completion from an unmounted form cannot close its replacement. The Chromium reproduction initially retained the old draft, then passed after the correction without submitting a provider request.

## Expanded packaged acceptance

`check-installed-images.mjs` now exercises generation, a nested edit, an edit of that result, v2 source recovery, inherited edited-original download, denial for the earlier fork, and missing-input refusal without generation fallback. Its expected counts are two generations, two edits and two PTC dispatches. Provider replies, preview storage and code execution are synthetic; the registered tool, PTC bridge and original asset files are real.

The matrix report validator now requires the edit counts and source/inheritance/invalid-input evidence. Four negative validator cases ensure those new requirements cannot silently disappear. No workflow permission or production default was changed.

## Verification performed

Exact runtime: Node `v22.22.3`, pnpm `10.30.3`, DSH `0.1.7-rc.1`, pi-ai `0.85.1`.

| Check | Actual outcome |
| --- | --- |
| Pre-fix backend reproductions, selected with `-t review:` | Four failures as expected: repeated attachment occurrence, both nested-event whitespace cases, and failed-result inheritance. Other tests were filtered, not counted as passing. |
| Pre-fix Chromium draft reproduction | One failure as expected; eight other tests filtered. |
| Focused backend verification after initial fixes | Four files / 59 tests passed; two additional occurrence cases were added afterward and included in the full run. |
| Typecheck and focused edit Chromium suite | Passed; nine browser tests. |
| Final `pnpm run check` after live-findings fixes | Exit 0; 124 files / 1,405 tests passed, including lint, host/client types, build, proxy preservation, isolated imports, capability CLI, compatibility and packing. |
| Final `pnpm run test:browser` | Exit 0; 13 files / 70 Chromium tests passed. |
| Rebuilt package with existing exact host dependencies | Exit 0; two generations, two edits, two PTC dispatches, source and inherited-edit checks, negative-input refusal, zero real-provider requests. This is not a fresh installation. |
| First `pnpm --silent run check:dsh-matrix` attempt | Failed during registry resolution, before plugin execution: `exact DSH fixture resolution failed: fetch failed`. No policy or endpoint workaround was applied. |
| Fresh final `pnpm run check:dsh-install` | Exit 0 on exact DSH 0.1.7-rc.1 after the adapter handle projection. Defaults unchanged; two synthetic generations, two edits, source/inheritance/refusal checks and existing runtime/disposal/compaction regressions passed. |

Successful final isolated archive SHA-256: `42b9d7fe55877580e6c207cb2d0dd6973e4dbf68fd79aa16ff80a1b2c90e4d33`.
This archive includes the final adapter projection and settings-help wording. It predates only the evidence-note update that records its own hash, so it identifies the tested runtime/package content rather than a byte-for-byte release artifact after this note was written.

Product byte identities after the final live-findings fix and successful full check:

- src/adapter.ts: c72b8682dc342cebe878534ef5dd79bcb987f00220bd0086a59ffec51ee7f680
- src/image-tool.ts: c3ec17be5443452be5c9020699fdca5cf608887865f59ebadc1295cf4c9e918b
- src/image-input-contract.ts: 2191857a8b2d5f10c3070d65e609fde61b0f0e835187503a021a2e510c15ae78
- lib/index.js: 0ace9ac73f9697614a888b176c7fb83bfa7f1ef6b4420f547118c2986c999e50
- src/client/locales.ts: 0da18ac561f0550f20c24458c05b46dc168c53ce5cf11059bc6aebca8f172712
- lib/client.js: 3ee42b3ea7082a1178d103b4da95291d9b2b6cb29bbb3958eff063eee43d486f
- tests/image-handle-projection.spec.ts: d6df0cf4ecf036177de960276c026c7b8ad5852e4fc025e0e1469710237d3449
- tests/image-edit-session.spec.ts: b85d66fe13e571fcd6a9d2deb72ebfd5bcd4acefaf1fa71a5d9e6054a30973d1

## Bounded live-provider acceptance

The maintainer explicitly authorized at most three real image-edit requests and eight ordinary model requests, using only non-sensitive generated fixtures, no automatic retries, no daily-service changes, and no credential disclosure. The normal credential-store APIs selected an already signed-in profile; raw access/refresh tokens and authorization headers were never printed or copied into the report.

### Real image backend

The fixed Codex OAuth edit route was called exactly three times and all three returned valid PNG results. No ordinary model request was needed for these three calls.

1. Single-image edit changed the off-white background to pale blue while retaining the central red square and green circle.
2. Consecutive edit from result 1 added a yellow border around the red square while retaining the pale-blue background and green circle.
3. Three-input edit from result 2 plus two references used the blue color reference and checker texture reference in the background while retaining the red square, yellow border and green circle.

Visual inspection was backed by local pixel summaries: yellow pixels were absent in step 1 and appeared in step 2; step 3 retained the red/green/yellow populations while the outer margin changed from a near-uniform pale blue to multiple blue checker shades. There was no fourth real image call.

### Real conversational selection

A separate isolated real GPT-5.6 Sol harness blocked the image endpoint locally and captured tool arguments instead.

- Natural wording (“FIRST attached image”, “SECOND … reference”) produced one edit call with one reference, but the opaque attachment identities were mapped incorrectly.
- The same task with explicit attachment IDs in user text mapped target and reference correctly, showing the tool protocol itself was sound.
- Strengthening only the tool description did not fix the natural ordinal case. This consumed six ordinary model requests total across those diagnostics.
- Investigation showed the image-capable request carried image bytes without adjacent text binding each occurrence to its opaque attachment ID. The candidate now fixes that at the Codex Connect adapter boundary: when enableImageGeneration is on, every request image is followed only in the provider request projection by a bounded line naming its per-message ordinal and stable attachmentId. Durable session messages are unchanged; when the feature is off, the projection is not applied. Focused and full synthetic AgentLoop tests verify the exact wire ordering.
- The last two authorized ordinary model calls were used for an intermediate live recheck. The model/tool turn completed, but the acceptance script raised a local variable-name ReferenceError while constructing its final JSON report, after execution. No result classification was persisted, so this run is outcome_unknown, not success. Both calls are conservatively counted against the budget. The intermediate system-prompt approach used for that attempt was subsequently removed after offline tests proved it did not enter the actual request projection.

Final live budget accounting: **3/3 real image edits, 8/8 ordinary model requests**. No further live call was made after the budget was exhausted. Therefore the final adapter-level ordinal mapping fix is strongly regression-tested but still requires a newly authorized real-model confirmation before claiming natural “first/second image” selection is live-accepted.

## Remaining acceptance and explicit limits

The identified findings are fixed and regression-covered; this is not a guarantee that no further defects exist. The bounded real run proves current-account access to the edit endpoint and representative single/continued/multi-input edit quality for the tested fixtures, but it does not establish general backend limits or pixel-perfect preservation. The final adapter handle projection has synthetic wire evidence but no post-fix live-model confirmation because the authorized model budget was exhausted. The full installed everyday Session page, physical mobile, Windows and process-crash behavior remain outside this round's acceptance.

The next live gate, if separately authorized, needs no additional image generation: one isolated natural-language “first image / second reference” conversational check is sufficient to confirm the final adapter handle projection. Keep the image endpoint locally blocked and bound ordinary model calls explicitly. Do not reuse the exhausted budget from this round.

Real requests in this round used only the already-selected Codex account through normal store/transport APIs; raw credential values were not printed or copied into artifacts. No push, PR, merge, release, npm channel change or daily deployment occurred. Local fixes and evidence remain on the feature branch.
