import { a as appendAssistantMessageDiagnostic, l as AssistantMessageEventStream, n as clampThinkingLevel, o as createAssistantMessageDiagnostic, s as formatThrownValue } from "./models-DKCjz2BR.js";
import { g as getProviderEnvValue, n as buildBaseOptions, o as getPiUserAgent, s as headersToRecord, u as createGrammarToolInputProperties } from "./simple-options-BexO61P-.js";
import { n as formatProviderError, r as normalizeProviderError, t as clampOpenAIPromptCacheKey } from "./openai-prompt-cache-B08QdMP7.js";
import { n as convertResponsesTools, r as processResponsesStream, t as convertResponsesMessages } from "./openai-responses-shared-DP9YzGll.js";
import { t as splitDeferredTools } from "./deferred-tools-CITFWvi1.js";
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/session-resources.js
const sessionResourceCleanups = /* @__PURE__ */ new Set();
function registerSessionResourceCleanup(cleanup) {
	sessionResourceCleanups.add(cleanup);
	return () => {
		sessionResourceCleanups.delete(cleanup);
	};
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/uuid.js
const MAX_UUID_V7_TIMESTAMP = 0xffffffffffff;
const MAX_SEQUENCE = (1n << 41n) - 1n;
let lastOrdinaryTimestamp = -1;
let sequence;
/** Generate a time-ordered UUIDv7. A supplied timestamp is preserved for follower ids. */
function uuidv7(timestampMs) {
	const requestedTimestamp = timestampMs ?? Date.now();
	if (!Number.isInteger(requestedTimestamp) || requestedTimestamp < 0 || requestedTimestamp > MAX_UUID_V7_TIMESTAMP) throw new RangeError(`UUIDv7 timestamp must be an integer between 0 and ${MAX_UUID_V7_TIMESTAMP}`);
	const effectiveTimestamp = timestampMs === void 0 ? Math.max(requestedTimestamp, lastOrdinaryTimestamp) : timestampMs;
	if (timestampMs === void 0) lastOrdinaryTimestamp = effectiveTimestamp;
	const bytes = /* @__PURE__ */ new Uint8Array(16);
	globalThis.crypto.getRandomValues(bytes);
	if (sequence === void 0) sequence = BigInt(bytes[1]) << 32n | BigInt(bytes[2]) << 24n | BigInt(bytes[3]) << 16n | BigInt(bytes[4]) << 8n | BigInt(bytes[5]);
	else {
		if (sequence === MAX_SEQUENCE) throw new RangeError("UUIDv7 generator sequence exhausted");
		sequence++;
	}
	const timestamp = BigInt(effectiveTimestamp);
	for (let index = 5; index >= 0; index--) bytes[index] = Number(timestamp >> BigInt((5 - index) * 8)) & 255;
	bytes[6] = 112 | Number(sequence >> 37n & 15n);
	bytes[7] = Number(sequence >> 29n & 255n);
	bytes[8] = 128 | Number(sequence >> 23n & 63n);
	bytes[9] = Number(sequence >> 15n & 255n);
	bytes[10] = Number(sequence >> 7n & 255n);
	bytes[11] = Number((sequence & 127n) << 1n) | bytes[11] & 1;
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
	return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/abort-signals.js
function combineAbortSignals(signals) {
	const activeSignals = signals.filter((signal) => signal !== void 0);
	if (activeSignals.length === 0) return { cleanup: () => {} };
	if (activeSignals.length === 1) return {
		signal: activeSignals[0],
		cleanup: () => {}
	};
	const controller = new AbortController();
	const listeners = [];
	const abort = (signal) => {
		if (!controller.signal.aborted) controller.abort(signal.reason);
	};
	for (const signal of activeSignals) {
		if (signal.aborted) {
			abort(signal);
			break;
		}
		const listener = () => abort(signal);
		signal.addEventListener("abort", listener, { once: true });
		listeners.push({
			signal,
			listener
		});
	}
	return {
		signal: controller.signal,
		cleanup: () => {
			for (const { signal, listener } of listeners) signal.removeEventListener("abort", listener);
		}
	};
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/node-http-proxy.js
const DEFAULT_PROXY_PORTS = {
	ftp: 21,
	gopher: 70,
	http: 80,
	https: 443,
	ws: 80,
	wss: 443
};
function getProxyEnv(key, env) {
	const lowercaseKey = key.toLowerCase();
	const uppercaseKey = key.toUpperCase();
	return env?.[lowercaseKey] || env?.[uppercaseKey] || getProviderEnvValue(lowercaseKey) || getProviderEnvValue(uppercaseKey) || "";
}
function parseProxyTargetUrl(targetUrl) {
	if (targetUrl instanceof URL) return targetUrl;
	try {
		return new URL(targetUrl);
	} catch {
		return;
	}
}
function stripBrackets(host) {
	return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}
function parseNoProxyEntry(entry) {
	const trimmed = entry.trim().toLowerCase();
	if (!trimmed) return void 0;
	if (trimmed.startsWith("[")) {
		const closingBracket = trimmed.indexOf("]");
		if (closingBracket !== -1) {
			const host = trimmed.slice(1, closingBracket);
			const rest = trimmed.slice(closingBracket + 1);
			if (rest.startsWith(":")) {
				const port = Number.parseInt(rest.slice(1), 10);
				return {
					host,
					port: Number.isNaN(port) ? 0 : port
				};
			}
			return {
				host,
				port: 0
			};
		}
	}
	if (trimmed.includes(":") && trimmed.split(":").length > 2) return {
		host: trimmed,
		port: 0
	};
	const colonIndex = trimmed.lastIndexOf(":");
	if (colonIndex !== -1 && colonIndex === trimmed.indexOf(":")) {
		const host = trimmed.slice(0, colonIndex);
		const port = Number.parseInt(trimmed.slice(colonIndex + 1), 10);
		if (!Number.isNaN(port)) return {
			host,
			port
		};
	}
	return {
		host: trimmed,
		port: 0
	};
}
function shouldProxyHostname(hostname, port, env) {
	const noProxy = getProxyEnv("no_proxy", env).toLowerCase();
	if (!noProxy) return true;
	if (noProxy === "*") return false;
	const normalizedTargetHost = stripBrackets(hostname.toLowerCase());
	return noProxy.split(/[,\s]/).every((entry) => {
		const parsed = parseNoProxyEntry(entry);
		if (!parsed) return true;
		if (parsed.port && parsed.port !== port) return true;
		let domain = stripBrackets(parsed.host);
		if (domain.startsWith("*.")) domain = domain.slice(2);
		else if (domain.startsWith(".") || domain.startsWith("*")) domain = domain.slice(1);
		if (!domain) return true;
		if (normalizedTargetHost === domain) return false;
		if (normalizedTargetHost.endsWith(`.${domain}`)) return false;
		return true;
	});
}
function getProxyForUrl(targetUrl, env) {
	const parsedUrl = parseProxyTargetUrl(targetUrl);
	if (!parsedUrl?.protocol || !parsedUrl.host) return "";
	const protocol = parsedUrl.protocol.split(":", 1)[0];
	if (!shouldProxyHostname(stripBrackets(parsedUrl.hostname || parsedUrl.host.replace(/:\d*$/, "")), Number.parseInt(parsedUrl.port, 10) || DEFAULT_PROXY_PORTS[protocol] || 0, env)) return "";
	let proxy = getProxyEnv(`${protocol}_proxy`, env) || getProxyEnv("all_proxy", env);
	if (proxy && !proxy.includes("://")) proxy = `${protocol}://${proxy}`;
	return proxy;
}
const UNSUPPORTED_PROXY_PROTOCOL_MESSAGE = "Unsupported proxy protocol. SOCKS and PAC proxy URLs are not supported; use an HTTP or HTTPS proxy URL.";
function resolveHttpProxyUrlForTarget(targetUrl, env) {
	const proxy = getProxyForUrl(targetUrl, env);
	if (!proxy) return;
	let proxyUrl;
	try {
		proxyUrl = new URL(proxy);
	} catch (error) {
		throw new Error(`Invalid proxy URL ${JSON.stringify(proxy)}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (proxyUrl.protocol !== "http:" && proxyUrl.protocol !== "https:") throw new Error(`${UNSUPPORTED_PROXY_PROTOCOL_MESSAGE} Got ${proxyUrl.protocol}`);
	return proxyUrl;
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js
const DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const DEFAULT_MAX_RETRIES = 0;
const BASE_DELAY_MS = 1e3;
const DEFAULT_MAX_RETRY_DELAY_MS = 6e4;
const DEFAULT_WEBSOCKET_CONNECT_TIMEOUT_MS = 15e3;
const REQUEST_COMPRESSION_ZSTD_LEVEL = 3;
const CODEX_TOOL_CALL_PROVIDERS = /* @__PURE__ */ new Set([
	"openai",
	"openai-codex",
	"opencode"
]);
const WEBSOCKET_MESSAGE_TOO_BIG_CLOSE_CODE = 1009;
const WEBSOCKET_CONNECTION_LIMIT_REACHED_CODE = "websocket_connection_limit_reached";
const PREVIOUS_RESPONSE_NOT_FOUND_CODE = "previous_response_not_found";
const CODEX_RESPONSE_STATUSES = /* @__PURE__ */ new Set([
	"completed",
	"incomplete",
	"failed",
	"cancelled",
	"queued",
	"in_progress"
]);
function assertSuccessfulOutput(output) {
	if (output.stopReason === "pending") throw new Error("Codex stream ended without a stop reason");
	if (output.stopReason === "error" || output.stopReason === "aborted") throw new Error(output.errorMessage || "An unknown error occurred");
}
function isTerminalRateLimitError(errorText) {
	return /GoUsageLimitError|FreeUsageLimitError|Monthly usage limit reached|available balance|insufficient_quota|out of budget|quota exceeded|billing/i.test(errorText);
}
function isRetryableError(status, errorText) {
	if (status === 429 && isTerminalRateLimitError(errorText)) return false;
	if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
	return /rate.?limit|overloaded|service.?unavailable|upstream.?connect|connection.?refused/i.test(errorText);
}
function getRetryAfterDelayMs(headers) {
	const retryAfterMs = headers.get("retry-after-ms");
	if (retryAfterMs !== null) {
		const millis = Number(retryAfterMs);
		if (Number.isFinite(millis)) return Math.max(0, millis);
	}
	const retryAfter = headers.get("retry-after");
	if (!retryAfter) return;
	const seconds = Number(retryAfter);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
	const date = Date.parse(retryAfter);
	if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
}
var RetryDelayExceededError = class extends Error {};
function validateRetryDelayMs(delayMs, options) {
	const maxRetryDelayMs = options?.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
	if (maxRetryDelayMs > 0 && delayMs > maxRetryDelayMs) throw new RetryDelayExceededError(`Server requested ${Math.ceil(delayMs / 1e3)}s retry delay (max: ${Math.ceil(maxRetryDelayMs / 1e3)}s)`);
	return delayMs;
}
function sleep(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(/* @__PURE__ */ new Error("Request was aborted"));
			return;
		}
		const timeout = setTimeout(resolve, ms);
		signal?.addEventListener("abort", () => {
			clearTimeout(timeout);
			reject(/* @__PURE__ */ new Error("Request was aborted"));
		});
	});
}
function normalizeTimeoutMs(value) {
	if (value === void 0) return void 0;
	if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid timeoutMs: ${String(value)}`);
	return Math.floor(value);
}
function loadNodeZlib() {
	if (typeof process === "undefined" || !(process.versions?.node || process.versions?.bun)) return null;
	return process.getBuiltinModule?.("node:zlib") ?? null;
}
function compressRequestBodyZstd(bodyJson) {
	const zlib = loadNodeZlib();
	if (!zlib || typeof zlib.zstdCompressSync !== "function") return null;
	try {
		const compressed = zlib.zstdCompressSync(bodyJson, { params: { [zlib.constants.ZSTD_c_compressionLevel]: REQUEST_COMPRESSION_ZSTD_LEVEL } });
		return new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);
	} catch {
		return null;
	}
}
const stream = (model, context, options) => {
	const stream = new AssistantMessageEventStream();
	(async () => {
		const output = {
			role: "assistant",
			content: [],
			api: "openai-codex-responses",
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					total: 0
				}
			},
			stopReason: "pending",
			timestamp: Date.now()
		};
		try {
			const apiKey = options?.apiKey;
			if (!apiKey) throw new Error(`No API key for provider: ${model.provider}`);
			const accountId = extractAccountId(apiKey);
			const grammarToolInputProperties = createGrammarToolInputProperties(context.tools, model.compat?.supportsOpenAIGrammarTools ?? false);
			const cacheSessionId = options?.cacheRetention === "none" ? void 0 : options?.sessionId;
			const codexSessionId = clampOpenAIPromptCacheKey(cacheSessionId);
			let body = buildRequestBody(model, context, options, codexSessionId, grammarToolInputProperties);
			const nextBody = await options?.onPayload?.(body, model);
			if (nextBody !== void 0) body = nextBody;
			const websocketRequestId = codexSessionId || uuidv7();
			const sseHeaders = buildSSEHeaders(model.headers, options?.headers, accountId, apiKey, codexSessionId);
			const websocketHeaders = buildWebSocketHeaders(model.headers, options?.headers, accountId, apiKey, websocketRequestId);
			const bodyJson = JSON.stringify(body);
			const httpTimeoutMs = normalizeTimeoutMs(options?.timeoutMs);
			const websocketConnectTimeoutMs = normalizeTimeoutMs(options?.websocketConnectTimeoutMs);
			const transport = options?.transport || "auto";
			let startEmitted = false;
			const websocketDisabledForSession = transport !== "sse" && isWebSocketSseFallbackActive(cacheSessionId);
			if (websocketDisabledForSession) recordWebSocketSseFallback(cacheSessionId);
			if (transport !== "sse" && !websocketDisabledForSession) {
				let websocketStarted = false;
				let retriedWebSocketConnectionLimit = false;
				let retriedMissingWebSocketContinuation = false;
				while (true) {
					websocketStarted = false;
					try {
						await processWebSocketStream(resolveCodexWebSocketUrl(model.baseUrl), body, websocketHeaders, output, stream, model, () => {
							websocketStarted = true;
							if (!startEmitted) {
								startEmitted = true;
								stream.push({
									type: "start",
									partial: output
								});
							}
						}, httpTimeoutMs, websocketConnectTimeoutMs, cacheSessionId, accountId, grammarToolInputProperties, options);
						if (options?.signal?.aborted) throw new Error("Request was aborted");
						assertSuccessfulOutput(output);
						stream.push({
							type: "done",
							reason: output.stopReason,
							message: output
						});
						stream.end();
						return;
					} catch (error) {
						const aborted = options?.signal?.aborted;
						const connectionLimitBeforeStart = !websocketStarted && isWebSocketConnectionLimitReachedError(error);
						const previousResponseNotFound = isPreviousResponseNotFoundError(error);
						if (!aborted && previousResponseNotFound && !retriedMissingWebSocketContinuation) {
							retriedMissingWebSocketContinuation = true;
							continue;
						}
						if (!aborted && connectionLimitBeforeStart && !retriedWebSocketConnectionLimit) {
							retriedWebSocketConnectionLimit = true;
							continue;
						}
						if (aborted || isCodexNonTransportError(error) && !connectionLimitBeforeStart) throw error;
						appendAssistantMessageDiagnostic(output, createAssistantMessageDiagnostic("provider_transport_failure", error, {
							configuredTransport: transport,
							fallbackTransport: websocketStarted ? void 0 : "sse",
							eventsEmitted: websocketStarted,
							phase: websocketStarted ? "after_message_stream_start" : "before_message_stream_start",
							requestBytes: new TextEncoder().encode(bodyJson).byteLength
						}));
						recordWebSocketFailure(cacheSessionId, error);
						if (websocketStarted) throw error;
						recordWebSocketSseFallback(cacheSessionId);
						break;
					}
				}
			}
			const compressedBody = compressRequestBodyZstd(bodyJson);
			if (compressedBody) sseHeaders.set("content-encoding", "zstd");
			const sseBody = compressedBody ?? bodyJson;
			let response;
			let lastError;
			const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				if (options?.signal?.aborted) throw new Error("Request was aborted");
				try {
					const headerTimeoutSignal = httpTimeoutMs !== void 0 && httpTimeoutMs > 0 ? AbortSignal.timeout(httpTimeoutMs) : void 0;
					const combinedSignal = combineAbortSignals([options?.signal, headerTimeoutSignal]);
					try {
						response = await (options?.fetch ?? globalThis.fetch)(resolveCodexUrl(model.baseUrl), {
							method: "POST",
							headers: sseHeaders,
							body: sseBody,
							signal: combinedSignal.signal
						});
					} catch (error) {
						if (headerTimeoutSignal?.aborted && !options?.signal?.aborted) throw new Error(`Codex SSE response headers timed out after ${httpTimeoutMs}ms`);
						throw error;
					} finally {
						combinedSignal.cleanup();
					}
					await options?.onResponse?.({
						status: response.status,
						headers: headersToRecord(response.headers)
					}, model);
					if (response.ok) break;
					const errorText = await response.text();
					if (attempt < maxRetries && isRetryableError(response.status, errorText)) {
						const retryAfterDelayMs = getRetryAfterDelayMs(response.headers);
						await sleep(retryAfterDelayMs === void 0 ? BASE_DELAY_MS * 2 ** attempt : validateRetryDelayMs(retryAfterDelayMs, options), options?.signal);
						continue;
					}
					const info = await parseErrorResponse(new Response(errorText, {
						status: response.status,
						statusText: response.statusText
					}));
					throw new Error(info.friendlyMessage || info.message);
				} catch (error) {
					if (error instanceof Error) {
						if (error.name === "AbortError" || error.message === "Request was aborted") throw new Error("Request was aborted");
					}
					lastError = error instanceof Error ? error : new Error(String(error));
					if (attempt < maxRetries && !(lastError instanceof RetryDelayExceededError) && !lastError.message.includes("usage limit")) {
						await sleep(BASE_DELAY_MS * 2 ** attempt, options?.signal);
						continue;
					}
					throw lastError;
				}
			}
			if (!response?.ok) throw lastError ?? /* @__PURE__ */ new Error("Failed after retries");
			if (!response.body) throw new Error("No response body");
			if (!startEmitted) {
				startEmitted = true;
				stream.push({
					type: "start",
					partial: output
				});
			}
			await processStream(response, output, stream, model, grammarToolInputProperties, options);
			if (options?.signal?.aborted) throw new Error("Request was aborted");
			assertSuccessfulOutput(output);
			stream.push({
				type: "done",
				reason: output.stopReason,
				message: output
			});
			stream.end();
		} catch (error) {
			for (const block of output.content) {
				delete block.partialJson;
				delete block.customInput;
			}
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = formatProviderError(normalizeProviderError(error));
			stream.push({
				type: "error",
				reason: output.stopReason,
				error: output
			});
			stream.end();
		}
	})();
	return stream;
};
const streamSimple = (model, context, options) => {
	const apiKey = options?.apiKey;
	if (!apiKey) throw new Error(`No API key for provider: ${model.provider}`);
	const base = {
		...buildBaseOptions(model, context, options, apiKey),
		toolChoice: options?.toolChoice
	};
	const clampedReasoning = options?.reasoning ? clampThinkingLevel(model, options.reasoning) : void 0;
	const reasoningEffort = clampedReasoning === "off" ? void 0 : clampedReasoning;
	return stream(model, context, {
		...base,
		reasoningEffort
	});
};
function buildRequestBody(model, context, options, cacheSessionId, grammarToolInputProperties = createGrammarToolInputProperties(context.tools, model.compat?.supportsOpenAIGrammarTools ?? false)) {
	const supportsStrictMode = model.compat?.supportsStrictMode ?? true;
	const supportsOpenAIGrammarTools = model.compat?.supportsOpenAIGrammarTools ?? false;
	const deferredToolsMode = model.compat?.supportsAdditionalTools ? "additional-tools" : model.compat?.supportsToolSearch ? "tool-search" : void 0;
	const toolPlacement = splitDeferredTools(context, deferredToolsMode !== void 0);
	const messages = convertResponsesMessages(model, context, CODEX_TOOL_CALL_PROVIDERS, {
		includeSystemPrompt: false,
		grammarToolInputProperties,
		deferredTools: toolPlacement.deferred,
		deferredToolsMode,
		toolOptions: {
			strict: null,
			supportsStrictMode,
			supportsOpenAIGrammarTools
		}
	});
	const body = {
		model: model.id,
		store: false,
		stream: true,
		instructions: context.systemPrompt || "You are a helpful assistant.",
		input: messages,
		text: { verbosity: options?.textVerbosity || "low" },
		include: ["reasoning.encrypted_content"],
		prompt_cache_key: cacheSessionId,
		tool_choice: options?.toolChoice ?? "auto",
		parallel_tool_calls: true
	};
	if (options?.temperature !== void 0) body.temperature = options.temperature;
	if (options?.serviceTier !== void 0) body.service_tier = options.serviceTier;
	if (toolPlacement.immediate.length > 0) body.tools = convertResponsesTools(toolPlacement.immediate, {
		strict: null,
		supportsStrictMode,
		supportsOpenAIGrammarTools
	});
	if (options?.reasoningEffort !== void 0) {
		const effort = options.reasoningEffort === "none" ? model.thinkingLevelMap?.off ?? "none" : model.thinkingLevelMap?.[options.reasoningEffort] ?? options.reasoningEffort;
		if (effort !== null) body.reasoning = {
			effort,
			summary: options.reasoningSummary ?? "auto"
		};
	}
	return body;
}
function getServiceTierCostMultiplier(model, serviceTier) {
	switch (serviceTier) {
		case "flex": return .5;
		case "priority": return model.id === "gpt-5.5" ? 2.5 : 2;
		default: return 1;
	}
}
function applyServiceTierPricing(usage, serviceTier, model) {
	const multiplier = getServiceTierCostMultiplier(model, serviceTier);
	if (multiplier === 1) return;
	usage.cost.input *= multiplier;
	usage.cost.output *= multiplier;
	usage.cost.cacheRead *= multiplier;
	usage.cost.cacheWrite *= multiplier;
	usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
}
function resolveCodexServiceTier(responseServiceTier, requestServiceTier) {
	if (responseServiceTier === "default" && (requestServiceTier === "flex" || requestServiceTier === "priority")) return requestServiceTier;
	return responseServiceTier ?? requestServiceTier;
}
function resolveCodexUrl(baseUrl) {
	const normalized = (baseUrl && baseUrl.trim().length > 0 ? baseUrl : DEFAULT_CODEX_BASE_URL).replace(/\/+$/, "");
	if (normalized.endsWith("/codex/responses")) return normalized;
	if (normalized.endsWith("/codex")) return `${normalized}/responses`;
	return `${normalized}/codex/responses`;
}
function resolveCodexWebSocketUrl(baseUrl) {
	const url = new URL(resolveCodexUrl(baseUrl));
	if (url.protocol === "https:") url.protocol = "wss:";
	if (url.protocol === "http:") url.protocol = "ws:";
	return url.toString();
}
async function processStream(response, output, stream, model, grammarToolInputProperties, options) {
	await processResponsesStream(mapCodexEvents(parseSSE(response, options?.signal), output), output, stream, model, {
		serviceTier: options?.serviceTier,
		grammarToolInputProperties,
		resolveServiceTier: resolveCodexServiceTier,
		applyServiceTierPricing: (usage, serviceTier) => applyServiceTierPricing(usage, serviceTier, model)
	});
}
var CodexApiError = class extends Error {
	code;
	payload;
	constructor(message, options) {
		super(message);
		this.name = "CodexApiError";
		this.code = options?.code;
		this.payload = options?.payload;
		this.cause = options?.cause;
	}
};
var CodexProtocolError = class extends Error {
	payload;
	constructor(message, options) {
		super(message);
		this.name = "CodexProtocolError";
		this.payload = options?.payload;
		this.cause = options?.cause;
	}
};
function isCodexNonTransportError(error) {
	return error instanceof CodexApiError || error instanceof CodexProtocolError;
}
function isWebSocketConnectionLimitReachedError(error) {
	return error instanceof CodexApiError && error.code === WEBSOCKET_CONNECTION_LIMIT_REACHED_CODE;
}
function isPreviousResponseNotFoundError(error) {
	return error instanceof CodexApiError && error.code === PREVIOUS_RESPONSE_NOT_FOUND_CODE;
}
function extractCodexEventError(event) {
	const nested = event.error && typeof event.error === "object" ? event.error : void 0;
	return {
		code: typeof event.code === "string" ? event.code : typeof nested?.code === "string" ? nested.code : void 0,
		message: typeof event.message === "string" ? event.message : typeof nested?.message === "string" ? nested.message : void 0
	};
}
async function* mapCodexEvents(events, output) {
	for await (const event of events) {
		const type = typeof event.type === "string" ? event.type : void 0;
		if (!type) continue;
		if (type === "error") {
			const { code, message } = extractCodexEventError(event);
			throw new CodexApiError(`Codex error: ${message || code || JSON.stringify(event)}`, {
				code,
				payload: event
			});
		}
		if (type === "response.failed") {
			const response = event.response;
			const code = response?.error?.code;
			const message = response?.error?.message;
			throw new CodexApiError(message || "Codex response failed", {
				code,
				payload: event
			});
		}
		if (type === "response.done" || type === "response.completed" || type === "response.incomplete") {
			const response = event.response;
			if (typeof response?.end_turn === "boolean") output.endTurn = response.end_turn;
			const normalizedResponse = response ? {
				...response,
				status: normalizeCodexStatus(response.status)
			} : response;
			yield {
				...event,
				type: "response.completed",
				response: normalizedResponse
			};
			return;
		}
		yield event;
	}
}
function normalizeCodexStatus(status) {
	if (typeof status !== "string") return void 0;
	return CODEX_RESPONSE_STATUSES.has(status) ? status : void 0;
}
async function* parseSSE(response, signal) {
	if (!response.body) return;
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const onAbort = () => {
		reader.cancel().catch(() => {});
	};
	signal?.addEventListener("abort", onAbort, { once: true });
	try {
		while (true) {
			if (signal?.aborted) throw new Error("Request was aborted");
			const { done, value } = await reader.read();
			if (signal?.aborted) throw new Error("Request was aborted");
			buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
			if (done && buffer.trim()) buffer += "\n\n";
			let idx = buffer.indexOf("\n\n");
			while (idx !== -1) {
				const chunk = buffer.slice(0, idx);
				buffer = buffer.slice(idx + 2);
				const dataLines = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
				if (dataLines.length > 0) {
					const data = dataLines.join("\n").trim();
					if (data && data !== "[DONE]") try {
						yield JSON.parse(data);
					} catch (cause) {
						throw new CodexProtocolError(`Invalid Codex SSE JSON: ${formatThrownValue(cause)}`, {
							cause,
							payload: data
						});
					}
				}
				idx = buffer.indexOf("\n\n");
			}
			if (done) break;
		}
	} finally {
		signal?.removeEventListener("abort", onAbort);
		try {
			await reader.cancel();
		} catch {}
		try {
			reader.releaseLock();
		} catch {}
	}
}
const OPENAI_BETA_RESPONSES_WEBSOCKETS = "responses_websockets=2026-02-06";
const SESSION_WEBSOCKET_CACHE_TTL_MS = 3e5;
const SESSION_WEBSOCKET_MAX_AGE_MS = 33e5;
const websocketSessionCache = /* @__PURE__ */ new Map();
const websocketDebugStats = /* @__PURE__ */ new Map();
const websocketSseFallbackSessions = /* @__PURE__ */ new Set();
function getOrCreateWebSocketDebugStats(sessionId) {
	let stats = websocketDebugStats.get(sessionId);
	if (!stats) {
		stats = {
			requests: 0,
			connectionsCreated: 0,
			connectionsReused: 0,
			cachedContextRequests: 0,
			storeTrueRequests: 0,
			fullContextRequests: 0,
			deltaRequests: 0,
			lastInputItems: 0,
			websocketFailures: 0,
			sseFallbacks: 0
		};
		websocketDebugStats.set(sessionId, stats);
	}
	return stats;
}
function getOpenAICodexWebSocketDebugStats(sessionId) {
	const stats = websocketDebugStats.get(sessionId);
	return stats ? { ...stats } : void 0;
}
function resetOpenAICodexWebSocketDebugStats(sessionId) {
	if (sessionId) {
		websocketDebugStats.delete(sessionId);
		websocketSseFallbackSessions.delete(sessionId);
		return;
	}
	websocketDebugStats.clear();
	websocketSseFallbackSessions.clear();
}
function closeOpenAICodexWebSocketSessions(sessionId) {
	const closeEntry = (entry) => {
		if (entry.idleTimer) clearTimeout(entry.idleTimer);
		closeWebSocketSilently(entry.socket, 1e3, "debug_close");
	};
	if (sessionId) {
		for (const entry of websocketSessionCache.get(sessionId)?.values() ?? []) closeEntry(entry);
		websocketSessionCache.delete(sessionId);
		return;
	}
	for (const accountEntries of websocketSessionCache.values()) for (const entry of accountEntries.values()) closeEntry(entry);
	websocketSessionCache.clear();
}
registerSessionResourceCleanup(closeOpenAICodexWebSocketSessions);
function isWebSocketSseFallbackActive(sessionId) {
	return sessionId ? websocketSseFallbackSessions.has(sessionId) : false;
}
function recordWebSocketSseFallback(sessionId) {
	if (!sessionId) return;
	const stats = getOrCreateWebSocketDebugStats(sessionId);
	stats.sseFallbacks++;
	stats.websocketFallbackActive = isWebSocketSseFallbackActive(sessionId);
}
function recordWebSocketFailure(sessionId, error) {
	if (!sessionId) return;
	websocketSseFallbackSessions.add(sessionId);
	const stats = getOrCreateWebSocketDebugStats(sessionId);
	stats.websocketFailures++;
	stats.lastWebSocketError = formatThrownValue(error);
	stats.websocketFallbackActive = true;
}
let _cachedWebsocket = null;
async function getWebSocketConstructor(env) {
	if (!env && _cachedWebsocket) return _cachedWebsocket;
	if (typeof process !== "undefined" && process.versions?.bun) {
		const WebSocketWithProxy = class extends WebSocket {
			constructor(url, options) {
				let _opts = {};
				if (Array.isArray(options) || typeof options === "string") _opts = { protocols: options };
				else _opts = { ...options };
				const proxyUrl = resolveHttpProxyUrlForTarget(url.toString().replace(/^wss:/, "https:").replace(/^ws:/, "http:"), env);
				super(url, {
					..._opts,
					...proxyUrl ? { proxy: proxyUrl.toString() } : {}
				});
			}
		};
		if (!env) _cachedWebsocket = WebSocketWithProxy;
		return WebSocketWithProxy;
	}
	const ctor = globalThis.WebSocket;
	if (typeof ctor !== "function") return null;
	return ctor;
}
var WebSocketCloseError = class extends Error {
	code;
	reason;
	wasClean;
	constructor(message, options) {
		super(message);
		this.name = "WebSocketCloseError";
		this.code = options?.code;
		this.reason = options?.reason;
		this.wasClean = options?.wasClean;
	}
};
function getWebSocketReadyState(socket) {
	const readyState = socket.readyState;
	return typeof readyState === "number" ? readyState : void 0;
}
function isWebSocketReusable(socket) {
	const readyState = getWebSocketReadyState(socket);
	return readyState === void 0 || readyState === 1;
}
function isWebSocketSessionExpired(entry) {
	return Date.now() - entry.createdAt >= SESSION_WEBSOCKET_MAX_AGE_MS;
}
function closeWebSocketSilently(socket, code = 1e3, reason = "done") {
	try {
		socket.close(code, reason);
	} catch {}
}
function scheduleSessionWebSocketExpiry(sessionId, accountId, entry) {
	if (entry.idleTimer) clearTimeout(entry.idleTimer);
	entry.idleTimer = setTimeout(() => {
		if (entry.busy) return;
		closeWebSocketSilently(entry.socket, 1e3, "idle_timeout");
		const accountEntries = websocketSessionCache.get(sessionId);
		if (accountEntries?.get(accountId) === entry) accountEntries.delete(accountId);
		if (accountEntries?.size === 0) websocketSessionCache.delete(sessionId);
	}, SESSION_WEBSOCKET_CACHE_TTL_MS);
}
async function connectWebSocket(url, headers, signal, connectTimeoutMs = DEFAULT_WEBSOCKET_CONNECT_TIMEOUT_MS, env) {
	const WebSocketCtor = await getWebSocketConstructor(env);
	if (!WebSocketCtor) throw new Error("WebSocket transport is not available in this runtime");
	const wsHeaders = headersToRecord(headers);
	delete wsHeaders["OpenAI-Beta"];
	return new Promise((resolve, reject) => {
		let settled = false;
		let timeout;
		let socket;
		try {
			socket = new WebSocketCtor(url, { headers: wsHeaders });
		} catch (error) {
			reject(error instanceof Error ? error : new Error(String(error)));
			return;
		}
		const cleanup = () => {
			if (timeout) {
				clearTimeout(timeout);
				timeout = void 0;
			}
			socket.removeEventListener("open", onOpen);
			socket.removeEventListener("error", onError);
			socket.removeEventListener("close", onClose);
			signal?.removeEventListener("abort", onAbort);
		};
		const fail = (error, closeReason) => {
			if (settled) return;
			settled = true;
			cleanup();
			if (closeReason) closeWebSocketSilently(socket, 1e3, closeReason);
			reject(error);
		};
		const onOpen = () => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(socket);
		};
		const onError = (event) => {
			fail(extractWebSocketError(event));
		};
		const onClose = (event) => {
			fail(extractWebSocketCloseError(event));
		};
		const onAbort = () => {
			fail(/* @__PURE__ */ new Error("Request was aborted"), "aborted");
		};
		socket.addEventListener("open", onOpen);
		socket.addEventListener("error", onError);
		socket.addEventListener("close", onClose);
		signal?.addEventListener("abort", onAbort);
		if (connectTimeoutMs > 0) timeout = setTimeout(() => {
			fail(/* @__PURE__ */ new Error(`WebSocket connect timeout after ${connectTimeoutMs}ms`), "connect_timeout");
		}, connectTimeoutMs);
		if (signal?.aborted) onAbort();
	});
}
async function acquireWebSocket(url, headers, sessionId, accountId, signal, connectTimeoutMs, env) {
	if (!sessionId) {
		const socket = await connectWebSocket(url, headers, signal, connectTimeoutMs, env);
		return {
			socket,
			reused: false,
			release: () => closeWebSocketSilently(socket)
		};
	}
	let accountEntries = websocketSessionCache.get(sessionId);
	const cached = accountEntries?.get(accountId);
	if (cached) {
		if (cached.idleTimer) {
			clearTimeout(cached.idleTimer);
			cached.idleTimer = void 0;
		}
		if (!cached.busy && isWebSocketSessionExpired(cached)) {
			closeWebSocketSilently(cached.socket, 1e3, "connection_age_limit");
			accountEntries?.delete(accountId);
			if (accountEntries?.size === 0) websocketSessionCache.delete(sessionId);
		} else if (!cached.busy && isWebSocketReusable(cached.socket)) {
			cached.busy = true;
			return {
				socket: cached.socket,
				entry: cached,
				reused: true,
				release: ({ keep } = {}) => {
					if (!keep || !isWebSocketReusable(cached.socket)) {
						closeWebSocketSilently(cached.socket);
						const currentEntries = websocketSessionCache.get(sessionId);
						if (currentEntries?.get(accountId) === cached) currentEntries.delete(accountId);
						if (currentEntries?.size === 0) websocketSessionCache.delete(sessionId);
						return;
					}
					cached.busy = false;
					scheduleSessionWebSocketExpiry(sessionId, accountId, cached);
				}
			};
		}
		if (cached.busy) {
			const socket = await connectWebSocket(url, headers, signal, connectTimeoutMs, env);
			return {
				socket,
				reused: false,
				release: () => {
					closeWebSocketSilently(socket);
				}
			};
		}
		if (!isWebSocketReusable(cached.socket)) {
			closeWebSocketSilently(cached.socket);
			accountEntries?.delete(accountId);
			if (accountEntries?.size === 0) websocketSessionCache.delete(sessionId);
		}
	}
	const socket = await connectWebSocket(url, headers, signal, connectTimeoutMs, env);
	const entry = {
		socket,
		busy: true,
		createdAt: Date.now()
	};
	accountEntries = websocketSessionCache.get(sessionId);
	if (!accountEntries) {
		accountEntries = /* @__PURE__ */ new Map();
		websocketSessionCache.set(sessionId, accountEntries);
	}
	accountEntries.set(accountId, entry);
	return {
		socket,
		entry,
		reused: false,
		release: ({ keep } = {}) => {
			if (!keep || !isWebSocketReusable(entry.socket)) {
				closeWebSocketSilently(entry.socket);
				if (entry.idleTimer) clearTimeout(entry.idleTimer);
				const currentEntries = websocketSessionCache.get(sessionId);
				if (currentEntries?.get(accountId) === entry) currentEntries.delete(accountId);
				if (currentEntries?.size === 0) websocketSessionCache.delete(sessionId);
				return;
			}
			entry.busy = false;
			scheduleSessionWebSocketExpiry(sessionId, accountId, entry);
		}
	};
}
function extractWebSocketError(event) {
	if (event && typeof event === "object") {
		const message = "message" in event ? event.message : void 0;
		if (typeof message === "string" && message.length > 0) return new Error(message);
		const nestedError = "error" in event ? event.error : void 0;
		if (nestedError instanceof Error && nestedError.message.length > 0) return nestedError;
		if (nestedError && typeof nestedError === "object" && "message" in nestedError) {
			const nestedMessage = nestedError.message;
			if (typeof nestedMessage === "string" && nestedMessage.length > 0) return new Error(nestedMessage);
		}
	}
	return /* @__PURE__ */ new Error("WebSocket error");
}
function extractWebSocketCloseError(event) {
	if (event && typeof event === "object") {
		const code = "code" in event ? event.code : void 0;
		const reason = "reason" in event ? event.reason : void 0;
		const wasClean = "wasClean" in event ? event.wasClean : void 0;
		const codeText = typeof code === "number" ? ` ${code}` : "";
		let reasonText = typeof reason === "string" && reason.length > 0 ? ` ${reason}` : "";
		if (!reasonText && code === WEBSOCKET_MESSAGE_TOO_BIG_CLOSE_CODE) reasonText = " message too big";
		return new WebSocketCloseError(`WebSocket closed${codeText}${reasonText}`.trim(), {
			code: typeof code === "number" ? code : void 0,
			reason: typeof reason === "string" && reason.length > 0 ? reason : void 0,
			wasClean: typeof wasClean === "boolean" ? wasClean : void 0
		});
	}
	return /* @__PURE__ */ new Error("WebSocket closed");
}
async function decodeWebSocketData(data) {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
	if (ArrayBuffer.isView(data)) {
		const view = data;
		return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
	}
	if (data && typeof data === "object" && "arrayBuffer" in data) {
		const arrayBuffer = await data.arrayBuffer();
		return new TextDecoder().decode(new Uint8Array(arrayBuffer));
	}
	return null;
}
async function* parseWebSocket(socket, signal, idleTimeoutMs) {
	const queue = [];
	let pending = null;
	let done = false;
	let failed = null;
	let sawCompletion = false;
	const wake = () => {
		if (!pending) return;
		const resolve = pending;
		pending = null;
		resolve();
	};
	const onMessage = (event) => {
		(async () => {
			let text = null;
			try {
				if (!event || typeof event !== "object" || !("data" in event)) return;
				text = await decodeWebSocketData(event.data);
				if (!text) return;
				const parsed = JSON.parse(text);
				const type = typeof parsed.type === "string" ? parsed.type : "";
				if (type === "response.completed" || type === "response.done" || type === "response.incomplete") {
					sawCompletion = true;
					done = true;
				}
				queue.push(parsed);
				wake();
			} catch (cause) {
				failed = new CodexProtocolError(`Invalid Codex WebSocket JSON: ${formatThrownValue(cause)}`, {
					cause,
					payload: text
				});
				done = true;
				wake();
			}
		})();
	};
	const onError = (event) => {
		failed = extractWebSocketError(event);
		done = true;
		wake();
	};
	const onClose = (event) => {
		if (sawCompletion) {
			done = true;
			wake();
			return;
		}
		if (!failed) failed = extractWebSocketCloseError(event);
		done = true;
		wake();
	};
	const onAbort = () => {
		failed = /* @__PURE__ */ new Error("Request was aborted");
		done = true;
		wake();
	};
	socket.addEventListener("message", onMessage);
	socket.addEventListener("error", onError);
	socket.addEventListener("close", onClose);
	signal?.addEventListener("abort", onAbort);
	try {
		while (true) {
			if (signal?.aborted) throw new Error("Request was aborted");
			if (queue.length > 0) {
				yield queue.shift();
				continue;
			}
			if (done) break;
			let timeout;
			await new Promise((resolve, reject) => {
				pending = resolve;
				if (idleTimeoutMs !== void 0 && idleTimeoutMs > 0) timeout = setTimeout(() => {
					const error = /* @__PURE__ */ new Error(`WebSocket idle timeout after ${idleTimeoutMs}ms`);
					failed = error;
					done = true;
					pending = null;
					closeWebSocketSilently(socket, 1e3, "idle_timeout");
					reject(error);
				}, idleTimeoutMs);
			}).finally(() => {
				if (timeout) clearTimeout(timeout);
			});
		}
		if (failed) throw failed;
		if (!sawCompletion) throw new Error("WebSocket stream closed before response.completed");
	} finally {
		socket.removeEventListener("message", onMessage);
		socket.removeEventListener("error", onError);
		socket.removeEventListener("close", onClose);
		signal?.removeEventListener("abort", onAbort);
	}
}
function requestBodyWithoutInput(body) {
	const { input: _input, previous_response_id: _previousResponseId, ...rest } = body;
	return rest;
}
function responseInputsEqual(a, b) {
	return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}
