import { createRequire } from "node:module";
//#region \0rolldown/runtime.js
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __require = /* #__PURE__ */ (() => createRequire(import.meta.url))();
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/event-stream.js
var EventStream = class {
	queue = [];
	waiting = [];
	done = false;
	finalResultPromise;
	resolveFinalResult;
	isComplete;
	extractResult;
	constructor(isComplete, extractResult) {
		this.isComplete = isComplete;
		this.extractResult = extractResult;
		this.finalResultPromise = new Promise((resolve) => {
			this.resolveFinalResult = resolve;
		});
	}
	push(event) {
		if (this.done) return;
		if (this.isComplete(event)) {
			this.done = true;
			this.resolveFinalResult(this.extractResult(event));
		}
		const waiter = this.waiting.shift();
		if (waiter) waiter({
			value: event,
			done: false
		});
		else this.queue.push(event);
	}
	end(result) {
		this.done = true;
		if (result !== void 0) this.resolveFinalResult(result);
		while (this.waiting.length > 0) this.waiting.shift()({
			value: void 0,
			done: true
		});
	}
	async *[Symbol.asyncIterator]() {
		while (true) if (this.queue.length > 0) yield this.queue.shift();
		else if (this.done) return;
		else {
			const result = await new Promise((resolve) => this.waiting.push(resolve));
			if (result.done) return;
			yield result.value;
		}
	}
	result() {
		return this.finalResultPromise;
	}
};
var AssistantMessageEventStream = class extends EventStream {
	constructor() {
		super((event) => event.type === "done" || event.type === "error", (event) => {
			if (event.type === "done") return event.message;
			else if (event.type === "error") return event.error;
			throw new Error("Unexpected event type for final result");
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/api/lazy.js
function createSetupErrorMessage(model, error) {
	return {
		role: "assistant",
		content: [],
		api: model.api,
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
		stopReason: "error",
		errorMessage: error instanceof Error ? error.message : String(error),
		timestamp: Date.now()
	};
}
function hasResult(source) {
	return typeof source.result === "function";
}
async function forwardStream(target, source) {
	for await (const event of source) target.push(event);
	target.end(hasResult(source) ? await source.result() : void 0);
}
/**
* Returns a stream synchronously while running async setup (auth resolution,
* lazy module loading) behind it. Setup failures terminate the stream with an
* error event.
*/
function lazyStream(model, setup) {
	const outer = new AssistantMessageEventStream();
	setup().then((inner) => forwardStream(outer, inner)).catch((error) => {
		const message = createSetupErrorMessage(model, error);
		outer.push({
			type: "error",
			reason: "error",
			error: message
		});
		outer.end(message);
	});
	return outer;
}
function lazyApi(load, capabilities) {
	const api = {
		stream: (model, context, options) => lazyStream(model, async () => (await load()).stream(model, context, options)),
		streamSimple: (model, context, options) => lazyStream(model, async () => (await load()).streamSimple(model, context, options))
	};
	if (capabilities?.fetchDeferred) api.fetchDeferred = (model, handle, options) => lazyStream(model, async () => {
		const implementation = await load();
		if (!implementation.fetchDeferred) throw new Error("API does not support deferred responses");
		return implementation.fetchDeferred(model, handle, options);
	});
	if (capabilities?.cancelDeferred) api.cancelDeferred = async (model, handle, options) => {
		const implementation = await load();
		if (!implementation.cancelDeferred) throw new Error("API cannot cancel deferred responses");
		await implementation.cancelDeferred(model, handle, options);
	};
	return api;
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/auth/context.js
var __rewriteRelativeImportExtension = function(path, preserveJsx) {
	if (typeof path === "string" && /^\.\.?\//.test(path)) return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
		return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
	});
	return path;
};
const importNodeModule = (specifier) => import(__rewriteRelativeImportExtension(specifier));
function getProcessEnv() {
	return globalThis.process?.env;
}
/**
* Default auth context: env vars from `process.env` (undefined in browsers),
* file existence via node:fs (always false in browsers).
*/
function defaultProviderAuthContext() {
	return {
		async env(name) {
			const value = getProcessEnv()?.[name];
			return typeof value === "string" && value.trim().length > 0 ? value : void 0;
		},
		async fileExists(path) {
			try {
				const fs = await importNodeModule("node:fs/promises");
				let resolved = path;
				if (resolved.startsWith("~")) resolved = (await importNodeModule("node:os")).homedir() + resolved.slice(1);
				await fs.access(resolved);
				return true;
			} catch {
				return false;
			}
		}
	};
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/abort.js
function abortReason(signal) {
	if (signal.reason !== void 0) return signal.reason;
	const error = /* @__PURE__ */ new Error("The operation was aborted");
	error.name = "AbortError";
	return error;
}
/** Create an operation-local signal for public APIs whose signal is optional. */
function operationSignal(signal) {
	return signal ?? new AbortController().signal;
}
/**
* Stop waiting for an operation when its signal aborts while continuing to
* observe the abandoned promise so a later rejection is always handled.
*/
function raceWithAbortSignal(operation, signal) {
	if (signal.aborted) {
		operation.catch(() => {});
		return Promise.reject(abortReason(signal));
	}
	return new Promise((resolve, reject) => {
		let settled = false;
		const cleanup = () => signal.removeEventListener("abort", onAbort);
		const onAbort = () => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(abortReason(signal));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then((value) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(value);
		}, (error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		});
		if (signal.aborted) onAbort();
	});
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/auth/credential-store.js
/**
* Default in-memory credential store. Apps inject persistent stores.
* Keyed by `Provider.id`, one credential per provider; see `CredentialStore`.
* Writes are serialized per provider through a promise chain.
*/
var InMemoryCredentialStore = class {
	credentials = /* @__PURE__ */ new Map();
	chains = /* @__PURE__ */ new Map();
	/** Serialize tasks per provider id without releasing the chain before active work settles. */
	enqueue(providerId, task, options) {
		const signal = operationSignal(options?.signal);
		const previous = this.chains.get(providerId) ?? Promise.resolve();
		const queued = (async () => {
			await previous.catch(() => {});
			signal.throwIfAborted();
			return task();
		})();
		const tail = queued.catch(() => {});
		this.chains.set(providerId, tail);
		tail.then(() => {
			if (this.chains.get(providerId) === tail) this.chains.delete(providerId);
		});
		return raceWithAbortSignal(queued, signal);
	}
	async read(providerId, options) {
		options?.signal?.throwIfAborted();
		return this.credentials.get(providerId);
	}
	async list(options) {
		options?.signal?.throwIfAborted();
		return [...this.credentials].map(([providerId, credential]) => ({
			providerId,
			type: credential.type
		}));
	}
	modify(providerId, fn, options) {
		return this.enqueue(providerId, async () => {
			const current = this.credentials.get(providerId);
			const next = await fn(current);
			options?.signal?.throwIfAborted();
			if (next !== void 0) this.credentials.set(providerId, next);
			return next ?? current;
		}, options);
	}
	delete(providerId, options) {
		return this.enqueue(providerId, async () => {
			this.credentials.delete(providerId);
		}, options);
	}
};
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/diagnostics.js
function formatThrownValue(value) {
	if (value instanceof Error) return value.message || value.name;
	if (typeof value === "string") return value;
	return String(value);
}
function extractDiagnosticError(error) {
	if (!(error instanceof Error)) return {
		name: "ThrownValue",
		message: formatThrownValue(error)
	};
	const code = error.code;
	return {
		name: error.name || void 0,
		message: error.message || error.name,
		stack: error.stack,
		code: typeof code === "string" || typeof code === "number" ? code : void 0
	};
}
function createAssistantMessageDiagnostic(type, error, details) {
	return {
		type,
		timestamp: Date.now(),
		error: extractDiagnosticError(error),
		details
	};
}
function appendAssistantMessageDiagnostic(message, diagnostic) {
	message.diagnostics = [...message.diagnostics ?? [], diagnostic];
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/auth/resolve.js
var ModelsError = class extends Error {
	code;
	constructor(code, message, options) {
		super(withCauseDetail(message, options?.cause), options);
		this.name = "ModelsError";
		this.code = code;
	}
};
/** Callers surface `error.message` only, so keep the underlying reason in it. */
function withCauseDetail(message, cause) {
	if (cause === void 0 || cause === null) return message;
	const detail = formatThrownValue(cause).trim();
	if (!detail || message.includes(detail)) return message;
	return `${message}: ${detail}`;
}
/**
* Auth resolution shared by the `Models` and `ImagesModels` collections.
* A stored credential owns the provider: ambient/env is consulted only when
* nothing is stored. No silent env fallback after a failed refresh or for a
* credential type without a matching handler.
*/
function resolveProviderAuth(provider, credentials, authContext, overrides) {
	const signal = operationSignal(overrides?.signal);
	return raceWithAbortSignal(resolveProviderAuthWithSignal(provider, credentials, authContext, overrides, signal), signal);
}
async function resolveProviderAuthWithSignal(provider, credentials, authContext, overrides, signal) {
	signal.throwIfAborted();
	const requestAuthContext = overrides?.env ? overlayEnvAuthContext(authContext, overrides.env) : authContext;
	if (overrides?.apiKey !== void 0 && provider.auth.apiKey) return resolveApiKey(requestAuthContext, provider.auth.apiKey, provider.id, {
		type: "api_key",
		key: overrides.apiKey,
		env: overrides.env
	}, signal);
	const stored = await readCredential(credentials, provider.id, signal);
	if (stored) {
		if (stored.type === "oauth" && provider.auth.oauth) return resolveStoredOAuth(credentials, provider.id, provider.auth.oauth, stored, signal, overrides?.minOAuthValidityMs);
		if (stored.type === "api_key" && provider.auth.apiKey) {
			const credential = overrides?.env ? {
				...stored,
				env: {
					...stored.env,
					...overrides.env
				}
			} : stored;
			return resolveApiKey(requestAuthContext, provider.auth.apiKey, provider.id, credential, signal);
		}
		return;
	}
	return provider.auth.apiKey ? resolveApiKey(requestAuthContext, provider.auth.apiKey, provider.id, void 0, signal) : void 0;
}
function overlayEnvAuthContext(base, env) {
	return {
		env: async (name) => env[name] || await base.env(name),
		fileExists: (path) => base.fileExists(path)
	};
}
const DEFAULT_OAUTH_MINIMUM_VALIDITY_MS = 3e5;
const DEFAULT_OAUTH_REFRESH_TIMEOUT_MS = 15e3;
/**
* OAuth resolution with double-checked locking: tokens with less than five
* minutes remaining lock, re-check expiry under the lock, refresh once
* globally, and persist the rotated credential before release.
*/
async function resolveStoredOAuth(credentials, providerId, oauth, stored, signal, minOAuthValidityMs) {
	const minimumValidityMs = Math.max(DEFAULT_OAUTH_MINIMUM_VALIDITY_MS, minOAuthValidityMs ?? 0);
	const expiresSoon = (credential) => Date.now() + minimumValidityMs >= credential.expires;
	let credential = stored;
	if (expiresSoon(credential)) {
		let post;
		try {
			post = await credentials.modify(providerId, async (current) => {
				if (current?.type !== "oauth") return void 0;
				if (!expiresSoon(current)) return void 0;
				try {
					const refreshSignal = AbortSignal.any([signal, AbortSignal.timeout(DEFAULT_OAUTH_REFRESH_TIMEOUT_MS)]);
					return await oauth.refresh(current, refreshSignal);
				} catch (error) {
					throw new ModelsError("oauth", `OAuth refresh failed for ${providerId}`, { cause: error });
				}
			}, { signal });
		} catch (error) {
			if (error instanceof ModelsError) throw error;
			throw new ModelsError("auth", `Credential store modify failed for ${providerId}`, { cause: error });
		}
		if (post?.type !== "oauth") return void 0;
		credential = post;
		if (minOAuthValidityMs !== void 0 && expiresSoon(credential)) throw new ModelsError("oauth", `OAuth refresh returned a token that expires too soon for ${providerId}`);
	}
	try {
		return {
			auth: await oauth.toAuth(credential),
			source: "OAuth"
		};
	} catch (error) {
		throw new ModelsError("oauth", `OAuth auth derivation failed for ${providerId}`, { cause: error });
	}
}
async function resolveApiKey(authContext, apiKey, providerId, credential, signal) {
	try {
		return await apiKey.resolve({
			ctx: authContext,
			credential,
			signal
		});
	} catch (error) {
		throw new ModelsError("auth", `API key auth failed for provider ${providerId}`, { cause: error });
	}
}
async function readCredential(credentials, providerId, signal) {
	try {
		return await credentials.read(providerId, { signal });
	} catch (error) {
		throw new ModelsError("auth", `Credential store read failed for ${providerId}`, { cause: error });
	}
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/models-store.js
var InMemoryModelsStore = class {
	entries = /* @__PURE__ */ new Map();
	async read(providerId, options) {
		options?.signal?.throwIfAborted();
		const entry = this.entries.get(providerId);
		return entry ? structuredClone(entry) : void 0;
	}
	async write(providerId, entry, options) {
		options?.signal?.throwIfAborted();
		this.entries.set(providerId, structuredClone(entry));
	}
	async delete(providerId, options) {
		options?.signal?.throwIfAborted();
		this.entries.delete(providerId);
	}
};
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/models.js
function mergeHeaders(base, override) {
	if (!base && !override) return void 0;
	const merged = { ...base };
	for (const [name, value] of Object.entries(override ?? {})) {
		const lowerName = name.toLowerCase();
		for (const existingName of Object.keys(merged)) if (existingName.toLowerCase() === lowerName) delete merged[existingName];
		merged[name] = value;
	}
	return merged;
}
var ModelsImpl = class {
	providers = /* @__PURE__ */ new Map();
	credentials;
	modelsStore;
	authContext;
	refreshGenerations = /* @__PURE__ */ new Map();
	refreshControllers = /* @__PURE__ */ new Map();
	publicationChains = /* @__PURE__ */ new Map();
	constructor(options) {
		this.credentials = options?.credentials ?? new InMemoryCredentialStore();
		this.modelsStore = options?.modelsStore ?? new InMemoryModelsStore();
		this.authContext = options?.authContext ?? defaultProviderAuthContext();
	}
	setProvider(provider) {
		this.supersedeProviderRefresh(provider.id);
		this.providers.set(provider.id, provider);
	}
	deleteProvider(id) {
		this.supersedeProviderRefresh(id);
		this.providers.delete(id);
	}
	clearProviders() {
		for (const id of /* @__PURE__ */ new Set([...this.providers.keys(), ...this.refreshControllers.keys()])) this.supersedeProviderRefresh(id);
		this.providers.clear();
	}
	getProviders() {
		return Array.from(this.providers.values());
	}
	getProvider(id) {
		return this.providers.get(id);
	}
	getModels(provider) {
		if (provider !== void 0) {
			const entry = this.providers.get(provider);
			if (!entry) return [];
			try {
				return entry.getModels();
			} catch {
				return [];
			}
		}
		const models = [];
		for (const entry of this.providers.values()) try {
			models.push(...entry.getModels());
		} catch {}
		return models;
	}
	getModel(provider, id) {
		return this.getModels(provider).find((model) => model.id === id);
	}
	supersedeProviderRefresh(providerId) {
		const generation = (this.refreshGenerations.get(providerId) ?? 0) + 1;
		this.refreshGenerations.set(providerId, generation);
		const previous = this.refreshControllers.get(providerId);
		if (previous) {
			this.refreshControllers.delete(providerId);
			previous.abort();
		}
		return generation;
	}
	beginProviderRefresh(providerId) {
		const generation = this.supersedeProviderRefresh(providerId);
		const controller = new AbortController();
		this.refreshControllers.set(providerId, controller);
		return {
			generation,
			controller
		};
	}
	publishProviderModels(providerId, generation, signal, publication) {
		const previous = this.publicationChains.get(providerId) ?? Promise.resolve();
		const queued = (async () => {
			await previous.catch(() => {});
			if (signal.aborted || this.refreshGenerations.get(providerId) !== generation) return false;
			if (publication.persist === null) await this.modelsStore.delete(providerId, { signal });
			else if (publication.persist !== void 0) await this.modelsStore.write(providerId, structuredClone(publication.persist), { signal });
			if (signal.aborted || this.refreshGenerations.get(providerId) !== generation) return false;
			publication.update?.();
			return true;
		})();
		const tail = queued.catch(() => {});
		this.publicationChains.set(providerId, tail);
		tail.then(() => {
			if (this.publicationChains.get(providerId) === tail) this.publicationChains.delete(providerId);
		});
		return raceWithAbortSignal(queued, signal);
	}
	async runProviderRefreshPhase(provider, credential, allowNetwork, force, generation, signal) {
		const stored = await this.modelsStore.read(provider.id, { signal });
		await provider.refreshModels({
			credential,
			stored: stored ? structuredClone(stored) : void 0,
			publish: (publication) => this.publishProviderModels(provider.id, generation, signal, publication),
			allowNetwork,
			force: allowNetwork ? force : void 0,
			signal
		});
	}
	async refresh(options = {}) {
		const allowNetwork = options.allowNetwork ?? true;
		const callerSignal = operationSignal(options.signal);
		const errors = /* @__PURE__ */ new Map();
		if (callerSignal.aborted) return {
			aborted: true,
			errors
		};
		const selected = options.providers ? new Set(options.providers) : void 0;
		const refreshable = Array.from(this.providers.values()).filter((provider) => provider.refreshModels !== void 0 && (!selected || selected.has(provider.id)));
		const refresh = Promise.all(refreshable.map(async (provider) => {
			const { generation, controller } = this.beginProviderRefresh(provider.id);
			const signal = AbortSignal.any([callerSignal, controller.signal]);
			const operation = (async () => {
				let storedCredential;
				let credentialError;
				try {
					storedCredential = await this.readCredential(provider.id, signal);
				} catch (error) {
					credentialError = error;
				}
				await this.runProviderRefreshPhase(provider, storedCredential, false, void 0, generation, signal);
				if (credentialError !== void 0) throw credentialError;
				if (!allowNetwork || signal.aborted) return;
				const credential = await this.resolveRefreshCredential(provider, storedCredential, signal);
				if (!credential) return;
				await this.runProviderRefreshPhase(provider, credential, true, options.force, generation, signal);
			})();
			try {
				await raceWithAbortSignal(operation, signal);
			} catch (error) {
				if (!signal.aborted) errors.set(provider.id, error instanceof Error ? error : new ModelsError("model_source", `Model refresh failed for ${provider.id}`, { cause: error }));
			} finally {
				if (this.refreshControllers.get(provider.id) === controller) this.refreshControllers.delete(provider.id);
			}
		}));
		try {
			await raceWithAbortSignal(refresh, callerSignal);
		} catch (error) {
			if (!callerSignal.aborted) throw error;
		}
		return {
			aborted: callerSignal.aborted,
			errors: new Map(errors)
		};
	}
	async resolveRefreshCredential(provider, stored, signal) {
		if (stored?.type === "oauth") {
			const oauth = provider.auth.oauth;
			if (!oauth) return void 0;
			if (Date.now() < stored.expires) return stored;
			if (signal.aborted) return void 0;
			const post = await this.credentials.modify(provider.id, async (current) => {
				if (current?.type !== "oauth" || Date.now() < current.expires) return void 0;
				return oauth.refresh(current, signal);
			}, { signal });
			return post?.type === "oauth" ? post : void 0;
		}
		const apiKey = provider.auth.apiKey;
		if (!apiKey) return void 0;
		const credential = stored?.type === "api_key" ? stored : void 0;
		const result = await apiKey.resolve({
			ctx: this.authContext,
			credential,
			signal
		});
		if (!result) return void 0;
		return {
			type: "api_key",
			key: result.auth.apiKey,
			env: result.env
		};
	}
	async readCredential(providerId, signal) {
		try {
			return await this.credentials.read(providerId, { signal });
		} catch (error) {
			throw new ModelsError("auth", `Credential store read failed for ${providerId}`, { cause: error });
		}
	}
	async checkProviderAuth(provider, credential, signal) {
		if (credential?.type === "oauth") return provider.auth.oauth ? {
			source: "OAuth",
			type: "oauth"
		} : void 0;
		const apiKey = provider.auth.apiKey;
		if (!apiKey) return void 0;
		if (apiKey.check) try {
			return await apiKey.check({
				ctx: this.authContext,
				credential: credential?.type === "api_key" ? credential : void 0,
				signal
			});
		} catch (error) {
			throw new ModelsError("auth", `API key auth check failed for provider ${provider.id}`, { cause: error });
		}
		const resolution = await resolveProviderAuth(provider, this.credentials, this.authContext, { signal });
		return resolution ? {
			source: resolution.source,
			type: "api_key"
		} : void 0;
	}
	checkAuth(providerId, options) {
		const signal = operationSignal(options?.signal);
		return raceWithAbortSignal((async () => {
			signal.throwIfAborted();
			const provider = this.providers.get(providerId);
			if (!provider) return void 0;
			return this.checkProviderAuth(provider, await this.readCredential(providerId, signal), signal);
		})(), signal);
	}
	getAvailable(providerId, options) {
		const signal = operationSignal(options?.signal);
		return raceWithAbortSignal((async () => {
			signal.throwIfAborted();
			const providers = providerId ? [this.providers.get(providerId)].filter((entry) => entry !== void 0) : this.getProviders();
			return (await Promise.all(providers.map(async (provider) => {
				const credential = await this.readCredential(provider.id, signal);
				return {
					provider,
					credential,
					auth: await this.checkProviderAuth(provider, credential, signal)
				};
			}))).flatMap(({ provider, credential, auth }) => {
				if (!auth) return [];
				const models = provider.getModels();
				return provider.filterModels?.(models, credential) ?? models;
			});
		})(), signal);
	}
	async getAuth(providerOrModel, overrides) {
		const signal = operationSignal(overrides?.signal);
		const providerId = typeof providerOrModel === "string" ? providerOrModel : providerOrModel.provider;
		const provider = this.providers.get(providerId);
		if (!provider) return void 0;
		const result = await resolveProviderAuth(provider, this.credentials, this.authContext, {
			...overrides,
			signal
		});
		if (!result || typeof providerOrModel === "string" || !providerOrModel.headers) return result;
		return {
			...result,
			auth: {
				...result.auth,
				headers: mergeHeaders(result.auth.headers, providerOrModel.headers)
			}
		};
	}
	async login(providerId, type, interaction) {
		const signal = operationSignal(interaction.signal);
		signal.throwIfAborted();
		const provider = this.providers.get(providerId);
		if (!provider) throw new ModelsError("provider", `Unknown provider: ${providerId}`);
		const method = type === "oauth" ? provider.auth.oauth : provider.auth.apiKey;
		if (!method?.login) throw new ModelsError("auth", `${provider.name} does not support ${type} login`);
		const credential = await raceWithAbortSignal(method.login({
			...interaction,
			signal
		}), signal);
		let mutationStarted = false;
		let markMutationStarted;
		const started = new Promise((resolve) => {
			markMutationStarted = resolve;
		});
		const mutation = this.credentials.modify(providerId, async () => {
			mutationStarted = true;
			markMutationStarted?.();
			return credential;
		}, { signal });
		mutation.catch(() => {});
		try {
			await new Promise((resolve, reject) => {
				const onAbort = () => {
					if (!mutationStarted) reject(signal.reason);
				};
				signal.addEventListener("abort", onAbort, { once: true });
				Promise.race([started, mutation]).then(() => {
					signal.removeEventListener("abort", onAbort);
					resolve();
				}, (error) => {
					signal.removeEventListener("abort", onAbort);
					reject(error);
				});
				if (signal.aborted) onAbort();
			});
			await mutation;
		} catch (error) {
			signal.throwIfAborted();
			throw new ModelsError("auth", `Credential store modify failed for ${providerId}`, { cause: error });
		}
		return credential;
	}
	async logout(providerId, options) {
		const signal = operationSignal(options?.signal);
		signal.throwIfAborted();
		try {
			await this.credentials.delete(providerId, { signal });
		} catch (error) {
			signal.throwIfAborted();
			throw new ModelsError("auth", `Credential store delete failed for ${providerId}`, { cause: error });
		}
	}
	requireProvider(model) {
		const provider = this.providers.get(model.provider);
		if (!provider) throw new ModelsError("provider", `Unknown provider: ${model.provider}`);
		return provider;
	}
	async applyAuth(model, options) {
		this.requireProvider(model);
		const resolution = await this.getAuth(model, {
			apiKey: options?.apiKey,
			env: options?.env,
			signal: options?.signal
		});
		if (!resolution) throw new ModelsError("auth", `Provider is not configured: ${model.provider}`);
		const auth = resolution.auth;
		const apiKey = options?.apiKey ?? auth.apiKey;
		let headers = mergeHeaders(auth.headers, options?.headers);
		if (options?.transformHeaders) headers = await options.transformHeaders(headers ?? {});
		const env = resolution.env || options?.env ? {
			...resolution.env ?? {},
			...options?.env ?? {}
		} : void 0;
		const requestModel = auth.baseUrl ? {
			...model,
			baseUrl: auth.baseUrl
		} : model;
		const { transformHeaders: _transformHeaders, ...providerOptions } = options ?? {};
		return {
			requestModel,
			requestOptions: {
				...providerOptions,
				apiKey,
				headers,
				env
			}
		};
	}
	stream(model, context, options) {
		return lazyStream(model, async () => {
			const provider = this.requireProvider(model);
			const { requestModel, requestOptions } = await this.applyAuth(model, options);
			return provider.stream(requestModel, context, requestOptions);
		});
	}
	async complete(model, context, options) {
		return this.stream(model, context, options).result();
	}
	streamSimple(model, context, options) {
		return lazyStream(model, async () => {
			const provider = this.requireProvider(model);
			const { requestModel, requestOptions } = await this.applyAuth(model, options);
			return provider.streamSimple(requestModel, context, requestOptions);
		});
	}
	async completeSimple(model, context, options) {
		return this.streamSimple(model, context, options).result();
	}
	streamDeferred(model, handle, options) {
		return lazyStream(model, async () => {
			const provider = this.requireProvider(model);
			if (!provider.fetchDeferred) throw new ModelsError("provider", `Provider ${model.provider} does not support deferred responses`);
			const { requestModel, requestOptions } = await this.applyAuth(model, options);
			return provider.fetchDeferred(requestModel, handle, requestOptions);
		});
	}
	async fetchDeferred(model, handle, options) {
		return this.streamDeferred(model, handle, options).result();
	}
	async cancelDeferred(model, handle, options) {
		const provider = this.requireProvider(model);
		if (!provider.cancelDeferred) throw new ModelsError("provider", `Provider ${model.provider} does not support deferred responses`);
		const { requestModel, requestOptions } = await this.applyAuth(model, options);
		await provider.cancelDeferred(requestModel, handle, requestOptions);
	}
};
function createModels(options) {
	return new ModelsImpl(options);
}
/**
* Builds a provider from parts. Built-in provider factories and models.json
* custom providers both go through this. A single `api` streams all models;
* an `api` map dispatches on `model.api`, and a model whose api has no entry
* produces a stream error.
*/
function createProvider(input) {
	const baselineModels = input.models;
	let dynamicModels = [];
	const fetchModels = input.fetchModels;
	const currentModels = () => {
		const merged = [...baselineModels];
		for (const model of dynamicModels) {
			const index = merged.findIndex((entry) => entry.id === model.id);
			if (index >= 0) merged[index] = model;
			else merged.push(model);
		}
		return merged;
	};
	const single = typeof input.api.stream === "function" ? input.api : void 0;
	const byApi = single ? void 0 : input.api;
	const apiFor = (model) => single ?? byApi?.[model.api];
	const dispatch = (model, run) => {
		const streams = apiFor(model);
		if (!streams) return lazyStream(model, async () => {
			throw new ModelsError("stream", `Provider ${input.id} has no API implementation for "${model.api}"`);
		});
		return run(streams);
	};
	const provider = {
		id: input.id,
		name: input.name ?? input.id,
		baseUrl: input.baseUrl,
		headers: input.headers,
		auth: input.auth,
		getModels: currentModels,
		refreshModels: fetchModels ? async (context) => {
			if (context.stored) {
				const restored = context.stored.models.filter((model) => model.provider === input.id).map((model) => model);
				if (!await context.publish({ update: () => {
					dynamicModels = restored;
				} })) return;
			}
			if (!context.allowNetwork || context.signal.aborted) return;
			const refreshed = await fetchModels(context);
			if (context.signal.aborted) return;
			await context.publish({
				persist: {
					models: refreshed,
					checkedAt: Date.now()
				},
				update: () => {
					dynamicModels = refreshed;
				}
			});
		} : void 0,
		filterModels: input.filterModels,
		stream: (model, context, options) => dispatch(model, (streams) => streams.stream(model, context, options)),
		streamSimple: (model, context, options) => dispatch(model, (streams) => streams.streamSimple(model, context, options))
	};
	const streams = single ? [single] : Object.values(byApi ?? {}).filter((entry) => entry !== void 0);
	if (streams.some((entry) => entry.fetchDeferred !== void 0)) provider.fetchDeferred = (model, handle, options) => lazyStream(model, async () => {
		const implementation = apiFor(model);
		if (!implementation?.fetchDeferred) throw new ModelsError("provider", `Provider ${input.id} does not support deferred responses for "${model.api}"`);
		return implementation.fetchDeferred(model, handle, options);
	});
	if (streams.some((entry) => entry.cancelDeferred !== void 0)) provider.cancelDeferred = async (model, handle, options) => {
		const implementation = apiFor(model);
		if (!implementation?.cancelDeferred) throw new ModelsError("provider", `Provider ${input.id} cannot cancel deferred responses for "${model.api}"`);
		await implementation.cancelDeferred(model, handle, options);
	};
	return provider;
}
function calculateCost(model, usage) {
	const inputTokens = usage.input + usage.cacheRead + usage.cacheWrite;
	let rates = model.cost;
	let matchedThreshold = -1;
	for (const tier of model.cost.tiers ?? []) if (inputTokens > tier.inputTokensAbove && tier.inputTokensAbove > matchedThreshold) {
		rates = tier;
		matchedThreshold = tier.inputTokensAbove;
	}
	const longWrite = usage.cacheWrite1h ?? 0;
	const shortWrite = usage.cacheWrite - longWrite;
	usage.cost.input = rates.input / 1e6 * usage.input;
	usage.cost.output = rates.output / 1e6 * usage.output;
	usage.cost.cacheRead = rates.cacheRead / 1e6 * usage.cacheRead;
	usage.cost.cacheWrite = (rates.cacheWrite * shortWrite + rates.input * 2 * longWrite) / 1e6;
	usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
	return usage.cost;
}
const EXTENDED_THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
function getSupportedThinkingLevels(model) {
	if (!model.reasoning) return ["off"];
	return EXTENDED_THINKING_LEVELS.filter((level) => {
		const mapped = model.thinkingLevelMap?.[level];
		if (mapped === null) return false;
		if (level === "xhigh" || level === "max") return mapped !== void 0;
		return true;
	});
}
function clampThinkingLevel(model, level) {
	const availableLevels = getSupportedThinkingLevels(model);
	if (availableLevels.includes(level)) return level;
	const requestedIndex = EXTENDED_THINKING_LEVELS.indexOf(level);
	if (requestedIndex === -1) return availableLevels[0] ?? "off";
	for (let i = requestedIndex; i < EXTENDED_THINKING_LEVELS.length; i++) {
		const candidate = EXTENDED_THINKING_LEVELS[i];
		if (availableLevels.includes(candidate)) return candidate;
	}
	for (let i = requestedIndex - 1; i >= 0; i--) {
		const candidate = EXTENDED_THINKING_LEVELS[i];
		if (availableLevels.includes(candidate)) return candidate;
	}
	return availableLevels[0] ?? "off";
}
//#endregion
export { appendAssistantMessageDiagnostic as a, lazyApi as c, __require as d, createProvider as i, AssistantMessageEventStream as l, clampThinkingLevel as n, createAssistantMessageDiagnostic as o, createModels as r, formatThrownValue as s, calculateCost as t, __commonJSMin as u };
