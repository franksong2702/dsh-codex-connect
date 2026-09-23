//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/provider-retry.js
const DEFAULT_MAX_RETRY_DELAY_MS = 6e4;
function isProviderError(error) {
	if (!(error instanceof Error) || !("status" in error) || !("headers" in error)) return false;
	return (error.status === void 0 || typeof error.status === "number") && (error.headers === void 0 || error.headers instanceof Headers);
}
/** Mirrors the pinned OpenAI/Anthropic SDK retry policy; review when either SDK is upgraded. */
function isRetryableProviderError(error) {
	const shouldRetry = error.headers?.get("x-should-retry");
	if (shouldRetry === "true") return true;
	if (shouldRetry === "false") return false;
	if (error.status === void 0) return true;
	return error.status === 408 || error.status === 409 || error.status === 429 || typeof error.status === "number" && error.status >= 500;
}
function validateServerRetryDelayMs(delayMs, maxRetryDelayMs, providerErrorMessage) {
	const maxDelayMs = maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
	if (maxDelayMs > 0 && delayMs > maxDelayMs) throw new Error(`Server requested ${Math.ceil(delayMs / 1e3)}s retry delay (max: ${Math.ceil(maxDelayMs / 1e3)}s). ${providerErrorMessage}`);
	return delayMs;
}
function getRetryDelayMs(error, retryIndex, maxRetryDelayMs) {
	const retryAfterMs = error.headers?.get("retry-after-ms");
	if (retryAfterMs) {
		const value = Number.parseFloat(retryAfterMs);
		if (!Number.isNaN(value)) return validateServerRetryDelayMs(value, maxRetryDelayMs, error.message);
	}
	const retryAfter = error.headers?.get("retry-after");
	if (retryAfter) {
		const seconds = Number.parseFloat(retryAfter);
		return validateServerRetryDelayMs(Number.isNaN(seconds) ? Date.parse(retryAfter) - Date.now() : seconds * 1e3, maxRetryDelayMs, error.message);
	}
	return Math.min(.5 * 2 ** retryIndex, 8) * 1e3 * (1 - Math.random() * .25);
}
function createAbortError() {
	const error = /* @__PURE__ */ new Error("Request aborted");
	error.name = "AbortError";
	return error;
}
function abortableSleep(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(createAbortError());
			return;
		}
		const onAbort = () => {
			clearTimeout(timeout);
			reject(createAbortError());
		};
		const timeout = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, Math.max(0, ms));
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
/**
* Reproduce the retry behavior used by the OpenAI and Anthropic SDKs while making
* their backoff sleep interruptible. Their built-in retry timers ignore the
* request AbortSignal, so callers must invoke the SDK with `maxRetries: 0` and
* wrap the request with this helper. Provider-requested delays above
* `maxRetryDelayMs` fail immediately (60 seconds by default); set it to zero to
* disable the limit.
*/
async function retryProviderRequest(request, options = {}) {
	const maxRetries = options.maxRetries ?? 0;
	let retriesRemaining = maxRetries;
	for (;;) try {
		return await request();
	} catch (error) {
		if (options.signal?.aborted) throw createAbortError();
		if (retriesRemaining <= 0 || !isProviderError(error) || !isRetryableProviderError(error)) throw error;
		const retryIndex = maxRetries - retriesRemaining;
		retriesRemaining--;
		await abortableSleep(getRetryDelayMs(error, retryIndex, options.maxRetryDelayMs), options.signal);
	}
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/api/github-copilot-headers.js
function inferCopilotInitiator(messages) {
	const last = messages[messages.length - 1];
	return last && last.role !== "user" ? "agent" : "user";
}
function hasCopilotVisionInput(messages) {
	return messages.some((msg) => {
		if (msg.role === "user" && Array.isArray(msg.content)) return msg.content.some((c) => c.type === "image");
		if (msg.role === "toolResult" && Array.isArray(msg.content)) return msg.content.some((c) => c.type === "image");
		return false;
	});
}
function buildCopilotDynamicHeaders(params) {
	const headers = {
		"X-Initiator": inferCopilotInitiator(params.messages),
		"Openai-Intent": "conversation-edits"
	};
	if (params.hasImages) headers["Copilot-Vision-Request"] = "true";
	return headers;
}
//#endregion
export { hasCopilotVisionInput as n, retryProviderRequest as r, buildCopilotDynamicHeaders as t };
