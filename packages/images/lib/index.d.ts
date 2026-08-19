import z from "@deepseek-ai/schemastery";
import "@deepseek-ai/dsh-tools";
import { Context } from "@deepseek-ai/cordis";
//#region src/tool.d.ts
declare const IMAGE_GENERATE_TOOL_NAME = "codex_connect_image_generate";
//#endregion
//#region src/index.d.ts
/** Stable Host plugin id. */
declare const name = "llm-openai-codex-images";
/** Optional image capability configuration. */
interface Config {
  /** Register the image generation tool for new calls. */
  enabled?: boolean;
}
declare const Config: z<Config>;
/** Register the image tool only for one enabled, compatible service lifecycle. */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { Config, IMAGE_GENERATE_TOOL_NAME, apply, name };