function requestBodiesMatchExceptInput(a, b) {
	return JSON.stringify(requestBodyWithoutInput(a)) === JSON.stringify(requestBodyWithoutInput(b));
}
function getCachedWebSocketInputDelta(body, continuation) {
	if (!requestBodiesMatchExceptInput(body, continuation.lastRequestBody)) return;
	const currentInput = body.input ?? [];
	const baseline = [...continuation.lastRequestBody.input ?? [], ...continuation.lastResponseItems];
	if (currentInput.length < baseline.length) return;
	if (!responseInputsEqual(currentInput.slice(0, baseline.length), baseline)) return;
	return currentInput.slice(baseline.length);
}
function buildCachedWebSocketRequestBody(entry, body) {
	const continuation = entry.continuation;
	if (!continuation) return body;
	const delta = getCachedWebSocketInputDelta(body, continuation);
	if (!delta || !continuation.lastResponseId) {
		entry.continuation = void 0;
		return body;
	}
	return {
		...body,
		previous_response_id: continuation.lastResponseId,
		input: delta
	};
}
async function* startWebSocketOutputOnFirstEvent(events, onStart) {
	let started = false;
	for await (const event of events) {
		if (!started) {
			started = true;
			onStart();
		}
		yield event;
	}
}
async function processWebSocketStream(url, body, headers, output, stream, model, onStart, idleTimeoutMs, websocketConnectTimeoutMs, cacheSessionId, accountId, grammarToolInputProperties, options) {
	const { socket, entry, reused, release } = await acquireWebSocket(url, headers, cacheSessionId, accountId, options?.signal, websocketConnectTimeoutMs, options?.env);
	let keepConnection = true;
	const useCachedContext = options?.transport === "websocket-cached" || options?.transport === "auto";
	const fullBody = body;
	const requestBody = useCachedContext && entry ? buildCachedWebSocketRequestBody(entry, fullBody) : fullBody;
	const stats = cacheSessionId ? getOrCreateWebSocketDebugStats(cacheSessionId) : void 0;
	if (stats) {
		stats.requests++;
		if (reused) stats.connectionsReused++;
		else stats.connectionsCreated++;
		if (useCachedContext) stats.cachedContextRequests++;
		if (requestBody.store === true) stats.storeTrueRequests++;
		stats.lastInputItems = requestBody.input?.length ?? 0;
		if (requestBody.previous_response_id) {
			stats.deltaRequests++;
			stats.lastDeltaInputItems = requestBody.input?.length ?? 0;
			stats.lastPreviousResponseId = requestBody.previous_response_id;
		} else {
			stats.fullContextRequests++;
			stats.lastDeltaInputItems = void 0;
			stats.lastPreviousResponseId = void 0;
		}
	}
	try {
		socket.send(JSON.stringify({
			type: "response.create",
			...requestBody
		}));
		await processResponsesStream(startWebSocketOutputOnFirstEvent(mapCodexEvents(parseWebSocket(socket, options?.signal, idleTimeoutMs), output), onStart), output, stream, model, {
			serviceTier: options?.serviceTier,
			grammarToolInputProperties,
			resolveServiceTier: resolveCodexServiceTier,
			applyServiceTierPricing: (usage, serviceTier) => applyServiceTierPricing(usage, serviceTier, model)
		});
		if (options?.signal?.aborted) keepConnection = false;
		else if (useCachedContext && entry && output.responseId) {
			const responseItems = convertResponsesMessages(model, { messages: [output] }, CODEX_TOOL_CALL_PROVIDERS, {
				includeSystemPrompt: false,
				grammarToolInputProperties
			}).filter((item) => item.type !== "function_call_output" && item.type !== "custom_tool_call_output");
			entry.continuation = {
				lastRequestBody: fullBody,
				lastResponseId: output.responseId,
				lastResponseItems: responseItems
			};
		}
	} catch (error) {
		if (entry) entry.continuation = void 0;
		keepConnection = false;
		throw error;
	} finally {
		release({ keep: keepConnection });
	}
}
async function parseErrorResponse(response) {
	const raw = await response.text();
	let message = raw || response.statusText || "Request failed";
	let friendlyMessage;
	try {
		const err = JSON.parse(raw)?.error;
		if (err) {
			const code = err.code || err.type || "";
			if (/usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(code) || response.status === 429) {
				const plan = err.plan_type ? ` (${err.plan_type.toLowerCase()} plan)` : "";
				const mins = err.resets_at ? Math.max(0, Math.round((err.resets_at * 1e3 - Date.now()) / 6e4)) : void 0;
				friendlyMessage = `You have hit your ChatGPT usage limit${plan}.${mins !== void 0 ? ` Try again in ~${mins} min.` : ""}`.trim();
			}
			message = err.message || friendlyMessage || message;
		}
	} catch {}
	return {
		message,
		friendlyMessage
	};
}
function extractAccountId(token) {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) throw new Error("Invalid token");
		const accountId = JSON.parse(atob(parts[1]))?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
		if (!accountId) throw new Error("No account ID in token");
		return accountId;
	} catch {
		throw new Error("Failed to extract accountId from token");
	}
}
function buildBaseCodexHeaders(initHeaders, additionalHeaders, accountId, token) {
	const headers = new Headers(initHeaders);
	for (const [key, value] of Object.entries(additionalHeaders || {})) if (value === null) headers.delete(key);
	else headers.set(key, value);
	headers.set("Authorization", `Bearer ${token}`);
	headers.set("chatgpt-account-id", accountId);
	headers.set("originator", "pi");
	headers.set("User-Agent", getPiUserAgent());
	return headers;
}
function buildSSEHeaders(initHeaders, additionalHeaders, accountId, token, sessionId) {
	const headers = buildBaseCodexHeaders(initHeaders, additionalHeaders, accountId, token);
	headers.set("OpenAI-Beta", "responses=experimental");
	headers.set("accept", "text/event-stream");
	headers.set("content-type", "application/json");
	if (sessionId) {
		headers.set("session-id", sessionId);
		headers.set("x-client-request-id", sessionId);
	}
	return headers;
}
function buildWebSocketHeaders(initHeaders, additionalHeaders, accountId, token, requestId) {
	const headers = buildBaseCodexHeaders(initHeaders, additionalHeaders, accountId, token);
	headers.delete("accept");
	headers.delete("content-type");
	headers.delete("OpenAI-Beta");
	headers.delete("openai-beta");
	headers.set("OpenAI-Beta", OPENAI_BETA_RESPONSES_WEBSOCKETS);
	headers.set("x-client-request-id", requestId);
	headers.set("session-id", requestId);
	return headers;
}
//#endregion
export { closeOpenAICodexWebSocketSessions, getOpenAICodexWebSocketDebugStats, resetOpenAICodexWebSocketDebugStats, stream, streamSimple };
