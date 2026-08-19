import z from "@deepseek-ai/schemastery";
//#region src/index.ts
/** Stable Host plugin id. */
const name = "llm-openai-codex-images";
/** Tool name reserved for the later Host and browser contributions. */
const IMAGE_GENERATE_TOOL_NAME = "codex_connect_image_generate";
const TRANSPORT_SERVICE = "openaiCodexTransport";
const SUPPORTED_TRANSPORT_API_VERSION = 1;
const Config = z.object({ enabled: z.boolean().default(true) });
/** Wait for the core Transport without registering the PR-3 image tool. */
function apply(ctx, _config) {
	if (ctx.reflect.get(TRANSPORT_SERVICE) === void 0) ctx.logger.warn("dsh-codex-connect-images: waiting for the Codex Connect core transport; install it with \"dsh plugin --profile web add dsh-codex-connect@alpha\"");
	ctx.inject([TRANSPORT_SERVICE], (transportCtx) => {
		if (transportCtx.reflect.get(TRANSPORT_SERVICE)?.apiVersion !== SUPPORTED_TRANSPORT_API_VERSION) {
			transportCtx.logger.error("dsh-codex-connect-images: the installed Codex Connect core exposes an unsupported transport API version; update both packages to matching alpha releases");
			return;
		}
	});
}
//#endregion
export { Config, IMAGE_GENERATE_TOOL_NAME, apply, name };
