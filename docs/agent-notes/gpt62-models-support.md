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

The [official API pages for Astra](https://developers.openai.com/api/docs/models/gpt-6.2-astra) and [Sol](https://developers.openai.com/api/docs/models/gpt-6.2-sol) independently document text/image input and 128,000 maximum output tokens. Their separate 1,050,000-token API context window is not copied into the ChatGPT OAuth route. The [official release guide](https://learn.chatgpt.com/docs/whats-new/gpt-62-astra-sol) documents availability in ChatGPT Work, Codex and the API; catalog inclusion is not proof of account access.

Both fallbacks share the existing Sol/Terra catalog loop. Native provider entries retain their position, names, budgets, pricing and capability metadata, except for the deliberate thinking-level overlay that masks Off/Minimal and enables Xhigh/Max. Sol61's known bundled-static 272,000 calibration is not applied to either new model. OAuth cost fields retain zero placeholders because the plugin has no authoritative subscription token-price schedule; they do not imply free use or copy API pricing.

## Validation

Local environment: Node `v24.18.0`, pnpm `11.28.5`, locked DSH development API `0.1.7-rc.1`, pi-ai `0.85.1`. Locked dependency installation completed without changing the dependency manifests or lockfile.

- Focused command: `pnpm exec vitest run tests/gpt62-models.spec.ts tests/astra-reasoning.spec.ts tests/astra-tool-replay.spec.ts tests/model-contract.spec.ts tests/adapter.spec.ts tests/speed-mode-contract.spec.ts tests/codex-sampling-contract.spec.ts`: 7 files / 175 tests passed on the final candidate.
- Full checks, browser tests, and built CLI checks from PR #453 are not repeated in this focused integration; they must be rerun by the owning Alpha16 workflow after the compatibility changes settle.
- All automated model responses, attachments and credentials are synthetic. No real OAuth credential was read and no live model was called. Real-account availability, route capacity, quality and subscription entitlement remain unverified. Exact-head remote CI and supported-host installation matrices are separate from this local result. Implemented, merged, released, enabled and accepted are separate states.
