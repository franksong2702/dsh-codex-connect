# PR #272 post-release fixes — 2026-09-26

Status: unreleased patch; independent re-review required. Do not use the earlier review pass as approval for these fixes.

## Affected baseline and correction

The user supplied three independent reproduction tests for `5acc87399203700726475ad5e76e282d2631b28c`. PR #272 had already been merged as `8e685d736da8e605ead11808a7daab5cdaf4b481` and released as `0.1.0-alpha.4.48` before the report reached this workflow. Both P2 findings are valid. The original three tests were preserved, independently re-executed against the released code, and all three failed. Their fixtures and assertions were not weakened to make the patch pass.

The previous assistant's “independent review — pass” was overstated: a new WebCodex workflow session records a separate task but does not constitute a separate reviewer or model. It missed these cases. Green existing tests did not cover them. That pass should be read as withdrawn, not as a completed external approval.

## Repairs

1. Keep explicit user upload occurrences separate from generated-result/preview mappings. A complete recorded upload reference selects its attachment bytes, even if the filename, dimensions and content ID match an old generated preview. An unqualified ID shared across both origins is refused with an ambiguity explanation. Explicit `assetId` selection still uses the original, and missing originals still fail without fallback. The rule applies equally to target and reference inputs; serialization, forks and user inbox image admission are covered. This is not a most-recent-image heuristic.
2. Project a complete validated attachment reference next to request images so the conversational model can select the uploaded copy without making users look up opaque IDs. Do not persist relative ordinals or grant new access. Older explicit original handles stay supported.
3. Share a fixed public failure catalog between input validation, transport-facing tool errors and the browser. Only exact allowlisted strings are shown; an upstream string beginning with a known message and then containing a path, bearer value or other data is rejected. Unknown errors get a generic safe explanation. Input errors show recovery guidance and omit ineffective unchanged-retry controls; timeout/uncertain-outcome notices and explicitly initiated transient retries remain.

## Executed checks

- Original reproduction cases: before **0 passed / 3 failed**, after **3 passed / 0 failed**. Other cases excluded by the name filter were explicitly skipped, not counted as passed.
- Complete `pnpm run check`: **125 files / 1,440 tests passed**, including source lint, host/client types, build, import isolation, compatibility and package audit.
- Chromium `pnpm run test:browser`: **13 files / 73 tests passed**. Includes English/Chinese failure recovery and raw-detail suppression.
- Additional tests cover uploaded-copy byte identity, explicit original selection, missing-original refusal, reference ambiguity, repeated canonical selections, restored inherited-event prefixes, user inbox admission and adjacent full-reference wire data.
- The first full validation of the new tests found an unsupported inline `seedSource` test-option field; it was removed to use the actual `PrepareSessionOptions` contract, then the full check passed. No production behavior was changed to silence it.
- Exact DSH `0.1.7-rc.1` installation matrix: **passed**, with unchanged defaults, two synthetic generations, two synthetic edits, inherited-access/source/refusal checks and zero real provider requests. Tested archive SHA-256: `e3cc631c29a5e7453cd080a07ee5eb475763278394ba962cafb211489befbd23`. The archive predates only this final evidence annotation; all runtime fingerprints remain unchanged.

Compact evidence and runtime SHA-256 fingerprints: `docs/experiments/evidence/issue-272-post-release-fix.json`.

## Delivery boundaries

No real model or image service calls, credential inspection, daily-service restart, published-package replacement, tag move, latest-tag promotion or new release in this fix round. Alpha 4.48 on npm is not fixed by this branch. Public recommendations remain unpromoted while the correction awaits review. The changed guidance has offline wire coverage, not a new live-model reliability claim. Tests and a self-review are not a replacement for an independent review of the final patch.
