import z from "@deepseek-ai/schemastery";
//#region src/index.ts
/** Stable Host plugin id. */
const name = "llm-openai-codex-images";
/** Tool name reserved for the later Host and browser contributions. */
const IMAGE_GENERATE_TOOL_NAME = "codex_connect_image_generate";
const Config = z.object({ enabled: z.boolean().default(true) });
/** PR-1 deliberately registers no services, tools, routes, or effects. */
function apply(_ctx, _config) {}
//#endregion
export { Config, IMAGE_GENERATE_TOOL_NAME, apply, name };
