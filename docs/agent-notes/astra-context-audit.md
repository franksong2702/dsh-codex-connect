# Astra prompt and context audit — 2026-09-18

Baseline: main `eae9430f16f1707d8cefb76dec6e8344871d7684`. Scope: repository development guidance and plugin-owned model-visible text; not a DSH core prompt rewrite, model benchmark or port of #167/#200.

## Reference and decision

The [OpenAI guidance published September 11](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) recommends precise skill triggers, progressive disclosure and revisiting excessive procedural instructions. Applied here, that means a short task-oriented router and explicit completion boundaries, not a new global Astra persona. Safety and lifecycle constraints remain in code and in the host's authority model.

## Two different context layers

| Surface actually inspected | Finding | Action |
| --- | --- | --- |
| Repository `AGENTS.md` / `SKILL.md` discovery | The baseline has neither tracked file. `.agents/notes` contains historical feature notes, not registered skills. | Add a short `AGENTS.md` router. Do not require reading the whole documentation tree or invent a skill installation. |
| `src/adapter.ts` | The normal adapter preserves the host/pi-ai message pipeline; Astra specialization is catalog/effort metadata, not an injected global procedure. | Keep host-owned system instructions and message conversion. |
| `src/native-compaction.ts` | Native compaction forwards `context.systemPrompt` and tool definitions; it removes the host's extra summarization instruction for the native operation. | Keep the lifecycle/protocol implementation unchanged. No duplicate repository documentation is injected. |
| `src/image-tool.ts` | The optional tool already describes one prompt, exact original preservation, conversation preview and service-default size/style. | Keep the concise description and programmatic argument/size guards. |
| `src/search.ts` | Standalone search submits the query through its provider contract, not a plugin-wide Astra system prompt. | Keep routing, configured model, limits and authentication unchanged. |
| `src/auto-review-backend.ts` / `src/auto-review-probe.ts` | Risk/authorization instructions belong to the dedicated reviewer or diagnostic request, not every main-agent turn. | Do not shorten safety policy or change the reviewer route to claim Astra optimization. |
| `src/auto-review.ts` denial notice | The previous wording said to stop/request input without explicitly separating a rejected dependency from independent authorized work. | Scope the stop to the action and its dependents; retain the no-workaround rule and require exact-action approval subject to higher-priority restrictions. |

## Product change and regression boundary

Only the denial notice changes in the shipped-source layer. It still returns `rejected`; it does not create an approval, enqueue a retry, change the three-denial circuit breaker, or replace platform/host policy. Tests retain the existing one-shot approval and breaker behavior and add a single-denial assertion covering independent work, no implicit follow-up, and no new authority.

The guidance is shared by Codex models rather than Astra-only. This is a clearer boundary, not a measured latency/cost reduction. No claim is made that the model will consistently interpret the new wording better until a separately authorized behavioral comparison exists. Repository-agent ergonomics and user-facing product outcomes must not be reported as the same metric.

Think's proposed reasoning changes and Split's synthetic consent UI remain in their own unmerged PRs. This audit does not validate their prompts as deployed behavior or resolve their composition with Remember.
