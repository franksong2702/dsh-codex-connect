# GPT-6.2 Astra and Sol manual model support — 2026-11-18

Unpublished implementation candidate based on main `29371edc8ab926c8788c823bc5d108eff1aad9d7`, plugin `0.2.0-alpha.15`, pi-ai `0.85.1`. Model discovery remains a credential-free bundled catalog, not an authenticated remote model list.

## Implementation contract

Goal: make `gpt-6.2-astra` and `gpt-6.2-sol` selectable and usable through the existing ChatGPT OAuth / `openai-codex-responses` adapter. Scope: missing model fallbacks, model-specific context provenance, selection, reasoning, image and tool regressions, and generated build. Do not change dependency versions, existing model defaults, Ultrafast eligibility, frozen Task behavior or Host permissions. Real credentials and live-model calls are outside this candidate's validation.

## Sources and route-specific decisions

The [immutable official Codex catalog](https://github.com/openai/codex/blob/6c0cee502d215e5df2dd9a303cf2e252229c9e12/codex-rs/models-manager/models.json) was published by [OpenAI's GPT-6.2 catalog change](https://github.com/openai/codex/commit/6c0cee502d215e5df2dd9a303cf2e252229c9e12). Its entries provide:

- `gpt-6.2-sol`: `display_name=GPT-6.2-Sol`, text/image input, parallel tool calls, `context_window=500000`, and `max_context_window=872000`.
- `gpt-6.2-astra`: `display_name=GPT-6.2-Astra`, text/image input, parallel tool calls, `context_window=272000`, and `max_context_window=872000`.
- Both advertise Low, Medium, High, Xhigh, Max and client Ultra. The plugin continues to omit effort for Default; Ultra is client orchestration, not a pi-ai thinking level.
- Both entries list Priority/Fast in this catalog snapshot. Existing Ultrafast eligibility remains unchanged in this focused manual-model integration; no account entitlement is inferred.

The official API pages for [Astra](https://developers.openai.com/api/docs/models/gpt-6.2-astra) and [Sol](https://developers.openai.com/api/docs/models/gpt-6.2-sol) independently document text/image input and 128,000 maximum output tokens. Their separate 1,050,000-token API context window is not copied into the ChatGPT OAuth route. The [official release guide](https://learn.chatgpt.com/docs/whats-new/gpt-62-astra-sol) documents availability in ChatGPT Work, Codex and the API; catalog inclusion is not proof of account access.

Both fallbacks share the existing Sol/Terra catalog loop. Native provider entries retain their position, names, budgets, pricing and capability metadata, except for the deliberate thinking-level overlay that masks Off/Minimal and enables Xhigh/Max. Sol61's known bundled-static 272,000 calibration is not applied to either new model. OAuth cost fields retain zero placeholders because the plugin has no authoritative subscription token-price schedule; they do not imply free use or copy API pricing.

## Validation

Local environment: Node `v24.18.0`, pnpm `11.28.5`, locked DSH development API `0.1.7-rc.1`, pi-ai `0.85.1`. Locked dependency installation completed without changing the dependency manifests or lockfile.

- Focused command: `pnpm exec vitest run tests/gpt62-models.spec.ts tests/astra-reasoning.spec.ts tests/astra-tool-replay.spec.ts tests/model-contract.spec.ts tests/adapter.spec.ts tests/speed-mode-contract.spec.ts tests/codex-sampling-contract.spec.ts`: **7 files / 175 tests passed** on the final candidate.
- `pnpm run check`: **passed**, including workflow contracts, metadata/source lint, Host/client typecheck, **178 test files / 2,571 passed / 2 skipped**, generated build, environment-proxy/isolated imports, built capability CLI, request metrics, declared compatibility and **74 packed files**. npm used an isolated task-local cache. The upstream UI package emits a missing-source-map warning; it did not fail validation.
- `pnpm run test:browser` with task-local Chromium: **15 files / 101 tests passed**, including GPT-6.2 catalog selection/order and narrow-viewport coverage.
- Built CLI offline checks in an empty, isolated `DSH_HOME`: `node lib/bin.js capabilities --model <id> --json` for both IDs returned the expected signed-out exit **1**, the requested model, `probe.state=not-requested`, and `checks.model.reason=catalog-is-not-entitlement`. No probe flag or real credentials were used.
- `git diff --check`: passed. `lib/` was regenerated only by the project build; dependency manifests, lockfile, compatibility declarations, release version and defaults remain unchanged.

Generated SHA-256 identities:

| File | SHA-256 |
| --- | --- |
| `lib/index.js` | `7177dc8abe8fa25612b515b1316b5791d0a8646b34c009763f1123e6f965dfa8` |
| `lib/bin.js` | `ece1f73612df7606dbd07e760052e8d1941b858623e2700b5fbad5218fd51b59` |
| `lib/client.js` | `ecff2cb34090f05f5a7480db260d9ff36cc3f8943944d2c41c4b5bbbcb853e56` |

All automated model responses, attachments and credentials are synthetic. No real OAuth credential was read and no live model was called. Real-account availability, route capacity, quality and subscription entitlement remain unverified. Exact-head remote CI and supported-host installation matrices are separate from this local result. Implemented, merged, released, enabled and accepted are separate states.
