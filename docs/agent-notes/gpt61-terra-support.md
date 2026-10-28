# GPT-6.1 Terra manual model support — 2026-10-28

Unpublished implementation candidate based on main `2e6a9d7a4d2ec7833003311745ff139056bc399f`, plugin `0.2.0-alpha.10`, pi-ai `0.85.1`. Model discovery is a credential-free bundled catalog, not an authenticated remote model list.

## Implementation contract

Goal: make `gpt-6.1-terra` selectable and usable through the existing ChatGPT OAuth / `openai-codex-responses` adapter. Authority: `AGENTS.md`, `docs/maintenance-scope.md`, the official sources below and the current adapter/tests. Scope: missing model fallback, model-specific context provenance, selection, reasoning, image and tool regressions, generated build. Do not change dependency versions, existing model defaults, Ultrafast eligibility, frozen Task behavior or Host permissions. Do not install into a daily Host, restart a service, read real credentials, call real models, merge or publish.

Steps: pin source metadata; add only a missing entry; validate selection and supported wire efforts; exercise tools/images with synthetic fixtures; run the complete check and browser regression; regenerate and inspect `lib/`; push a Draft PR. Record validation here. No unresolved product decision blocks this bounded model integration.

## Sources and route-specific decisions

The [immutable official Codex catalog](https://github.com/openai/codex/blob/e8e6a922c0008bc08bacc69dd2ce9b6c3c12944c/codex-rs/models-manager/models.json) was fetched in full, not inferred from a search excerpt. Its Git blob is `489ebe3f2483348641a16160ce8491dd077eabca`. Terra's entry has:

- `slug=gpt-6.1-terra`, `display_name=GPT-6.1 Terra`, text/image input and parallel tool calls.
- `context_window=500000`, `max_context_window=872000`: the fallback default and local override ceiling. The [official type definition](https://github.com/openai/codex/blob/e8e6a922c0008bc08bacc69dd2ce9b6c3c12944c/codex-rs/protocol/src/openai_models.rs#L461-L465) explicitly defines the latter as the maximum for configuration overrides. These are official-client metadata, not measured account/endpoint capacity.
- `default_reasoning_level=low`; supported levels Low, Medium, High, Xhigh, Max and client Ultra. The plugin continues to omit effort for Default; it does not force either the Codex Low or API Medium default.
- Priority/Fast service tier only; no Ultrafast. Existing Fast behavior remains independent of effort and does not establish account entitlement.

The [official API model page](https://developers.openai.com/api/docs/models/gpt-6.1-terra) was opened and independently documents 1,050,000 context, 128,000 output, text/image input, Responses-only tool calling and `none/low/medium/high/xhigh/max` (Medium default). Only the 128,000 output limit supplements the Codex fallback. API context and API `none` are not silently adopted as OAuth route capabilities. The [official Codex model guide](https://learn.chatgpt.com/docs/models) documents the exact `codex -m gpt-6.1-terra` identifier.

The current Host adapter derives choices from pi-ai's thinking-level map and validates requests before authentication. Terra's fallback masks Off/Minimal and enables Xhigh/Max because the pinned **Terra** OAuth catalog supports those five direct levels. This is route-specific evidence, not a claim that Terra's API rejects None. Off/Minimal/None/Ultra are rejected before authentication/dispatch. Ultra client orchestration is outside the maintained manual-model scope. Terra uses the same catalog loop as Sol61, Sol6 and Luna: a future native Terra entry keeps its names, budgets, pricing and capability metadata, and the same effort mask is still overlaid on its thinking-level map, so a native `minimal`/`off` mapping cannot reintroduce levels the pinned OAuth catalog does not advertise. No duplicate entry or bundled-static context calibration is applied to Terra.

Review follow-up (2026-10-28): the initial candidate kept native Terra effort maps intact, unlike Sol61/Sol6/Luna/Astra. A synthetic native entry shaped like pi-ai 0.85.1's own entries (`{ xhigh, max, minimal: 'low' }`) therefore exposed Minimal and left Off unmasked. Terra now shares the Sol loop; the native-entry regression asserts the overlaid mask.

OAuth cost fields retain the existing zero placeholders because the plugin has no authoritative subscription token-price schedule. They do not imply free use or copy API pricing. The fallback retains existing Responses grammar/additional-tool/search metadata and text/image inputs; synthetic tests exercise the real Host/pi-ai path rather than just adding a display name.

## Computer Use boundary

Selecting Terra enables the model to consume the existing Host's supplied tools and images. A model entry does not install a desktop driver, implement a `computer` action loop or grant screen/input permissions. Dedicated computer use needs separate tools/execution and Host-owned authority. The requested future reusable Terra executor for sessions using another main model is a separate capability, not a reason to switch their Session model or expand this PR. No new desktop tool, account privilege or system permission is introduced here.

## Validation

Local environment: Node **v24.13.0**, pnpm **10.30.3**, locked DSH API **0.1.7-rc.1**, pi-ai **0.85.1**. The isolated branch starts from the baseline above; a fresh `git fetch origin main` confirmed that the remote baseline was still identical before submission. No matching open Terra integration PR was found.

- Focused command: `pnpm exec vitest run tests/terra61-model.spec.ts tests/astra-reasoning.spec.ts tests/astra-tool-replay.spec.ts tests/model-contract.spec.ts tests/adapter.spec.ts tests/speed-mode-contract.spec.ts`: **6 files / 115 tests passed**. A subsequent standalone run of the final typed image fixture passed **5/5**.
- `pnpm run check`: **passed**, including workflow contracts, metadata/source lint, Host/client typecheck, **172 test files / 2,376 passed / 2 skipped**, build, environment-proxy/isolated imports, built capability CLI, request metrics, declared compatibility and **71 packed files**. The first complete run found one stale bilingual README hash record; `README.i18n.yaml` was updated after reviewing both translations and the complete check was rerun successfully. Initial new-test fixture failures (missing synthetic account identity and incomplete SSE response) were corrected in fixtures without changing auth or transport behavior. The upstream UI package emits a missing-source-map warning; it did not fail validation.
- `PLAYWRIGHT_BROWSERS_PATH=<isolated-browser-directory> pnpm run test:browser`: **14 files / 97 tests passed**, including Terra's configuration checkbox and 360-pixel layout. The browser was downloaded into the task directory; no daily browser/profile or Host was used.
- Built CLI offline check in an empty, isolated `DSH_HOME`: `node lib/bin.js capabilities --model gpt-6.1-terra --json` returned the expected signed-out exit **1**, `model=gpt-6.1-terra`, `probe.state=not-requested`, `checks.model.reason=catalog-is-not-entitlement`. No probe flag or real credentials were used.
- `git diff --check`: passed. `lib/` was regenerated only by the project build; dependency manifests, lockfile, compatibility declarations, release version and defaults remain unchanged.

Generated SHA-256 identities:

| File | SHA-256 |
| --- | --- |
| `lib/index.js` | `cbd65e2bcb72f08661445d031b2991a713b3f35d5aeb67bad408639e74a1bfa3` |
| `lib/bin.js` | `9f56fc32f7479ca5744d1691265589217ef42c17950271942c1df9a7994ce91b` |
| `lib/client.js` | `41ee1edff526e65dad940be72b41cb3916bd6ae917bd4cb09f6be13f0ca974a3` |

All automated model responses and credentials are synthetic. Exact-head remote CI and the full supported-host installation matrices are not claimed by this local run. Real-account availability, route capacity, quality, computer-use execution and subscription entitlement remain unverified. Implemented, merged, released, enabled and accepted are separate states; this candidate does not claim the latter four.
