# Issue #270: source review and regression fixes — 2026-09-25

Status: reviewed local candidate with reproduced fixes and synthetic verification; not live-account acceptance or a release.

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
| Final `pnpm run check` | Exit 0; 123 files / 1,402 tests passed, including lint, host/client types, build, proxy preservation, isolated imports, capability CLI, compatibility and packing. |
| Final `pnpm run test:browser` | Exit 0; 13 files / 70 Chromium tests passed. |
| Rebuilt package with existing exact host dependencies | Exit 0; two generations, two edits, two PTC dispatches, source and inherited-edit checks, negative-input refusal, zero real-provider requests. This is not a fresh installation. |
| First `pnpm --silent run check:dsh-matrix` attempt | Failed during registry resolution, before plugin execution: `exact DSH fixture resolution failed: fetch failed`. No policy or endpoint workaround was applied. |
| One retry with `pnpm --silent run check:dsh-install` | Exit 0 on a freshly isolated exact DSH 0.1.7-rc.1 install. Defaults unchanged; new edit checks and existing runtime/disposal/compaction regressions passed. The matrix wrapper itself was not rerun. |

Successful isolated archive SHA-256: `f00c65f35e4d0be8d84ec8370fb0f4173f9dce4c45f7cbc41659c06923d157ce`.

That archive was built before this checkpoint and its cross-links were added. Its hash identifies the tested archive, not a later documentation-only repack. Product byte identities below were measured from the reviewed build:

- `src/image-history.ts`: `d0f85d49934e60331f9dea2fb24e94221df1998ecabc2b39c2016b11c67a4eea`
- `src/image-inputs.ts`: `c1768b5b7517d541cfd625b97fc5f78bfff23164a83db5b1af090d4137500b12`
- `src/image-asset-routes.ts`: `f9e5ca0a4e531dbb9f61f97350d28ba2e94f9200360203b31de99f5f67214ce3`
- `src/client/CodexImageToolView.tsx`: `c0ff029d733a5a84a84c44b1681351a440c9068af8930d948a5d194648a837be`
- `lib/index.js`: `a0deed9fc3932f9633c9a6b94ec400b34cc8558c08b1d82a783e528d67e52701`
- `lib/client.js`: `dae870bcd0856d4956c042318aeed7e13f0ae62d71707f882d983431a79dd2da`
- `scripts/check-installed-images.mjs`: `de117553c02c321bc465042e2c6220c45a15ddf0fbbc48aba6a07de176472bf6`

## Remaining acceptance and explicit limits

The identified findings are fixed and regression-covered; this is not a guarantee that no further defects exist. Source tests and Chromium component tests do not prove a real conversational model consistently selects the right target. Synthetic edits do not prove current account entitlement, actual backend limits, subject preservation or reference-following quality. The full installed everyday Session page, physical mobile, Windows and process-crash behavior remain outside this round's acceptance.

Proposed next live scope, requiring separate explicit authorization: use only the existing selected DSH account through the normal plugin transport in an isolated test session/profile, with non-sensitive fixtures; at most three image edit requests (single-image edit, continuation from its output, one target plus references), and at most eight ordinary model requests if validating the conversational path. No automatic image retries, account rotation, alternate API-key route, provider endpoint probing, publishing or daily 3080/3081 service changes. Stop on refusal or uncertain completion and record the outcome without calling it success.

No real credential read, real model/image request, push, PR, merge, release, npm channel change or daily deployment occurred in this round. Local fixes and evidence remain on the feature branch.
