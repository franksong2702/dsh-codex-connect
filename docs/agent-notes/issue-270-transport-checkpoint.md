# Issue #270: local image edit transport checkpoint — 2026-09-25

Status: partial implementation; not a completed or enabled image-editing feature.

## Identity and scope

Repository: `franksong2702/dsh-codex-connect`. Base: `b1b6efcd93be434bc4b7dd8b9da692803102844e`. Local branch: `franksong2702/issue-270-image-edit`. Development took place in a clean isolated worktree; pre-existing worktrees and daily services were not modified.

This checkpoint implements the independently testable transport part of Issue #270. The model-callable tool remains prompt-only. No new edit button behavior, DSH input resolver, source history, feature default, model selection, account policy or activation route is enabled by this change.

## Implemented

- `src/image-edit-request.ts` validates a complete batch of already-authorized image bytes and snapshots the ordered data URLs and prompt synchronously before any queue/credential await. No file, URL or DSH attachment lookup happens in this module.
- `src/transport.ts` adds `editImages` on the fixed Codex OAuth `images/edits` route. The optional method is additive to transport API v1: consumers must explicitly detect its presence and must never substitute `generateImages` when it is absent or fails.
- Generation and editing share the existing account capture, image request governor, proxy, cancellation, timeout, manual-redirect refusal, bounded response read and fixed safe error behavior. Editing does not automatically retry or switch to generation.
- Input admission occurs before authentication. The final encoded JSON body is size-checked before reading credentials. Generated response bytes are still returned to the existing caller-owned validation/storage layer.
- The matching `lib/index.js` and `lib/index.d.ts` were rebuilt by the full check.

Local defensive limits are five inputs, 10 MiB per image, 20 MiB total input bytes, 32 MiB encoded request body, 50 million pixels per image and 32,768 pixels per side. These are conservative plugin limits, NOT measured service limits or account entitlements. The future host-facing resolver must additionally enforce the exact host limits and session authorization. Existing image-format detection is reused; this checkpoint is not a new full raster-decoder validation guarantee.

## Verification performed

Environment: Node `22.22.3`, pnpm `10.30.3`, DSH development packages `0.1.7-rc.1`, pi-ai `0.85.1`.

| Command / boundary | Observed result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Succeeded; existing lockfile unchanged. |
| Focused transport tests after first fix | 3 files / 55 tests passed at that intermediate test set. |
| `pnpm run typecheck` | Host and client typechecking passed. |
| `pnpm run check` on final source/test content | Exit 0; 120 files / 1,348 tests passed, including 27 new edit-transport cases. Lint, typecheck, build, environment-proxy preservation, isolated import, capability CLI, compatibility and package checks passed. |
| `pnpm run test:browser` | Exit 0; 12 Chromium test files / 61 tests passed. This is existing UI regression, not new edit-UI acceptance. |
| `git diff --check` | Passed. |

New cases cover distinct ordered images, direct/governed paths, invalid input with zero credential capture and zero provider dispatch, input mutation while awaiting credentials, pre-cancellation, configured model hint, HTTP rejection/redirect, malformed result, uncertain network completion without resubmission, and prompt-only generation compatibility. Providers and credential contents are synthetic, with temporary stores cleaned after each test; no real account/model request was made.

The first focused run failed (31 failed / 24 passed) because a response-local `images` binding shadowed the input parameter before dispatch. It was renamed to `outputImages`, and the same focused command then passed. This failed run is retained as history, not counted as successful evidence. Subsequent full checks contain the corrected source and expanded tests.

Final tested source identities (SHA-256):

- `src/image-edit-request.ts`: `4ddbb9c8f48bb4f76592a4d755ccff0d8bf9c187f746829a5676ffc8b7321a12`
- `src/transport.ts`: `2d33bfd23cea65bb60d8eae54c04f9a2cbd06cbab7503dc02f8a0421962645a7`
- `tests/image-edit-transport.spec.ts`: `65778b833fa691ac4b37603c273af6fb0267756f9cbe56d7fd136ceea3671989`
- `lib/index.js`: `a423cef03f684ae17402f3553df4b9a4ba9513b6f108cf670b1c1d755afe3b6a`
- `lib/index.d.ts`: `1e3828d751d541c4a0e55782762d99d1ef4b508ec667f4b759b5ded10e4f4166`

## Execution blockers and remaining work

Two platform tool calls were blocked with: `因 OpenAI 无法确定请求的安全状态，已拦截此工具调用。`

The first was a bounded installed-host/source inspection. The second was a write of `src/image-input-contract.ts`. Those actions and their dependent host input/tool/provenance/UI work were stopped, without an alternate execution route. The input-contract file is absent; do not assume its attempted content was implemented. The block did not affect the independently implemented transport validation above and does not establish a Codex protocol limitation.

A separate attempt to import the approved conversation specification into the worktree failed for missing authenticated host-file provenance. The specification remains a conversation attachment; it was not imported by an alternative path. This file is a newly authored implementation checkpoint, not that specification.

Outstanding before claiming #270 complete:

1. Verify exact installed-host image/attachment authorization and prompt submission contracts through an authorized execution path.
2. Implement trusted target/reference resolution and model-visible edit inputs, with missing/unauthorized inputs causing zero provider calls.
3. Persist edit sources and operation through ordinary and nested tool result representations, without widening fork permissions or inventing originals for preview-only history.
4. Bind edit and retry controls to an explicit selected image and retain all reference inputs, while leaving ordinary text generation unchanged.
5. Complete installed-session, restart/fork, negative, browser and real-account image-effect acceptance. Any live request requires separately scoped authorization; current tests do not prove account access, image-edit quality or backend limits.

No push, PR, merge, release, channel promotion, service restart, 3080/3081 operation or real-credential access was performed. Do not close Issue #270 or describe this checkpoint as a user-ready feature.
