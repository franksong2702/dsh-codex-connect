//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/hash.js
/** Fast deterministic hash to shorten long strings */
function shortHash(str) {
	let h1 = 3735928559;
	let h2 = 1103547991;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
	h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
	return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/error-body.js
const MAX_PROVIDER_ERROR_BODY_CHARS = 4e3;
function normalizeProviderError(error) {
	if (!(error instanceof Error)) return {
		message: safeJsonStringify(error),
		messageCarriesBody: false
	};
	const sdkError = error;
	const status = extractStatus(sdkError);
	const body = extractBody(sdkError);
	const messageCarriesBody = body === void 0 || error.message.includes(body);
	return {
		status,
		body,
		message: error.message,
		messageCarriesBody
	};
}
/**
* Probe the HTTP status, first numeric hit wins, in SDK-field order:
* `statusCode` (Mistral) → `status` (`openai`, `@google/genai`) →
* `$metadata.httpStatusCode` (Bedrock) → `$response.statusCode` (Bedrock).
*/
function extractStatus(error) {
	if (typeof error.statusCode === "number") return error.statusCode;
	if (typeof error.status === "number") return error.status;
	if (typeof error.$metadata?.httpStatusCode === "number") return error.$metadata.httpStatusCode;
	if (typeof error.$response?.statusCode === "number") return error.$response.statusCode;
}
/**
* Probe the raw body reason, first usable hit wins, in SDK-field order:
* `body` string (Mistral) → `error` parsed JSON body object (`openai` SDK's
* `this.error`) → `$response.body` (Bedrock). Empty objects and unread response
* streams are treated as no body so they do not surface as `"{}"` or serialized
* stream internals. The chosen body is truncated to the cap.
*/
function extractBody(error) {
	const bodyText = pickBodyText(error);
	if (bodyText === void 0) return void 0;
	const trimmed = bodyText.trim();
	if (trimmed.length === 0) return void 0;
	return truncateErrorText(trimmed, MAX_PROVIDER_ERROR_BODY_CHARS);
}
function pickBodyText(error) {
	if (typeof error.body === "string") return error.body;
	if (isPlainNonEmptyObject(error.error)) return safeJsonStringify(error.error);
	const responseBody = error.$response?.body;
	if (typeof responseBody === "string") return responseBody;
	if (isReadableStreamLike(responseBody)) return void 0;
	if (isPlainNonEmptyObject(responseBody)) return safeJsonStringify(responseBody);
}
function isReadableStreamLike(value) {
	return typeof value === "object" && value !== null && "pipe" in value && typeof value.pipe === "function";
}
/**
* Only a PLAIN object counts as an HTTP body. SDK error fields can hold class
* instances instead of parsed bodies — AWS SDK v3's `$response.body` is an
* HTTP stream/response wrapper object, and stringifying one produced garbage
* like `{"_events":...}` as the "body", which then REPLACED `error.message`
* in the composed display string. `error.message` is where the SDK puts the
* real deserialized exception text ("Input is too long...", schema validation
* details, ...), so the one useful string was discarded for noise. A class
* instance yields no body, `messageCarriesBody` stays true, and the real
* message survives. Complements the `pipe` sniffing above: web
* ReadableStreams (pipeTo/pipeThrough, no `pipe`) and non-stream SDK wrapper
* classes fail the prototype check, while parsed JSON bodies (plain objects
* by construction) still pass.
*/
function isPlainNonEmptyObject(value) {
	if (typeof value !== "object" || value === null) return false;
	const proto = Object.getPrototypeOf(value);
	if (proto !== Object.prototype && proto !== null) return false;
	return Object.keys(value).length > 0;
}
/**
* Compose a display string from a normalized error. When the message already
* carries the body (Anthropic / `@google/genai` happy path) or no body/status
* was extracted, the message is returned unchanged. Otherwise the status and
* body are surfaced, with an optional provider prefix.
*
* - no prefix: `"<status>: <body>"`
* - prefix:    `"<prefix> (<status>): <body>"`
*/
function formatProviderError(norm, prefix) {
	if (norm.messageCarriesBody || norm.status === void 0 || norm.body === void 0) return prefix !== void 0 && norm.status !== void 0 ? `${prefix} (${norm.status}): ${norm.message}` : norm.message;
	return prefix !== void 0 ? `${prefix} (${norm.status}): ${norm.body}` : `${norm.status}: ${norm.body}`;
}
function truncateErrorText(text, maxChars) {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}... [truncated ${text.length - maxChars} chars]`;
}
function safeJsonStringify(value) {
	try {
		const serialized = JSON.stringify(value);
		return serialized === void 0 ? String(value) : serialized;
	} catch {
		return String(value);
	}
}
function clampOpenAIPromptCacheKey(key) {
	if (key === void 0) return void 0;
	const chars = Array.from(key);
	if (chars.length <= 64) return key;
	return chars.slice(0, 64).join("");
}
//#endregion
export { shortHash as i, formatProviderError as n, normalizeProviderError as r, clampOpenAIPromptCacheKey as t };
