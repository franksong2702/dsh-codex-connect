import z from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
/** Stable Host plugin id. */
declare const name = "llm-openai-codex-images";
/** Tool name reserved for the later Host and browser contributions. */
declare const IMAGE_GENERATE_TOOL_NAME = "codex_connect_image_generate";
/** Optional image capability configuration. */
interface Config {
  /** Register the image generation tool for new calls once the capability ships. */
  enabled?: boolean;
}
declare const Config: z<Config>;
/** PR-1 deliberately registers no services, tools, routes, or effects. */
declare function apply(_ctx: Context, _config: Config): void;
//#endregion
export { Config, IMAGE_GENERATE_TOOL_NAME, apply, name };