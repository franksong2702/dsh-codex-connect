import { createHash, randomBytes, randomUUID } from "node:crypto";
import { basename, dirname, join, parse, resolve } from "node:path";
import z from "@deepseek-ai/schemastery";
import { deepEqualJson } from "@deepseek-ai/dsh-util-values";
import { createModels, defaultProviderAuthContext } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { createUserMessage, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { link, lstat, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { AsyncLocalStorage } from "node:async_hooks";
import { Dispatcher, ProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { fileURLToPath } from "node:url";
import { SessionId } from "@deepseek-ai/dsh-session";
import { AttachmentId } from "@deepseek-ai/dsh-attachment";
import { TOOL_ABORTED, defineTool } from "@deepseek-ai/dsh-tools";
import { lookup } from "node:dns/promises";
import { request } from "node:http";
import { request as request$1 } from "node:https";
import { BlockList, isIP } from "node:net";
import { Service } from "@deepseek-ai/cordis";
import { constants } from "node:fs";
import { WebError } from "@deepseek-ai/dsh-web";
import { constants as constants$1, zstdCompressSync, zstdDecompressSync } from "node:zlib";
//#region src/store.ts
/**
* Owner-only persistent OAuth credential storage for the OpenAI Codex bundle.
* @module dsh-codex-connect/store
*/
/** Provider route and pi-ai provider id owned by this bundle. */
const OPENAI_CODEX_PROVIDER = "openai-codex";
/** Basename of the OAuth document inside the Harness home. */
const OPENAI_CODEX_AUTH_FILENAME = ".openai-codex-auth.json";
/** Current on-disk format; pre-release readers reject every other version. */
const AUTH_FORMAT_VERSION = 1;
/** Whether a filesystem error reports an absent path. */
function isENOENT$1(error) {
	return error?.code === "ENOENT";
}
/** Reject a credential document readable by another POSIX user. */
async function assertOwnerOnly$1(filename) {
	let mode;
	try {
		mode = (await stat(filename)).mode;
	} catch (error) {
		if (isENOENT$1(error)) return;
		throw error;
	}
	/* v8 ignore next -- native Windows coverage takes the mode-less branch */
	if (process.platform === "win32") return;
	/* v8 ignore start -- POSIX tests cover this branch; Windows cannot express it */
	if ((mode & 63) !== 0) throw new Error(`openai-codex: ${filename} is readable beyond its owner (mode ${(mode & 511).toString(8)}); run "chmod 600 ${filename}" before starting again`);
	/* v8 ignore stop */
}
/** Validate the strict JSON document without quoting token-bearing input. */
function parseDocument$2(text, filename) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`openai-codex: ${filename} is not valid JSON`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`openai-codex: ${filename} must contain an object`);
	const document = value;
	if (document["version"] !== AUTH_FORMAT_VERSION) throw new Error(`openai-codex: ${filename} has unsupported auth format version ${String(document["version"])}`);
	if (Object.keys(document).some((key) => key !== "version" && key !== "credential")) throw new Error(`openai-codex: ${filename} contains an unknown top-level field`);
	const raw = document["credential"];
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`openai-codex: ${filename} credential must be an object`);
	const credential = raw;
	if (Object.keys(credential).some((key) => ![
		"type",
		"access",
		"refresh",
		"expires",
		"accountId"
	].includes(key))) throw new Error(`openai-codex: ${filename} credential contains an unknown field`);
	if (credential["type"] !== "oauth") throw new Error(`openai-codex: ${filename} credential type must be oauth`);
	for (const key of [
		"access",
		"refresh",
		"accountId"
	]) if (typeof credential[key] !== "string" || credential[key].length === 0) throw new Error(`openai-codex: ${filename} credential ${key} must be a non-empty string`);
	if (typeof credential["expires"] !== "number" || !Number.isFinite(credential["expires"]) || credential["expires"] <= 0) throw new Error(`openai-codex: ${filename} credential expires must be a positive finite number`);
	return {
		version: AUTH_FORMAT_VERSION,
		credential
	};
}
/** Detach a credential from callers that may mutate provider-owned extras. */
function cloneCredential(credential) {
	return structuredClone(credential);
}
/**
* Resolve the default OAuth document path.
* @param dshHome - optional Harness-home override.
* @returns the absolute owner-only document path.
*/
function openAICodexAuthPath(dshHome) {
	return resolve(join(resolveDshHome(dshHome), OPENAI_CODEX_AUTH_FILENAME));
}
/** File-backed pi-ai store scoped to the single OpenAI Codex provider. */
var OpenAICodexCredentialStore = class {
	/** Absolute credential document path. */
	filename;
	/**
	* @param filename - explicit document path, defaulting under `$DSH_HOME`.
	*/
	constructor(filename = openAICodexAuthPath()) {
		this.filename = resolve(filename);
	}
	/** Read and validate the current document without acquiring the writer lock. */
	async readCurrent() {
		await assertOwnerOnly$1(this.filename);
		let text;
		try {
			text = await readFile(this.filename, "utf8");
		} catch (error) {
			if (isENOENT$1(error)) return void 0;
			throw error;
		}
		return cloneCredential(parseDocument$2(text, this.filename).credential);
	}
	/** @inheritdoc */
	async read(providerId) {
		return providerId === "openai-codex" ? this.readCurrent() : void 0;
	}
	/** @inheritdoc */
	async list() {
		return await this.readCurrent() === void 0 ? [] : [{
			providerId: OPENAI_CODEX_PROVIDER,
			type: "oauth"
		}];
	}
	/** @inheritdoc */
	async modify(providerId, fn) {
		if (providerId !== "openai-codex") throw new Error(`openai-codex: credential store does not own provider "${providerId}"`);
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		return withFileLock(this.filename, async () => {
			const current = await this.readCurrent();
			const candidate = await fn(current);
			if (candidate === void 0) return current;
			const document = parseDocument$2(JSON.stringify({
				version: AUTH_FORMAT_VERSION,
				credential: candidate
			}), this.filename);
			await writeFileAtomic(this.filename, `${JSON.stringify(document, null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
			return cloneCredential(document.credential);
		});
	}
	/** @inheritdoc */
	async delete(providerId) {
		if (providerId !== "openai-codex") return;
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		await withFileLock(this.filename, () => rm(this.filename, { force: true }));
	}
};
//#endregion
//#region src/model-contract.ts
/** Node-free model catalog contract shared by the Host route and browser card. */
/** Same-origin endpoint exposing the complete Codex model catalog. */
const OPENAI_CODEX_MODEL_CATALOG_PATH = "/plugins/dsh-codex-connect/models";
const CONFIGURATION_LIMITS = Object.freeze({
	"gpt-5.6-sol": 872e3,
	"gpt-5.6-terra": 872e3,
	"gpt-5.6-luna": 872e3,
	"gpt-5.4": 1e6,
	"gpt-5.5": 272e3,
	"gpt-5.4-mini": 272e3
});
/** Keep unlisted or newer provider defaults usable without inventing a larger limit. */
function openAICodexContextLimit(id, contextWindow) {
	const ceiling = Object.hasOwn(CONFIGURATION_LIMITS, id) ? CONFIGURATION_LIMITS[id] : void 0;
	return ceiling === void 0 || ceiling < contextWindow ? {
		maxContextWindow: contextWindow,
		contextLimitSource: "catalog-default"
	} : {
		maxContextWindow: ceiling,
		contextLimitSource: "codex-catalog"
	};
}
/** Whether a proposed local token budget fits the model's configuration range. */
function isValidOpenAICodexContextBudget(value, maximum) {
	return Number.isSafeInteger(value) && value > 0 && value <= maximum;
}
//#endregion
//#region src/adapter.ts
/** OpenAI Codex adapter assembled from public dsh-llm-pi-ai extension points. */
/** Return a detached copy of the complete pi-ai Codex model catalog. */
function openAICodexModelCatalog() {
	return openaiCodexProvider().getModels().map((model) => ({
		id: model.id,
		name: model.name,
		contextWindow: model.contextWindow,
		...openAICodexContextLimit(model.id, model.contextWindow)
	}));
}
/** Provider idle ceiling used by the composite route. */
const OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS = 3e5;
/** rc.2 default maximum base64 image payload retained in one request. */
const OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES = 20971520;
/** rc.2 default total-pixel budget for one deterministic inline image version. */
const OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET = 4194304;
/** rc.2 default raw encoded-byte cap for one deterministic inline image version. */
const OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES = 1048576;
/**
* Give the generic dsh adapter a request-scoped bearer-token entry without
* changing the provider's user-facing OAuth flow. The resolver accepts only
* the explicit override supplied by this plugin; it never discovers an API
* key from the environment or persistent api-key credentials.
*/
function isPayloadRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Add the request-scoped Fast Mode hint without changing auth or other options. */
function withOpenAICodexFastMode(provider, fastMode) {
	const streamSimple = provider.streamSimple;
	return {
		...provider,
		streamSimple(model, context, options) {
			const sessionId = options?.sessionId;
			if (!(provider.id === "openai-codex" && model.provider === "openai-codex" && fastMode !== void 0 && fastMode.isEnabled(sessionId))) return streamSimple.call(provider, model, context, options);
			const previousOnPayload = options?.onPayload;
			const nextOptions = {
				...options,
				async onPayload(payload, payloadModel) {
					const replaced = await previousOnPayload?.(payload, payloadModel);
					const nextPayload = replaced === void 0 ? payload : replaced;
					return isPayloadRecord(nextPayload) ? {
						...nextPayload,
						service_tier: "priority"
					} : nextPayload;
				}
			};
			return streamSimple.call(provider, model, context, nextOptions);
		}
	};
}
function requestProvider(provider, fastMode, proxyManager, resolveProxyUrl) {
	const configured = withOpenAICodexFastMode(provider, fastMode);
	const streamSimple = configured.streamSimple;
	return {
		...configured,
		streamSimple(model, context, options) {
			const proxyUrl = resolveProxyUrl?.();
			const operation = () => streamSimple.call(configured, model, context, options);
			return proxyManager?.runStream(proxyUrl, operation) ?? operation();
		},
		auth: {
			...provider.auth,
			apiKey: {
				name: "OpenAI Codex OAuth bearer token",
				async resolve({ credential }) {
					const apiKey = credential?.key;
					return apiKey === void 0 || apiKey.length === 0 ? void 0 : {
						auth: { apiKey },
						source: "OAuth"
					};
				}
			}
		}
	};
}
/** Build the immutable profile consumed by the DSH pi-ai adapter. */
function createOpenAICodexProfile(provider, fastMode, proxyManager, resolveProxyUrl, contextWindowOverrides) {
	const effectiveProvider = contextWindowOverrides === void 0 ? provider : withOpenAICodexContextWindowOverrides(provider, contextWindowOverrides);
	return {
		provider: OPENAI_CODEX_PROVIDER,
		displayName: "OpenAI Codex",
		transport: "sse",
		streamIdleTimeoutMs: OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS,
		maxRequestImageBytes: OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES,
		requestImagePixelBudget: OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET,
		requestImageMaxBytes: OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES,
		retryPolicy: resolveRetryPolicy(void 0, "dsh-codex-connect retryPolicy"),
		configuredMaxTokens: /* @__PURE__ */ new Map(),
		piProvider: requestProvider(effectiveProvider, fastMode, proxyManager, resolveProxyUrl)
	};
}
/**
* Detach one provider and replace the advertised context window for the
* configured model ids. Request streaming itself is unaffected: pi-ai streams
* the caller-supplied model, so only the metadata Harness reads for context
* budgeting and compaction changes.
*/
function withOpenAICodexContextWindowOverrides(provider, overrides) {
	const baselineModels = provider.getModels();
	assertOpenAICodexContextWindowOverrides(overrides, baselineModels);
	const replaced = baselineModels.map((model) => {
		const contextWindow = overrides[model.id];
		return contextWindow === void 0 ? model : {
			...model,
			contextWindow
		};
	});
	return {
		...provider,
		getModels: () => replaced
	};
}
/** Reject unknown ids and out-of-range budgets before accepting settings or requests. */
function assertOpenAICodexContextWindowOverrides(overrides, catalog) {
	const models = new Map(catalog.map((model) => [model.id, model]));
	for (const [id, budget] of Object.entries(overrides ?? {})) {
		const model = models.get(id);
		if (model === void 0) throw new TypeError(`OpenAI Codex contextWindowOverrides contains unknown model id "${id}"`);
		const { maxContextWindow } = openAICodexContextLimit(id, model.contextWindow);
		if (budget !== null && !isValidOpenAICodexContextBudget(budget, maxContextWindow)) throw new TypeError(`OpenAI Codex contextWindowOverrides for "${id}" must be an integer from 1 to ${maxContextWindow} tokens; use null to restore the catalog default`);
	}
}
/**
* Create the Codex subscription adapter without requiring a dsh fork. The
* public pi-ai adapter owns Harness message conversion, image attachment
* resolution, streaming, reasoning metadata, and compaction behavior; this
* plugin supplies its provider-native OAuth token for each request.
*/
function createOpenAICodexAdapter(credentials, resolveAttachments, fastMode, visibleModelIds, proxyManager, resolveProxyUrl, contextWindowOverrides) {
	const provider = openaiCodexProvider();
	let profiles;
	let previousOverrides;
	const currentProfiles = () => {
		const overrides = contextWindowOverrides?.();
		if (profiles === void 0 || !deepEqualJson(previousOverrides, overrides)) {
			const profile = createOpenAICodexProfile(provider, fastMode, proxyManager, resolveProxyUrl, overrides);
			previousOverrides = overrides === void 0 ? void 0 : { ...overrides };
			profiles = /* @__PURE__ */ new Map([[OPENAI_CODEX_PROVIDER, profile]]);
		}
		return profiles;
	};
	const models = createModels({ credentials });
	models.setProvider(provider);
	class OpenAICodexAdapter extends PiAiAdapter {
		async listModels(providerId) {
			const catalog = await super.listModels(providerId);
			const configured = visibleModelIds?.();
			if (configured === void 0) return catalog;
			const visible = new Set(configured);
			return catalog.filter((model) => visible.has(model.id));
		}
	}
	return new OpenAICodexAdapter({
		profiles: currentProfiles,
		resolveApiKey: async () => {
			const operation = async () => (await models.getAuth(OPENAI_CODEX_PROVIDER))?.auth.apiKey;
			return proxyManager?.run(resolveProxyUrl?.(), operation) ?? operation();
		},
		auth: {
			credentials,
			authContext: defaultProviderAuthContext()
		},
		resolveAttachments
	});
}
//#endregion
//#region src/auth.ts
/**
* OpenAI Codex OAuth orchestration shared by the plugin and standalone launcher.
* @module dsh-codex-connect/auth
*/
/**
* Complete provider-native OAuth and persist the resulting credential.
* @param interaction - terminal or UI callbacks for the provider flow.
* @param store - credential store, defaulting under `$DSH_HOME`.
*/
async function loginOpenAICodex(interaction, store = new OpenAICodexCredentialStore()) {
	const models = createModels({ credentials: store });
	models.setProvider(openaiCodexProvider());
	await models.login(OPENAI_CODEX_PROVIDER, "oauth", interaction);
}
/**
* Remove the stored OpenAI Codex credential.
* @param store - credential store, defaulting under `$DSH_HOME`.
*/
async function logoutOpenAICodex(store = new OpenAICodexCredentialStore()) {
	await store.delete(OPENAI_CODEX_PROVIDER);
}
/**
* Read non-secret OpenAI Codex login state without refreshing the token.
* @param store - credential store, defaulting under `$DSH_HOME`.
* @returns stored login state and expiry.
*/
async function openAICodexAuthStatus(store = new OpenAICodexCredentialStore()) {
	const credential = await store.read(OPENAI_CODEX_PROVIDER);
	return credential?.type === "oauth" ? {
		authenticated: true,
		expiresAt: new Date(credential.expires)
	} : { authenticated: false };
}
//#endregion
//#region src/usage.ts
/** Live ChatGPT Codex rate-limit usage for the browser account page. */
/** Fixed endpoint used by the official Codex client for ChatGPT rate limits. */
const OPENAI_CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const USAGE_REQUEST_TIMEOUT_MS = 15e3;
/** Stable public discriminant for an expired or revoked Codex OAuth session. */
const OPENAI_CODEX_REAUTH_REQUIRED_CODE = "OPENAI_CODEX_REAUTH_REQUIRED";
/** Fixed, secret-free message for a browser-facing reauthorization prompt. */
const OPENAI_CODEX_REAUTH_REQUIRED_MESSAGE = "OpenAI Codex authorization must be renewed";
/**
* Raised when the usage endpoint rejects the current OAuth session.
*
* The error intentionally carries no response, credential, or account data so
* callers can safely pass its fixed message across the Web boundary.
*/
var OpenAICodexReauthRequiredError = class extends Error {
	code = OPENAI_CODEX_REAUTH_REQUIRED_CODE;
	constructor() {
		super(OPENAI_CODEX_REAUTH_REQUIRED_MESSAGE);
		this.name = "OpenAICodexReauthRequiredError";
	}
};
/** Identify the dedicated reauthorization failure without comparing messages. */
function isOpenAICodexReauthRequiredError(error) {
	return error instanceof OpenAICodexReauthRequiredError;
}
function isRecord$2(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** JavaScript Date's maximum representable instant, expressed in Unix seconds. */
const MAX_DATE_UNIX_SECONDS = Math.floor(864e10);
function parseResetAt(record) {
	if (!Object.hasOwn(record, "reset_at")) return void 0;
	const value = record["reset_at"];
	if (value === null) return void 0;
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > MAX_DATE_UNIX_SECONDS) throw new Error("OpenAI Codex returned an invalid rate-limit reset time");
	if (!Number.isFinite((/* @__PURE__ */ new Date(value * 1e3)).getTime())) throw new Error("OpenAI Codex returned an invalid rate-limit reset time");
	return value;
}
function parseWindow(value) {
	if (value === void 0 || value === null) return void 0;
	if (!isRecord$2(value)) throw new Error("OpenAI Codex returned a malformed rate-limit window");
	const usedPercent = value["used_percent"];
	const windowSeconds = value["limit_window_seconds"];
	if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100) throw new Error("OpenAI Codex returned an invalid used percentage");
	if (typeof windowSeconds !== "number" || !Number.isInteger(windowSeconds) || windowSeconds <= 0) throw new Error("OpenAI Codex returned an invalid rate-limit window duration");
	const resetAt = parseResetAt(value);
	return {
		remainingPercent: 100 - usedPercent,
		windowSeconds,
		...resetAt === void 0 ? {} : { resetAt }
	};
}
function parseLimit(id, name, value) {
	if (value === void 0 || value === null) return void 0;
	if (!isRecord$2(value)) throw new Error("OpenAI Codex returned malformed rate-limit details");
	const windows = [parseWindow(value["primary_window"]), parseWindow(value["secondary_window"])].filter((window) => window !== void 0);
	return windows.length === 0 ? void 0 : {
		id,
		...name === void 0 ? {} : { name },
		windows
	};
}
function exactAmount(record, key) {
	const value = record[key];
	if (typeof value !== "string" || value.length === 0 || value.length > 64 || !/^-?\d+(?:\.\d+)?$/u.test(value)) throw new Error(`OpenAI Codex returned an invalid ${key} amount`);
	return value;
}
function parseCredits(value) {
	if (value === void 0 || value === null) return void 0;
	if (!isRecord$2(value) || typeof value["has_credits"] !== "boolean" || typeof value["unlimited"] !== "boolean") throw new Error("OpenAI Codex returned malformed credit details");
	if (!value["has_credits"]) return void 0;
	const balance = value["balance"];
	if (balance !== void 0 && balance !== null && (typeof balance !== "string" || balance.length === 0 || balance.length > 64 || !/^-?\d+(?:\.\d+)?$/u.test(balance))) throw new Error("OpenAI Codex returned an invalid credit balance");
	return {
		unlimited: value["unlimited"],
		...typeof balance === "string" ? { balance } : {}
	};
}
function parseIndividualLimit(value) {
	if (value === void 0 || value === null) return void 0;
	if (!isRecord$2(value)) throw new Error("OpenAI Codex returned malformed spend-control details");
	const individual = value["individual_limit"];
	if (individual === void 0 || individual === null) return void 0;
	if (!isRecord$2(individual)) throw new Error("OpenAI Codex returned a malformed individual limit");
	const remainingPercent = individual["remaining_percent"];
	if (typeof remainingPercent !== "number" || !Number.isFinite(remainingPercent) || remainingPercent < 0 || remainingPercent > 100) throw new Error("OpenAI Codex returned an invalid individual-limit percentage");
	return {
		limit: exactAmount(individual, "limit"),
		used: exactAmount(individual, "used"),
		remaining: exactAmount(individual, "remaining"),
		remainingPercent
	};
}
/**
* Convert the provider response into the small secret-free object sent to the browser.
* @param value - opaque JSON returned by the ChatGPT usage endpoint.
* @returns core and additionally metered quota buckets with remaining percentages.
*/
function parseOpenAICodexUsage(value) {
	if (!isRecord$2(value)) throw new Error("OpenAI Codex returned a malformed usage response");
	const limits = [];
	const primary = parseLimit("codex", "Codex", value["rate_limit"]);
	if (primary !== void 0) limits.push(primary);
	const additional = value["additional_rate_limits"];
	if (additional !== void 0 && additional !== null && !Array.isArray(additional)) throw new Error("OpenAI Codex returned malformed additional rate limits");
	for (const item of additional ?? []) {
		if (!isRecord$2(item)) throw new Error("OpenAI Codex returned a malformed additional rate limit");
		const id = item["metered_feature"];
		const name = item["limit_name"];
		if (typeof id !== "string" || id.length === 0) throw new Error("OpenAI Codex returned an additional rate limit without an id");
		if (name !== void 0 && name !== null && typeof name !== "string") throw new Error("OpenAI Codex returned an invalid additional rate-limit name");
		const limit = parseLimit(id, typeof name === "string" && name.length > 0 ? name : void 0, item["rate_limit"]);
		if (limit !== void 0) limits.push(limit);
	}
	const credits = parseCredits(value["credits"]);
	const individualLimit = parseIndividualLimit(value["spend_control"]);
	return {
		rateLimits: limits,
		...credits === void 0 ? {} : { credits },
		...individualLimit === void 0 ? {} : { individualLimit }
	};
}
/**
* Read current quota without issuing a model request. OAuth is refreshed through
* the same provider-native credential lifecycle used by normal Codex turns.
* @param store - plugin-owned OAuth credential store.
* @returns current rate-limit buckets safe to expose to the local browser page.
*/
async function readOpenAICodexRateLimits(store) {
	const models = createModels({ credentials: store });
	models.setProvider(openaiCodexProvider());
	const auth = await models.getAuth(OPENAI_CODEX_PROVIDER);
	const credential = await store.read(OPENAI_CODEX_PROVIDER);
	const access = auth?.auth.apiKey;
	const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
	if (access === void 0 || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) throw new Error("OpenAI Codex is signed out");
	const response = await fetch(OPENAI_CODEX_USAGE_URL, {
		method: "GET",
		redirect: "error",
		headers: {
			authorization: `Bearer ${access}`,
			"chatgpt-account-id": accountId,
			accept: "application/json",
			"cache-control": "no-store",
			"user-agent": "dsh-codex-connect"
		},
		signal: AbortSignal.timeout(USAGE_REQUEST_TIMEOUT_MS)
	});
	if (!response.ok) {
		if (response.status === 401 || response.status === 403) throw new OpenAICodexReauthRequiredError();
		throw new Error(`OpenAI Codex usage request failed with HTTP ${response.status}`);
	}
	let value;
	try {
		value = await response.json();
	} catch (error) {
		throw new Error("OpenAI Codex returned an unreadable usage response", { cause: error });
	}
	return parseOpenAICodexUsage(value);
}
//#endregion
//#region src/auth-paths.ts
/** Node-free route constants shared by the Host and browser plugin halves. */
/** Plugin-owned status endpoint consumed by its browser half. */
const OPENAI_CODEX_AUTH_STATUS_PATH = "/plugins/dsh-openai-codex/auth/status";
/** Plugin-owned browser-login endpoint consumed by its browser half. */
const OPENAI_CODEX_AUTH_LOGIN_PATH = "/plugins/dsh-openai-codex/auth/login";
/** Plugin-owned logout endpoint consumed by its browser half. */
const OPENAI_CODEX_AUTH_LOGOUT_PATH = "/plugins/dsh-openai-codex/auth/logout";
/** Cancel only the pending authorization; never delete a stored credential. */
const OPENAI_CODEX_AUTH_CANCEL_PATH = "/plugins/dsh-openai-codex/auth/cancel";
//#endregion
//#region src/trusted-origins.ts
/** Owner-only allowlist for browser origins that may reach the Web OAuth routes. */
/** Basename of the DSH-home-scoped browser-origin allowlist. */
const OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME = ".openai-codex-trusted-origins.json";
/** Only supported policy mode; a future mode must not be silently accepted. */
const TRUSTED_ORIGINS_MODE = "allowlist";
/** Whether a filesystem error reports an absent path. */
function isENOENT(error) {
	return error?.code === "ENOENT";
}
/** Reject a sidecar readable by another POSIX user. */
async function assertOwnerOnly(filename) {
	let metadata;
	try {
		metadata = await lstat(filename);
	} catch (error) {
		if (isENOENT(error)) return;
		throw error;
	}
	if (!metadata.isFile()) throw new Error(`openai-codex: ${filename} is not a regular file`);
	/* v8 ignore next -- native Windows coverage takes the mode-less branch */
	if (process.platform === "win32") return;
	/* v8 ignore start -- POSIX tests cover this branch; Windows cannot express it */
	if ((metadata.mode & 63) !== 0) throw new Error(`openai-codex: ${filename} is readable beyond its owner (mode ${(metadata.mode & 511).toString(8)}); run "chmod 600 ${filename}" before starting again`);
	/* v8 ignore stop */
}
/** Reject malformed input without echoing its contents into an error. */
function parseDocument$1(text, filename) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`openai-codex: ${filename} is not valid JSON`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`openai-codex: ${filename} must contain an object`);
	const document = value;
	if (Object.keys(document).some((key) => ![
		"version",
		"mode",
		"origins"
	].includes(key))) throw new Error(`openai-codex: ${filename} contains an unknown top-level field`);
	if (document["version"] !== 1) throw new Error(`openai-codex: ${filename} has unsupported trusted-origins format version ${String(document["version"])}`);
	if (document["mode"] !== "allowlist") throw new Error(`openai-codex: ${filename} has unsupported trusted-origins mode`);
	const rawOrigins = document["origins"];
	if (!Array.isArray(rawOrigins)) throw new Error(`openai-codex: ${filename} origins must be an array`);
	const origins = /* @__PURE__ */ new Set();
	for (const rawOrigin of rawOrigins) {
		if (typeof rawOrigin !== "string") throw new Error(`openai-codex: ${filename} origins must contain strings`);
		try {
			origins.add(normalizeTrustedOrigin(rawOrigin));
		} catch {
			throw new Error(`openai-codex: ${filename} contains an invalid trusted origin`);
		}
	}
	return {
		version: 1,
		mode: TRUSTED_ORIGINS_MODE,
		origins: [...origins].sort()
	};
}
/**
* Normalize one exact browser origin.
*
* Only HTTP(S) origins are accepted. Credentials, non-root paths, queries,
* fragments, wildcards, and CIDR-looking host paths are rejected. WHATWG URL
* normalization lowercases the scheme/host and removes default ports.
*/
function normalizeTrustedOrigin(rawOrigin) {
	if (typeof rawOrigin !== "string" || rawOrigin.length === 0 || rawOrigin.trim() !== rawOrigin) throw new Error("trusted origin must be a non-empty URL without surrounding whitespace");
	let origin;
	try {
		origin = new URL(rawOrigin);
	} catch {
		throw new Error("trusted origin must be a valid URL");
	}
	if (origin.protocol !== "http:" && origin.protocol !== "https:") throw new Error("trusted origin protocol must be http or https");
	if (origin.username !== "" || origin.password !== "") throw new Error("trusted origin must not contain credentials");
	if (origin.pathname !== "/" || origin.search !== "" || origin.hash !== "") throw new Error("trusted origin must not contain a path, query, or fragment");
	if (origin.hostname === "" || origin.hostname.includes("*")) throw new Error("trusted origin host must be exact");
	if (origin.pathname !== "/" || /(?:^|\/)\d+\/\d+$/u.test(rawOrigin)) throw new Error("trusted origin must not be a CIDR or path");
	if (origin.origin === "null") throw new Error("trusted origin must have an HTTP(S) host");
	return origin.origin;
}
/** Resolve the sidecar path under one DSH home. */
function openAICodexTrustedOriginsPath(dshHome) {
	return resolve(join(resolveDshHome(dshHome), OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME));
}
/** File-backed exact-origin allowlist. */
var OpenAICodexTrustedOriginsStore = class {
	/** Absolute sidecar path. */
	filename;
	constructor(filename = openAICodexTrustedOriginsPath()) {
		this.filename = resolve(filename);
	}
	async readCurrent() {
		await assertOwnerOnly(this.filename);
		let text;
		try {
			text = await readFile(this.filename, "utf8");
		} catch (error) {
			if (isENOENT(error)) return {
				version: 1,
				mode: TRUSTED_ORIGINS_MODE,
				origins: []
			};
			throw error;
		}
		return parseDocument$1(text, this.filename);
	}
	/** Read the current canonical list without acquiring the writer lock. */
	async list() {
		return [...(await this.readCurrent()).origins];
	}
	/** Whether an exact normalized origin is currently trusted. */
	async has(origin) {
		const normalized = normalizeTrustedOrigin(origin);
		return (await this.readCurrent()).origins.includes(normalized);
	}
	/** Add one origin idempotently and return the resulting sorted list. */
	async trust(origin) {
		const normalized = normalizeTrustedOrigin(origin);
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		return withFileLock(this.filename, async () => {
			const current = await this.readCurrent();
			if (current.origins.includes(normalized)) return [...current.origins];
			const next = {
				version: 1,
				mode: TRUSTED_ORIGINS_MODE,
				origins: [...current.origins, normalized].sort()
			};
			await writeFileAtomic(this.filename, `${JSON.stringify(next, null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
			return [...next.origins];
		});
	}
	/** Remove one origin idempotently and return the resulting sorted list. */
	async untrust(origin) {
		const normalized = normalizeTrustedOrigin(origin);
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		return withFileLock(this.filename, async () => {
			const current = await this.readCurrent();
			if (!current.origins.includes(normalized)) return [...current.origins];
			const next = {
				version: 1,
				mode: TRUSTED_ORIGINS_MODE,
				origins: current.origins.filter((candidate) => candidate !== normalized)
			};
			await writeFileAtomic(this.filename, `${JSON.stringify(next, null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
			return [...next.origins];
		});
	}
};
//#endregion
//#region src/fast-mode.ts
/** Process-local, per-session OpenAI Codex Fast Mode state. */
/** Maximum number of enabled sessions retained by one plugin instance. */
const OPENAI_CODEX_FAST_MODE_MAX_SESSIONS = 256;
/** Maximum UTF-16 code units accepted for an opaque DSH session id. */
const OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH = 256;
/**
* Validate the opaque session identity used by the Fast Mode registry.
*
* The registry deliberately does not interpret or normalize session ids.  It
* only rejects values that cannot safely serve as a bounded map key.
*/
function isFastModeSessionId(value) {
	return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}
/**
* In-memory Fast Mode registry.  Entries are positive-only: disabling a
* session removes its key, and an insertion over the bound evicts the least
* recently touched key.  A new plugin instance starts with an empty map.
*/
var FastModeRegistry = class {
	maxSessions;
	enabledSessions = /* @__PURE__ */ new Map();
	constructor(maxSessions = 256) {
		this.maxSessions = maxSessions;
		if (!Number.isSafeInteger(maxSessions) || maxSessions < 1 || maxSessions > 256) throw new RangeError("Fast Mode registry capacity is out of bounds");
	}
	/** Number of currently enabled sessions. */
	get size() {
		return this.enabledSessions.size;
	}
	/** Read one session without exposing the map or any credential state. */
	isEnabled(sessionId) {
		if (!isFastModeSessionId(sessionId)) return false;
		if (this.enabledSessions.get(sessionId) === void 0) return false;
		this.enabledSessions.delete(sessionId);
		this.enabledSessions.set(sessionId, true);
		return true;
	}
	/** Alias useful to callers that model this as a boolean setting. */
	get(sessionId) {
		return this.isEnabled(sessionId);
	}
	/** Enable or disable exactly one opaque session id. */
	set(sessionId, enabled) {
		if (!isFastModeSessionId(sessionId)) throw new TypeError("Invalid Fast Mode session id");
		if (typeof enabled !== "boolean") throw new TypeError("Fast Mode enabled must be boolean");
		if (!enabled) {
			this.enabledSessions.delete(sessionId);
			return;
		}
		this.enabledSessions.delete(sessionId);
		while (this.enabledSessions.size >= this.maxSessions) {
			const oldest = this.enabledSessions.keys().next().value;
			if (oldest === void 0) break;
			this.enabledSessions.delete(oldest);
		}
		this.enabledSessions.set(sessionId, true);
	}
	/** Explicitly named alias for callers that avoid boolean-setting verbs. */
	setEnabled(sessionId, enabled) {
		this.set(sessionId, enabled);
	}
	/** Disable one session and forget its key. */
	delete(sessionId) {
		if (!isFastModeSessionId(sessionId)) return;
		this.enabledSessions.delete(sessionId);
	}
	/** Remove all process-local state during an explicit lifecycle teardown. */
	clear() {
		this.enabledSessions.clear();
	}
};
//#endregion
//#region src/fast-mode-paths.ts
/** Node-free Fast Mode route constants shared by Host and browser halves. */
/** GET/POST endpoint for one conversation's process-local Fast Mode state. */
const OPENAI_CODEX_FAST_MODE_PATH = "/plugins/dsh-openai-codex/fast-mode";
/** Default deadline for the complete interactive authorization, including the callback. */
const OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS = 6e5;
/** Stable, non-sensitive error returned when a browser origin needs CLI trust. */
const REMOTE_WEB_ORIGIN_NOT_TRUSTED = "remote-web-origin-not-trusted";
/** Redact provider diagnostics before they cross to the browser. */
function safeMessage(error) {
	return (error instanceof Error ? error.message : String(error)).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[redacted token]").replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, "$1[redacted]").slice(0, 1e3);
}
/** Reject with the prompt's abort reason while browser callback owns completion. */
function waitForPromptAbort(prompt, operationSignal) {
	const signal = prompt.signal === void 0 ? operationSignal : AbortSignal.any([prompt.signal, operationSignal]);
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise((_resolve, reject) => {
		signal.addEventListener("abort", () => {
			reject(signal.reason);
		}, { once: true });
	});
}
/** One lifecycle owner for the callback server, challenge, and public status. */
var OpenAICodexWebAuth = class {
	store;
	state = { status: "signed-out" };
	operation;
	cancellation;
	challenge;
	challengeWaiters = [];
	challengeTimer;
	authorizationTimer;
	transition;
	disposed = false;
	challengeTimeoutMs;
	authorizationTimeoutMs;
	proxyManager;
	resolveProxyUrl;
	constructor(store, options = {}) {
		this.store = store;
		this.challengeTimeoutMs = options.challengeTimeoutMs ?? 3e4;
		this.authorizationTimeoutMs = options.authorizationTimeoutMs ?? 6e5;
		this.proxyManager = options.proxyManager;
		this.resolveProxyUrl = options.resolveProxyUrl ?? (() => void 0);
		if (!Number.isFinite(this.challengeTimeoutMs) || this.challengeTimeoutMs <= 0) throw new TypeError("OpenAI Codex auth URL timeout must be a positive finite number");
		if (!Number.isSafeInteger(this.authorizationTimeoutMs) || this.authorizationTimeoutMs <= 0 || this.authorizationTimeoutMs > 2147483647) throw new TypeError("OpenAI Codex authorization timeout must be a positive timer-safe integer");
	}
	/** Read current public state, consulting durable storage while idle. */
	async status() {
		if (this.operation !== void 0) return this.state;
		if (this.state.status === "error") return this.state;
		return this.readStoredStatus();
	}
	/** Start or join the current browser-login operation. */
	async signIn() {
		while (this.transition !== void 0) await this.transition;
		if (this.disposed) throw new Error("OpenAI Codex plugin disposed");
		if (this.operation === void 0) this.start();
		if (this.challenge !== void 0) return this.challenge;
		return new Promise((resolve, reject) => {
			this.challengeWaiters.push({
				resolve,
				reject
			});
		});
	}
	/** Cancel any callback listener, wait for quiescence, then delete the credential. */
	async signOut() {
		await this.finishLogin("logout");
	}
	/** Cancel the pending authorization and retain any already stored account. */
	async cancel() {
		await this.finishLogin("cancel");
	}
	/** Stop the owned callback listener during plugin disposal. */
	async dispose() {
		this.disposed = true;
		await this.finishLogin("dispose");
	}
	async finishLogin(action) {
		while (this.transition !== void 0) await this.transition;
		const operation = this.operation;
		this.cancelSignIn(/* @__PURE__ */ new Error(action === "dispose" ? "OpenAI Codex plugin disposed" : "OpenAI Codex sign-in cancelled"));
		const transition = (async () => {
			await operation?.catch(() => void 0);
			this.challenge = void 0;
			if (action === "logout") {
				await logoutOpenAICodex(this.store);
				this.state = { status: "signed-out" };
			} else if (action === "cancel") this.state = await this.readStoredStatus();
		})();
		this.transition = transition;
		try {
			await transition;
		} finally {
			if (this.transition === transition) this.transition = void 0;
		}
	}
	start() {
		const cancellation = new AbortController();
		this.cancellation = cancellation;
		this.challenge = void 0;
		this.state = { status: "signing-in" };
		this.challengeTimer = setTimeout(() => {
			this.cancelSignIn(/* @__PURE__ */ new Error(`OpenAI Codex did not provide an authorization URL within ${String(this.challengeTimeoutMs)}ms`));
		}, this.challengeTimeoutMs);
		this.challengeTimer.unref();
		this.authorizationTimer = setTimeout(() => {
			this.cancelSignIn(/* @__PURE__ */ new Error("ChatGPT authorization expired. Please sign in again."));
		}, this.authorizationTimeoutMs);
		this.authorizationTimer.unref();
		const login = () => loginOpenAICodex({
			signal: cancellation.signal,
			prompt: (prompt) => prompt.type === "select" ? Promise.resolve("browser") : waitForPromptAbort(prompt, cancellation.signal),
			notify: (event) => {
				this.onEvent(event);
			}
		}, this.store);
		this.operation = (this.proxyManager?.run(this.resolveProxyUrl(), login) ?? login()).then(async () => {
			if (this.challenge === void 0) {
				const error = /* @__PURE__ */ new Error("OpenAI Codex sign-in finished without an authorization URL");
				this.rejectChallenge(error);
				this.state = {
					status: "error",
					message: safeMessage(error)
				};
				return;
			}
			this.state = await this.readStoredStatus();
		}, (error) => {
			this.rejectChallenge(error);
			this.state = {
				status: "error",
				message: safeMessage(error)
			};
		}).finally(() => {
			this.clearChallengeTimer();
			clearTimeout(this.authorizationTimer);
			this.authorizationTimer = void 0;
			this.challenge = void 0;
			this.operation = void 0;
			this.cancellation = void 0;
		});
	}
	onEvent(event) {
		if (event.type !== "auth_url") return;
		let url;
		try {
			url = new URL(event.url);
		} catch {
			const error = /* @__PURE__ */ new Error("OpenAI returned an invalid authorization URL");
			this.cancelSignIn(error);
			return;
		}
		if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
			const error = /* @__PURE__ */ new Error("OpenAI returned an unsafe authorization URL");
			this.cancelSignIn(error);
			return;
		}
		const challenge = { url: event.url };
		this.challenge = challenge;
		this.clearChallengeTimer();
		for (const waiter of this.challengeWaiters.splice(0)) waiter.resolve(challenge);
	}
	async readStoredStatus() {
		if (!(await openAICodexAuthStatus(this.store)).authenticated) return { status: "signed-out" };
		try {
			const readUsage = () => readOpenAICodexRateLimits(this.store);
			return {
				status: "signed-in",
				usage: await (this.proxyManager?.run(this.resolveProxyUrl(), readUsage) ?? readUsage())
			};
		} catch (error) {
			if (isOpenAICodexReauthRequiredError(error)) return {
				status: "reauth-required",
				message: OPENAI_CODEX_REAUTH_REQUIRED_MESSAGE
			};
			return {
				status: "signed-in",
				usage: { rateLimits: [] },
				quotaError: safeMessage(error)
			};
		}
	}
	rejectChallenge(error) {
		this.clearChallengeTimer();
		for (const waiter of this.challengeWaiters.splice(0)) waiter.reject(error);
	}
	clearChallengeTimer() {
		if (this.challengeTimer === void 0) return;
		clearTimeout(this.challengeTimer);
		this.challengeTimer = void 0;
	}
	cancelSignIn(error) {
		this.rejectChallenge(error);
		this.cancellation?.abort(error);
	}
};
function loopbackHost(rawHost) {
	if (/[\\/@?#]/u.test(rawHost)) return false;
	try {
		const parsed = new URL(`http://${rawHost}`);
		if (parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") return false;
		const hostname = (parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]") ? parsed.hostname.slice(1, -1) : parsed.hostname).toLowerCase().replace(/\.$/u, "");
		return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "::1" || hostname === "::ffff:127.0.0.1";
	} catch {
		return false;
	}
}
function exactOrigin(req, rawHost, rawOrigin) {
	try {
		const effective = normalizeTrustedOrigin(`${req.socket.encrypted === true ? "https" : "http"}://${rawHost}`);
		return normalizeTrustedOrigin(rawOrigin) === effective;
	} catch {
		return false;
	}
}
function effectiveOrigin(req, rawHost) {
	try {
		return normalizeTrustedOrigin(`${req.socket.encrypted === true ? "https" : "http"}://${rawHost}`);
	} catch {
		return;
	}
}
function sameOriginMetadata(req, host) {
	const origin = req.headers.origin;
	if (origin === void 0) return true;
	return typeof origin === "string" && exactOrigin(req, host, origin);
}
/** Evaluate one request against loopback defaults and the current sidecar. */
async function trustedRequestDecision(req, trustedOrigins = new OpenAICodexTrustedOriginsStore()) {
	const remote = req.socket.remoteAddress;
	const localPeer = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
	const fetchSite = req.headers["sec-fetch-site"];
	if (typeof fetchSite === "string" ? fetchSite.trim().toLowerCase() === "cross-site" : Array.isArray(fetchSite) && fetchSite.some((value) => value.trim().toLowerCase() === "cross-site")) return {
		trusted: false,
		error: "forbidden"
	};
	const host = req.headers.host;
	if (typeof host !== "string") return {
		trusted: false,
		error: "forbidden"
	};
	const origin = effectiveOrigin(req, host);
	if (origin === void 0) return {
		trusted: false,
		error: "forbidden"
	};
	if (!sameOriginMetadata(req, host)) return {
		trusted: false,
		error: "forbidden"
	};
	if (localPeer && loopbackHost(host)) return { trusted: true };
	try {
		if (await trustedOrigins.has(origin)) return { trusted: true };
	} catch {
		return {
			trusted: false,
			error: "forbidden"
		};
	}
	return {
		trusted: false,
		error: REMOTE_WEB_ORIGIN_NOT_TRUSTED
	};
}
function json$4(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
function header(req, name) {
	const value = req.headers[name];
	if (Array.isArray(value)) return value[0];
	return value;
}
function contentLength(req) {
	const raw = header(req, "content-length");
	if (raw === void 0) return void 0;
	if (!/^\d+$/u.test(raw.trim())) throw new TypeError("Fast Mode request content length is invalid");
	const value = Number(raw);
	if (!Number.isSafeInteger(value)) throw new TypeError("Fast Mode request content length is invalid");
	return value;
}
/** Collect one small JSON body without exposing or logging its contents. */
async function readFastModeBody(req) {
	const declared = contentLength(req);
	if (declared !== void 0 && (!Number.isFinite(declared) || declared > 4096)) throw new RangeError("Fast Mode request body is too large");
	const chunks = [];
	let total = 0;
	const iterable = req;
	if (typeof req[Symbol.asyncIterator] === "function") for await (const chunk of iterable) {
		const bytes = typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk);
		total += bytes.byteLength;
		if (total > 4096) throw new RangeError("Fast Mode request body is too large");
		chunks.push(bytes);
	}
	else {
		const body = req.body;
		if (typeof body === "string") {
			const bytes = Buffer.from(body);
			if (bytes.byteLength > 4096) throw new RangeError("Fast Mode request body is too large");
			chunks.push(bytes);
		} else if (body instanceof Uint8Array) {
			if (body.byteLength > 4096) throw new RangeError("Fast Mode request body is too large");
			chunks.push(new Uint8Array(body));
		} else if (body !== void 0) throw new TypeError("Fast Mode request body is invalid");
	}
	const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
	if (bytes.byteLength === 0) throw new TypeError("Fast Mode request body is invalid");
	let text;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new TypeError("Fast Mode request body is invalid");
	}
	try {
		return JSON.parse(text);
	} catch {
		throw new TypeError("Fast Mode request body is invalid");
	}
}
function fastModeSessionIdFromQuery(req) {
	const rawUrl = req.url;
	if (typeof rawUrl !== "string") return void 0;
	try {
		const values = new URL(rawUrl, "http://dsh.invalid").searchParams.getAll("sessionId");
		return values.length === 1 && isFastModeSessionId(values[0]) ? values[0] : void 0;
	} catch {
		return;
	}
}
function fastModeBody(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const record = value;
	if (Object.keys(record).length !== 2) return void 0;
	const sessionId = record["sessionId"];
	const enabled = record["enabled"];
	return isFastModeSessionId(sessionId) && typeof enabled === "boolean" ? {
		sessionId,
		enabled
	} : void 0;
}
/** Register the plugin-owned OAuth routes when the Web server is composed. */
function registerOpenAICodexAuthRoutes(ctx, store, trustedOriginsOverride, fastModeOverride, proxyManager, resolveProxyUrl, authorizationTimeoutMs) {
	const auth = new OpenAICodexWebAuth(store, {
		proxyManager,
		resolveProxyUrl,
		authorizationTimeoutMs
	});
	const storedFilename = store.filename;
	const fastMode = fastModeOverride ?? new FastModeRegistry();
	const trustedOrigins = trustedOriginsOverride ?? (typeof storedFilename === "string" ? new OpenAICodexTrustedOriginsStore(join(dirname(storedFilename), ".openai-codex-trusted-origins.json")) : new OpenAICodexTrustedOriginsStore());
	ctx.effect(() => {
		const authorize = async (req, res) => {
			const decision = await trustedRequestDecision(req, trustedOrigins);
			if (decision.trusted) return true;
			json$4(res, 403, { error: decision.error });
			return false;
		};
		const routes = [
			ctx.webServer.register({
				kind: "exact",
				path: OPENAI_CODEX_AUTH_STATUS_PATH,
				handler: async (req, res) => {
					if (req.method !== "GET") return json$4(res, 405, { error: "method not allowed" });
					if (!await authorize(req, res)) return;
					json$4(res, 200, await auth.status());
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: OPENAI_CODEX_AUTH_LOGIN_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json$4(res, 405, { error: "method not allowed" });
					if (!await authorize(req, res)) return;
					try {
						json$4(res, 200, await auth.signIn());
					} catch (error) {
						json$4(res, 500, { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: OPENAI_CODEX_AUTH_CANCEL_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json$4(res, 405, { error: "method not allowed" });
					if (!await authorize(req, res)) return;
					try {
						await auth.cancel();
						json$4(res, 200, await auth.status());
					} catch (error) {
						json$4(res, 500, { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: OPENAI_CODEX_AUTH_LOGOUT_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json$4(res, 405, { error: "method not allowed" });
					if (!await authorize(req, res)) return;
					try {
						await auth.signOut();
						json$4(res, 200, { ok: true });
					} catch (error) {
						json$4(res, 500, { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: OPENAI_CODEX_FAST_MODE_PATH,
				handler: async (req, res) => {
					if (req.method !== "GET" && req.method !== "POST") return json$4(res, 405, { error: "method not allowed" });
					if (!await authorize(req, res)) return;
					if (req.method === "GET") {
						const sessionId = fastModeSessionIdFromQuery(req);
						if (sessionId === void 0) return json$4(res, 400, { error: "invalid input" });
						return json$4(res, 200, { enabled: fastMode.isEnabled(sessionId) });
					}
					const type = header(req, "content-type");
					if (type === void 0 || !/^application\/json(?:\s*;|$)/iu.test(type.trim())) return json$4(res, 415, { error: "unsupported content type" });
					try {
						const body = fastModeBody(await readFastModeBody(req));
						if (body === void 0) return json$4(res, 400, { error: "invalid input" });
						fastMode.set(body.sessionId, body.enabled);
						return json$4(res, 200, { enabled: fastMode.isEnabled(body.sessionId) });
					} catch (error) {
						return json$4(res, error instanceof RangeError ? 413 : 400, { error: error instanceof RangeError ? "request body too large" : "invalid input" });
					}
				}
			})
		];
		return async () => {
			for (const dispose of routes) dispose();
			await auth.dispose();
		};
	}, "dsh-codex-connect: Web OAuth routes");
}
//#endregion
//#region src/settings-contract.ts
/** Node-free settings contract shared by the Host plugin and browser card. */
/** Stable Harness settings namespace owned by this plugin. */
const OPENAI_CODEX_SETTINGS_NAMESPACE = "llm-openai-codex";
/** Suggested local HTTP proxy shown by the settings UI; it is never enabled by default. */
const DEFAULT_OPENAI_CODEX_PROXY_URL = "http://127.0.0.1:7890";
/**
* Normalize the credential-free HTTP proxy URL accepted by Codex Connect.
* Paths, query strings, fragments, and embedded credentials are rejected so
* the value remains an origin rather than an opaque request target.
*/
function normalizeOpenAICodexProxyUrl(value) {
	if (typeof value !== "string" || value.trim().length === 0) return void 0;
	try {
		const parsed = new URL(value.trim());
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return void 0;
		if (parsed.username !== "" || parsed.password !== "") return void 0;
		if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") return void 0;
		if (parsed.hostname.length === 0) return void 0;
		if (parsed.port !== "" && (!/^\d+$/u.test(parsed.port) || Number(parsed.port) < 1 || Number(parsed.port) > 65535)) return void 0;
		return parsed.origin;
	} catch {
		return;
	}
}
/** Whether a value is a supported, canonical HTTP(S) proxy origin. */
function isValidOpenAICodexProxyUrl(value) {
	return normalizeOpenAICodexProxyUrl(value) !== void 0;
}
/**
* Whether a value is a bounded per-model context-window override map. Keys
* are nonempty, unpadded model ids; values are positive safe integers or null
* to restore that model's catalog default. The Host also checks catalog
* membership and the model-specific configuration ceiling.
*/
function isValidOpenAICodexContextWindowOverrides(value) {
	if (!isRecord$1(value)) return false;
	const entries = Object.entries(value);
	if (entries.length > 256) return false;
	return entries.every(([modelId, window]) => modelId.length > 0 && modelId.trim() === modelId && (window === null || typeof window === "number" && Number.isSafeInteger(window) && window > 0));
}
/** Preserve per-model null masks until the Host has merged its settings layers. */
function parseOpenAICodexContextWindowOverrides(value) {
	if (value === void 0 || value === null) return void 0;
	if (!isValidOpenAICodexContextWindowOverrides(value)) throw new TypeError("OpenAI Codex contextWindowOverrides must contain at most 256 nonempty model ids with positive safe-integer token budgets or null resets");
	return { ...value };
}
/** Resolve merged settings; whole-map or per-model null masks use catalog defaults. */
function resolveOpenAICodexContextWindowOverrides(value) {
	const overrides = parseOpenAICodexContextWindowOverrides(value);
	if (overrides === void 0) return void 0;
	return Object.fromEntries(Object.entries(overrides).filter((entry) => entry[1] !== null));
}
/** Default model used by the standalone search endpoint. */
const DEFAULT_OPENAI_CODEX_SEARCH_MODEL = "gpt-5.6-sol";
/** Default search mode, matching the official local Codex client. */
const DEFAULT_OPENAI_CODEX_SEARCH_MODE = "cached";
/** Default provider search-context size. */
const DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE = "medium";
/** Default output budget for the standalone search response. */
const DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS = 1e4;
const DEFAULT_OPENAI_CODEX_SETTINGS = Object.freeze({
	models: void 0,
	enableProxy: false,
	proxyUrl: DEFAULT_OPENAI_CODEX_PROXY_URL,
	contextWindowOverrides: void 0,
	enableSearch: false,
	enableImageTool: false,
	enableImageGeneration: false,
	searchModel: DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
	searchMode: DEFAULT_OPENAI_CODEX_SEARCH_MODE,
	searchContextSize: DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
	searchMaxOutputTokens: DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS
});
/** Fill the schema defaults even when called without Cordis validation. */
function resolveOpenAICodexSettings(value) {
	const resolved = {
		...DEFAULT_OPENAI_CODEX_SETTINGS,
		...value
	};
	if (!isValidOpenAICodexProxyUrl(resolved.proxyUrl)) throw new TypeError("OpenAI Codex proxyUrl must be an HTTP(S) origin without credentials or a path");
	return {
		...resolved,
		contextWindowOverrides: resolveOpenAICodexContextWindowOverrides(resolved.contextWindowOverrides)
	};
}
/** Resolve the active proxy without treating a disabled value as a route. */
function resolveOpenAICodexProxyUrl(value) {
	const resolved = resolveOpenAICodexSettings(value);
	return resolved.enableProxy ? normalizeOpenAICodexProxyUrl(resolved.proxyUrl) : void 0;
}
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Narrow the redacted settings wire payload before it enters React state. */
function decodeOpenAICodexSettings(value) {
	if (!isRecord$1(value)) return void 0;
	const models = value["models"];
	const enableProxy = value["enableProxy"];
	const proxyUrl = value["proxyUrl"];
	const contextWindowOverrides = value["contextWindowOverrides"];
	const enableSearch = value["enableSearch"];
	const enableImageTool = value["enableImageTool"];
	const enableImageGeneration = value["enableImageGeneration"];
	const searchModel = value["searchModel"];
	const searchMode = value["searchMode"];
	const searchContextSize = value["searchContextSize"];
	const searchMaxOutputTokens = value["searchMaxOutputTokens"];
	if (models !== void 0 && (!Array.isArray(models) || models.some((model) => typeof model !== "string"))) return void 0;
	if (enableProxy !== void 0 && typeof enableProxy !== "boolean") return void 0;
	if (proxyUrl !== void 0 && (typeof proxyUrl !== "string" || !isValidOpenAICodexProxyUrl(proxyUrl))) return void 0;
	if (contextWindowOverrides !== void 0 && contextWindowOverrides !== null && !isValidOpenAICodexContextWindowOverrides(contextWindowOverrides)) return void 0;
	if (typeof enableSearch !== "boolean" || typeof enableImageTool !== "boolean") return void 0;
	if (enableImageGeneration !== void 0 && typeof enableImageGeneration !== "boolean") return void 0;
	if (typeof searchModel !== "string" || searchModel.trim().length === 0) return void 0;
	if (searchMode !== "cached" && searchMode !== "indexed" && searchMode !== "live") return void 0;
	if (searchContextSize !== "low" && searchContextSize !== "medium" && searchContextSize !== "high") return void 0;
	if (typeof searchMaxOutputTokens !== "number" || !Number.isInteger(searchMaxOutputTokens) || searchMaxOutputTokens < 1) return void 0;
	const overrides = resolveOpenAICodexContextWindowOverrides(contextWindowOverrides);
	return {
		models: models === void 0 ? void 0 : [...new Set(models)],
		enableProxy: enableProxy ?? false,
		proxyUrl: proxyUrl === void 0 ? DEFAULT_OPENAI_CODEX_PROXY_URL : normalizeOpenAICodexProxyUrl(proxyUrl),
		contextWindowOverrides: overrides === void 0 ? void 0 : Object.freeze(overrides),
		enableSearch,
		enableImageTool,
		enableImageGeneration: enableImageGeneration ?? false,
		searchModel,
		searchMode,
		searchContextSize,
		searchMaxOutputTokens
	};
}
//#endregion
//#region src/provider-proxy.ts
/** Explicit Codex-only HTTP(S) proxying, probing, and lifecycle ownership. */
/** Canonical first-party endpoint used for a no-auth, no-model reachability probe. */
const OPENAI_CODEX_PROXY_PROBE_URL = "https://chatgpt.com/backend-api/codex";
/** Upper bound for one candidate probe, including CONNECT and response headers. */
const OPENAI_CODEX_PROXY_PROBE_TIMEOUT_MS = 3e3;
/** Maximum number of candidates considered by automatic detection. */
const OPENAI_CODEX_PROXY_CANDIDATE_LIMIT = 8;
/** Bounded local candidates documented by the settings UI. */
const OPENAI_CODEX_LOCAL_PROXY_CANDIDATES = [
	"http://127.0.0.1:7890",
	"http://127.0.0.1:7897",
	"http://127.0.0.1:10809"
];
const proxyScope = new AsyncLocalStorage();
const activeOwners = /* @__PURE__ */ new Set();
var ScopedProxyDispatcher = class extends Dispatcher {
	fallback;
	constructor(fallback) {
		super();
		this.fallback = fallback;
	}
	setFallback(fallback) {
		this.fallback = fallback;
	}
	dispatch(options, handler) {
		return (proxyScope.getStore() ?? this.fallback).dispatch(options, handler);
	}
};
let installedDispatcher;
let previousDispatcher;
function ensureInstalled(owner) {
	if (activeOwners.has(owner)) return;
	const current = getGlobalDispatcher();
	if (installedDispatcher === void 0) {
		previousDispatcher = current;
		installedDispatcher = new ScopedProxyDispatcher(current);
		setGlobalDispatcher(installedDispatcher);
	} else if (current !== installedDispatcher) {
		installedDispatcher.setFallback(current);
		setGlobalDispatcher(installedDispatcher);
	}
	activeOwners.add(owner);
}
function removeOwner(owner) {
	activeOwners.delete(owner);
	if (activeOwners.size !== 0 || installedDispatcher === void 0) return;
	const installed = installedDispatcher;
	const previous = previousDispatcher;
	installedDispatcher = void 0;
	previousDispatcher = void 0;
	if (getGlobalDispatcher() === installed && previous !== void 0) setGlobalDispatcher(previous);
}
function isPromiseLike(value) {
	return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}
function errorCode(error) {
	if (typeof error !== "object" || error === null) return void 0;
	const record = error;
	return typeof record["code"] === "string" ? record["code"] : errorCode(record["cause"]);
}
function classifyProbeError(error) {
	const code = errorCode(error);
	if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns-failure";
	if (code === "ECONNREFUSED") return "connection-refused";
	if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ABORT_ERR") return "timeout";
	if (code === "ERR_TLS_CERT_ALTNAME_INVALID" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED") return "tls-failure";
	return "connect-failure";
}
function classifyResponse(status) {
	if (status === 407) return "proxy-authentication-required";
	if (status === 401 || status === 403) return "upstream-authentication-required";
	return "reachable";
}
function candidateEnvironmentValues() {
	return [
		process.env["HTTPS_PROXY"],
		process.env["https_proxy"],
		process.env["HTTP_PROXY"],
		process.env["http_proxy"],
		process.env["ALL_PROXY"],
		process.env["all_proxy"]
	].filter((value) => value !== void 0);
}
/** Return a small, deterministic candidate set; this never scans LAN hosts or ports. */
function listOpenAICodexProxyCandidates() {
	const candidates = [];
	for (const value of [...candidateEnvironmentValues(), ...OPENAI_CODEX_LOCAL_PROXY_CANDIDATES]) {
		const normalized = normalizeOpenAICodexProxyUrl(value);
		if (normalized !== void 0 && !candidates.includes(normalized)) candidates.push(normalized);
		if (candidates.length >= 8) break;
	}
	return candidates;
}
/** One plugin instance owns its proxy agents and contributes one global wrapper owner. */
var OpenAICodexProxyManager = class {
	agents = /* @__PURE__ */ new Map();
	activeOperations = 0;
	idleWaiters = [];
	disposed = false;
	disposePromise;
	async waitForIdle() {
		if (this.activeOperations === 0) return;
		await new Promise((resolve) => {
			this.idleWaiters.push(resolve);
		});
	}
	async closeAgents() {
		removeOwner(this);
		const agents = [...this.agents.values()];
		this.agents.clear();
		await Promise.allSettled(agents.map((agent) => agent.close()));
	}
	agentFor(proxyUrl) {
		let agent = this.agents.get(proxyUrl);
		if (agent !== void 0) return agent;
		agent = new ProxyAgent(proxyUrl);
		this.agents.set(proxyUrl, agent);
		return agent;
	}
	acquire(proxyUrl) {
		if (this.disposed) throw new Error("OpenAI Codex proxy manager has been disposed");
		ensureInstalled(this);
		this.activeOperations += 1;
		let released = false;
		return {
			agent: this.agentFor(proxyUrl),
			release: () => {
				if (released) return;
				released = true;
				this.activeOperations -= 1;
				if (this.activeOperations === 0) for (const resolve of this.idleWaiters.splice(0)) resolve();
			}
		};
	}
	/** Run a synchronous or asynchronous Codex operation in the selected proxy scope. */
	run(proxyUrl, operation) {
		if (proxyUrl === void 0) return operation();
		const normalized = normalizeOpenAICodexProxyUrl(proxyUrl);
		if (!isValidOpenAICodexProxyUrl(normalized)) throw new TypeError("OpenAI Codex proxy URL is invalid");
		const lease = this.acquire(normalized);
		try {
			const value = proxyScope.run(lease.agent, operation);
			if (isPromiseLike(value)) return Promise.resolve(value).finally(lease.release);
			lease.release();
			return value;
		} catch (error) {
			lease.release();
			throw error;
		}
	}
	/** Run a streaming operation and keep the proxy lease until its final event. */
	runStream(proxyUrl, operation) {
		if (proxyUrl === void 0) return operation();
		const normalized = normalizeOpenAICodexProxyUrl(proxyUrl);
		if (!isValidOpenAICodexProxyUrl(normalized)) throw new TypeError("OpenAI Codex proxy URL is invalid");
		const lease = this.acquire(normalized);
		try {
			const stream = proxyScope.run(lease.agent, operation);
			Promise.resolve(stream.result()).finally(lease.release);
			return stream;
		} catch (error) {
			lease.release();
			throw error;
		}
	}
	/** Probe one proxy without credentials, model calls, quota calls, or settings writes. */
	async probe(proxyUrl) {
		const normalized = normalizeOpenAICodexProxyUrl(proxyUrl);
		if (normalized === void 0) return {
			proxyUrl,
			reachable: false,
			classification: "invalid"
		};
		try {
			const response = await this.run(normalized, () => fetch(OPENAI_CODEX_PROXY_PROBE_URL, {
				method: "GET",
				redirect: "manual",
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(OPENAI_CODEX_PROXY_PROBE_TIMEOUT_MS)
			}));
			await response.body?.cancel();
			return {
				proxyUrl: normalized,
				reachable: true,
				classification: classifyResponse(response.status),
				status: response.status
			};
		} catch (error) {
			return {
				proxyUrl: normalized,
				reachable: false,
				classification: classifyProbeError(error)
			};
		}
	}
	/** Close owned pools only after all scoped operations have become quiescent. */
	async dispose() {
		if (this.disposePromise !== void 0) return this.disposePromise;
		this.disposed = true;
		this.disposePromise = (async () => {
			await this.waitForIdle();
			await this.closeAgents();
		})();
		return this.disposePromise;
	}
	/** Release the process wrapper and pools after the user disables the proxy. */
	async deactivate() {
		if (this.disposed) return;
		await this.waitForIdle();
		await this.closeAgents();
	}
};
/** Probe the bounded automatic candidate set in parallel. */
async function detectOpenAICodexProxies(manager) {
	return Promise.all(listOpenAICodexProxyCandidates().map((candidate) => manager.probe(candidate)));
}
//#endregion
//#region src/proxy-paths.ts
/** Node-free route constants shared by the Host and browser plugin halves. */
/** Detect bounded local/environment proxy candidates without changing settings. */
const OPENAI_CODEX_PROXY_DETECT_PATH = "/plugins/dsh-openai-codex/proxy/detect";
/** Test one manually entered proxy origin without changing settings. */
const OPENAI_CODEX_PROXY_TEST_PATH = "/plugins/dsh-openai-codex/proxy/test";
//#endregion
//#region src/proxy-routes.ts
function json$3(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
function proxyUrlFromQuery(req) {
	if (typeof req.url !== "string") return void 0;
	try {
		const values = new URL(req.url, "http://dsh.invalid").searchParams.getAll("proxyUrl");
		return values.length === 1 && values[0].length <= 2e3 ? values[0] : void 0;
	} catch {
		return;
	}
}
/** Register bounded detection and draft-probe routes; neither route mutates settings. */
function registerOpenAICodexProxyRoutes(ctx, trustedOrigins, manager) {
	ctx.effect(() => {
		const authorize = async (req, res) => {
			const decision = await trustedRequestDecision(req, trustedOrigins);
			if (decision.trusted) return true;
			json$3(res, 403, { error: decision.error });
			return false;
		};
		const routes = [ctx.webServer.register({
			kind: "exact",
			path: OPENAI_CODEX_PROXY_DETECT_PATH,
			handler: async (req, res) => {
				if (req.method !== "POST") return json$3(res, 405, { error: "method not allowed" });
				if (!await authorize(req, res)) return;
				const results = await detectOpenAICodexProxies(manager);
				return json$3(res, 200, {
					candidates: results.filter((result) => result.reachable),
					results
				});
			}
		}), ctx.webServer.register({
			kind: "exact",
			path: OPENAI_CODEX_PROXY_TEST_PATH,
			handler: async (req, res) => {
				if (req.method !== "POST") return json$3(res, 405, { error: "method not allowed" });
				if (!await authorize(req, res)) return;
				const proxyUrl = proxyUrlFromQuery(req);
				if (proxyUrl === void 0) return json$3(res, 400, { error: "invalid proxy URL" });
				return json$3(res, 200, await manager.probe(proxyUrl));
			}
		})];
		return () => {
			for (const dispose of routes) dispose();
		};
	}, "dsh-codex-connect: proxy detection routes");
}
//#endregion
//#region src/compatibility.ts
const COMPATIBILITY_SCHEMA_VERSION = 1;
const SUPPORTED_NODE_RANGE = "^22.19.0 || >=24.0.0";
const SUPPORTED_DSH_PLUGIN_API_VERSION = "0.1.2-alpha.3";
const SUPPORTED_PI_AI_RANGE = "^0.84.2";
const PI_AI_PACKAGE = "@earendil-works/pi-ai";
const DSH_PLUGIN_API_PACKAGES = [
	"@deepseek-ai/dsh-agent",
	"@deepseek-ai/dsh-atomic-write",
	"@deepseek-ai/dsh-attachment",
	"@deepseek-ai/dsh-home-paths",
	"@deepseek-ai/dsh-host-webserver",
	"@deepseek-ai/dsh-invariants",
	"@deepseek-ai/dsh-llm",
	"@deepseek-ai/dsh-llm-pi-ai",
	"@deepseek-ai/dsh-fs",
	"@deepseek-ai/dsh-session",
	"@deepseek-ai/dsh-settings",
	"@deepseek-ai/dsh-tools",
	"@deepseek-ai/dsh-util-values",
	"@deepseek-ai/dsh-web"
];
const COMPATIBILITY_PACKAGES = [
	"@deepseek-ai/dsh-llm",
	"@deepseek-ai/dsh-llm-pi-ai",
	PI_AI_PACKAGE
];
/** Public contract data mirrored by compatibility.json without importing JSON at runtime. */
const COMPATIBILITY_CONTRACT = {
	schemaVersion: 1,
	engines: { node: SUPPORTED_NODE_RANGE },
	dshPluginApi: {
		version: SUPPORTED_DSH_PLUGIN_API_VERSION,
		packages: DSH_PLUGIN_API_PACKAGES
	},
	piAi: {
		package: PI_AI_PACKAGE,
		version: SUPPORTED_PI_AI_RANGE
	}
};
const PACKAGE_JSON_SEARCH_DEPTH = 8;
function compareVersion(left, right) {
	return left === right ? "compatible" : "incompatible";
}
function piAiVersionStatus(value) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value.trim());
	if (match === null) return "incompatible";
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	return major === 0 && minor === 84 && patch >= 2 ? "compatible" : "incompatible";
}
function parseNodeVersion(value) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/u.exec(value.trim());
	if (match === null) return void 0;
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	if (![
		major,
		minor,
		patch
	].every(Number.isSafeInteger)) return void 0;
	return [
		major,
		minor,
		patch
	];
}
function nodeStatus(value) {
	if (value === void 0 || value === null || value.trim() === "") return "unknown";
	const parsed = parseNodeVersion(value);
	if (parsed === void 0) return "unknown";
	const [major, minor, patch] = parsed;
	if (major === 22) return minor > 19 || minor === 19 && patch >= 0 ? "compatible" : "incompatible";
	return major >= 24 ? "compatible" : "incompatible";
}
function packageEntry(supported, installed, status = (value) => compareVersion(value, supported)) {
	return {
		supported,
		installed: installed ?? null,
		status: installed === void 0 || installed === null || installed === "" ? "unknown" : status(installed)
	};
}
function nodeEntry(installed) {
	return {
		supported: SUPPORTED_NODE_RANGE,
		installed: installed ?? null,
		status: nodeStatus(installed)
	};
}
function aggregateStatus(entries) {
	if (entries.some((entry) => entry.status === "incompatible")) return "incompatible";
	if (entries.some((entry) => entry.status === "unknown")) return "unknown";
	return "compatible";
}
/** Evaluate a captured set of versions without touching the filesystem. */
function evaluateCompatibility(input = {}) {
	const installedNode = input.nodeVersion ?? input.node ?? input.installed?.node;
	const suppliedPackages = input.packageVersions ?? input.packages ?? input.installed?.packages ?? {};
	const packages = {
		"@deepseek-ai/dsh-llm": packageEntry(SUPPORTED_DSH_PLUGIN_API_VERSION, suppliedPackages["@deepseek-ai/dsh-llm"]),
		"@deepseek-ai/dsh-llm-pi-ai": packageEntry(SUPPORTED_DSH_PLUGIN_API_VERSION, suppliedPackages["@deepseek-ai/dsh-llm-pi-ai"]),
		[PI_AI_PACKAGE]: packageEntry(SUPPORTED_PI_AI_RANGE, suppliedPackages[PI_AI_PACKAGE], piAiVersionStatus)
	};
	const node = nodeEntry(installedNode);
	return {
		schemaVersion: 1,
		status: aggregateStatus([node, ...Object.values(packages)]),
		node,
		packages
	};
}
/** Alias for callers that prefer assessment terminology. */
const assessCompatibility = evaluateCompatibility;
/**
* Resolve installed package metadata without returning a filesystem path.
* @param name - package to resolve from this plugin installation.
* @returns its version, or undefined when metadata cannot be read.
*/
async function readInstalledPackageVersion(name) {
	let entry;
	try {
		const resolved = import.meta.resolve(name);
		if (!resolved.startsWith("file:")) return void 0;
		entry = fileURLToPath(resolved);
	} catch {
		return;
	}
	let directory = dirname(entry);
	for (let depth = 0; depth < PACKAGE_JSON_SEARCH_DEPTH; depth += 1) {
		const candidate = join(directory, "package.json");
		try {
			const parsed = JSON.parse(await readFile(candidate, "utf8"));
			if (parsed.name === name && typeof parsed.version === "string") return parsed.version;
		} catch {}
		const parent = parse(directory).root === directory ? directory : dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
}
/** Read installed package metadata and return only versions and statuses. */
async function detectCompatibility(options = {}) {
	const readVersion = options.readPackageVersion ?? readInstalledPackageVersion;
	const packageVersions = options.packageVersions ?? options.packages ?? options.installed?.packages;
	const resolvedPackages = packageVersions === void 0 ? Object.fromEntries(await Promise.all(COMPATIBILITY_PACKAGES.map(async (name) => [name, await readVersion(name)]))) : packageVersions;
	return evaluateCompatibility({
		nodeVersion: options.nodeVersion ?? options.node ?? options.installed?.node ?? process.version,
		packageVersions: resolvedPackages
	});
}
const OPENAI_CODEX_NPM_METADATA_URL = `https://registry.npmjs.org/-/package/dsh-codex-connect/dist-tags`;
const OPENAI_CODEX_RELEASE_API_BASE = "https://api.github.com/repos/franksong2702/dsh-codex-connect/releases/tags/v";
const OPENAI_CODEX_RELEASE_PAGE_BASE = "https://github.com/franksong2702/dsh-codex-connect/releases/tag/v";
const OPENAI_CODEX_UPDATE_HIGHLIGHTS_URL = "https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/update-highlights.json";
const OPENAI_CODEX_VERIFIED_COMPATIBILITY_URL = "https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/verified-compatibility.json";
const OPENAI_CODEX_UPDATE_MAX_METADATA_BYTES = 65536;
const OPENAI_CODEX_UPDATE_MAX_HIGHLIGHTS_BYTES = 65536;
const OPENAI_CODEX_UPDATE_MAX_COMPATIBILITY_BYTES = 65536;
const OPENAI_CODEX_UPDATE_MAX_RELEASE_BYTES = 32768;
const HIGHLIGHT_KINDS = [
	"trusted-origins",
	"runtime-compatibility",
	"quota-fast-mode",
	"dsh-rc7",
	"search-stability",
	"image-generation",
	"oauth-history",
	"model-visibility",
	"proxy-connection",
	"models-account",
	"context-budget"
];
function isHighlightKind(value) {
	return typeof value === "string" && HIGHLIGHT_KINDS.includes(value);
}
/** Parse the public release-summary catalog without trusting arbitrary fields. */
function parseOpenAICodexUpdateHighlights(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const record = value;
	if (record["schemaVersion"] !== 1 || !Array.isArray(record["releases"]) || record["releases"].length > 256) return void 0;
	const releases = [];
	const seenVersions = /* @__PURE__ */ new Set();
	for (const rawRelease of record["releases"]) {
		if (typeof rawRelease !== "object" || rawRelease === null || Array.isArray(rawRelease)) continue;
		const release = rawRelease;
		const version = release["version"];
		const kinds = release["highlights"];
		if (typeof version !== "string" || parseOpenAICodexVersion(version) === void 0 || !Array.isArray(kinds) || kinds.length > 32) continue;
		if (seenVersions.has(version)) continue;
		seenVersions.add(version);
		const validKinds = [];
		for (const kind of kinds) if (isHighlightKind(kind) && !validKinds.includes(kind)) validKinds.push(kind);
		releases.push({
			version,
			highlights: validKinds
		});
	}
	return {
		schemaVersion: 1,
		releases
	};
}
function parseVersionParts(raw) {
	const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(raw);
	if (match === null) return void 0;
	const rawPrerelease = match[4] === void 0 ? [] : match[4].split(".");
	if (rawPrerelease.some((identifier) => /^\d+$/u.test(identifier) && !/^(0|[1-9]\d*)$/u.test(identifier))) return void 0;
	const prerelease = rawPrerelease.map((identifier) => /^(0|[1-9]\d*)$/u.test(identifier) ? Number(identifier) : identifier);
	if (prerelease.some((identifier) => typeof identifier === "number" && !Number.isSafeInteger(identifier))) return void 0;
	const parsed = {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease
	};
	return [
		parsed.major,
		parsed.minor,
		parsed.patch
	].every(Number.isSafeInteger) ? parsed : void 0;
}
/** Parse one exact package version, accepting the conventional leading `v`. */
function parseOpenAICodexVersion(raw) {
	if (typeof raw !== "string") return void 0;
	return parseVersionParts(raw.startsWith("v") ? raw.slice(1) : raw);
}
function compareIdentifiers(left, right) {
	if (typeof left === "number" && typeof right === "number") return left < right ? -1 : left > right ? 1 : 0;
	if (typeof left === "number") return -1;
	if (typeof right === "number") return 1;
	return left < right ? -1 : left > right ? 1 : 0;
}
/** Compare two package versions using SemVer precedence (build metadata ignored). */
function compareOpenAICodexVersions(left, right) {
	const a = parseOpenAICodexVersion(left);
	const b = parseOpenAICodexVersion(right);
	if (a === void 0 || b === void 0) throw new TypeError("invalid OpenAI Codex version");
	for (const [aPart, bPart] of [
		[a.major, b.major],
		[a.minor, b.minor],
		[a.patch, b.patch]
	]) if (aPart !== bPart) return aPart < bPart ? -1 : 1;
	if (a.prerelease.length === 0 && b.prerelease.length !== 0) return 1;
	if (a.prerelease.length !== 0 && b.prerelease.length === 0) return -1;
	for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
		const aPart = a.prerelease[index];
		const bPart = b.prerelease[index];
		if (aPart === void 0) return -1;
		if (bPart === void 0) return 1;
		const comparison = compareIdentifiers(aPart, bPart);
		if (comparison !== 0) return comparison;
	}
	return 0;
}
/** Parse the repository-owned compatibility catalog without assuming version ranges are monotonic. */
function parseOpenAICodexVerifiedCompatibility(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const record = value;
	const checkedAt = record["checkedAt"];
	const latestDshVersion = record["latestDshVersion"];
	const rawPluginVersions = record["pluginVersions"];
	if (record["schemaVersion"] !== 1 || typeof checkedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(checkedAt) || typeof latestDshVersion !== "string" || parseOpenAICodexVersion(latestDshVersion) === void 0 || !Array.isArray(rawPluginVersions) || rawPluginVersions.length > 256) return void 0;
	const pluginVersions = [];
	const seenPluginVersions = /* @__PURE__ */ new Set();
	for (const rawPluginVersion of rawPluginVersions) {
		if (typeof rawPluginVersion !== "object" || rawPluginVersion === null || Array.isArray(rawPluginVersion)) return void 0;
		const pluginVersion = rawPluginVersion;
		const version = pluginVersion["version"];
		const rawVerified = pluginVersion["verifiedDshVersions"];
		if (typeof version !== "string" || parseOpenAICodexVersion(version) === void 0 || seenPluginVersions.has(version) || !Array.isArray(rawVerified) || rawVerified.length > 64) return void 0;
		const verifiedDshVersions = [];
		for (const rawDshVersion of rawVerified) {
			if (typeof rawDshVersion !== "string" || parseOpenAICodexVersion(rawDshVersion) === void 0 || verifiedDshVersions.includes(rawDshVersion)) return void 0;
			verifiedDshVersions.push(rawDshVersion);
		}
		seenPluginVersions.add(version);
		pluginVersions.push({
			version,
			verifiedDshVersions
		});
	}
	return {
		schemaVersion: 1,
		checkedAt,
		latestDshVersion,
		pluginVersions
	};
}
/** Combine installed, published, and repository-verified versions into one user decision. */
function evaluateOpenAICodexDshCompatibility(currentVersion, latestPluginVersion, currentDshVersion, catalog) {
	if (catalog === void 0) return {
		status: "unverified",
		latestPluginVersion
	};
	if (currentDshVersion === void 0) return {
		status: "unverified",
		latestPluginVersion,
		latestDshVersion: catalog.latestDshVersion
	};
	const verified = (version) => catalog.pluginVersions.some((plugin) => plugin.version === version && plugin.verifiedDshVersions.includes(currentDshVersion));
	if (verified(currentVersion)) return {
		status: "compatible",
		latestPluginVersion,
		latestDshVersion: catalog.latestDshVersion
	};
	if (latestPluginVersion !== currentVersion && verified(latestPluginVersion)) return {
		status: "plugin-update-required",
		latestPluginVersion,
		latestDshVersion: catalog.latestDshVersion
	};
	return {
		status: currentDshVersion === catalog.latestDshVersion || catalog.pluginVersions.some((plugin) => plugin.verifiedDshVersions.includes(currentDshVersion)) ? "not-yet-compatible" : "unverified",
		latestPluginVersion,
		latestDshVersion: catalog.latestDshVersion
	};
}
function boundedText(value, maxBytes) {
	if (new TextEncoder().encode(value).byteLength > maxBytes) throw new RangeError("update response is too large");
	return value;
}
async function readBoundedText(response, maxBytes) {
	if (response.body === null) return boundedText(await response.text(), maxBytes);
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const chunks = [];
	let total = 0;
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			total += next.value.byteLength;
			if (total > maxBytes) {
				await reader.cancel();
				throw new RangeError("update response is too large");
			}
			chunks.push(decoder.decode(next.value, { stream: true }));
		}
		chunks.push(decoder.decode());
		return chunks.join("");
	} finally {
		reader.releaseLock();
	}
}
async function fetchBounded(fetchImpl, url, maxBytes, timeoutMs, headers) {
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort(/* @__PURE__ */ new Error("update request timed out"));
	}, timeoutMs);
	try {
		const response = await fetchImpl(url, {
			headers,
			signal: controller.signal
		});
		return {
			response,
			text: await readBoundedText(response, maxBytes)
		};
	} finally {
		clearTimeout(timer);
	}
}
function cleanReleaseText(value, maxLength) {
	if (typeof value !== "string" || value.length === 0) return void 0;
	const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "").replace(/\r\n?/gu, "\n").trim().slice(0, maxLength);
	return clean.length === 0 ? void 0 : clean;
}
function registryCandidates(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
	const record = value;
	const tags = record["dist-tags"] ?? record;
	if (typeof tags !== "object" || tags === null || Array.isArray(tags)) return [];
	return ["latest", "alpha"].map((tag) => tags[tag]).filter((candidate) => typeof candidate === "string" && parseOpenAICodexVersion(candidate) !== void 0);
}
function releaseUrl(version) {
	return `${OPENAI_CODEX_RELEASE_PAGE_BASE}${version}`;
}
function releaseApiUrl(version) {
	return `${OPENAI_CODEX_RELEASE_API_BASE}${version}`;
}
function releaseHighlightsBetween(catalog, currentVersion, latestVersion) {
	const releases = catalog.releases.filter((release) => compareOpenAICodexVersions(release.version, currentVersion) > 0).filter((release) => compareOpenAICodexVersions(release.version, latestVersion) <= 0);
	return {
		...releases.length === 0 ? {} : { versionsBehind: releases.length },
		highlights: releases.flatMap((release) => release.highlights.map((kind) => ({
			version: release.version,
			kind
		})))
	};
}
async function releaseHighlights(currentVersion, latestVersion, fetchImpl, timeoutMs) {
	try {
		const { response, text } = await fetchBounded(fetchImpl, OPENAI_CODEX_UPDATE_HIGHLIGHTS_URL, OPENAI_CODEX_UPDATE_MAX_HIGHLIGHTS_BYTES, timeoutMs, { accept: "application/json" });
		if (!response.ok) return { highlights: [] };
		const parsed = parseOpenAICodexUpdateHighlights(JSON.parse(text));
		return parsed === void 0 ? { highlights: [] } : releaseHighlightsBetween(parsed, currentVersion, latestVersion);
	} catch {
		return { highlights: [] };
	}
}
async function releaseDetails(version, fetchImpl, timeoutMs) {
	try {
		const { response, text } = await fetchBounded(fetchImpl, releaseApiUrl(version), OPENAI_CODEX_UPDATE_MAX_RELEASE_BYTES, timeoutMs, { accept: "application/vnd.github+json" });
		if (!response.ok) return {};
		const value = JSON.parse(text);
		if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
		const release = value;
		const releaseName = cleanReleaseText(release["name"], 200);
		const releaseNotes = cleanReleaseText(release["body"], 16e3);
		const publishedAt = typeof release["published_at"] === "string" && /^\d{4}-\d{2}-\d{2}T/iu.test(release["published_at"]) ? release["published_at"].slice(0, 64) : void 0;
		return {
			...releaseName === void 0 ? {} : { releaseName },
			...releaseNotes === void 0 ? {} : { releaseNotes },
			...publishedAt === void 0 ? {} : { publishedAt }
		};
	} catch {
		return {};
	}
}
async function dshCompatibilityAdvice(currentVersion, latestPluginVersion, currentDshVersion, fetchImpl, timeoutMs) {
	try {
		const { response, text } = await fetchBounded(fetchImpl, OPENAI_CODEX_VERIFIED_COMPATIBILITY_URL, OPENAI_CODEX_UPDATE_MAX_COMPATIBILITY_BYTES, timeoutMs, { accept: "application/json" });
		if (!response.ok) return evaluateOpenAICodexDshCompatibility(currentVersion, latestPluginVersion, currentDshVersion);
		return evaluateOpenAICodexDshCompatibility(currentVersion, latestPluginVersion, currentDshVersion, parseOpenAICodexVerifiedCompatibility(JSON.parse(text)));
	} catch {
		return evaluateOpenAICodexDshCompatibility(currentVersion, latestPluginVersion, currentDshVersion);
	}
}
/** Check npm's public dist-tags and enrich an available update with public release notes. */
async function checkForOpenAICodexUpdate(options) {
	const { currentVersion, currentDshVersion } = options;
	const currentDsh = currentDshVersion === void 0 ? {} : { currentDshVersion };
	if (parseOpenAICodexVersion(currentVersion) === void 0) return {
		status: "unavailable",
		currentVersion,
		...currentDsh,
		reason: "invalid-current-version"
	};
	const fetchImpl = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 8e3;
	let metadata;
	try {
		const { response, text } = await fetchBounded(fetchImpl, OPENAI_CODEX_NPM_METADATA_URL, OPENAI_CODEX_UPDATE_MAX_METADATA_BYTES, timeoutMs, { accept: "application/json" });
		if (!response.ok) return {
			status: "unavailable",
			currentVersion,
			...currentDsh,
			reason: "registry-unavailable"
		};
		metadata = JSON.parse(text);
	} catch (error) {
		return {
			status: "unavailable",
			currentVersion,
			...currentDsh,
			reason: error instanceof SyntaxError || error instanceof RangeError ? "invalid-registry-response" : "registry-unavailable"
		};
	}
	const candidates = registryCandidates(metadata);
	if (candidates.length === 0) return {
		status: "unavailable",
		currentVersion,
		...currentDsh,
		reason: "invalid-registry-response"
	};
	const latestVersion = candidates.reduce((best, candidate) => compareOpenAICodexVersions(candidate, best) > 0 ? candidate : best);
	if (compareOpenAICodexVersions(latestVersion, currentVersion) <= 0) {
		const compatibility = await dshCompatibilityAdvice(currentVersion, currentVersion, currentDshVersion, fetchImpl, timeoutMs);
		return {
			status: "up-to-date",
			currentVersion,
			...currentDsh,
			latestVersion: currentVersion,
			compatibility
		};
	}
	const [highlightResult, details, compatibility] = await Promise.all([
		releaseHighlights(currentVersion, latestVersion, fetchImpl, timeoutMs),
		releaseDetails(latestVersion, fetchImpl, timeoutMs),
		dshCompatibilityAdvice(currentVersion, latestVersion, currentDshVersion, fetchImpl, timeoutMs)
	]);
	return {
		status: "update-available",
		currentVersion,
		...currentDsh,
		latestVersion,
		releaseUrl: releaseUrl(latestVersion),
		highlights: highlightResult.highlights,
		compatibility,
		...highlightResult.versionsBehind === void 0 ? {} : { versionsBehind: highlightResult.versionsBehind },
		...details
	};
}
/** Validate a route response before it is rendered by the browser. */
function parseOpenAICodexUpdateResult(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const record = value;
	const currentVersion = record["currentVersion"];
	if (typeof currentVersion !== "string" || parseOpenAICodexVersion(currentVersion) === void 0) return void 0;
	const rawCurrentDshVersion = record["currentDshVersion"];
	const currentDshVersion = rawCurrentDshVersion === void 0 ? void 0 : typeof rawCurrentDshVersion === "string" && parseOpenAICodexVersion(rawCurrentDshVersion) !== void 0 ? rawCurrentDshVersion : void 0;
	if (rawCurrentDshVersion !== void 0 && currentDshVersion === void 0) return void 0;
	const currentDsh = currentDshVersion === void 0 ? {} : { currentDshVersion };
	if (record["status"] === "unavailable") {
		const reason = record["reason"];
		return reason === "invalid-current-version" || reason === "registry-unavailable" || reason === "invalid-registry-response" ? {
			status: "unavailable",
			currentVersion,
			...currentDsh,
			reason
		} : void 0;
	}
	const latestVersion = record["latestVersion"];
	if (typeof latestVersion !== "string" || parseOpenAICodexVersion(latestVersion) === void 0) return void 0;
	const compatibility = parseOpenAICodexDshCompatibilityAdvice(record["compatibility"], latestVersion);
	if (compatibility === void 0) return void 0;
	if (currentDshVersion === void 0 && compatibility.status !== "unverified") return void 0;
	if (record["status"] === "up-to-date") return {
		status: "up-to-date",
		currentVersion,
		...currentDsh,
		latestVersion,
		compatibility
	};
	if (record["status"] !== "update-available" || compareOpenAICodexVersions(latestVersion, currentVersion) <= 0) return void 0;
	const expectedUrl = releaseUrl(latestVersion);
	if (record["releaseUrl"] !== expectedUrl) return void 0;
	const rawVersionsBehind = record["versionsBehind"];
	const versionsBehind = rawVersionsBehind === void 0 ? void 0 : typeof rawVersionsBehind === "number" && Number.isSafeInteger(rawVersionsBehind) && rawVersionsBehind > 0 && rawVersionsBehind <= 256 ? rawVersionsBehind : void 0;
	if (rawVersionsBehind !== void 0 && versionsBehind === void 0) return void 0;
	const rawHighlights = record["highlights"];
	const highlights = rawHighlights === void 0 ? [] : Array.isArray(rawHighlights) ? rawHighlights.flatMap((value) => {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
		const highlight = value;
		const version = highlight["version"];
		const kind = highlight["kind"];
		if (typeof version !== "string" || parseOpenAICodexVersion(version) === void 0) return [];
		if (!isHighlightKind(kind)) return [];
		return [{
			version,
			kind
		}];
	}) : void 0;
	if (highlights === void 0 || Array.isArray(rawHighlights) && highlights.length !== rawHighlights.length) return void 0;
	const releaseName = cleanReleaseText(record["releaseName"], 200);
	const releaseNotes = cleanReleaseText(record["releaseNotes"], 16e3);
	const publishedAt = typeof record["publishedAt"] === "string" && /^\d{4}-\d{2}-\d{2}T/iu.test(record["publishedAt"]) ? record["publishedAt"].slice(0, 64) : void 0;
	return {
		status: "update-available",
		currentVersion,
		...currentDsh,
		latestVersion,
		releaseUrl: expectedUrl,
		highlights,
		compatibility,
		...versionsBehind === void 0 ? {} : { versionsBehind },
		...releaseName === void 0 ? {} : { releaseName },
		...releaseNotes === void 0 ? {} : { releaseNotes },
		...publishedAt === void 0 ? {} : { publishedAt }
	};
}
function parseOpenAICodexDshCompatibilityAdvice(value, latestPluginVersion) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const record = value;
	const status = record["status"];
	if (status !== "compatible" && status !== "plugin-update-required" && status !== "not-yet-compatible" && status !== "unverified") return void 0;
	if (record["latestPluginVersion"] !== latestPluginVersion) return void 0;
	const latestDshVersion = record["latestDshVersion"];
	if (status === "unverified") {
		if (latestDshVersion === void 0) return {
			status,
			latestPluginVersion
		};
		if (typeof latestDshVersion !== "string" || parseOpenAICodexVersion(latestDshVersion) === void 0) return void 0;
		return {
			status,
			latestPluginVersion,
			latestDshVersion
		};
	}
	if (typeof latestDshVersion !== "string" || parseOpenAICodexVersion(latestDshVersion) === void 0) return void 0;
	return {
		status,
		latestPluginVersion,
		latestDshVersion
	};
}
//#endregion
//#region src/update-paths.ts
/** Same-origin route used by the browser update reminder. */
const OPENAI_CODEX_UPDATE_PATH = "/openai-codex/update";
const OPENAI_CODEX_RUNTIME_PATH = "/openai-codex/runtime";
//#endregion
//#region src/update-routes.ts
async function detectCurrentDshVersion() {
	const report = await detectCompatibility();
	const llm = report.packages["@deepseek-ai/dsh-llm"].installed;
	const adapter = report.packages["@deepseek-ai/dsh-llm-pi-ai"].installed;
	return llm !== null && llm === adapter ? llm : void 0;
}
function json$2(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
/** Register the public-version route without crossing the OAuth credential boundary. */
function registerOpenAICodexUpdateRoutes(ctx, options, trustedOrigins) {
	ctx.effect(() => {
		const disposeRuntime = ctx.webServer.register({
			kind: "exact",
			path: OPENAI_CODEX_RUNTIME_PATH,
			handler: async (req, res) => {
				if (req.method !== "GET") return json$2(res, 405, { error: "method not allowed" });
				const decision = await trustedRequestDecision(req, trustedOrigins);
				if (!decision.trusted) return json$2(res, 403, { error: decision.error });
				try {
					const currentDshVersion = await (options.resolveCurrentDshVersion ?? detectCurrentDshVersion)();
					return json$2(res, 200, currentDshVersion === void 0 ? {} : { currentDshVersion });
				} catch {
					return json$2(res, 200, {});
				}
			}
		});
		const disposeUpdate = ctx.webServer.register({
			kind: "exact",
			path: OPENAI_CODEX_UPDATE_PATH,
			handler: async (req, res) => {
				if (req.method !== "GET") return json$2(res, 405, { error: "method not allowed" });
				const decision = await trustedRequestDecision(req, trustedOrigins);
				if (!decision.trusted) return json$2(res, 403, { error: decision.error });
				let result;
				let currentDshVersion;
				try {
					currentDshVersion = await (options.resolveCurrentDshVersion ?? detectCurrentDshVersion)();
				} catch {
					currentDshVersion = void 0;
				}
				try {
					result = await checkForOpenAICodexUpdate({
						currentVersion: options.currentVersion,
						...currentDshVersion === void 0 ? {} : { currentDshVersion },
						...options.fetchImpl === void 0 ? {} : { fetchImpl: options.fetchImpl },
						timeoutMs: options.timeoutMs ?? 8e3
					});
				} catch {
					result = {
						status: "unavailable",
						currentVersion: options.currentVersion,
						...currentDshVersion === void 0 ? {} : { currentDshVersion },
						reason: "registry-unavailable"
					};
				}
				return json$2(res, 200, result);
			}
		});
		return () => {
			disposeUpdate();
			disposeRuntime();
		};
	}, "dsh-codex-connect: update route");
}
//#endregion
//#region src/model-routes.ts
function json$1(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
/** Register the read-only catalog route consumed by Plugin configuration. */
function registerOpenAICodexModelCatalogRoute(ctx, resolveCatalog, trustedOrigins) {
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: OPENAI_CODEX_MODEL_CATALOG_PATH,
		handler: async (req, res) => {
			if (req.method !== "GET") return json$1(res, 405, { error: "method not allowed" });
			const decision = await trustedRequestDecision(req, trustedOrigins);
			if (!decision.trusted) return json$1(res, 403, { error: decision.error });
			return json$1(res, 200, resolveCatalog());
		}
	}), "dsh-codex-connect: model catalog route");
}
//#endregion
//#region src/image-assets-contract.ts
/** Same-origin endpoint serving one session-owned original generated image. */
const OPENAI_CODEX_ORIGINAL_IMAGE_PATH = "/plugins/dsh-codex-connect/images/original";
/** Opaque identifier format for one plugin-owned original image. */
const OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN = /^img_[0-9a-f]{32}$/u;
function positiveSafeInteger$3(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
/** Decode session-log metadata without trusting an asset id, filename, or media type. */
function decodeOpenAICodexOriginalImageRef(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const candidate = value;
	if (typeof candidate.assetId !== "string" || !OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN.test(candidate.assetId) || candidate.mediaType !== "image/png" && candidate.mediaType !== "image/jpeg" && candidate.mediaType !== "image/webp" || !positiveSafeInteger$3(candidate.width) || !positiveSafeInteger$3(candidate.height) || !positiveSafeInteger$3(candidate.bytes) || candidate.bytes > 50331648 || typeof candidate.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(candidate.name) || typeof candidate.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(candidate.sha256)) return void 0;
	return {
		assetId: candidate.assetId,
		mediaType: candidate.mediaType,
		width: candidate.width,
		height: candidate.height,
		bytes: candidate.bytes,
		name: candidate.name,
		sha256: candidate.sha256
	};
}
//#endregion
//#region src/image-presentation.ts
/** Stable metadata marker for generated image result views. */
const IMAGE_PRESENTATION_KIND = "codex-connect-images";
function positiveSafeInteger$2(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function mediaType$1(value) {
	return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}
function imageRef(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const candidate = value;
	if (typeof candidate.attachmentId !== "string" || candidate.attachmentId.length === 0 || !mediaType$1(candidate.mediaType) || !positiveSafeInteger$2(candidate.bytes) || !positiveSafeInteger$2(candidate.width) || !positiveSafeInteger$2(candidate.height) || candidate.name !== void 0 && (typeof candidate.name !== "string" || candidate.name.length === 0)) return void 0;
	return {
		attachmentId: candidate.attachmentId,
		mediaType: candidate.mediaType,
		bytes: candidate.bytes,
		width: candidate.width,
		height: candidate.height,
		...candidate.name === void 0 ? {} : { name: candidate.name }
	};
}
/** Decode durable tool-result metadata without trusting arbitrary session JSON. */
function decodeImagePresentationMeta(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const candidate = value;
	if (candidate.kind !== "codex-connect-images" || typeof candidate.prompt !== "string" || candidate.prompt.length < 1 || candidate.prompt.length > 32e3 || !Array.isArray(candidate.images) || candidate.images.length < 1 || candidate.images.length > 4) return void 0;
	if (candidate.schemaVersion === void 0) {
		const previews = candidate.images.map(imageRef);
		if (previews.some((image) => image === void 0)) return void 0;
		return {
			kind: IMAGE_PRESENTATION_KIND,
			schemaVersion: 1,
			prompt: candidate.prompt,
			images: previews.map((preview) => ({ preview }))
		};
	}
	if (candidate.schemaVersion !== 1) return void 0;
	const images = [];
	for (const value of candidate.images) {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
		const entry = value;
		const preview = imageRef(entry.preview);
		const original = decodeOpenAICodexOriginalImageRef(entry.original);
		if (preview === void 0 || original === void 0) return void 0;
		images.push({
			preview,
			original
		});
	}
	return {
		kind: IMAGE_PRESENTATION_KIND,
		schemaVersion: 1,
		prompt: candidate.prompt,
		images
	};
}
//#endregion
//#region src/image-asset-routes.ts
/** Fork access follows copied result events, not every asset owned by an ancestor. */
function inheritedOriginal(session, assetId) {
	if (session?.header.parentSession === void 0) return void 0;
	const seedLength = session.header.seedLength ?? 0;
	for (const event of session.events) {
		if (event.seq >= seedLength) break;
		if (event.type !== "tool/result") continue;
		const original = decodeImagePresentationMeta(event.data.meta)?.images.find((image) => image.original?.assetId === assetId)?.original;
		if (original !== void 0) return original;
	}
}
function json(res, status, value) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(value));
}
function query(req) {
	if (typeof req.url !== "string") return void 0;
	try {
		const parsed = new URL(req.url, "http://dsh.invalid");
		const sessionIds = parsed.searchParams.getAll("sessionId");
		const assetIds = parsed.searchParams.getAll("assetId");
		const sessionId = sessionIds[0];
		const assetId = assetIds[0];
		if (sessionIds.length !== 1 || assetIds.length !== 1 || sessionId === void 0 || sessionId.length < 1 || sessionId.length > 512 || assetId === void 0 || !OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN.test(assetId)) return void 0;
		return {
			sessionId,
			assetId
		};
	} catch {
		return;
	}
}
/** Register a history-safe route even while new image generation is disabled. */
function registerOpenAICodexOriginalImageRoute(ctx, trustedOrigins, assets) {
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: OPENAI_CODEX_ORIGINAL_IMAGE_PATH,
		handler: async (req, res) => {
			if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
			const decision = await trustedRequestDecision(req, trustedOrigins);
			if (!decision.trusted) return json(res, 403, { error: decision.error });
			const requested = query(req);
			if (requested === void 0) return json(res, 400, { error: "invalid input" });
			const session = ctx.get("sessions")?.get(SessionId(requested.sessionId));
			const stored = await assets.read(requested.sessionId, requested.assetId, inheritedOriginal(session, requested.assetId));
			if (stored === void 0) return json(res, 404, { error: "original image not found" });
			res.writeHead(200, {
				"content-type": stored.ref.mediaType,
				"content-length": String(stored.ref.bytes),
				"content-disposition": `attachment; filename="${stored.ref.name}"`,
				"cache-control": "private, no-store",
				"x-content-type-options": "nosniff"
			});
			res.end(Buffer.from(stored.data));
		}
	}), "dsh-codex-connect: original image download route");
}
//#endregion
//#region src/version.ts
const CODEX_CONNECT_VERSION = "0.1.0-alpha.4.22";
//#endregion
//#region src/doctor.ts
/** Secret-free diagnostics and duplicate-provider guidance. */
/** Actionable message for legacy/manual `openai-codex` adapter collisions. */
function openAICodexConflictMessage() {
	return "Codex Connect cannot register provider \"openai-codex\" because another adapter already owns it. Remove or disable the legacy dsh-codex bundle or manual openai-codex provider row, then restart Harness.";
}
/** Fail before the generic registry error so the collision has a migration hint. */
function assertNoOpenAICodexProviderConflict(providerIds) {
	if (providerIds.includes("openai-codex")) throw new Error(openAICodexConflictMessage());
}
/**
* Inspect only process and filesystem metadata. This function never opens the
* OAuth document, refreshes a token, or starts an authorization flow.
*/
async function diagnoseOpenAICodex(options = {}) {
	const path = options.credentialPath ?? openAICodexAuthPath();
	let state = "missing";
	let mode;
	try {
		const info = await lstat(path);
		if (!info.isFile()) state = "not-a-regular-file";
		else if (process.platform === "win32") state = "owner-only";
		else {
			mode = (info.mode & 511).toString(8).padStart(3, "0");
			state = (info.mode & 63) === 0 ? "owner-only" : "permissions-too-broad";
		}
	} catch (error) {
		state = error?.code === "ENOENT" ? "missing" : "unreadable-metadata";
	}
	const providerConflict = options.providerIds?.includes("openai-codex") ?? false;
	const compatibility = await detectCompatibility(options.compatibilityOptions);
	const hints = [];
	if (state === "missing") hints.push("Sign in only when you are ready; installation does not start OAuth.");
	if (state === "permissions-too-broad") hints.push(`Restrict the OAuth file to its owner before use (current mode ${mode}).`);
	if (state === "not-a-regular-file") hints.push("Replace the OAuth path with an owner-only regular file created by Codex Connect login.");
	if (state === "unreadable-metadata") hints.push("Harness could not inspect the OAuth file metadata; check the parent directory and file ownership.");
	if (providerConflict) hints.push(openAICodexConflictMessage());
	if (!providerConflict) hints.push("If Harness reports a duplicate openai-codex adapter, remove the legacy bundle or manual provider row.");
	if (compatibility.status === "incompatible") hints.push("Compatibility mismatch: install the declared DSH plugin API versions with @earendil-works/pi-ai ^0.84.2, then run doctor again; no files are changed automatically.");
	else if (compatibility.status === "unknown") hints.push("Compatibility is unknown: verify the declared DSH plugin API and @earendil-works/pi-ai versions, then run doctor again.");
	return {
		package: "dsh-codex-connect",
		version: CODEX_CONNECT_VERSION,
		node: process.version,
		credentialFile: {
			path,
			state,
			...mode === void 0 ? {} : { mode }
		},
		capabilities: {
			modelProvider: true,
			search: options.enableSearch === true,
			imageTool: options.enableImageTool === true,
			imageGeneration: options.enableImageGeneration === true,
			changesHarnessDefaultModel: false,
			changesHarnessSearchRoute: false
		},
		providerConflict,
		compatibility,
		hints
	};
}
//#endregion
//#region src/base64.ts
/** Strict base64 helpers used before allocating decoded image bytes. */
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/u;
function base64Value(character) {
	return BASE64_ALPHABET.indexOf(character);
}
/** Return the exact decoded length for canonical base64, or undefined when invalid. */
function estimateBase64Bytes(value) {
	if (value.length === 0 || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) return void 0;
	const firstPadding = value.indexOf("=");
	if (firstPadding >= 0 && firstPadding < value.length - 2) return void 0;
	const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
	if (padding === 2 && (base64Value(value[value.length - 3] ?? "") & 15) !== 0) return void 0;
	if (padding === 1 && (base64Value(value[value.length - 2] ?? "") & 3) !== 0) return void 0;
	const bytes = value.length / 4 * 3 - padding;
	return Number.isSafeInteger(bytes) ? bytes : void 0;
}
/** Decode canonical base64 after strict syntax and tail-bit validation. */
function decodeStrictBase64(value) {
	const expected = estimateBase64Bytes(value);
	if (expected === void 0) return void 0;
	const decoded = Buffer.from(value, "base64");
	return decoded.byteLength === expected ? new Uint8Array(decoded) : void 0;
}
function ascii(data, start, end) {
	return String.fromCharCode(...data.subarray(start, end));
}
function validDimensions(mediaType, width, height) {
	if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 16777216 || height > 16777216) return void 0;
	return {
		mediaType,
		width,
		height
	};
}
function png(data, view) {
	if (data.byteLength < 45 || ascii(data, 12, 16) !== "IHDR" || view.getUint32(8) !== 13) return void 0;
	const end = data.byteLength - 12;
	if (view.getUint32(end) !== 0 || ascii(data, end + 4, end + 8) !== "IEND") return void 0;
	return validDimensions("image/png", view.getUint32(16), view.getUint32(20));
}
const JPEG_SOF_MARKERS = /* @__PURE__ */ new Set([
	192,
	193,
	194,
	195,
	197,
	198,
	199,
	201,
	202,
	203,
	205,
	206,
	207
]);
function jpeg(data, view) {
	let offset = 2;
	let iterations = 0;
	while (offset < data.byteLength && iterations++ < 4096) {
		if (data[offset] !== 255) return void 0;
		while (offset < data.byteLength && data[offset] === 255) offset += 1;
		if (offset >= data.byteLength) return void 0;
		const marker = data[offset] ?? 0;
		offset += 1;
		if (marker === 0) return void 0;
		if (marker === 1 || marker >= 208 && marker <= 217) {
			if (marker === 217) return void 0;
			continue;
		}
		if (marker === 218 || offset + 2 > data.byteLength) return void 0;
		const segmentLength = view.getUint16(offset);
		if (segmentLength < 2 || offset + segmentLength > data.byteLength) return void 0;
		if (JPEG_SOF_MARKERS.has(marker)) {
			if (segmentLength < 7) return void 0;
			return validDimensions("image/jpeg", view.getUint16(offset + 5), view.getUint16(offset + 3));
		}
		offset += segmentLength;
	}
}
function readUint24LE(data, offset) {
	return (data[offset] ?? 0) | (data[offset + 1] ?? 0) << 8 | (data[offset + 2] ?? 0) << 16;
}
function webp(data, view) {
	if (data.byteLength < 20 || ascii(data, 8, 12) !== "WEBP" || view.getUint32(4, true) + 8 !== data.byteLength) return void 0;
	const kind = ascii(data, 12, 16);
	const size = view.getUint32(16, true);
	const payload = 20;
	if (payload + size > data.byteLength) return void 0;
	if (kind === "VP8X") {
		if (size < 10) return void 0;
		return validDimensions("image/webp", readUint24LE(data, 24) + 1, readUint24LE(data, 27) + 1);
	}
	if (kind === "VP8L") {
		if (size < 5 || data[payload] !== 47) return void 0;
		const packed = view.getUint32(21, true) >>> 0;
		return validDimensions("image/webp", (packed & 16383) + 1, (packed >>> 14 & 16383) + 1);
	}
	if (kind === "VP8 ") {
		if (size < 10 || ((data[payload] ?? 1) & 1) !== 0 || data[23] !== 157 || data[24] !== 1 || data[25] !== 42) return void 0;
		return validDimensions("image/webp", view.getUint16(26, true) & 16383, view.getUint16(28, true) & 16383);
	}
}
/** Detect an encoded PNG, JPEG, or WebP and derive its intrinsic dimensions. */
function detectEncodedImage(data) {
	try {
		const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
		if (data.byteLength >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 && data[4] === 13 && data[5] === 10 && data[6] === 26 && data[7] === 10) return png(data, view);
		if (data.byteLength >= 2 && data[0] === 255 && data[1] === 216) return jpeg(data, view);
		if (data.byteLength >= 12 && ascii(data, 0, 4) === "RIFF") return webp(data, view);
		return;
	} catch {
		return;
	}
}
//#endregion
//#region src/image-tool.ts
/** Stable model-callable tool name. */
const IMAGE_GENERATE_TOOL_NAME = "codex_connect_image_generate";
const TRANSPORT_SERVICE = "openaiCodexTransport";
const PROMPT_MAX_LENGTH = 32e3;
const MAX_IMAGES_PER_RESPONSE = 4;
const CANCELED_REQUEST_NOTE = "The request may still be processing.";
var SafeToolError = class extends Error {};
function failure(message) {
	throw new SafeToolError(message);
}
/** Convert transport failures to fixed, secret-free user text. */
function fixedTransportMessage(error) {
	switch (typeof error === "object" && error !== null && "code" in error ? error.code : void 0) {
		case "OPENAI_CODEX_SIGNED_OUT": return "Sign in to OpenAI Codex before generating images.";
		case "OPENAI_CODEX_REAUTH_REQUIRED": return "Renew OpenAI Codex authorization before generating images.";
		case "OPENAI_CODEX_RATE_LIMITED": return "Image generation is temporarily unavailable. Try again later.";
		case "OPENAI_CODEX_TIMEOUT": return `Image generation timed out. ${CANCELED_REQUEST_NOTE}`;
		case "OPENAI_CODEX_CANCELED": return `Image generation was canceled. ${CANCELED_REQUEST_NOTE}`;
		case "OPENAI_CODEX_NETWORK_ERROR": return `The image generation request lost its network connection. ${CANCELED_REQUEST_NOTE}`;
		case "OPENAI_CODEX_UPSTREAM_REJECTED": return "The image generation request was rejected.";
		case "OPENAI_CODEX_UPSTREAM_UNAVAILABLE": return "Image generation is temporarily unavailable.";
		case "OPENAI_CODEX_RESPONSE_TOO_LARGE": return "The image generation response exceeded the safe size limit.";
		case "OPENAI_CODEX_MALFORMED_RESPONSE": return "The image generation response was unreadable.";
		default: return "Image generation failed without exposing private response details.";
	}
}
function extension(mediaType) {
	return mediaType === "image/jpeg" ? "jpg" : mediaType.slice(6);
}
function outputContent(value) {
	const lines = value.images.map(({ original, preview }, index) => `${String(index + 1)}. original ${original.mediaType}, ${String(original.width)}x${String(original.height)} px, ${String(original.bytes)} bytes; preview ${String(preview.width)}x${String(preview.height)} px, attachment ${preview.attachmentId}`);
	return [{
		type: "text",
		text: `Generated ${String(value.images.length)} image${value.images.length === 1 ? "" : "s"}:\n${lines.join("\n")}`
	}, ...value.images.map(({ preview }) => ({
		type: "image",
		attachment: {
			attachmentId: AttachmentId(preview.attachmentId),
			mediaType: preview.mediaType,
			width: preview.width,
			height: preview.height,
			bytes: preview.bytes,
			name: preview.name
		}
	}))];
}
function positiveSafeInteger$1(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function previewValue(ref, fallbackName) {
	if (typeof ref.attachmentId !== "string" || ref.attachmentId.length === 0 || ref.mediaType !== "image/png" && ref.mediaType !== "image/jpeg" && ref.mediaType !== "image/webp" || !positiveSafeInteger$1(ref.bytes) || !positiveSafeInteger$1(ref.width) || !positiveSafeInteger$1(ref.height)) failure("The attachment store returned invalid preview metadata.");
	const name = typeof ref.name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(ref.name) ? ref.name : fallbackName;
	return {
		attachmentId: ref.attachmentId,
		mediaType: ref.mediaType,
		width: ref.width,
		height: ref.height,
		bytes: ref.bytes,
		name
	};
}
function executionKey(exec) {
	return `${String(exec.agent?.id ?? "<no-agent>")}\u0000${String(exec.rootCallId)}\u0000${String(exec.callId)}`;
}
async function generate(ctx, transport, assets, prompt, exec) {
	let response;
	try {
		response = await transport.generateImages({ prompt }, { signal: exec.signal });
	} catch (error) {
		failure(fixedTransportMessage(error));
	}
	const limits = ctx.attachments.imageLimits;
	if (response.images.length < 1 || response.images.length > MAX_IMAGES_PER_RESPONSE || response.images.length > limits.maxImagesPerMessage) failure("The generated image count exceeds this deployment's attachment limit.");
	let estimatedTotal = 0;
	const estimates = [];
	for (const image of response.images) {
		const estimate = estimateBase64Bytes(image.b64Json);
		if (estimate === void 0) failure("The image generation response contained invalid image data.");
		if (estimate > limits.maxImageBytes) failure("A generated image exceeds this deployment's byte limit.");
		estimatedTotal += estimate;
		if (!Number.isSafeInteger(estimatedTotal) || estimatedTotal > limits.maxMessageImageBytes) failure("The generated image batch exceeds this deployment's byte limit.");
		estimates.push(estimate);
	}
	const inputs = [];
	const parsedImages = [];
	for (const [index, image] of response.images.entries()) {
		const data = decodeStrictBase64(image.b64Json);
		if (data === void 0 || data.byteLength !== estimates[index]) failure("The image generation response contained invalid image data.");
		const parsed = detectEncodedImage(data);
		if (parsed === void 0) failure("Generated images must be valid PNG, JPEG, or WebP files.");
		if (!limits.mediaTypes.includes(parsed.mediaType)) failure(`${parsed.mediaType} images are disabled by this deployment.`);
		if (parsed.width * parsed.height > limits.maxImagePixels) failure("A generated image exceeds this deployment's pixel limit.");
		const name = `codex-image-${String(index + 1)}.${extension(parsed.mediaType)}`;
		parsedImages.push(parsed);
		inputs.push({
			data,
			mediaType: parsed.mediaType,
			name
		});
	}
	const sessionId = exec.agent?.id;
	if (sessionId === void 0) failure("Image generation requires a session-owned tool call.");
	let originals;
	try {
		originals = await assets.saveImages(String(sessionId), inputs.map((input, index) => {
			const parsed = parsedImages[index];
			if (parsed === void 0 || input.name === void 0) failure("The generated image batch is incomplete.");
			return {
				data: input.data,
				mediaType: parsed.mediaType,
				width: parsed.width,
				height: parsed.height,
				name: input.name
			};
		}));
	} catch {
		failure("The generated original images could not be saved.");
	}
	let refs;
	try {
		refs = await ctx.attachments.saveImages(inputs);
	} catch {
		await assets.removeImages(originals);
		failure("The generated images could not be saved; no attachment references were returned.");
	}
	if (refs.length !== inputs.length || originals.length !== inputs.length) {
		await assets.removeImages(originals);
		failure("The image stores returned an incomplete image batch.");
	}
	try {
		return { images: refs.map((ref, index) => {
			const original = originals[index];
			const name = inputs[index]?.name;
			if (original === void 0 || name === void 0) failure("The image stores returned an incomplete image batch.");
			return {
				original,
				preview: previewValue(ref, name)
			};
		}) };
	} catch (error) {
		await assets.removeImages(originals);
		throw error;
	}
}
function appendAbortNote(result) {
	if (!result.isError || result.error.info?.code !== TOOL_ABORTED) return void 0;
	if (result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").includes(CANCELED_REQUEST_NOTE)) return void 0;
	return [...result.content, {
		type: "text",
		text: CANCELED_REQUEST_NOTE
	}];
}
/** Build one fiber-owned image tool, including in-flight call deduplication. */
function imageGenerateTool(ctx, assets) {
	const inFlight = /* @__PURE__ */ new Map();
	return defineTool({
		name: IMAGE_GENERATE_TOOL_NAME,
		description: "Generate an image from a text prompt, preserve the exact original, and save a DSH conversation preview. Supports one prompt only; output size and style are service defaults.",
		parameters: { prompt: {
			type: "string",
			required: true,
			description: "A complete description of the image to generate."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { images: {
					type: "array",
					required: true,
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							original: {
								type: "object",
								required: true,
								additionalProperties: false,
								properties: {
									assetId: {
										type: "string",
										required: true
									},
									mediaType: {
										type: "string",
										required: true,
										enum: [
											"image/png",
											"image/jpeg",
											"image/webp"
										]
									},
									width: {
										type: "integer",
										required: true
									},
									height: {
										type: "integer",
										required: true
									},
									bytes: {
										type: "integer",
										required: true
									},
									name: {
										type: "string",
										required: true
									},
									sha256: {
										type: "string",
										required: true
									}
								}
							},
							preview: {
								type: "object",
								required: true,
								additionalProperties: false,
								properties: {
									attachmentId: {
										type: "string",
										required: true
									},
									mediaType: {
										type: "string",
										required: true,
										enum: [
											"image/png",
											"image/jpeg",
											"image/webp"
										]
									},
									width: {
										type: "integer",
										required: true
									},
									height: {
										type: "integer",
										required: true
									},
									bytes: {
										type: "integer",
										required: true
									},
									name: {
										type: "string",
										required: true
									}
								}
							}
						}
					}
				} }
			},
			render: (_args, value) => outputContent(value),
			presentationMeta: (args, value) => ({
				kind: IMAGE_PRESENTATION_KIND,
				schemaVersion: 1,
				prompt: args.prompt.trim(),
				images: value.images
			})
		},
		isConcurrencySafe: () => false,
		finalizeContent: (_exec, result) => appendAbortNote(result),
		async execute(args, exec) {
			if (Object.keys(args).length !== 1 || !Object.hasOwn(args, "prompt")) failure("Image generation accepts only the prompt field.");
			const prompt = args.prompt.trim();
			if (prompt.length === 0 || prompt.length > PROMPT_MAX_LENGTH) failure("Image prompt must contain 1 to 32000 characters.");
			const transport = ctx.reflect.get(TRANSPORT_SERVICE);
			if (transport?.apiVersion !== 1) failure("The Codex Connect image transport is unavailable.");
			const key = executionKey(exec);
			const current = inFlight.get(key);
			if (current !== void 0) return current;
			const pending = generate(ctx, transport, assets, prompt, exec).catch((error) => {
				if (error instanceof SafeToolError) throw error;
				failure(fixedTransportMessage(error));
			}).finally(() => {
				inFlight.delete(key);
			});
			inFlight.set(key, pending);
			return pending;
		}
	});
}
//#endregion
//#region src/public-http.ts
/** Public-network-only HTTP(S) reader used by the optional remote image path. */
/** Maximum time one DNS-plus-HTTP hop may occupy. */
const PUBLIC_HTTP_HOP_TIMEOUT_MS = 3e4;
function blockedList(family, ranges) {
	const list = new BlockList();
	for (const [address, prefix] of ranges) list.addSubnet(address, prefix, family);
	return list;
}
const BLOCKED_IPV4 = blockedList("ipv4", [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4]
]);
const GLOBAL_IPV6 = blockedList("ipv6", [["2000::", 3]]);
const BLOCKED_IPV6 = blockedList("ipv6", [
	["2001::", 32],
	["2001:2::", 48],
	["2001:10::", 28],
	["2001:20::", 28],
	["2001:db8::", 32],
	["2002::", 16]
]);
function unbracket(hostname) {
	return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}
/** Whether an address is ordinary public unicast rather than a local/special target. */
function isPublicNetworkAddress(rawAddress) {
	const address = unbracket(rawAddress);
	if (address.includes("%")) return false;
	const family = isIP(address);
	if (family === 4) return !BLOCKED_IPV4.check(address, "ipv4");
	if (family === 6) return GLOBAL_IPV6.check(address, "ipv6") && !BLOCKED_IPV6.check(address, "ipv6");
	return false;
}
function abortError(signal) {
	return signal.reason instanceof Error ? signal.reason : new Error(signal.reason === void 0 ? "remote image request aborted" : String(signal.reason));
}
function assertTargetUrl(url) {
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("view_image URL must use http or https");
	if (url.username !== "" || url.password !== "") throw new Error("view_image URL must not contain credentials");
}
function normalizeAddress(candidate) {
	if (candidate.family !== 4 && candidate.family !== 6) throw new Error("remote image hostname resolved to an unsupported address family");
	return {
		address: candidate.address,
		family: candidate.family
	};
}
async function resolveHost(hostname, signal) {
	if (signal.aborted) throw abortError(signal);
	const literal = unbracket(hostname);
	const family = isIP(literal);
	if (family === 4 || family === 6) return [{
		address: literal,
		family
	}];
	const results = await lookup(literal, {
		all: true,
		order: "verbatim"
	});
	if (signal.aborted) throw abortError(signal);
	return results.map(normalizeAddress);
}
/** Collect one response body while enforcing declared and streaming size limits. */
async function collectBoundedBytes(body, declaredLength, maxBytes, signal) {
	const declared = declaredLength === void 0 ? NaN : Number(declaredLength);
	if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`remote image exceeds ${String(maxBytes)} bytes`);
	const chunks = [];
	let total = 0;
	for await (const chunk of body) {
		if (signal.aborted) throw abortError(signal);
		const bytes = typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk);
		total += bytes.byteLength;
		if (total > maxBytes) throw new Error(`remote image exceeds ${String(maxBytes)} bytes`);
		chunks.push(bytes);
	}
	const data = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		data.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return data;
}
function pinnedLookup(address) {
	return (_hostname, options, callback) => {
		const resolved = {
			address: address.address,
			family: address.family
		};
		if (options.all === true) callback(null, [resolved]);
		else callback(null, resolved.address, resolved.family);
	};
}
function headerValue(message, name) {
	const value = message.headers[name];
	return Array.isArray(value) ? value[0] : value;
}
async function requestPinned(url, address, maxBytes, signal) {
	if (signal.aborted) throw abortError(signal);
	return new Promise((resolve, reject) => {
		let settled = false;
		let response;
		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal.removeEventListener("abort", onAbort);
			if (result.ok) resolve(result.value);
			else reject(result.error);
		};
		const request$2 = (url.protocol === "https:" ? request$1 : request)(url, {
			method: "GET",
			agent: false,
			lookup: pinnedLookup(address),
			headers: { accept: "image/png, image/jpeg, image/webp, image/gif" }
		}, (incoming) => {
			response = incoming;
			const status = incoming.statusCode ?? 0;
			const location = headerValue(incoming, "location");
			if (status >= 300 && status < 400 || status < 200 || status >= 300) {
				finish({
					ok: true,
					value: {
						status,
						...location === void 0 ? {} : { location }
					}
				});
				incoming.destroy();
				return;
			}
			collectBoundedBytes(incoming, headerValue(incoming, "content-length"), maxBytes, signal).then((data) => {
				finish({
					ok: true,
					value: {
						status,
						data
					}
				});
			}, (error) => {
				incoming.destroy(error instanceof Error ? error : void 0);
				finish({
					ok: false,
					error
				});
			});
		});
		const onAbort = () => {
			const error = abortError(signal);
			response?.destroy(error);
			request$2.destroy(error);
		};
		const timer = setTimeout(() => {
			const error = /* @__PURE__ */ new Error(`remote image request exceeded ${String(PUBLIC_HTTP_HOP_TIMEOUT_MS)}ms`);
			response?.destroy(error);
			request$2.destroy(error);
		}, PUBLIC_HTTP_HOP_TIMEOUT_MS);
		timer.unref();
		signal.addEventListener("abort", onAbort, { once: true });
		request$2.once("error", (error) => {
			finish({
				ok: false,
				error
			});
		});
		request$2.end();
	});
}
/** Production resolver and one-shot agent which pins the validated address. */
const NODE_PUBLIC_HTTP_RUNTIME = {
	resolve: resolveHost,
	get: requestPinned
};
/** Fetch bytes from a public HTTP(S) target, revalidating and repinning each redirect. */
async function fetchPublicHttpResource(source, maxBytes, signal, runtime = NODE_PUBLIC_HTTP_RUNTIME) {
	let url = new URL(source);
	assertTargetUrl(url);
	for (let redirects = 0;; redirects += 1) {
		if (signal.aborted) throw abortError(signal);
		const addresses = await runtime.resolve(url.hostname, signal);
		if (addresses.length === 0 || addresses.some((candidate) => !isPublicNetworkAddress(candidate.address))) throw new Error(`remote image host ${JSON.stringify(url.hostname)} must resolve only to public network addresses`);
		const hop = await runtime.get(url, addresses[0], maxBytes, signal);
		if (hop.status >= 300 && hop.status < 400) {
			if (redirects >= 5) throw new Error(`remote image exceeded ${String(5)} redirects`);
			if (hop.location === void 0) throw new Error(`remote image redirect ${String(hop.status)} has no location`);
			url = new URL(hop.location, url);
			assertTargetUrl(url);
			continue;
		}
		if (hop.status < 200 || hop.status >= 300) throw new Error(`remote image request failed with HTTP ${String(hop.status)}`);
		if (hop.data === void 0) throw new Error("remote image response did not contain a body");
		const name = basename(url.pathname) || void 0;
		return {
			data: hop.data,
			display: url.href,
			...name === void 0 ? {} : { name }
		};
	}
}
//#endregion
//#region src/view-image.ts
/** Codex-compatible `view_image` tool for local paths and HTTP(S) URLs. */
/** Stable Codex tool name. */
const VIEW_IMAGE_TOOL_NAME = "view_image";
function refOf(image) {
	return {
		attachmentId: AttachmentId(image.attachmentId),
		mediaType: image.mediaType,
		bytes: image.bytes,
		width: image.width,
		height: image.height,
		...image.name === void 0 ? {} : { name: image.name }
	};
}
function contentOf(value) {
	return [{
		type: "text",
		text: `<source>${value.source}</source>\n<image>${value.image.mediaType}, ${value.image.width}x${value.image.height} px, ${value.image.bytes} bytes</image>`
	}, {
		type: "image",
		attachment: refOf(value.image)
	}];
}
function mediaTypeOf(data) {
	if (data.length >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 && data[4] === 13 && data[5] === 10 && data[6] === 26 && data[7] === 10) return "image/png";
	if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
	if (data.length >= 6) {
		const signature = String.fromCharCode(...data.subarray(0, 6));
		if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
	}
	if (data.length >= 12 && String.fromCharCode(...data.subarray(0, 4)) === "RIFF" && String.fromCharCode(...data.subarray(8, 12)) === "WEBP") return "image/webp";
}
async function assertImageCapable(ctx, exec, source) {
	const configured = exec.agent?.session.requestHeader()?.config;
	const provider = configured?.provider ?? exec.agent?.options.provider;
	const model = configured?.model ?? exec.agent?.options.model;
	if (provider === void 0 || model === void 0) throw new Error(`cannot view ${JSON.stringify(source)}: the current model route is unavailable`);
	const info = await ctx.llm.resolveModelInfo(provider, model, exec.signal);
	if (info.inputModalities === void 0 || !info.inputModalities.includes("image")) throw new Error(`cannot view ${JSON.stringify(source)}: model "${model}" does not declare image input`);
}
/** Build the plugin-owned image viewing tool. */
function viewImageTool(ctx) {
	return defineTool({
		name: VIEW_IMAGE_TOOL_NAME,
		description: "View an image from a local file path or an http(s) URL. Returns the actual PNG, JPEG, WebP, or GIF image to vision-capable models.",
		parameters: { source: {
			type: "string",
			required: true,
			description: "Local absolute/relative image path, or an http(s) image URL."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					source: {
						type: "string",
						required: true
					},
					image: {
						type: "object",
						required: true,
						additionalProperties: false,
						properties: {
							attachmentId: {
								type: "string",
								required: true
							},
							mediaType: {
								type: "string",
								required: true,
								enum: [
									"image/png",
									"image/jpeg",
									"image/webp",
									"image/gif"
								]
							},
							bytes: {
								type: "integer",
								required: true
							},
							width: {
								type: "integer",
								required: true
							},
							height: {
								type: "integer",
								required: true
							},
							name: { type: "string" }
						}
					}
				}
			},
			render: (_args, value) => contentOf(value)
		},
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			const source = args.source.trim();
			if (source.length === 0) throw new Error("view_image source must not be empty");
			await assertImageCapable(ctx, exec, source);
			const attachments = ctx.attachments;
			const maxBytes = Math.min(attachments.imageLimits.maxImageBytes, attachments.imageLimits.maxMessageImageBytes);
			let loaded;
			if (/^https?:\/\//iu.test(source)) loaded = await fetchPublicHttpResource(source, maxBytes, exec.signal);
			else {
				const cwd = exec.agent?.session.header.cwd;
				const target = await ctx.fs.resolve(source, {
					...cwd === void 0 ? {} : { cwd },
					signal: exec.signal
				});
				const info = await ctx.fs.stat(target, exec.signal);
				if (info === void 0) throw new Error(`image path does not exist: ${source}`);
				if (info.type !== "file") throw new Error(`image path is not a regular file: ${source}`);
				loaded = {
					data: await ctx.fs.readBytes(target, exec.signal, maxBytes),
					display: target.displayPath,
					name: basename(target.displayPath)
				};
				ctx.emit("fs/observed", target, {
					kind: "present",
					version: info.version
				}, exec);
			}
			const mediaType = mediaTypeOf(loaded.data);
			if (mediaType === void 0) throw new Error("view_image supports PNG, JPEG, WebP, and GIF image bytes");
			if (!attachments.imageLimits.mediaTypes.includes(mediaType)) throw new Error(`${mediaType} images are disabled by this deployment`);
			const ref = await attachments.saveImage({
				data: loaded.data,
				mediaType,
				...loaded.name === void 0 ? {} : { name: loaded.name }
			});
			const value = {
				source: loaded.display,
				image: {
					attachmentId: ref.attachmentId,
					mediaType: ref.mediaType,
					bytes: ref.bytes,
					width: ref.width,
					height: ref.height,
					...ref.name === void 0 ? {} : { name: ref.name }
				}
			};
			if (exec.parent !== void 0) exec.deferContext(createUserMessage({
				content: contentOf(value),
				source: {
					kind: "plugin",
					plugin: "dsh-codex-connect"
				}
			}));
			return value;
		},
		presentCall: (args) => ({
			card: "generic",
			title: `View image ${args.source}`,
			kind: /^https?:\/\//iu.test(args.source) ? "fetch" : "read",
			.../^https?:\/\//iu.test(args.source) ? { rawInput: args.source } : { locations: [{ path: args.source }] }
		})
	});
}
//#endregion
//#region src/transport.ts
/** Fixed, bounded OAuth transport shared with optional Codex image capabilities. */
/** Cordis service name owned by the core plugin fiber. */
const OPENAI_CODEX_TRANSPORT_SERVICE = "openaiCodexTransport";
/** Structured contract version used across the core and companion packages. */
const OPENAI_CODEX_TRANSPORT_API_VERSION = 1;
/** Stage-zero verified image-generation endpoint. */
const OPENAI_CODEX_IMAGE_GENERATION_URL = "https://chatgpt.com/backend-api/codex/images/generations";
/** Network deadline covering the request and bounded response read. */
const OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS = 12e4;
/** Maximum accepted success-body size: 48 MiB. */
const OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES = 50331648;
/** Maximum error-body size read and discarded: 64 KiB. */
const OPENAI_CODEX_IMAGE_MAX_ERROR_BYTES = 65536;
/** Defensive upper bound for unexpected multi-image responses. */
const OPENAI_CODEX_IMAGE_MAX_COUNT = 4;
/** Local prompt limit enforced before any credential or network work. */
const OPENAI_CODEX_IMAGE_PROMPT_MAX_LENGTH = 32e3;
/** Internal, unverified route hint. It is intentionally not exported. */
const IMAGE_ROUTE_HINT_MODEL = "gpt-image-2";
/** Stable, secret-free transport errors consumed structurally by companion packages. */
const OPENAI_CODEX_TRANSPORT_ERROR_CODES = {
	invalidRequest: "OPENAI_CODEX_INVALID_REQUEST",
	signedOut: "OPENAI_CODEX_SIGNED_OUT",
	reauthRequired: OPENAI_CODEX_REAUTH_REQUIRED_CODE,
	rateLimited: "OPENAI_CODEX_RATE_LIMITED",
	upstreamRejected: "OPENAI_CODEX_UPSTREAM_REJECTED",
	upstreamUnavailable: "OPENAI_CODEX_UPSTREAM_UNAVAILABLE",
	redirectRejected: "OPENAI_CODEX_REDIRECT_REJECTED",
	timeout: "OPENAI_CODEX_TIMEOUT",
	canceled: "OPENAI_CODEX_CANCELED",
	networkError: "OPENAI_CODEX_NETWORK_ERROR",
	responseTooLarge: "OPENAI_CODEX_RESPONSE_TOO_LARGE",
	malformedResponse: "OPENAI_CODEX_MALFORMED_RESPONSE"
};
const TRANSPORT_ERROR_CODES = new Set(Object.values(OPENAI_CODEX_TRANSPORT_ERROR_CODES));
const ERROR_MESSAGES = {
	OPENAI_CODEX_INVALID_REQUEST: "The Codex image request is invalid",
	OPENAI_CODEX_SIGNED_OUT: "OpenAI Codex is signed out",
	OPENAI_CODEX_REAUTH_REQUIRED: "OpenAI Codex authorization must be renewed",
	OPENAI_CODEX_RATE_LIMITED: "The Codex image endpoint is rate limited",
	OPENAI_CODEX_UPSTREAM_REJECTED: "The Codex image endpoint rejected the request",
	OPENAI_CODEX_UPSTREAM_UNAVAILABLE: "The Codex image endpoint is unavailable",
	OPENAI_CODEX_REDIRECT_REJECTED: "The Codex image endpoint returned a redirect",
	OPENAI_CODEX_TIMEOUT: "The Codex image request timed out and may still be processing",
	OPENAI_CODEX_CANCELED: "The Codex image request was canceled and may still be processing",
	OPENAI_CODEX_NETWORK_ERROR: "The Codex image request failed before a response was received",
	OPENAI_CODEX_RESPONSE_TOO_LARGE: "The Codex image response exceeded the safe size limit",
	OPENAI_CODEX_MALFORMED_RESPONSE: "The Codex image endpoint returned an unreadable response"
};
/** Fixed, secret-free transport failure. */
var OpenAICodexTransportError = class extends Error {
	code;
	status;
	retryAfterSeconds;
	constructor(code, options = {}) {
		super(ERROR_MESSAGES[code]);
		this.name = "OpenAICodexTransportError";
		this.code = code;
		if (options.status !== void 0) this.status = options.status;
		if (options.retryAfterSeconds !== void 0) this.retryAfterSeconds = options.retryAfterSeconds;
	}
};
/** Identify transport failures structurally without relying on cross-package class identity. */
function isOpenAICodexTransportError(error) {
	if (typeof error !== "object" || error === null || Array.isArray(error)) return false;
	const code = error["code"];
	return typeof code === "string" && TRANSPORT_ERROR_CODES.has(code);
}
function responseTooLarge() {
	return new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.responseTooLarge);
}
/** Read a response body without ever retaining more than `maxBytes`. */
async function readOpenAICodexBoundedBody(response, maxBytes) {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new TypeError("maxBytes must be a non-negative safe integer");
	const declared = response.headers.get("content-length");
	if (declared !== null && /^\d+$/u.test(declared) && Number(declared) > maxBytes) throw responseTooLarge();
	if (response.body === null) return /* @__PURE__ */ new Uint8Array();
	const reader = response.body.getReader();
	const chunks = [];
	let length = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > maxBytes) {
				await reader.cancel();
				throw responseTooLarge();
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const output = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}
function retryAfterSeconds(response) {
	const value = response.headers.get("retry-after");
	if (value === null || !/^\d+$/u.test(value)) return void 0;
	const seconds = Number(value);
	return Number.isSafeInteger(seconds) ? seconds : void 0;
}
function statusError(response) {
	const options = { status: response.status };
	const retryAfter = response.status === 429 ? retryAfterSeconds(response) : void 0;
	if (retryAfter !== void 0) options.retryAfterSeconds = retryAfter;
	if (response.type === "opaqueredirect" || response.status === 0 || response.status >= 300 && response.status < 400) return new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.redirectRejected, options);
	if (response.status === 401 || response.status === 403) return new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.reauthRequired, options);
	if (response.status === 429) return new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.rateLimited, options);
	if (response.status >= 400 && response.status < 500) return new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.upstreamRejected, options);
	return new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.upstreamUnavailable, options);
}
function isAborted(signal) {
	return signal?.aborted === true;
}
function parseSuccess(bytes) {
	let value;
	try {
		value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse);
	const data = value["data"];
	if (!Array.isArray(data) || data.length === 0 || data.length > 4) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse);
	const images = [];
	for (const item of data) {
		if (typeof item !== "object" || item === null || Array.isArray(item)) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse);
		const b64Json = item["b64_json"];
		if (typeof b64Json !== "string" || b64Json.length === 0) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse);
		images.push({ b64Json });
	}
	return images;
}
/** Core-owned Cordis service for the optional image package. */
var OpenAICodexTransport = class extends Service {
	credentials;
	proxyManager;
	resolveProxyUrl;
	apiVersion = 1;
	models;
	constructor(ctx, credentials, proxyManager, resolveProxyUrl = () => void 0) {
		super(ctx, OPENAI_CODEX_TRANSPORT_SERVICE);
		this.credentials = credentials;
		this.proxyManager = proxyManager;
		this.resolveProxyUrl = resolveProxyUrl;
		this.models = createModels({ credentials });
		this.models.setProvider(openaiCodexProvider());
	}
	async generateImages(input, context) {
		const operation = () => this.generateImagesWithoutProxy(input, context);
		return this.proxyManager?.run(this.resolveProxyUrl(), operation) ?? operation();
	}
	async generateImagesWithoutProxy(input, context) {
		if (typeof input?.prompt !== "string" || input.prompt.trim().length === 0 || input.prompt.length > 32e3) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.invalidRequest);
		if (isAborted(context.signal)) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.canceled);
		if ((await this.credentials.read("openai-codex"))?.type !== "oauth") throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.signedOut);
		let auth;
		try {
			auth = await this.models.getAuth(OPENAI_CODEX_PROVIDER);
		} catch {
			throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.reauthRequired);
		}
		const refreshed = await this.credentials.read(OPENAI_CODEX_PROVIDER);
		const access = auth?.auth.apiKey;
		const accountId = refreshed?.type === "oauth" ? refreshed.accountId : void 0;
		if (typeof access !== "string" || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.reauthRequired);
		if (isAborted(context.signal)) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.canceled);
		const traceId = randomUUID();
		const startedAt = Date.now();
		const controller = new AbortController();
		let timedOut = false;
		const onCallerAbort = () => controller.abort();
		context.signal?.addEventListener("abort", onCallerAbort, { once: true });
		if (isAborted(context.signal)) controller.abort();
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS);
		try {
			const response = await fetch(OPENAI_CODEX_IMAGE_GENERATION_URL, {
				method: "POST",
				redirect: "manual",
				signal: controller.signal,
				headers: {
					authorization: `Bearer ${access}`,
					"chatgpt-account-id": accountId,
					"content-type": "application/json",
					accept: "application/json",
					"user-agent": "dsh-codex-connect"
				},
				body: JSON.stringify({
					model: IMAGE_ROUTE_HINT_MODEL,
					prompt: input.prompt
				})
			});
			if (!response.ok) {
				try {
					await readOpenAICodexBoundedBody(response, OPENAI_CODEX_IMAGE_MAX_ERROR_BYTES);
				} catch {}
				throw statusError(response);
			}
			if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.malformedResponse);
			const bytes = await readOpenAICodexBoundedBody(response, OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES);
			const images = parseSuccess(bytes);
			return {
				apiVersion: 1,
				traceId,
				elapsedMs: Date.now() - startedAt,
				responseBytes: bytes.byteLength,
				images
			};
		} catch (error) {
			if (isOpenAICodexTransportError(error)) throw error;
			if (isAborted(context.signal)) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.canceled);
			if (timedOut) throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.timeout);
			throw new OpenAICodexTransportError(OPENAI_CODEX_TRANSPORT_ERROR_CODES.networkError);
		} finally {
			clearTimeout(timer);
			context.signal?.removeEventListener("abort", onCallerAbort);
		}
	}
};
//#endregion
//#region src/image-assets.ts
/** Owner-only storage for exact GPT Image output bytes. */
/** Versioned plugin-owned root below DSH_HOME; this is not the DSH attachment store. */
const OPENAI_CODEX_IMAGE_ASSET_DIRECTORY = "dsh-codex-connect/images/v1";
const METADATA_VERSION = 1;
const ORIGINAL_FILENAME = "original";
const METADATA_FILENAME = "metadata.json";
const SAFE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
function digest(data) {
	return createHash("sha256").update(data).digest("hex");
}
function positiveSafeInteger(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function mediaType(value) {
	return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}
function validSessionId(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 512;
}
function parseDocument(text) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		return;
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const candidate = value;
	if (candidate.version !== METADATA_VERSION || !validSessionId(candidate.sessionId)) return void 0;
	const image = decodeOpenAICodexOriginalImageRef(candidate.image);
	return image === void 0 ? void 0 : {
		version: METADATA_VERSION,
		sessionId: candidate.sessionId,
		image
	};
}
async function assertOwnerFile(filename) {
	const metadata = await lstat(filename);
	if (!metadata.isFile()) throw new Error("original image object is not a regular file");
	/* v8 ignore next -- native Windows does not expose POSIX permission semantics. */
	if (process.platform !== "win32" && (metadata.mode & 63) !== 0) throw new Error("original image object is readable beyond its owner");
}
async function writeBinaryFile(filename, data) {
	await mkdir(dirname(filename), {
		recursive: true,
		mode: 448
	});
	const handle = await open(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 384);
	try {
		await handle.writeFile(data);
		await handle.sync();
	} finally {
		await handle.close();
	}
}
/** Exact-byte image store kept separate from DSH's deliberately normalized attachments. */
var OpenAICodexImageAssetStore = class {
	root;
	constructor(dshHome) {
		this.root = resolve(join(resolveDshHome(dshHome), OPENAI_CODEX_IMAGE_ASSET_DIRECTORY));
	}
	directory(assetId) {
		if (!OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN.test(assetId)) throw new TypeError("invalid original image asset id");
		return join(this.root, assetId.slice(4, 6), assetId);
	}
	async saveOne(sessionId, input) {
		if (!validSessionId(sessionId)) throw new TypeError("invalid original image session id");
		if (!(input.data instanceof Uint8Array) || input.data.byteLength < 1 || input.data.byteLength > 50331648 || !mediaType(input.mediaType) || !positiveSafeInteger(input.width) || !positiveSafeInteger(input.height) || !SAFE_NAME_PATTERN.test(input.name)) throw new TypeError("invalid original image input");
		const detected = detectEncodedImage(input.data);
		if (detected === void 0 || detected.mediaType !== input.mediaType || detected.width !== input.width || detected.height !== input.height) throw new TypeError("original image bytes do not match their declared metadata");
		const assetId = `img_${randomUUID().replaceAll("-", "")}`;
		const directory = this.directory(assetId);
		const ref = {
			assetId,
			mediaType: input.mediaType,
			width: input.width,
			height: input.height,
			bytes: input.data.byteLength,
			name: input.name,
			sha256: digest(input.data)
		};
		try {
			await mkdir(dirname(directory), {
				recursive: true,
				mode: 448
			});
			await mkdir(directory, {
				recursive: false,
				mode: 448
			});
			await writeBinaryFile(join(directory, ORIGINAL_FILENAME), input.data);
			const document = {
				version: METADATA_VERSION,
				sessionId,
				image: ref
			};
			await writeFileAtomic(join(directory, METADATA_FILENAME), `${JSON.stringify(document, null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
			return ref;
		} catch (error) {
			await rm(directory, {
				recursive: true,
				force: true
			}).catch(() => void 0);
			throw error;
		}
	}
	/** Save one complete response batch and remove already-written members if a later write fails. */
	async saveImages(sessionId, inputs) {
		if (inputs.length < 1 || inputs.length > 4) throw new TypeError("original image batch must contain 1 to 4 images");
		const refs = [];
		try {
			for (const input of inputs) refs.push(await this.saveOne(sessionId, input));
			return refs;
		} catch (error) {
			await this.removeImages(refs);
			throw error;
		}
	}
	/** Remove exact assets created by a failed cross-store operation. */
	async removeImages(refs) {
		await Promise.all(refs.map(async (ref) => {
			try {
				await rm(this.directory(ref.assetId), {
					recursive: true,
					force: true
				});
			} catch {}
		}));
	}
	/**
	* Read verified bytes for the owner or a server-authorized inherited reference.
	* @param sessionId - requesting session.
	* @param assetId - opaque original identifier.
	* @param inherited - reference resolved from the session's immutable fork prefix, never request data.
	* @returns the exact original, or undefined for denied access or invalid files.
	*/
	async read(sessionId, assetId, inherited) {
		if (!validSessionId(sessionId) || !OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN.test(assetId)) return void 0;
		const directory = this.directory(assetId);
		const metadataPath = join(directory, METADATA_FILENAME);
		const originalPath = join(directory, ORIGINAL_FILENAME);
		try {
			await Promise.all([assertOwnerFile(metadataPath), assertOwnerFile(originalPath)]);
			const document = parseDocument(await readFile(metadataPath, "utf8"));
			if (document === void 0 || document.image.assetId !== assetId) return void 0;
			if (document.sessionId !== sessionId && (inherited === void 0 || inherited.assetId !== document.image.assetId || inherited.sha256 !== document.image.sha256 || inherited.mediaType !== document.image.mediaType || inherited.width !== document.image.width || inherited.height !== document.image.height || inherited.bytes !== document.image.bytes || inherited.name !== document.image.name)) return void 0;
			const data = new Uint8Array(await readFile(originalPath));
			const detected = detectEncodedImage(data);
			if (data.byteLength !== document.image.bytes || digest(data) !== document.image.sha256 || detected === void 0 || detected.mediaType !== document.image.mediaType || detected.width !== document.image.width || detected.height !== document.image.height) return void 0;
			return {
				ref: document.image,
				data
			};
		} catch {
			return;
		}
	}
};
//#endregion
//#region src/search.ts
/**
* OpenAI Codex standalone web search over the dsh web provider seam.
* @module dsh-codex-connect/search
*/
/** Stable dsh web-provider id selected by the bundle patch. */
const OPENAI_CODEX_SEARCH_PROVIDER = OPENAI_CODEX_PROVIDER;
/** Trusted first-party Codex base; OAuth credentials never cross to a configured origin. */
const OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
/** Standalone search endpoint used by the official Codex client. */
const OPENAI_CODEX_SEARCH_URL = `${OPENAI_CODEX_BASE_URL}/alpha/search`;
/** Convert the configured mode to the official endpoint field. */
function externalWebAccess(mode) {
	switch (mode) {
		case "cached": return false;
		case "indexed": return "indexed";
		case "live": return true;
	}
}
/** Extract the account id paired with one OAuth access token. */
function accountIdFromToken(access) {
	try {
		const parts = access.split(".");
		if (parts.length !== 3 || parts[1] === void 0) throw new Error("invalid JWT");
		const auth = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))["https://api.openai.com/auth"];
		if (typeof auth !== "object" || auth === null || Array.isArray(auth)) throw new Error("missing auth claim");
		const accountId = auth["chatgpt_account_id"];
		if (typeof accountId !== "string" || accountId.length === 0) throw new Error("missing account id");
		return accountId;
	} catch (error) {
		throw new WebError("OpenAI Codex search credential has no usable account id; run \"dsh openai-codex login\" again", "WEB_PROVIDER_CREDENTIAL_MISSING", { cause: error });
	}
}
/** Whether an opaque value is a non-array record. */
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Read an optional non-empty string field. */
function optionalString(record, key) {
	const value = record[key];
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
/** Accept only citeable HTTP(S) URLs from opaque result DTOs. */
function citeableUrl(value) {
	if (typeof value !== "string") return void 0;
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:" ? value : void 0;
	} catch {
		return;
	}
}
/**
* Map the standalone endpoint's forward-compatible result DTOs into the dsh
* web result. Unknown DTO types and fields are ignored; malformed envelope
* fields fail at the network boundary.
* @param value - parsed response JSON.
* @returns normalized answer and citeable sources.
*/
function mapOpenAICodexSearchResponse(value) {
	if (!isRecord(value) || typeof value["output"] !== "string") throw new WebError("OpenAI Codex returned a search response without string output", "WEB_PROVIDER_ERROR");
	const output = value["output"];
	const rawResults = value["results"];
	if (rawResults !== void 0 && !Array.isArray(rawResults)) throw new WebError("OpenAI Codex returned a search response with non-array results", "WEB_PROVIDER_ERROR");
	const sources = [];
	const seen = /* @__PURE__ */ new Set();
	for (const item of rawResults ?? []) {
		if (!isRecord(item) || item["type"] !== "text_result") continue;
		const url = citeableUrl(item["url"]);
		if (url === void 0 || seen.has(url)) continue;
		seen.add(url);
		const title = optionalString(item, "title");
		const snippet = optionalString(item, "snippet");
		sources.push({
			url,
			...title === void 0 ? {} : { title },
			...snippet === void 0 ? {} : { snippet }
		});
	}
	return {
		...output.length === 0 ? {} : { content: output },
		sources,
		truncated: false
	};
}
/** Stable cancellation error for every provider phase. */
function searchAborted(signal, fallback) {
	return new WebError("OpenAI Codex search aborted", "WEB_ABORTED", { cause: signal?.aborted === true ? signal.reason : fallback });
}
/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal) {
	if (signal?.aborted === true) throw searchAborted(signal);
}
/** True for native fetch cancellation. */
function isAbortError(error) {
	return error instanceof DOMException && error.name === "AbortError";
}
/** Race an asynchronous auth refresh against caller cancellation. */
function abortable(operation, signal) {
	if (signal === void 0) return operation;
	if (signal.aborted) return Promise.reject(searchAborted(signal));
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			reject(searchAborted(signal));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then((value) => {
			signal.removeEventListener("abort", onAbort);
			resolve(value);
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			reject(error);
		});
	});
}
/** Keep provider diagnostics bounded and remove JWT-like material. */
function providerMessage(value) {
	if (!isRecord(value)) return void 0;
	const error = value["error"];
	return (typeof error === "string" ? error : isRecord(error) && typeof error["message"] === "string" ? error["message"] : typeof value["message"] === "string" ? value["message"] : void 0)?.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[REDACTED]").slice(0, 1e3);
}
/** OpenAI Codex standalone-search provider using the same refreshable OAuth store as the LLM route. */
var OpenAICodexSearchProvider = class {
	options;
	id = OPENAI_CODEX_SEARCH_PROVIDER;
	models;
	/**
	* @param options - fixed trusted endpoint policy and deployment tunables.
	*/
	constructor(options) {
		this.options = options;
		const models = createModels({ credentials: options.credentials });
		models.setProvider(openaiCodexProvider());
		this.models = models;
	}
	/** The local configuration is usable; credential presence is resolved per request. */
	available() {
		return this.options.model.length > 0 && Number.isInteger(this.options.maxOutputTokens) && this.options.maxOutputTokens > 0;
	}
	/** @inheritdoc */
	async search(request, signal) {
		const operation = () => this.searchWithoutProxy(request, signal);
		return this.options.proxyManager?.run(this.options.resolveProxyUrl?.(), operation) ?? operation();
	}
	async searchWithoutProxy(request, signal) {
		throwIfSearchAborted(signal);
		let auth;
		try {
			auth = await abortable(this.models.getAuth(OPENAI_CODEX_PROVIDER), signal);
		} catch (error) {
			throwIfSearchAborted(signal);
			if (isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError("OpenAI Codex search credential resolution failed", "WEB_PROVIDER_ERROR", { cause: error });
		}
		const access = auth?.auth.apiKey;
		if (access === void 0 || access.length === 0) throw new WebError("OpenAI Codex search is signed out; run \"dsh openai-codex login\"", "WEB_PROVIDER_CREDENTIAL_MISSING");
		const accountId = accountIdFromToken(access);
		throwIfSearchAborted(signal);
		const body = {
			id: this.options.resolveRequestId(),
			model: this.options.model,
			input: [{
				type: "message",
				role: "user",
				content: [{
					type: "input_text",
					text: request.query
				}]
			}],
			commands: { search_query: [{ q: request.query }] },
			settings: {
				search_context_size: this.options.contextSize,
				allowed_callers: ["direct"],
				external_web_access: externalWebAccess(this.options.mode)
			},
			max_output_tokens: this.options.maxOutputTokens
		};
		this.options.recordRequest?.({
			endpoint: OPENAI_CODEX_SEARCH_URL,
			body
		});
		throwIfSearchAborted(signal);
		let response;
		try {
			response = await fetch(OPENAI_CODEX_SEARCH_URL, {
				method: "POST",
				redirect: "error",
				headers: {
					authorization: `Bearer ${access}`,
					"chatgpt-account-id": accountId,
					"content-type": "application/json",
					accept: "application/json",
					originator: "deepseek-harness"
				},
				body: JSON.stringify(body),
				...signal === void 0 ? {} : { signal }
			});
		} catch (error) {
			throwIfSearchAborted(signal);
			if (isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError("OpenAI Codex search request failed", "WEB_PROVIDER_ERROR", { cause: error });
		}
		let payload;
		try {
			payload = await response.json();
		} catch (error) {
			throwIfSearchAborted(signal);
			if (isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`OpenAI Codex returned an unprocessable search response (HTTP ${response.status})`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!response.ok) {
			const detail = providerMessage(payload);
			const message = detail === void 0 ? `OpenAI Codex search failed (HTTP ${response.status})` : `OpenAI Codex search failed (HTTP ${response.status}): ${detail}`;
			throw new WebError(response.status === 401 || response.status === 403 ? `${message}; run "dsh openai-codex login" again` : message, response.status === 401 || response.status === 403 ? "WEB_PROVIDER_CREDENTIAL_MISSING" : "WEB_PROVIDER_ERROR");
		}
		return mapOpenAICodexSearchResponse(payload);
	}
};
//#endregion
//#region src/history-migration.ts
/** Offline compatibility migration for the private Codex search event emitted by Alpha 4.10. */
/** Private event written by Alpha 4.10 before the provider stopped persisting it. */
const OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT = "web/openai-codex-search-llm-request";
/** Backup suffix created beside every changed session artifact. */
const OPENAI_CODEX_HISTORY_BACKUP_SUFFIX = ".pre-codex-search-history-migration";
const ZSTD_MAGIC = 4247762216;
const CHECKSUM_OPTIONS = { params: { [constants$1.ZSTD_c_checksumFlag]: 1 } };
const STABLE_READ_ATTEMPTS = 3;
function scanZstdFrames(buffer) {
	const frames = [];
	let offset = 0;
	while (offset < buffer.length) {
		const start = offset;
		if (buffer.length - offset < 4) throw new Error(`incomplete Zstandard frame magic at byte ${offset}`);
		if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`invalid Zstandard frame magic at byte ${offset}`);
		offset += 4;
		if (offset === buffer.length) throw new Error(`incomplete Zstandard frame descriptor at byte ${offset}`);
		const descriptor = buffer.readUInt8(offset);
		offset += 1;
		if ((descriptor & 24) !== 0) throw new Error(`reserved Zstandard frame-header bit at byte ${offset - 1}`);
		const contentSizeFlag = descriptor >>> 6;
		const singleSegment = (descriptor & 32) !== 0;
		const checksum = (descriptor & 4) !== 0;
		const dictionaryFlag = descriptor & 3;
		const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
		const contentSizeBytes = contentSizeFlag === 0 ? singleSegment ? 1 : 0 : 1 << contentSizeFlag;
		const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
		if (buffer.length - offset < remainingHeaderBytes) throw new Error(`incomplete Zstandard frame header at byte ${start}`);
		offset += remainingHeaderBytes;
		for (;;) {
			if (buffer.length - offset < 3) throw new Error(`incomplete Zstandard block header at byte ${offset}`);
			const blockHeader = buffer.readUIntLE(offset, 3);
			offset += 3;
			const lastBlock = (blockHeader & 1) !== 0;
			const blockType = blockHeader >>> 1 & 3;
			const blockSize = blockHeader >>> 3;
			if (blockType === 3) throw new Error(`reserved Zstandard block type at byte ${offset - 3}`);
			const payloadBytes = blockType === 1 ? 1 : blockSize;
			if (buffer.length - offset < payloadBytes) throw new Error(`incomplete Zstandard block payload at byte ${offset}`);
			offset += payloadBytes;
			if (lastBlock) break;
		}
		if (checksum) {
			if (buffer.length - offset < 4) throw new Error(`incomplete Zstandard checksum at byte ${offset}`);
			offset += 4;
		}
		frames.push({
			start,
			end: offset
		});
	}
	return frames;
}
function markLegacyEventIgnorable(line) {
	let record;
	try {
		record = JSON.parse(line);
	} catch {
		return;
	}
	if (typeof record !== "object" || record === null || Array.isArray(record)) return void 0;
	const event = record;
	if (event["type"] !== "web/openai-codex-search-llm-request" || event["ignorable"] === true) return void 0;
	if (event["ignorable"] !== void 0) throw new Error(`legacy Codex search event seq ${String(event["seq"])} has an unexpected ignorable value`);
	let objectEnd = line.length - 1;
	while (objectEnd >= 0 && /\s/u.test(line[objectEnd] ?? "")) objectEnd -= 1;
	if (line[objectEnd] !== "}") throw new Error(`legacy Codex search event seq ${String(event["seq"])} is not a JSON object`);
	return `${line.slice(0, objectEnd)},"ignorable":true${line.slice(objectEnd)}`;
}
function rewriteFrame(frame) {
	const lines = zstdDecompressSync(frame).toString("utf8").split("\n");
	let changedEvents = 0;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (line === void 0 || line.length === 0) continue;
		const migrated = markLegacyEventIgnorable(line);
		if (migrated === void 0) continue;
		lines[index] = migrated;
		changedEvents += 1;
	}
	if (changedEvents === 0) return {
		frame,
		changedEvents
	};
	return {
		frame: zstdCompressSync(Buffer.from(lines.join("\n")), CHECKSUM_OPTIONS),
		changedEvents
	};
}
function validateMigration(original, migrated, expectedChanges) {
	const beforeFrames = scanZstdFrames(original);
	const afterFrames = scanZstdFrames(migrated);
	if (beforeFrames.length !== afterFrames.length) throw new Error("Zstandard frame count changed during migration");
	let changes = 0;
	for (let index = 0; index < beforeFrames.length; index += 1) {
		const beforeRange = beforeFrames[index];
		const afterRange = afterFrames[index];
		if (beforeRange === void 0 || afterRange === void 0) throw new Error("missing Zstandard frame during validation");
		const beforeLines = zstdDecompressSync(original.subarray(beforeRange.start, beforeRange.end)).toString("utf8").split("\n");
		const afterLines = zstdDecompressSync(migrated.subarray(afterRange.start, afterRange.end)).toString("utf8").split("\n");
		if (beforeLines.length !== afterLines.length) throw new Error(`logical line count changed in frame ${index}`);
		for (let line = 0; line < beforeLines.length; line += 1) {
			if (beforeLines[line] === afterLines[line]) continue;
			const expected = markLegacyEventIgnorable(beforeLines[line] ?? "");
			if (expected === void 0) throw new Error(`non-target record changed in frame ${index}, line ${line + 1}`);
			if (afterLines[line] !== expected) throw new Error(`legacy event changed beyond its ignorable marker in frame ${index}, line ${line + 1}`);
			changes += 1;
		}
	}
	if (changes !== expectedChanges) throw new Error(`validated ${changes} changes, expected ${expectedChanges}`);
}
function revision(metadata) {
	return [
		metadata.dev,
		metadata.ino,
		metadata.size,
		metadata.mtimeNs,
		metadata.ctimeNs
	].join(":");
}
async function readStableFile(path) {
	for (let attempt = 0; attempt < STABLE_READ_ATTEMPTS; attempt += 1) {
		const before = revision(await stat(path, { bigint: true }));
		const content = await readFile(path);
		if (before === revision(await stat(path, { bigint: true }))) return content;
	}
	throw new Error(`session kept changing during ${STABLE_READ_ATTEMPTS} stable-read attempts: ${path}`);
}
function renderMigration(original) {
	const frames = scanZstdFrames(original);
	const output = [];
	let changedEvents = 0;
	for (const frame of frames) {
		const rewritten = rewriteFrame(original.subarray(frame.start, frame.end));
		output.push(rewritten.frame);
		changedEvents += rewritten.changedEvents;
	}
	const migrated = Buffer.concat(output);
	if (changedEvents > 0) validateMigration(original, migrated, changedEvents);
	return {
		migrated,
		changedEvents
	};
}
async function* sessionArtifacts(root) {
	const pending = [root];
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === void 0) continue;
		let entries;
		try {
			entries = await readdir(current, { withFileTypes: true });
		} catch (error) {
			if (error.code === "ENOENT") continue;
			throw error;
		}
		for (const entry of entries) {
			const path = join(current, entry.name);
			if (entry.isDirectory()) pending.push(path);
			else if (entry.isFile() && entry.name === "session.jsonl.zstd") yield path;
		}
	}
}
async function syncParentDirectory(path) {
	const directory = await open(dirname(path), "r");
	try {
		await directory.sync();
	} finally {
		await directory.close();
	}
}
async function migrateArtifact(path, apply) {
	if (!apply) {
		const { changedEvents } = renderMigration(await readStableFile(path));
		return changedEvents === 0 ? void 0 : {
			path,
			changedEvents
		};
	}
	return withFileLock(path, async () => {
		const original = await readStableFile(path);
		const { migrated, changedEvents } = renderMigration(original);
		if (changedEvents === 0) return void 0;
		const metadata = await stat(path);
		const sourceIdentity = await stat(path, { bigint: true });
		const backupPath = path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX;
		try {
			await link(path, backupPath);
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
		const backupHandle = await open(backupPath, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const backupIdentity = await backupHandle.stat({ bigint: true });
			if (!backupIdentity.isFile()) throw new Error(`migration backup path is not a regular file: ${backupPath}`);
			if (backupIdentity.dev !== sourceIdentity.dev || backupIdentity.ino !== sourceIdentity.ino) throw new Error(`migration backup does not reference the current Session artifact: ${backupPath}`);
			if (!(await backupHandle.readFile()).equals(original)) throw new Error(`migration backup already exists with different content: ${backupPath}`);
			await backupHandle.sync();
		} finally {
			await backupHandle.close();
		}
		await syncParentDirectory(backupPath);
		const temporary = `${path}.codex-search-history-${randomBytes(6).toString("hex")}.tmp`;
		try {
			await writeFile(temporary, migrated, {
				flag: "wx",
				mode: metadata.mode & 511
			});
			const handle = await open(temporary, "r");
			try {
				await handle.sync();
			} finally {
				await handle.close();
			}
			if (!(await readStableFile(path)).equals(original)) throw new Error(`session changed while migration was prepared: ${path}`);
			await rename(temporary, path);
			try {
				await syncParentDirectory(path);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`session was repaired and backed up at ${backupPath}, but synchronizing its directory failed: ${message}`, { cause: error });
			}
			if (!(await readStableFile(backupPath)).equals(original)) throw new Error(`a Session writer changed the preserved backup during migration; stop DSH and restore ${backupPath}`);
		} finally {
			await rm(temporary, { force: true });
		}
		return {
			path,
			changedEvents,
			backupPath
		};
	});
}
/**
* Mark the retired Alpha 4.10 search event ignorable in compressed JSONL logs.
* Applying is an offline maintenance operation and fails closed without the
* caller's explicit acknowledgement that all DSH writers are stopped.
*/
async function migrateOpenAICodexSearchHistory(options = {}) {
	const apply = options.apply === true;
	if (apply && options.confirmStopped !== true) throw new Error("refusing to rewrite Session history without confirmStopped=true after stopping every DSH writer");
	if (apply && process.platform === "win32") throw new Error("applying this history migration is not supported on Windows; dry-run only");
	const root = resolve(options.root ?? join(resolveDshHome(options.dshHome), "sessions"));
	const files = [];
	for await (const path of sessionArtifacts(root)) try {
		const result = await migrateArtifact(path, apply);
		if (result !== void 0) files.push(result);
	} catch (error) {
		const partial = apply && files.length > 0 ? `; ${files.length} earlier file(s) were already repaired and remain backed up` : "";
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Codex search history migration failed at ${path}${partial}: ${message}`, { cause: error });
	}
	return {
		mode: apply ? "apply" : "dry-run",
		root,
		changedFiles: files.length,
		changedEvents: files.reduce((sum, file) => sum + file.changedEvents, 0),
		files
	};
}
//#endregion
//#region src/index.ts
/** Stable Cordis plugin name. */
const name = "llm-openai-codex";
/** The model registry required before the provider can register. */
const inject = ["llm"];
/** Branded Host settings namespace for Codex Connect capability configuration. */
const OPENAI_CODEX_SETTINGS_NS = OPENAI_CODEX_SETTINGS_NAMESPACE;
const Config = z.object({
	oauthTimeoutMs: z.number().step(1).min(1e3).max(18e5).default(OPENAI_CODEX_AUTHORIZATION_TIMEOUT_MS),
	models: z.union([z.const(void 0), z.array(z.string())]),
	enableProxy: z.boolean().default(false),
	proxyUrl: z.string().default(DEFAULT_OPENAI_CODEX_PROXY_URL),
	contextWindowOverrides: z.transform(z.union([z.const(void 0), z.dict(z.union([z.const(null), z.number()]))]), parseOpenAICodexContextWindowOverrides),
	enableSearch: z.boolean().default(false),
	enableImageTool: z.boolean().default(false),
	enableImageGeneration: z.boolean().default(false),
	searchModel: z.string().default(DEFAULT_OPENAI_CODEX_SEARCH_MODEL),
	searchMode: z.union([
		"cached",
		"indexed",
		"live"
	]).default(DEFAULT_OPENAI_CODEX_SEARCH_MODE),
	searchContextSize: z.union([
		"low",
		"medium",
		"high"
	]).default(DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE),
	searchMaxOutputTokens: z.number().step(1).min(1).default(DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS)
});
/**
* Register the `openai-codex` LLM route with one provider-native OAuth store.
* Search and image tooling are added only when their config flags are true.
* Selecting this route as the Harness default remains a separate profile choice.
* @param ctx - plugin context carrying the LLM registry plus optional services.
* @param config - capability gates and standalone-search tuning.
*/
function apply(ctx, config) {
	const catalog = openAICodexModelCatalog();
	const validateSettings = (value) => {
		resolveOpenAICodexSettings(value);
		assertOpenAICodexContextWindowOverrides(value.contextWindowOverrides ?? void 0, catalog);
	};
	validateSettings(config);
	let current = () => config;
	const proxyManager = new OpenAICodexProxyManager();
	const resolveProviderProxyUrl = () => resolveOpenAICodexProxyUrl(resolveOpenAICodexSettings(current()));
	let proxyWasActive = resolveProviderProxyUrl() !== void 0;
	const credentials = new OpenAICodexCredentialStore();
	const imageAssets = new OpenAICodexImageAssetStore();
	const trustedOrigins = new OpenAICodexTrustedOriginsStore(join(dirname(credentials.filename), OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME));
	const fastMode = new FastModeRegistry();
	assertNoOpenAICodexProviderConflict(ctx.llm.listProviders().map((provider) => provider.id));
	new OpenAICodexTransport(ctx, credentials, proxyManager, resolveProviderProxyUrl);
	ctx.llm.registerAdapter([OPENAI_CODEX_PROVIDER], createOpenAICodexAdapter(credentials, () => ctx.get("attachments"), fastMode, () => resolveOpenAICodexSettings(current()).models, proxyManager, resolveProviderProxyUrl, () => resolveOpenAICodexSettings(current()).contextWindowOverrides));
	ctx.inject(["webServer"], (webCtx) => {
		registerOpenAICodexAuthRoutes(webCtx, credentials, trustedOrigins, fastMode, proxyManager, resolveProviderProxyUrl, config.oauthTimeoutMs);
		registerOpenAICodexProxyRoutes(webCtx, trustedOrigins, proxyManager);
		registerOpenAICodexUpdateRoutes(webCtx, { currentVersion: CODEX_CONNECT_VERSION }, trustedOrigins);
		registerOpenAICodexModelCatalogRoute(webCtx, openAICodexModelCatalog, trustedOrigins);
		registerOpenAICodexOriginalImageRoute(webCtx, trustedOrigins, imageAssets);
	});
	let stopped = false;
	let searchFiber;
	let searchRegistration;
	let searchTail = Promise.resolve();
	let imageFiber;
	let imageTail = Promise.resolve();
	let imageGenerationFiber;
	let imageGenerationTail = Promise.resolve();
	const reconcileSearch = async () => {
		if (stopped) return;
		const resolved = resolveOpenAICodexSettings(current());
		const nextRegistration = resolved.enableSearch ? {
			model: resolved.searchModel,
			mode: resolved.searchMode,
			contextSize: resolved.searchContextSize,
			maxOutputTokens: resolved.searchMaxOutputTokens
		} : void 0;
		if (deepEqualJson(nextRegistration, searchRegistration)) return;
		const previous = searchFiber;
		searchFiber = void 0;
		searchRegistration = void 0;
		if (previous !== void 0) await previous.dispose();
		if (stopped || nextRegistration === void 0) return;
		const fiber = ctx.inject(["web"], (webCtx) => webCtx.web.registerSearchProvider(new OpenAICodexSearchProvider({
			credentials,
			model: nextRegistration.model,
			mode: nextRegistration.mode,
			contextSize: nextRegistration.contextSize,
			maxOutputTokens: nextRegistration.maxOutputTokens,
			resolveRequestId: () => String(webCtx.get("agents")?.currentInitiator()?.session.id ?? randomUUID()),
			proxyManager,
			resolveProxyUrl: resolveProviderProxyUrl
		})));
		searchFiber = fiber;
		searchRegistration = nextRegistration;
		Promise.resolve(fiber).catch((error) => {
			if (searchFiber === fiber) {
				searchFiber = void 0;
				searchRegistration = void 0;
			}
			ctx.logger.error("dsh-codex-connect: optional search provider failed to activate");
			ctx.logger.error(error);
		});
	};
	const reconcileImageTool = async () => {
		if (stopped) return;
		const enabled = resolveOpenAICodexSettings(current()).enableImageTool;
		if (enabled === (imageFiber !== void 0)) return;
		const previous = imageFiber;
		imageFiber = void 0;
		if (previous !== void 0) await previous.dispose();
		if (stopped || !enabled) return;
		const fiber = ctx.inject([
			"tools",
			"fs",
			"attachments"
		], (toolCtx) => toolCtx.tools.register(viewImageTool(toolCtx)));
		imageFiber = fiber;
		Promise.resolve(fiber).catch((error) => {
			if (imageFiber === fiber) imageFiber = void 0;
			ctx.logger.error("dsh-codex-connect: optional view_image tool failed to activate");
			ctx.logger.error(error);
		});
	};
	const reconcileImageGeneration = async () => {
		if (stopped) return;
		const enabled = resolveOpenAICodexSettings(current()).enableImageGeneration;
		if (enabled === (imageGenerationFiber !== void 0)) return;
		const previous = imageGenerationFiber;
		imageGenerationFiber = void 0;
		if (previous !== void 0) await previous.dispose();
		if (stopped || !enabled) return;
		const fiber = ctx.inject(["tools", "attachments"], (toolCtx) => toolCtx.tools.register(imageGenerateTool(toolCtx, imageAssets)));
		imageGenerationFiber = fiber;
		Promise.resolve(fiber).catch((error) => {
			if (imageGenerationFiber === fiber) imageGenerationFiber = void 0;
			ctx.logger.error("dsh-codex-connect: optional image generation tool failed to activate");
			ctx.logger.error(error);
		});
	};
	const scheduleCapabilities = () => {
		searchTail = searchTail.then(reconcileSearch, reconcileSearch).catch((error) => {
			ctx.logger.error("dsh-codex-connect: could not apply the updated search configuration");
			ctx.logger.error(error);
		});
		imageTail = imageTail.then(reconcileImageTool, reconcileImageTool).catch((error) => {
			ctx.logger.error("dsh-codex-connect: could not apply the updated image-tool configuration");
			ctx.logger.error(error);
		});
		imageGenerationTail = imageGenerationTail.then(reconcileImageGeneration, reconcileImageGeneration).catch((error) => {
			ctx.logger.error("dsh-codex-connect: could not apply the updated image-generation configuration");
			ctx.logger.error(error);
		});
	};
	ctx.effect(() => async () => {
		stopped = true;
		await Promise.all([
			searchTail,
			imageTail,
			imageGenerationTail
		]);
		const search = searchFiber;
		const image = imageFiber;
		const imageGeneration = imageGenerationFiber;
		searchFiber = void 0;
		imageFiber = void 0;
		imageGenerationFiber = void 0;
		await Promise.allSettled([
			search?.dispose() ?? Promise.resolve(),
			image?.dispose() ?? Promise.resolve(),
			imageGeneration?.dispose() ?? Promise.resolve()
		]);
		await proxyManager.dispose();
	}, "dsh-codex-connect: optional capability lifecycle");
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.installSection(ctx, OPENAI_CODEX_SETTINGS_NS, Config, config, {
			validate(value) {
				validateSettings(value);
				if (value.enableProxy === true && !isValidOpenAICodexProxyUrl(value.proxyUrl)) throw new TypeError("OpenAI Codex proxyUrl must be an HTTP(S) origin without credentials or a path");
			},
			setSource(source) {
				current = source;
			},
			onChange() {
				const proxyIsActive = resolveProviderProxyUrl() !== void 0;
				if (proxyWasActive && !proxyIsActive) proxyManager.deactivate().catch((error) => {
					ctx.logger.error("dsh-codex-connect: could not deactivate the provider proxy");
					ctx.logger.error(error);
				});
				proxyWasActive = proxyIsActive;
				scheduleCapabilities();
			}
		});
	});
	scheduleCapabilities();
}
//#endregion
export { OPENAI_CODEX_PROXY_PROBE_TIMEOUT_MS as $, openAICodexConflictMessage as A, openAICodexModelCatalog as At, DSH_PLUGIN_API_PACKAGES as B, OpenAICodexTransport as C, normalizeTrustedOrigin as Ct, IMAGE_GENERATE_TOOL_NAME as D, loginOpenAICodex as Dt, VIEW_IMAGE_TOOL_NAME as E, readOpenAICodexRateLimits as Et, parseOpenAICodexUpdateResult as F, assessCompatibility as G, SUPPORTED_DSH_PLUGIN_API_VERSION as H, parseOpenAICodexVersion as I, readInstalledPackageVersion as J, detectCompatibility as K, COMPATIBILITY_CONTRACT as L, OPENAI_CODEX_UPDATE_PATH as M, OPENAI_CODEX_PROVIDER as Mt, checkForOpenAICodexUpdate as N, OpenAICodexCredentialStore as Nt, assertNoOpenAICodexProviderConflict as O, logoutOpenAICodex as Ot, compareOpenAICodexVersions as P, openAICodexAuthPath as Pt, OPENAI_CODEX_PROXY_CANDIDATE_LIMIT as Q, COMPATIBILITY_PACKAGES as R, OPENAI_CODEX_TRANSPORT_SERVICE as S, OpenAICodexTrustedOriginsStore as St, isOpenAICodexTransportError as T, parseOpenAICodexUsage as Tt, SUPPORTED_NODE_RANGE as U, PI_AI_PACKAGE as V, SUPPORTED_PI_AI_RANGE as W, OPENAI_CODEX_PROXY_TEST_PATH as X, OPENAI_CODEX_PROXY_DETECT_PATH as Y, OPENAI_CODEX_LOCAL_PROXY_CANDIDATES as Z, OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES as _, OPENAI_CODEX_FAST_MODE_PATH as _t, name as a, DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE as at, OPENAI_CODEX_TRANSPORT_API_VERSION as b, OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH as bt, migrateOpenAICodexSearchHistory as c, DEFAULT_OPENAI_CODEX_SEARCH_MODEL as ct, OPENAI_CODEX_SEARCH_URL as d, decodeOpenAICodexSettings as dt, OPENAI_CODEX_PROXY_PROBE_URL as et, OpenAICodexSearchProvider as f, isValidOpenAICodexContextWindowOverrides as ft, OPENAI_CODEX_IMAGE_MAX_ERROR_BYTES as g, resolveOpenAICodexSettings as gt, OPENAI_CODEX_IMAGE_MAX_COUNT as h, resolveOpenAICodexProxyUrl as ht, inject as i, DEFAULT_OPENAI_CODEX_PROXY_URL as it, CODEX_CONNECT_VERSION as j, OPENAI_CODEX_AUTH_FILENAME as jt, diagnoseOpenAICodex as k, openAICodexAuthStatus as kt, OPENAI_CODEX_BASE_URL as l, DEFAULT_OPENAI_CODEX_SETTINGS as lt, OPENAI_CODEX_IMAGE_GENERATION_URL as m, normalizeOpenAICodexProxyUrl as mt, OPENAI_CODEX_SETTINGS_NS as n, detectOpenAICodexProxies as nt, OPENAI_CODEX_HISTORY_BACKUP_SUFFIX as o, DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS as ot, mapOpenAICodexSearchResponse as p, isValidOpenAICodexProxyUrl as pt, evaluateCompatibility as q, apply as r, listOpenAICodexProxyCandidates as rt, OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT as s, DEFAULT_OPENAI_CODEX_SEARCH_MODE as st, Config as t, OpenAICodexProxyManager as tt, OPENAI_CODEX_SEARCH_PROVIDER as u, OPENAI_CODEX_SETTINGS_NAMESPACE as ut, OPENAI_CODEX_IMAGE_PROMPT_MAX_LENGTH as v, FastModeRegistry as vt, OpenAICodexTransportError as w, OPENAI_CODEX_USAGE_URL as wt, OPENAI_CODEX_TRANSPORT_ERROR_CODES as x, isFastModeSessionId as xt, OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS as y, OPENAI_CODEX_FAST_MODE_MAX_SESSIONS as yt, COMPATIBILITY_SCHEMA_VERSION as z };
