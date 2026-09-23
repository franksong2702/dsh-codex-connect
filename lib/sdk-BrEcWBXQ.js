import { t as __commonJSMin } from "./rolldown-runtime-KwVTW_0O.js";
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/tslib.mjs
function __classPrivateFieldSet(receiver, state, value, kind, f) {
	if (kind === "m") throw new TypeError("Private method is not writable");
	if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
	if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
	return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
function __classPrivateFieldGet(receiver, state, kind, f) {
	if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
	if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
	return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/errors.mjs
function isAbortError(err) {
	return typeof err === "object" && err !== null && ("name" in err && err.name === "AbortError" || "message" in err && String(err.message).includes("FetchRequestCanceledException"));
}
const castToError = (err) => {
	if (err instanceof Error) return err;
	if (typeof err === "object" && err !== null) {
		try {
			const tag = Object.prototype.toString.call(err);
			if (tag === "[object Error]" || tag === "[object DOMException]") {
				const error = new Error(err.message, err.cause ? { cause: err.cause } : {});
				if (err.stack) error.stack = err.stack;
				if (err.cause && !error.cause) error.cause = err.cause;
				if (err.name) error.name = err.name;
				return error;
			}
		} catch {}
		try {
			return new Error(JSON.stringify(err));
		} catch {}
	}
	return new Error(err);
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/core/error.mjs
var AnthropicError = class extends Error {};
var APIError = class APIError extends AnthropicError {
	constructor(status, error, message, headers, type) {
		super(`${APIError.makeMessage(status, error, message)}`);
		this.status = status;
		this.headers = headers;
		this.requestID = headers?.get("request-id");
		this.workspaceID = headers?.get("anthropic-workspace-id");
		this.error = error;
		this.type = type ?? null;
	}
	static makeMessage(status, error, message) {
		const msg = error?.message ? typeof error.message === "string" ? error.message : JSON.stringify(error.message) : error ? JSON.stringify(error) : message;
		if (status && msg) return `${status} ${msg}`;
		if (status) return `${status} status code (no body)`;
		if (msg) return msg;
		return "(no status code or body)";
	}
	static generate(status, errorResponse, message, headers) {
		if (!status || !headers) return new APIConnectionError({
			message,
			cause: castToError(errorResponse)
		});
		const error = errorResponse;
		const type = error?.["error"]?.["type"];
		if (status === 400) return new BadRequestError(status, error, message, headers, type);
		if (status === 401) return new AuthenticationError(status, error, message, headers, type);
		if (status === 403) return new PermissionDeniedError(status, error, message, headers, type);
		if (status === 404) return new NotFoundError(status, error, message, headers, type);
		if (status === 409) return new ConflictError(status, error, message, headers, type);
		if (status === 422) return new UnprocessableEntityError(status, error, message, headers, type);
		if (status === 429) return new RateLimitError(status, error, message, headers, type);
		if (status >= 500) return new InternalServerError(status, error, message, headers, type);
		return new APIError(status, error, message, headers, type);
	}
};
var APIUserAbortError = class extends APIError {
	constructor({ message } = {}) {
		super(void 0, void 0, message || "Request was aborted.", void 0);
	}
};
var APIConnectionError = class extends APIError {
	constructor({ message, cause }) {
		super(void 0, void 0, message || "Connection error.", void 0);
		if (cause) this.cause = cause;
	}
};
var APIConnectionTimeoutError = class extends APIConnectionError {
	constructor({ message } = {}) {
		super({ message: message ?? "Request timed out." });
	}
};
/**
* An error that opts into the SDK's retry policy: throw it (e.g. from
* middleware) to have the attempt retried.
*
* Note that the request will only be retried when `maxRetries` has not been exhausted.
*/
var RetryableError = class extends AnthropicError {
	constructor(message, { cause } = {}) {
		super(message ?? "Retryable error.");
		if (cause !== void 0) this.cause = cause;
	}
};
var BadRequestError = class extends APIError {};
var AuthenticationError = class extends APIError {};
var PermissionDeniedError = class extends APIError {};
var NotFoundError = class extends APIError {};
var ConflictError = class extends APIError {};
var UnprocessableEntityError = class extends APIError {};
var RateLimitError = class extends APIError {};
var InternalServerError = class extends APIError {};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/tools/ToolError.mjs
/**
* An error that can be thrown from a tool's `run` method to return structured
* content blocks as the error result, rather than just a string message.
*
* When the ToolRunner catches this error, it will use the `content` property
* as the tool result with `is_error: true`.
*
* @example
* ```ts
* const tool = {
*   name: 'my_tool',
*   run: async (input) => {
*     if (somethingWentWrong) {
*       throw new ToolError([
*         { type: 'text', text: 'Error details here' },
*         { type: 'image', source: { type: 'base64', data: '...', media_type: 'image/png' } },
*       ]);
*     }
*     return 'success';
*   },
* };
* ```
*/
var ToolError = class extends Error {
	constructor(content) {
		const message = typeof content === "string" ? content : content.map((block) => {
			if (block.type === "text") return block.text;
			return `[${block.type}]`;
		}).join(" ");
		super(message);
		this.name = "ToolError";
		this.content = content;
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/uuid.mjs
/**
* https://stackoverflow.com/a/2117523
*/
let uuid4 = function() {
	const { crypto } = globalThis;
	if (crypto?.randomUUID) {
		uuid4 = crypto.randomUUID.bind(crypto);
		return crypto.randomUUID();
	}
	const u8 = /* @__PURE__ */ new Uint8Array(1);
	const randomByte = crypto ? () => crypto.getRandomValues(u8)[0] : () => Math.random() * 255 & 255;
	return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ randomByte() & 15 >> +c / 4).toString(16));
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/values.mjs
const startsWithSchemeRegexp = /^[a-z][a-z0-9+.-]*:/i;
const isAbsoluteURL = (url) => {
	return startsWithSchemeRegexp.test(url);
};
let isArray = (val) => (isArray = Array.isArray, isArray(val));
let isReadonlyArray = isArray;
/** Returns an object if the given value isn't an object, otherwise returns as-is */
function maybeObj(x) {
	if (typeof x !== "object") return {};
	return x ?? {};
}
function isEmptyObj(obj) {
	if (!obj) return true;
	for (const _k in obj) return false;
	return true;
}
function hasOwn(obj, key) {
	return Object.prototype.hasOwnProperty.call(obj, key);
}
function isObj(obj) {
	return obj != null && typeof obj === "object" && !Array.isArray(obj);
}
const validatePositiveInteger = (name, n) => {
	if (typeof n !== "number" || !Number.isInteger(n)) throw new AnthropicError(`${name} must be an integer`);
	if (n < 0) throw new AnthropicError(`${name} must be a positive integer`);
	return n;
};
const safeJSON = (text) => {
	try {
		return JSON.parse(text);
	} catch (err) {
		return;
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/sleep.mjs
/**
* Resolve after `ms`, or immediately when `signal` aborts.
*
* When a `signal` is passed the abort listener is always removed so repeated
* calls do not accumulate listeners on a long-lived signal. Resolves (rather
* than rejects) on abort — callers treat abort as "wake up early," not as a
* failure; callers that want to unwind should check the signal themselves.
*/
const sleep = (ms, signal) => new Promise((resolve) => {
	if (signal?.aborted) return resolve();
	const onAbort = () => {
		clearTimeout(timer);
		resolve();
	};
	const timer = setTimeout(() => {
		signal?.removeEventListener("abort", onAbort);
		resolve();
	}, ms);
	signal?.addEventListener("abort", onAbort, { once: true });
});
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/version.mjs
const VERSION = "0.123.0";
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/detect-platform.mjs
const isRunningInBrowser = () => {
	return typeof window !== "undefined" && typeof window.document !== "undefined" && typeof navigator !== "undefined";
};
/**
* Note this does not detect 'browser'; for that, use getBrowserInfo().
*/
function getDetectedPlatform() {
	if (typeof Deno !== "undefined" && Deno.build != null) return "deno";
	if (typeof EdgeRuntime !== "undefined") return "edge";
	if (Object.prototype.toString.call(typeof globalThis.process !== "undefined" ? globalThis.process : 0) === "[object process]") return "node";
	return "unknown";
}
const getPlatformProperties = () => {
	const detectedPlatform = getDetectedPlatform();
	if (detectedPlatform === "deno") return {
		"X-Stainless-Lang": "js",
		"X-Stainless-Package-Version": VERSION,
		"X-Stainless-OS": normalizePlatform(Deno.build.os),
		"X-Stainless-Arch": normalizeArch(Deno.build.arch),
		"X-Stainless-Runtime": "deno",
		"X-Stainless-Runtime-Version": typeof Deno.version === "string" ? Deno.version : Deno.version?.deno ?? "unknown"
	};
	if (typeof EdgeRuntime !== "undefined") return {
		"X-Stainless-Lang": "js",
		"X-Stainless-Package-Version": VERSION,
		"X-Stainless-OS": "Unknown",
		"X-Stainless-Arch": `other:${EdgeRuntime}`,
		"X-Stainless-Runtime": "edge",
		"X-Stainless-Runtime-Version": globalThis.process?.version ?? "unknown"
	};
	if (detectedPlatform === "node") return {
		"X-Stainless-Lang": "js",
		"X-Stainless-Package-Version": VERSION,
		"X-Stainless-OS": normalizePlatform(globalThis.process.platform ?? "unknown"),
		"X-Stainless-Arch": normalizeArch(globalThis.process.arch ?? "unknown"),
		"X-Stainless-Runtime": "node",
		"X-Stainless-Runtime-Version": globalThis.process.version ?? "unknown"
	};
	const browserInfo = getBrowserInfo();
	if (browserInfo) return {
		"X-Stainless-Lang": "js",
		"X-Stainless-Package-Version": VERSION,
		"X-Stainless-OS": "Unknown",
		"X-Stainless-Arch": "unknown",
		"X-Stainless-Runtime": `browser:${browserInfo.browser}`,
		"X-Stainless-Runtime-Version": browserInfo.version
	};
	return {
		"X-Stainless-Lang": "js",
		"X-Stainless-Package-Version": VERSION,
		"X-Stainless-OS": "Unknown",
		"X-Stainless-Arch": "unknown",
		"X-Stainless-Runtime": "unknown",
		"X-Stainless-Runtime-Version": "unknown"
	};
};
function getBrowserInfo() {
	if (typeof navigator === "undefined" || !navigator) return null;
	for (const { key, pattern } of [
		{
			key: "edge",
			pattern: /Edge(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/
		},
		{
			key: "ie",
			pattern: /MSIE(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/
		},
		{
			key: "ie",
			pattern: /Trident(?:.*rv\:(\d+)\.(\d+)(?:\.(\d+))?)?/
		},
		{
			key: "chrome",
			pattern: /Chrome(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/
		},
		{
			key: "firefox",
			pattern: /Firefox(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/
		},
		{
			key: "safari",
			pattern: /(?:Version\W+(\d+)\.(\d+)(?:\.(\d+))?)?(?:\W+Mobile\S*)?\W+Safari/
		}
	]) {
		const match = pattern.exec(navigator.userAgent);
		if (match) return {
			browser: key,
			version: `${match[1] || 0}.${match[2] || 0}.${match[3] || 0}`
		};
	}
	return null;
}
const normalizeArch = (arch) => {
	if (arch === "x32") return "x32";
	if (arch === "x86_64" || arch === "x64") return "x64";
	if (arch === "arm") return "arm";
	if (arch === "aarch64" || arch === "arm64") return "arm64";
	if (arch) return `other:${arch}`;
	return "unknown";
};
const normalizePlatform = (platform) => {
	platform = platform.toLowerCase();
	if (platform.includes("ios")) return "iOS";
	if (platform === "android") return "Android";
	if (platform === "darwin") return "MacOS";
	if (platform === "win32") return "Windows";
	if (platform === "freebsd") return "FreeBSD";
	if (platform === "openbsd") return "OpenBSD";
	if (platform === "linux") return "Linux";
	if (platform) return `Other:${platform}`;
	return "Unknown";
};
let _platformHeaders;
const getPlatformHeaders = () => {
	return _platformHeaders ?? (_platformHeaders = getPlatformProperties());
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/request-signal.mjs
/**
* Tracks the removal of the per-request abort listener that
* `fetchWithTimeout` attaches to a caller-provided signal, so the listener's
* lifetime matches the request instead of the signal.
*
* Without removal, a long-lived signal (e.g. one AbortController reused for
* a whole session) accumulates one `{ once: true }` listener plus its bound
* AbortController per HTTP attempt until the signal fires or is collected,
* and Node warns at the 11th listener. The listener must survive until the
* response body is settled - removing it when fetch resolves (headers) would
* break aborting an in-flight body read - so the code that finishes the body
* (response parsing, stream teardown, retry/error handling) calls
* `releaseRequestSignal` with the request's controller.
*/
const cleanups = /* @__PURE__ */ new WeakMap();
const registry = typeof globalThis.FinalizationRegistry === "function" ? new globalThis.FinalizationRegistry((controller) => releaseRequestSignal(controller)) : null;
function makeCleanup(signal, listener) {
	return () => signal.removeEventListener("abort", listener);
}
function registerRequestSignalCleanup(controller, signal, listener) {
	cleanups.set(controller, makeCleanup(signal, listener));
}
function armAbandonmentBackstop(body, controller) {
	if (cleanups.has(controller)) registry?.register(body, controller, controller);
}
function releaseRequestSignal(controller) {
	const cleanup = cleanups.get(controller);
	if (cleanup) {
		cleanups.delete(controller);
		registry?.unregister(controller);
		cleanup();
	}
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/shims.mjs
function getDefaultFetch() {
	if (typeof fetch !== "undefined") return fetch;
	throw new Error("`fetch` is not defined as a global; Either pass `fetch` to the client, `new Anthropic({ fetch })` or polyfill the global, `globalThis.fetch = fetch`");
}
function makeReadableStream(...args) {
	const ReadableStream = globalThis.ReadableStream;
	if (typeof ReadableStream === "undefined") throw new Error("`ReadableStream` is not defined as a global; You will need to polyfill it, `globalThis.ReadableStream = ReadableStream`");
	return new ReadableStream(...args);
}
function ReadableStreamFrom(iterable) {
	let iter = Symbol.asyncIterator in iterable ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]();
	return makeReadableStream({
		start() {},
		async pull(controller) {
			const { done, value } = await iter.next();
			if (done) controller.close();
			else controller.enqueue(value);
		},
		async cancel() {
			await iter.return?.();
		}
	});
}
/**
* Most browsers don't yet have async iterable support for ReadableStream,
* and Node has a very different way of reading bytes from its "ReadableStream".
*
* This polyfill was pulled from https://github.com/MattiasBuelens/web-streams-polyfill/pull/122#issuecomment-1627354490
*/
function ReadableStreamToAsyncIterable(stream) {
	if (stream[Symbol.asyncIterator]) return stream;
	const reader = stream.getReader();
	return {
		async next() {
			try {
				const result = await reader.read();
				if (result?.done) reader.releaseLock();
				return result;
			} catch (e) {
				reader.releaseLock();
				throw e;
			}
		},
		async return() {
			const cancelPromise = reader.cancel();
			reader.releaseLock();
			await cancelPromise;
			return {
				done: true,
				value: void 0
			};
		},
		[Symbol.asyncIterator]() {
			return this;
		}
	};
}
/**
* Cancels a ReadableStream we don't need to consume.
* See https://undici.nodejs.org/#/?id=garbage-collection
*/
async function CancelReadableStream(stream) {
	if (stream === null || typeof stream !== "object") return;
	if (stream[Symbol.asyncIterator]) {
		await stream[Symbol.asyncIterator]().return?.();
		return;
	}
	const reader = stream.getReader();
	const cancelPromise = reader.cancel();
	reader.releaseLock();
	await cancelPromise;
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/request-options.mjs
const FallbackEncoder = ({ headers, body }) => {
	return {
		bodyHeaders: { "content-type": "application/json" },
		body: JSON.stringify(body)
	};
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/qs/formats.mjs
const default_format = "RFC3986";
const default_formatter = (v) => String(v);
const formatters = {
	RFC1738: (v) => String(v).replace(/%20/g, "+"),
	RFC3986: default_formatter
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/qs/utils.mjs
let has = (obj, key) => (has = Object.hasOwn ?? Function.prototype.call.bind(Object.prototype.hasOwnProperty), has(obj, key));
const hex_table = /* @__PURE__ */ (() => {
	const array = [];
	for (let i = 0; i < 256; ++i) array.push("%" + ((i < 16 ? "0" : "") + i.toString(16)).toUpperCase());
	return array;
})();
const limit = 1024;
const encode = (str, _defaultEncoder, charset, _kind, format) => {
	if (str.length === 0) return str;
	let string = str;
	if (typeof str === "symbol") string = Symbol.prototype.toString.call(str);
	else if (typeof str !== "string") string = String(str);
	if (charset === "iso-8859-1") return escape(string).replace(/%u[0-9a-f]{4}/gi, function($0) {
		return "%26%23" + parseInt($0.slice(2), 16) + "%3B";
	});
	let out = "";
	for (let j = 0; j < string.length; j += limit) {
		const segment = string.length >= limit ? string.slice(j, j + limit) : string;
		const arr = [];
		for (let i = 0; i < segment.length; ++i) {
			let c = segment.charCodeAt(i);
			if (c === 45 || c === 46 || c === 95 || c === 126 || c >= 48 && c <= 57 || c >= 65 && c <= 90 || c >= 97 && c <= 122 || format === "RFC1738" && (c === 40 || c === 41)) {
				arr[arr.length] = segment.charAt(i);
				continue;
			}
			if (c < 128) {
				arr[arr.length] = hex_table[c];
				continue;
			}
			if (c < 2048) {
				arr[arr.length] = hex_table[192 | c >> 6] + hex_table[128 | c & 63];
				continue;
			}
			if (c < 55296 || c >= 57344) {
				arr[arr.length] = hex_table[224 | c >> 12] + hex_table[128 | c >> 6 & 63] + hex_table[128 | c & 63];
				continue;
			}
			i += 1;
			c = 65536 + ((c & 1023) << 10 | segment.charCodeAt(i) & 1023);
			arr[arr.length] = hex_table[240 | c >> 18] + hex_table[128 | c >> 12 & 63] + hex_table[128 | c >> 6 & 63] + hex_table[128 | c & 63];
		}
		out += arr.join("");
	}
	return out;
};
function is_buffer(obj) {
	if (!obj || typeof obj !== "object") return false;
	return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
}
function maybe_map(val, fn) {
	if (isArray(val)) {
		const mapped = [];
		for (let i = 0; i < val.length; i += 1) mapped.push(fn(val[i]));
		return mapped;
	}
	return fn(val);
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/qs/stringify.mjs
const array_prefix_generators = {
	brackets(prefix) {
		return String(prefix) + "[]";
	},
	comma: "comma",
	indices(prefix, key) {
		return String(prefix) + "[" + key + "]";
	},
	repeat(prefix) {
		return String(prefix);
	}
};
const push_to_array = function(arr, value_or_array) {
	Array.prototype.push.apply(arr, isArray(value_or_array) ? value_or_array : [value_or_array]);
};
let toISOString;
const defaults = {
	addQueryPrefix: false,
	allowDots: false,
	allowEmptyArrays: false,
	arrayFormat: "indices",
	charset: "utf-8",
	charsetSentinel: false,
	delimiter: "&",
	encode: true,
	encodeDotInKeys: false,
	encoder: encode,
	encodeValuesOnly: false,
	format: default_format,
	formatter: default_formatter,
	/** @deprecated */
	indices: false,
	serializeDate(date) {
		return (toISOString ?? (toISOString = Function.prototype.call.bind(Date.prototype.toISOString)))(date);
	},
	skipNulls: false,
	strictNullHandling: false
};
function is_non_nullish_primitive(v) {
	return typeof v === "string" || typeof v === "number" || typeof v === "boolean" || typeof v === "symbol" || typeof v === "bigint";
}
const sentinel = {};
function inner_stringify(object, prefix, generateArrayPrefix, commaRoundTrip, allowEmptyArrays, strictNullHandling, skipNulls, encodeDotInKeys, encoder, filter, sort, allowDots, serializeDate, format, formatter, encodeValuesOnly, charset, sideChannel) {
	let obj = object;
	let tmp_sc = sideChannel;
	let step = 0;
	let find_flag = false;
	while ((tmp_sc = tmp_sc.get(sentinel)) !== void 0 && !find_flag) {
		const pos = tmp_sc.get(object);
		step += 1;
		if (typeof pos !== "undefined") {
			if (pos === step) throw new RangeError("Cyclic object value");
			else find_flag = true;
		}
		if (typeof tmp_sc.get(sentinel) === "undefined") step = 0;
	}
	if (typeof filter === "function") obj = filter(prefix, obj);
	else if (obj instanceof Date) obj = serializeDate?.(obj);
	else if (generateArrayPrefix === "comma" && isArray(obj)) obj = maybe_map(obj, function(value) {
		if (value instanceof Date) return serializeDate?.(value);
		return value;
	});
	if (obj === null) {
		if (strictNullHandling) return encoder && !encodeValuesOnly ? encoder(prefix, defaults.encoder, charset, "key", format) : prefix;
		obj = "";
	}
	if (is_non_nullish_primitive(obj) || is_buffer(obj)) {
		if (encoder) {
			const key_value = encodeValuesOnly ? prefix : encoder(prefix, defaults.encoder, charset, "key", format);
			return [formatter?.(key_value) + "=" + formatter?.(encoder(obj, defaults.encoder, charset, "value", format))];
		}
		return [formatter?.(prefix) + "=" + formatter?.(String(obj))];
	}
	const values = [];
	if (typeof obj === "undefined") return values;
	let obj_keys;
	if (generateArrayPrefix === "comma" && isArray(obj)) {
		if (encodeValuesOnly && encoder) obj = maybe_map(obj, encoder);
		obj_keys = [{ value: obj.length > 0 ? obj.join(",") || null : void 0 }];
	} else if (isArray(filter)) obj_keys = filter;
	else {
		const keys = Object.keys(obj);
		obj_keys = sort ? keys.sort(sort) : keys;
	}
	const encoded_prefix = encodeDotInKeys ? String(prefix).replace(/\./g, "%2E") : String(prefix);
	const adjusted_prefix = commaRoundTrip && isArray(obj) && obj.length === 1 ? encoded_prefix + "[]" : encoded_prefix;
	if (allowEmptyArrays && isArray(obj) && obj.length === 0) return adjusted_prefix + "[]";
	for (let j = 0; j < obj_keys.length; ++j) {
		const key = obj_keys[j];
		const value = typeof key === "object" && typeof key.value !== "undefined" ? key.value : obj[key];
		if (skipNulls && value === null) continue;
		const encoded_key = allowDots && encodeDotInKeys ? key.replace(/\./g, "%2E") : key;
		const key_prefix = isArray(obj) ? typeof generateArrayPrefix === "function" ? generateArrayPrefix(adjusted_prefix, encoded_key) : adjusted_prefix : adjusted_prefix + (allowDots ? "." + encoded_key : "[" + encoded_key + "]");
		sideChannel.set(object, step);
		const valueSideChannel = /* @__PURE__ */ new WeakMap();
		valueSideChannel.set(sentinel, sideChannel);
		push_to_array(values, inner_stringify(value, key_prefix, generateArrayPrefix, commaRoundTrip, allowEmptyArrays, strictNullHandling, skipNulls, encodeDotInKeys, generateArrayPrefix === "comma" && encodeValuesOnly && isArray(obj) ? null : encoder, filter, sort, allowDots, serializeDate, format, formatter, encodeValuesOnly, charset, valueSideChannel));
	}
	return values;
}
function normalize_stringify_options(opts = defaults) {
	if (typeof opts.allowEmptyArrays !== "undefined" && typeof opts.allowEmptyArrays !== "boolean") throw new TypeError("`allowEmptyArrays` option can only be `true` or `false`, when provided");
	if (typeof opts.encodeDotInKeys !== "undefined" && typeof opts.encodeDotInKeys !== "boolean") throw new TypeError("`encodeDotInKeys` option can only be `true` or `false`, when provided");
	if (opts.encoder !== null && typeof opts.encoder !== "undefined" && typeof opts.encoder !== "function") throw new TypeError("Encoder has to be a function.");
	const charset = opts.charset || defaults.charset;
	if (typeof opts.charset !== "undefined" && opts.charset !== "utf-8" && opts.charset !== "iso-8859-1") throw new TypeError("The charset option must be either utf-8, iso-8859-1, or undefined");
	let format = default_format;
	if (typeof opts.format !== "undefined") {
		if (!has(formatters, opts.format)) throw new TypeError("Unknown format option provided.");
		format = opts.format;
	}
	const formatter = formatters[format];
	let filter = defaults.filter;
	if (typeof opts.filter === "function" || isArray(opts.filter)) filter = opts.filter;
	let arrayFormat;
	if (opts.arrayFormat && opts.arrayFormat in array_prefix_generators) arrayFormat = opts.arrayFormat;
	else if ("indices" in opts) arrayFormat = opts.indices ? "indices" : "repeat";
	else arrayFormat = defaults.arrayFormat;
	if ("commaRoundTrip" in opts && typeof opts.commaRoundTrip !== "boolean") throw new TypeError("`commaRoundTrip` must be a boolean, or absent");
	const allowDots = typeof opts.allowDots === "undefined" ? !!opts.encodeDotInKeys === true ? true : defaults.allowDots : !!opts.allowDots;
	return {
		addQueryPrefix: typeof opts.addQueryPrefix === "boolean" ? opts.addQueryPrefix : defaults.addQueryPrefix,
		allowDots,
		allowEmptyArrays: typeof opts.allowEmptyArrays === "boolean" ? !!opts.allowEmptyArrays : defaults.allowEmptyArrays,
		arrayFormat,
		charset,
		charsetSentinel: typeof opts.charsetSentinel === "boolean" ? opts.charsetSentinel : defaults.charsetSentinel,
		commaRoundTrip: !!opts.commaRoundTrip,
		delimiter: typeof opts.delimiter === "undefined" ? defaults.delimiter : opts.delimiter,
		encode: typeof opts.encode === "boolean" ? opts.encode : defaults.encode,
		encodeDotInKeys: typeof opts.encodeDotInKeys === "boolean" ? opts.encodeDotInKeys : defaults.encodeDotInKeys,
		encoder: typeof opts.encoder === "function" ? opts.encoder : defaults.encoder,
		encodeValuesOnly: typeof opts.encodeValuesOnly === "boolean" ? opts.encodeValuesOnly : defaults.encodeValuesOnly,
		filter,
		format,
		formatter,
		serializeDate: typeof opts.serializeDate === "function" ? opts.serializeDate : defaults.serializeDate,
		skipNulls: typeof opts.skipNulls === "boolean" ? opts.skipNulls : defaults.skipNulls,
		sort: typeof opts.sort === "function" ? opts.sort : null,
		strictNullHandling: typeof opts.strictNullHandling === "boolean" ? opts.strictNullHandling : defaults.strictNullHandling
	};
}
function stringify(object, opts = {}) {
	let obj = object;
	const options = normalize_stringify_options(opts);
	let obj_keys;
	let filter;
	if (typeof options.filter === "function") {
		filter = options.filter;
		obj = filter("", obj);
	} else if (isArray(options.filter)) {
		filter = options.filter;
		obj_keys = filter;
	}
	const keys = [];
	if (typeof obj !== "object" || obj === null) return "";
	const generateArrayPrefix = array_prefix_generators[options.arrayFormat];
	const commaRoundTrip = generateArrayPrefix === "comma" && options.commaRoundTrip;
	if (!obj_keys) obj_keys = Object.keys(obj);
	if (options.sort) obj_keys.sort(options.sort);
	const sideChannel = /* @__PURE__ */ new WeakMap();
	for (let i = 0; i < obj_keys.length; ++i) {
		const key = obj_keys[i];
		if (options.skipNulls && obj[key] === null) continue;
		push_to_array(keys, inner_stringify(obj[key], key, generateArrayPrefix, commaRoundTrip, options.allowEmptyArrays, options.strictNullHandling, options.skipNulls, options.encodeDotInKeys, options.encode ? options.encoder : null, options.filter, options.sort, options.allowDots, options.serializeDate, options.format, options.formatter, options.encodeValuesOnly, options.charset, sideChannel));
	}
	const joined = keys.join(options.delimiter);
	let prefix = options.addQueryPrefix === true ? "?" : "";
	if (options.charsetSentinel) {
		if (options.charset === "iso-8859-1") prefix += "utf8=%26%2310003%3B&";
		else prefix += "utf8=%E2%9C%93&";
	}
	return joined.length > 0 ? prefix + joined : "";
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/query.mjs
function stringifyQuery(query) {
	return stringify(query, { arrayFormat: "brackets" });
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/credentials/types.mjs
const GRANT_TYPE_JWT_BEARER = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const GRANT_TYPE_REFRESH_TOKEN = "refresh_token";
const TOKEN_ENDPOINT = "/v1/oauth/token";
/**
* `anthropic-beta` value required on authenticated API requests using an
* OAuth bearer token, and on `refresh_token` grants against the token endpoint.
*/
const OAUTH_API_BETA_HEADER = "oauth-2025-04-20";
/**
* `anthropic-beta` value required on jwt-bearer exchanges against the token
* endpoint. It routes the request to the federation service; it must NOT be
* sent on `refresh_token` grants, which are handled by a different backend.
*/
const FEDERATION_BETA_HEADER = "oidc-federation-2026-04-01";
const MAX_TOKEN_RESPONSE_BYTES = 1 << 20;
/**
* Rejects base URLs that would cause a JWT assertion or refresh token to be
* sent over cleartext HTTP. Loopback hosts are allowed for local development.
*/
function requireSecureTokenEndpoint(baseURL) {
	if (!baseURL) return;
	let u;
	try {
		u = new URL(baseURL);
	} catch (err) {
		throw new WorkloadIdentityError(`Invalid token endpoint base URL "${baseURL}": ${err}`);
	}
	if (u.protocol === "https:") return;
	const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (u.protocol === "http:" && (host === "localhost" || host === "127.0.0.1" || host === "::1")) return;
	throw new WorkloadIdentityError(`Refusing to send credential over non-https token endpoint "${baseURL}"`);
}
/**
* Reads the response body as text, parses it as a token-endpoint JSON
* response, validates `access_token` is present, and rejects a non-Bearer
* `token_type` when one is provided. Reads at most
* {@link MAX_TOKEN_RESPONSE_BYTES} from the body stream.
*/
async function parseTokenResponse(resp, requestId) {
	const text = await readLimitedText(resp);
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new WorkloadIdentityError(`Token endpoint returned non-JSON response (status ${resp.status})`, resp.status, redactSensitive(text), requestId);
	}
	if (!data.access_token) throw new WorkloadIdentityError(`Token endpoint response missing access_token: ${JSON.stringify(redactSensitive(data))}`, resp.status, redactSensitive(data), requestId);
	if (data.token_type && data.token_type.toLowerCase() !== "bearer") throw new WorkloadIdentityError(`Token endpoint response: unsupported token_type "${data.token_type}" (want Bearer)`, resp.status, redactSensitive(data), requestId);
	return data;
}
const MAX_ERROR_BODY_CHARS = 2e3;
const SAFE_ERROR_KEYS = /* @__PURE__ */ new Set([
	"error",
	"error_description",
	"error_uri"
]);
/**
* Returns a redacted copy of a token-endpoint error body for safe inclusion
* in an exception. Strings are truncated; objects keep only the RFC 6749
* §5.2 error fields.
*/
function redactSensitive(body) {
	if (body == null) return body;
	if (typeof body === "string") {
		let parsed;
		try {
			parsed = JSON.parse(body);
		} catch {
			if (body.length <= MAX_ERROR_BODY_CHARS) return body;
			return body.slice(0, MAX_ERROR_BODY_CHARS) + `... <${body.length - MAX_ERROR_BODY_CHARS} more chars>`;
		}
		return JSON.stringify(redactSensitive(parsed));
	}
	if (typeof body === "object" && !Array.isArray(body)) {
		const out = {};
		for (const [k, v] of Object.entries(body)) if (SAFE_ERROR_KEYS.has(k)) out[k] = v;
		return out;
	}
	return null;
}
/**
* Best-effort safety check on a credentials file before reading it.
*
* On POSIX: resolves symlinks (so containerized deployments that mount the
* credential as a symlink to a tmpfs-backed file keep working), then rejects
* the resolved target if it is group- or world- readable or writable. A uid
* mismatch on the resolved target is surfaced via `onWarn` since
* root-written/app-read is common in init-container setups. No-op on Windows.
*/
async function checkCredentialsFileSafety(path, onWarn = (m) => console.warn(`anthropic-sdk: ${m}`)) {
	if (typeof process === "undefined" || process.platform === "win32") return;
	const { fs } = await import("./node-PfV1oW7_.js");
	let resolved = path;
	let st;
	try {
		resolved = await fs.promises.realpath(path);
		st = await fs.promises.stat(resolved);
	} catch {
		return;
	}
	const mode = st.mode & 511;
	if (mode & 18) throw new WorkloadIdentityError(`Credentials file at ${resolved} is group/world-writable (mode 0o${mode.toString(8)}); this allows other local users to plant tokens. Run \`chmod 600 ${resolved}\`.`);
	if (mode & 36) throw new WorkloadIdentityError(`Credentials file at ${resolved} is group/world-readable (mode 0o${mode.toString(8)}); run \`chmod 600 ${resolved}\` before retrying.`);
	if (typeof process.getuid === "function" && st.uid !== process.getuid()) onWarn(`credentials file at ${resolved} is owned by uid ${st.uid} (current process uid ${process.getuid()}); verify this is intentional.`);
}
/**
* Atomically writes JSON to `targetPath` via a `.tmp` sibling + rename,
* with fsync on the file and (best-effort) on the parent directory.
* Creates the parent directory with mode 0700 and the file with mode 0600.
*/
async function writeCredentialsFileAtomic(targetPath, data) {
	const { fs, path } = await import("./node-PfV1oW7_.js");
	const dir = path.dirname(targetPath);
	await fs.promises.mkdir(dir, {
		recursive: true,
		mode: 448
	});
	const tmpPath = `${targetPath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
	try {
		const fh = await fs.promises.open(tmpPath, "w", 384);
		try {
			await fh.writeFile(JSON.stringify(data, null, 2));
			await fh.sync();
		} finally {
			await fh.close();
		}
		await fs.promises.rename(tmpPath, targetPath);
	} catch (err) {
		await fs.promises.unlink(tmpPath).catch(() => {});
		throw err;
	}
	try {
		const dirFh = await fs.promises.open(dir, "r");
		try {
			await dirFh.sync();
		} finally {
			await dirFh.close();
		}
	} catch {}
}
async function readLimitedText(resp) {
	if (!resp.body) return "";
	const reader = resp.body.getReader();
	const chunks = [];
	let received = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (received + value.length > MAX_TOKEN_RESPONSE_BYTES) {
			const remaining = MAX_TOKEN_RESPONSE_BYTES - received;
			if (remaining > 0) chunks.push(value.subarray(0, remaining));
			await reader.cancel();
			break;
		}
		chunks.push(value);
		received += value.length;
	}
	let merged;
	if (chunks.length === 1) merged = chunks[0];
	else {
		merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
		let offset = 0;
		for (const c of chunks) {
			merged.set(c, offset);
			offset += c.length;
		}
	}
	return new TextDecoder("utf-8").decode(merged);
}
var WorkloadIdentityError = class extends AnthropicError {
	constructor(message, statusCode = null, body = null, requestId = null) {
		super(message);
		this.statusCode = statusCode;
		this.body = body;
		this.requestId = requestId;
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/time.mjs
/** Current time as unix epoch seconds. */
function nowAsSeconds() {
	return Math.floor(Date.now() / 1e3);
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/credentials/token-cache.mjs
/**
* Wraps an {@link AccessTokenProvider} with two-tier proactive refresh
* and concurrent deduplication.
*
* Refresh policy on each {@link getToken} call:
*
* - No cached token → call provider (blocking), cache, return.
* - Cached with `expiresAt == null` → return cached forever.
* - More than 120s remaining → return cached.
* - 30–120s remaining (advisory window) → return stale token immediately,
*   kick off background refresh. On failure, log and keep stale.
* - Less than 30s remaining or expired (mandatory) → block and refresh.
*   On failure, throw.
*
* Concurrent mandatory callers coalesce into a single provider call.
*/
var TokenCache = class {
	constructor(provider, onAdvisoryRefreshError) {
		this.cached = null;
		this.pendingRefresh = null;
		this.nextForce = false;
		this.lastAdvisoryError = 0;
		this.provider = provider;
		this.onAdvisoryRefreshError = onAdvisoryRefreshError;
	}
	async getToken() {
		const force = this.nextForce;
		this.nextForce = false;
		const cached = this.cached;
		if (force || cached == null) return (await this.refresh(force)).token;
		if (cached.expiresAt == null) return cached.token;
		const remaining = cached.expiresAt - nowAsSeconds();
		if (remaining > 120) return cached.token;
		if (remaining > 30) {
			this.backgroundRefresh();
			return cached.token;
		}
		return (await this.refresh()).token;
	}
	/**
	* Clears the cached token and marks the next {@link getToken} as a forced
	* refresh, so the underlying provider bypasses any on-disk freshness check.
	* Called after a 401 — the server has just told us the token is bad even
	* if its `expires_at` still looks fresh.
	*/
	invalidate() {
		this.cached = null;
		this.nextForce = true;
	}
	/**
	* Mandatory refresh. Joins any in-flight refresh unless forced — a forced
	* refresh must not coalesce into a non-forced one that may re-serve the
	* same stale disk token.
	*/
	refresh(force = false) {
		if (this.pendingRefresh && !force) return this.pendingRefresh;
		return this.doRefresh(force);
	}
	/**
	* Advisory background refresh. Shares the same in-flight promise as
	* mandatory refreshes for deduplication, but swallows errors so the
	* stale cached token keeps being served. Backs off for
	* {@link ADVISORY_REFRESH_BACKOFF_IN_SECONDS} after a failure so an
	* outage during the advisory window doesn't hammer the token endpoint.
	*/
	backgroundRefresh() {
		if (this.pendingRefresh) return;
		if (nowAsSeconds() - this.lastAdvisoryError < 5) return;
		this.doRefresh().catch((err) => {
			this.lastAdvisoryError = nowAsSeconds();
			this.onAdvisoryRefreshError?.(err);
		});
	}
	/**
	* Core refresh. Sets {@link pendingRefresh} so concurrent callers
	* (both advisory and mandatory) coalesce into a single provider call.
	*/
	doRefresh(force = false) {
		this.pendingRefresh = this.provider(force ? { forceRefresh: true } : void 0).then((token) => {
			this.cached = token;
			this.pendingRefresh = null;
			return token;
		}, (err) => {
			this.pendingRefresh = null;
			throw err;
		});
		return this.pendingRefresh;
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/env.mjs
/**
* Read an environment variable.
*
* Trims beginning and trailing whitespace.
*
* Will return undefined if the environment variable doesn't exist or cannot be accessed.
*/
const readEnv = (env) => {
	if (typeof globalThis.process !== "undefined") return globalThis.process.env?.[env]?.trim() || void 0;
	if (typeof globalThis.Deno !== "undefined") return globalThis.Deno.env?.get?.(env)?.trim() || void 0;
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/bytes.mjs
function concatBytes(buffers) {
	let length = 0;
	for (const buffer of buffers) length += buffer.length;
	const output = new Uint8Array(length);
	let index = 0;
	for (const buffer of buffers) {
		output.set(buffer, index);
		index += buffer.length;
	}
	return output;
}
let encodeUTF8_;
function encodeUTF8(str) {
	let encoder;
	return (encodeUTF8_ ?? (encoder = new globalThis.TextEncoder(), encodeUTF8_ = encoder.encode.bind(encoder)))(str);
}
let decodeUTF8_;
function decodeUTF8(bytes) {
	let decoder;
	return (decodeUTF8_ ?? (decoder = new globalThis.TextDecoder(), decodeUTF8_ = decoder.decode.bind(decoder)))(bytes);
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/base64.mjs
const fromBase64 = (str) => {
	if (typeof globalThis.Buffer !== "undefined") {
		const buf = globalThis.Buffer.from(str, "base64");
		return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
	}
	if (typeof atob !== "undefined") {
		const bstr = atob(str);
		const buf = new Uint8Array(bstr.length);
		for (let i = 0; i < bstr.length; i++) buf[i] = bstr.charCodeAt(i);
		return buf;
	}
	throw new AnthropicError("Cannot decode base64 string; Expected `Buffer` or `atob` to be defined");
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/log.mjs
const defaultLogLevel = "warn";
const levelNumbers = {
	off: 0,
	error: 200,
	warn: 300,
	info: 400,
	debug: 500
};
const parseLogLevel = (maybeLevel, sourceName, logger) => {
	if (!maybeLevel) return;
	if (hasOwn(levelNumbers, maybeLevel)) return maybeLevel;
	logger.warn(`${sourceName} was set to ${JSON.stringify(maybeLevel)}, expected one of ${JSON.stringify(Object.keys(levelNumbers))}`);
};
function noop() {}
function makeLogFn(fnLevel, logger, logLevel) {
	if (!logger || levelNumbers[fnLevel] > levelNumbers[logLevel]) return noop;
	else return logger[fnLevel].bind(logger);
}
const noopLogger = {
	error: noop,
	warn: noop,
	info: noop,
	debug: noop
};
let cachedLoggers = /* @__PURE__ */ new WeakMap();
function filterLogger(logger, logLevel) {
	const cachedLogger = cachedLoggers.get(logger);
	if (cachedLogger && cachedLogger[0] === logLevel) return cachedLogger[1];
	const levelLogger = {
		error: makeLogFn("error", logger, logLevel),
		warn: makeLogFn("warn", logger, logLevel),
		info: makeLogFn("info", logger, logLevel),
		debug: makeLogFn("debug", logger, logLevel)
	};
	cachedLoggers.set(logger, [logLevel, levelLogger]);
	return levelLogger;
}
function loggerFor(client) {
	const logger = client.logger;
	const logLevel = client.logLevel ?? "off";
	if (!logger) return noopLogger;
	return filterLogger(logger, logLevel);
}
let lastEnvLevel;
let cachedDefaultLogger;
/**
* A logger matching the client defaults — `console`, filtered to
* `ANTHROPIC_LOG` or {@link defaultLogLevel} — for contexts with no client to
* read the configured `logger`/`logLevel` from.
*
* Cached per `ANTHROPIC_LOG` value so an invalid value warns once, like a
* client construction does, rather than on every request.
*/
function defaultLogger() {
	const envLevel = readEnv("ANTHROPIC_LOG");
	if (!cachedDefaultLogger || envLevel !== lastEnvLevel) {
		lastEnvLevel = envLevel;
		cachedDefaultLogger = filterLogger(console, parseLogLevel(envLevel, "process.env['ANTHROPIC_LOG']", filterLogger(console, "warn")) ?? "warn");
	}
	return cachedDefaultLogger;
}
const formatRequestDetails = (details) => {
	if (details.options) {
		details.options = { ...details.options };
		delete details.options["headers"];
	}
	if (details.headers) details.headers = Object.fromEntries((details.headers instanceof Headers ? [...details.headers] : Object.entries(details.headers)).map(([name, value]) => [name, name.toLowerCase() === "authorization" || name.toLowerCase() === "api-key" || name.toLowerCase() === "x-api-key" || name.toLowerCase() === "cookie" || name.toLowerCase() === "set-cookie" ? "***" : value]));
	if ("retryOfRequestLogID" in details) {
		if (details.retryOfRequestLogID) details.retryOf = details.retryOfRequestLogID;
		delete details.retryOfRequestLogID;
	}
	return details;
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/core/credentials.mjs
const PROFILE_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
function validateProfileName(name) {
	if (!name) throw new Error("profile name is empty");
	if (name === "." || name === "..") throw new Error(`profile name "${name}" is not allowed`);
	if (name.includes("/") || name.includes("\\")) throw new Error(`profile name "${name}" must not contain path separators`);
	if (!PROFILE_NAME_PATTERN.test(name)) throw new Error(`profile name "${name}" contains disallowed characters (allowed: letters, digits, '_', '.', '-')`);
}
/**
* Same as {@link loadConfig}, but also reports whether the config was loaded
* from a profile file on disk (`fromFile: true`) or synthesized entirely from
* environment variables (`fromFile: false`).
*/
const loadConfigWithSource = async (profile) => {
	var _a, _b;
	const rootConfigPath = await getRootConfigPath();
	if (rootConfigPath === null) return null;
	const profileName = profile ?? await getActiveProfileName();
	if (profileName === null) return null;
	validateProfileName(profileName);
	const { fs, path } = await import("./node-PfV1oW7_.js");
	const configPath = path.join(rootConfigPath, "configs", `${profileName}.json`);
	let configRaw;
	try {
		configRaw = await fs.promises.readFile(configPath, "utf-8");
	} catch (err) {
		if (err?.code !== "ENOENT") throw new Error(`failed to read config file ${configPath}: ${err}`);
		configRaw = null;
	}
	if (configRaw === null) {
		const organizationId = readEnv("ANTHROPIC_ORGANIZATION_ID");
		const identityTokenFile = readEnv("ANTHROPIC_IDENTITY_TOKEN_FILE");
		const federationRuleId = readEnv("ANTHROPIC_FEDERATION_RULE_ID");
		if (federationRuleId && organizationId) return {
			fromFile: false,
			config: {
				organization_id: organizationId,
				workspace_id: readEnv("ANTHROPIC_WORKSPACE_ID"),
				base_url: readEnv("ANTHROPIC_BASE_URL"),
				authentication: {
					type: "oidc_federation",
					federation_rule_id: federationRuleId,
					service_account_id: readEnv("ANTHROPIC_SERVICE_ACCOUNT_ID"),
					identity_token: identityTokenFile ? {
						source: "file",
						path: identityTokenFile
					} : void 0,
					scope: readEnv("ANTHROPIC_SCOPE")
				}
			}
		};
		return null;
	}
	let config;
	try {
		config = JSON.parse(configRaw);
	} catch (err) {
		throw new Error(`failed to parse config file ${configPath}: ${err}`);
	}
	if (!config.authentication) throw new Error(`config file ${configPath} is missing "authentication"`);
	const authType = config.authentication.type;
	if (authType !== "oidc_federation" && authType !== "user_oauth") throw new Error(`authentication.type "${authType}" is not a known authentication type`);
	config.organization_id ?? (config.organization_id = readEnv("ANTHROPIC_ORGANIZATION_ID"));
	config.workspace_id ?? (config.workspace_id = readEnv("ANTHROPIC_WORKSPACE_ID"));
	config.base_url ?? (config.base_url = readEnv("ANTHROPIC_BASE_URL"));
	(_a = config.authentication).scope ?? (_a.scope = readEnv("ANTHROPIC_SCOPE"));
	if (config.authentication.type === "oidc_federation") {
		if (!config.authentication.identity_token) {
			const identityTokenFile = readEnv("ANTHROPIC_IDENTITY_TOKEN_FILE");
			if (identityTokenFile) config.authentication.identity_token = {
				source: "file",
				path: identityTokenFile
			};
		}
		if (!config.authentication.federation_rule_id) config.authentication.federation_rule_id = readEnv("ANTHROPIC_FEDERATION_RULE_ID") ?? "";
		(_b = config.authentication).service_account_id ?? (_b.service_account_id = readEnv("ANTHROPIC_SERVICE_ACCOUNT_ID"));
	}
	return {
		config,
		fromFile: true
	};
};
/**
* Resolves the credentials file path for the given config.
*
* Uses `authentication.credentials_path` from the config if set, otherwise
* falls back to `<config_dir>/credentials/<profile>.json`.
*
* Returns `null` when running in a browser or the path cannot be resolved.
*/
const getCredentialsPath = async (config, profile) => {
	if (config?.authentication.credentials_path) return config.authentication.credentials_path;
	const rootConfigPath = await getRootConfigPath();
	if (!rootConfigPath) return null;
	const profileName = profile ?? await getActiveProfileName();
	if (!profileName) return null;
	validateProfileName(profileName);
	const { path } = await import("./node-PfV1oW7_.js");
	return path.join(rootConfigPath, "credentials", `${profileName}.json`);
};
const getRootConfigPath = async () => {
	if (!supportsLocalConfigFiles()) return null;
	const { path } = await import("./node-PfV1oW7_.js");
	const configDir = readEnv("ANTHROPIC_CONFIG_DIR");
	if (configDir) return configDir;
	if (getPlatformHeaders()["X-Stainless-OS"] === "Windows") {
		const appData = readEnv("APPDATA");
		if (appData) return path.join(appData, "Anthropic");
		const userProfile = readEnv("USERPROFILE");
		if (userProfile) return path.join(userProfile, "AppData", "Roaming", "Anthropic");
		return null;
	}
	const xdgConfigHome = readEnv("XDG_CONFIG_HOME");
	if (xdgConfigHome) return path.join(xdgConfigHome, "anthropic");
	const home = readEnv("HOME");
	if (home) return path.join(home, ".config", "anthropic");
	return null;
};
const supportsLocalConfigFiles = () => {
	const runtime = getPlatformHeaders()["X-Stainless-Runtime"];
	return runtime === "node" || runtime === "deno";
};
const getActiveProfileName = async () => {
	const rootConfigPath = await getRootConfigPath();
	if (!rootConfigPath) return null;
	const profileName = readEnv("ANTHROPIC_PROFILE");
	if (profileName) return profileName;
	const { fs, path } = await import("./node-PfV1oW7_.js");
	const filePath = path.join(rootConfigPath, "active_config");
	try {
		return (await fs.promises.readFile(filePath, "utf-8")).trim() || "default";
	} catch (err) {
		if (err?.code !== "ENOENT") throw new Error(`failed to read ${filePath}: ${err}`);
		return "default";
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/credentials/identity-token.mjs
/**
* Reads a JWT from a file on every call. Supports automatic rotation
* (e.g. Kubernetes projected service-account tokens).
*/
function identityTokenFromFile(path) {
	if (!path) throw new AnthropicError("Identity token file path is empty");
	return async () => {
		const { fs } = await import("./node-PfV1oW7_.js");
		let content;
		try {
			content = await fs.promises.readFile(path, "utf-8");
		} catch (err) {
			throw new AnthropicError(`Failed to read identity token file at ${path}: ${err}`);
		}
		const token = content.trim();
		if (!token) throw new AnthropicError(`Identity token file at ${path} is empty`);
		return token;
	};
}
/**
* Wraps a static JWT string as an {@link IdentityTokenProvider}.
*/
function identityTokenFromValue(token) {
	if (!token) throw new AnthropicError("Identity token value is empty");
	return () => token;
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/credentials/oidc-federation.mjs
/**
* Exchanges an external OIDC JWT for an Anthropic access token via the
* RFC 7523 jwt-bearer grant.
*
* Each invocation performs a fresh token exchange. Wrap in a
* {@link TokenCache} to avoid exchanging on every request.
*
* Federation grants do not return a refresh token — callers re-exchange
* their assertion on expiry.
*/
function oidcFederationProvider(config) {
	return async () => {
		requireSecureTokenEndpoint(config.baseURL);
		const jwt = await config.identityTokenProvider();
		if (jwt.length > 16384) throw new WorkloadIdentityError(`Identity token is ${Math.ceil(jwt.length / 1024)} KiB, exceeds the 16 KiB assertion limit`);
		const body = {
			grant_type: GRANT_TYPE_JWT_BEARER,
			assertion: jwt,
			federation_rule_id: config.federationRuleId,
			organization_id: config.organizationId
		};
		if (config.serviceAccountId) body["service_account_id"] = config.serviceAccountId;
		if (config.workspaceId) body["workspace_id"] = config.workspaceId;
		const url = `${config.baseURL}${TOKEN_ENDPOINT}`;
		let resp;
		try {
			resp = await config.fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"anthropic-beta": `${OAUTH_API_BETA_HEADER},${FEDERATION_BETA_HEADER}`,
					"User-Agent": config.userAgent || `anthropic-sdk-typescript/0.123.0 oidcFederationProvider`
				},
				body: JSON.stringify(body)
			});
		} catch (err) {
			throw new WorkloadIdentityError(`Failed to reach token endpoint ${url}: ${err}`);
		}
		const requestId = resp.headers.get("Request-Id");
		if (!resp.ok) {
			const redacted = redactSensitive(await resp.text().catch(() => ""));
			let hint = "";
			if (resp.status === 401) hint = ` Ensure your federation rule matches your identity token. ${config.workspaceId ? "" : "If your federation rule is scoped to multiple workspaces, set the ANTHROPIC_WORKSPACE_ID environment variable, the 'workspace_id' config key, or the `workspaceId` option. "}View your authentication events in the Workload identity page of Claude Console for more details.`;
			throw new WorkloadIdentityError(`Token exchange failed with status ${resp.status}${requestId ? ` (request-id ${requestId})` : ""}: ${redacted}${hint}`, resp.status, redacted, requestId);
		}
		const data = await parseTokenResponse(resp, requestId);
		const expiresIn = Number(data.expires_in);
		if (!Number.isFinite(expiresIn)) throw new WorkloadIdentityError(`Token endpoint response missing required fields: ${JSON.stringify(redactSensitive(data))}`, resp.status, redactSensitive(data), requestId);
		return {
			token: data.access_token,
			expiresAt: nowAsSeconds() + expiresIn
		};
	};
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/credentials/user-oauth.mjs
/**
* Reads a user-oauth credential file. Returns the cached access token while
* fresh; on expiry performs a `refresh_token` grant and writes the new
* tokens back to the credentials file (atomic replace, fsync'd).
*
* If `clientId` is empty, the access token is treated as static — the
* credentials file is read on every call but no refresh is attempted, and
* an expired token without a `refresh_token` raises.
*/
function userOAuthProvider(config) {
	return async (opts) => {
		const { fs } = await import("./node-PfV1oW7_.js");
		await checkCredentialsFileSafety(config.credentialsPath, config.onSafetyWarning);
		let raw;
		try {
			raw = await fs.promises.readFile(config.credentialsPath, "utf-8");
		} catch (err) {
			throw new WorkloadIdentityError(`Credentials file not found at ${config.credentialsPath}: ${err}`);
		}
		let creds;
		try {
			creds = JSON.parse(raw);
		} catch (err) {
			throw new WorkloadIdentityError(`Credentials file at ${config.credentialsPath} is not valid JSON: ${err}`);
		}
		const accessToken = creds.access_token;
		if (!accessToken) throw new WorkloadIdentityError(`Credentials file at ${config.credentialsPath} must include 'access_token'`);
		const expiresAt = creds.expires_at;
		if (!opts?.forceRefresh && (expiresAt == null || nowAsSeconds() < expiresAt - 30)) return {
			token: accessToken,
			expiresAt: expiresAt ?? null
		};
		const refreshToken = creds.refresh_token;
		if (!config.clientId || !refreshToken) throw new WorkloadIdentityError(`Access token at ${config.credentialsPath} has expired and no refresh is available (client_id ${config.clientId ? "set" : "empty"}, refresh_token ${refreshToken ? "set" : "empty"})`);
		requireSecureTokenEndpoint(config.baseURL);
		const body = {
			grant_type: GRANT_TYPE_REFRESH_TOKEN,
			refresh_token: refreshToken,
			client_id: config.clientId
		};
		const url = `${config.baseURL}${TOKEN_ENDPOINT}`;
		let resp;
		try {
			resp = await config.fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"anthropic-beta": OAUTH_API_BETA_HEADER,
					"User-Agent": config.userAgent || `anthropic-sdk-typescript/0.123.0 userOAuthProvider`
				},
				body: JSON.stringify(body)
			});
		} catch (err) {
			throw new WorkloadIdentityError(`User OAuth refresh failed to reach token endpoint: ${err}`);
		}
		const requestId = resp.headers.get("Request-Id");
		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new WorkloadIdentityError(`User OAuth refresh failed (HTTP ${resp.status}): ${redactSensitive(text)}`, resp.status, redactSensitive(text), requestId);
		}
		const data = await parseTokenResponse(resp, requestId);
		const expiresIn = Number(data.expires_in);
		if (!Number.isFinite(expiresIn)) throw new WorkloadIdentityError(`User OAuth refresh response missing or invalid expires_in: ${JSON.stringify(redactSensitive(data))}`, resp.status, redactSensitive(data), requestId);
		const newExpiresAt = nowAsSeconds() + expiresIn;
		const newRefreshToken = data.refresh_token || refreshToken;
		await writeCredentialsFileAtomic(config.credentialsPath, {
			...creds,
			version: "1.0",
			type: "oauth_token",
			access_token: data.access_token,
			expires_at: newExpiresAt,
			refresh_token: newRefreshToken
		});
		return {
			token: data.access_token,
			expiresAt: newExpiresAt
		};
	};
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/credentials/credential-chain.mjs
function resolveCredentialsFromConfig(config, options) {
	const provider = buildProvider(config, config.authentication.credentials_path ?? null, (config.base_url || options.baseURL).replace(/\/+$/, ""), options);
	const extraHeaders = {};
	if (config.workspace_id && config.authentication.type === "user_oauth") extraHeaders["anthropic-workspace-id"] = config.workspace_id;
	return {
		provider,
		extraHeaders,
		baseURL: config.base_url || void 0
	};
}
/**
* Resolves a {@link CredentialResult} from the environment. Returns `null`
* when no credentials can be resolved.
*
* Resolution order:
*
*   1. Config file for the active profile (or the explicit `profile` argument)
*      → dispatch on `authentication.type` (`oidc_federation`, `user_oauth`)
*   2. Environment variables `ANTHROPIC_FEDERATION_RULE_ID` +
*      `ANTHROPIC_ORGANIZATION_ID` (+ identity token) → OIDC federation
*   3. Nothing matches → `null`
*
* Passing `profile` selects `<config_dir>/configs/<profile>.json` directly,
* skipping `ANTHROPIC_PROFILE` / `active_config` resolution.
*/
async function defaultCredentials(options, profile) {
	const loaded = await loadConfigWithSource(profile);
	if (!loaded) return null;
	const { config, fromFile } = loaded;
	return resolveCredentialsFromConfig(config.authentication.credentials_path || !fromFile ? config : {
		...config,
		authentication: {
			...config.authentication,
			credentials_path: await getCredentialsPath(config, profile) ?? void 0
		}
	}, options);
}
function buildProvider(config, credentialsPath, baseURL, options) {
	switch (config.authentication.type) {
		case "oidc_federation": {
			const auth = config.authentication;
			const identityProvider = resolveIdentityTokenProvider(auth);
			if (!identityProvider) throw new WorkloadIdentityError("oidc_federation config requires an identity token (set authentication.identity_token, ANTHROPIC_IDENTITY_TOKEN_FILE, or ANTHROPIC_IDENTITY_TOKEN)");
			if (!auth.federation_rule_id) throw new WorkloadIdentityError("oidc_federation config requires 'federation_rule_id'. Set it in authentication.federation_rule_id in your profile, or via ANTHROPIC_FEDERATION_RULE_ID (profile takes precedence).");
			if (!config.organization_id) throw new WorkloadIdentityError("oidc_federation config requires organization_id (set ANTHROPIC_ORGANIZATION_ID or config.organization_id)");
			const exchange = oidcFederationProvider({
				identityTokenProvider: identityProvider,
				federationRuleId: auth.federation_rule_id,
				organizationId: config.organization_id,
				serviceAccountId: auth.service_account_id,
				workspaceId: config.workspace_id,
				baseURL,
				fetch: options.fetch,
				userAgent: options.userAgent
			});
			if (credentialsPath) return cachedExchangeProvider(exchange, credentialsPath, options.onCacheWriteError, options.onSafetyWarning);
			return exchange;
		}
		case "user_oauth":
			if (!credentialsPath) throw new WorkloadIdentityError("user_oauth config requires authentication.credentials_path (or load via a profile so it defaults to <config_dir>/credentials/<profile>.json)");
			return userOAuthProvider({
				credentialsPath,
				clientId: config.authentication.client_id,
				baseURL,
				fetch: options.fetch,
				userAgent: options.userAgent,
				onSafetyWarning: options.onSafetyWarning
			});
		default: {
			const t = config.authentication.type;
			throw new WorkloadIdentityError(`authentication.type "${t}" is not a known authentication type`);
		}
	}
}
/**
* Resolves the identity token provider from config fields or environment variables.
*
* Resolution order:
*   1. `identity_token.path` from the config (source: "file")
*   2. `ANTHROPIC_IDENTITY_TOKEN_FILE` env var
*   3. `ANTHROPIC_IDENTITY_TOKEN` env var (static value)
*/
function resolveIdentityTokenProvider(auth) {
	if (auth.identity_token) {
		const source = auth.identity_token.source;
		if (source !== "file") throw new WorkloadIdentityError(`identity_token.source "${source}" is not supported by this SDK version (only "file")`);
		if (!auth.identity_token.path) throw new WorkloadIdentityError(`identity_token.source "file" requires a non-empty path`);
		return identityTokenFromFile(auth.identity_token.path);
	}
	const tokenFile = readEnv("ANTHROPIC_IDENTITY_TOKEN_FILE");
	if (tokenFile) return identityTokenFromFile(tokenFile);
	const tokenValue = readEnv("ANTHROPIC_IDENTITY_TOKEN");
	if (tokenValue) return identityTokenFromValue(tokenValue);
	return null;
}
/**
* Wraps a federation exchange provider with credential file caching.
* Checks the file for a fresh token before exchanging, and writes the
* result back after a successful exchange (best-effort, atomic replace).
*
* Note: this is not cross-process serialized — two SDK instances that
* miss the cache simultaneously will both perform a full exchange and
* the last writer wins. That is acceptable: federation exchanges are
* idempotent and the cache is an optimization, not a correctness gate.
*/
function cachedExchangeProvider(exchange, credentialsPath, onCacheWriteError, onSafetyWarning) {
	return async (opts) => {
		const { fs } = await import("./node-PfV1oW7_.js");
		await checkCredentialsFileSafety(credentialsPath, onSafetyWarning);
		let existing;
		try {
			const raw = await fs.promises.readFile(credentialsPath, "utf-8");
			existing = JSON.parse(raw);
			const token = existing?.["access_token"];
			if (token && !opts?.forceRefresh) {
				const expiresAt = existing?.["expires_at"];
				if (expiresAt == null || nowAsSeconds() < expiresAt - 30) return {
					token,
					expiresAt: expiresAt ?? null
				};
			}
		} catch (err) {
			if (err?.code !== "ENOENT" && !(err instanceof SyntaxError)) onCacheWriteError?.(err);
		}
		const result = await exchange(opts);
		try {
			await writeCredentialsFileAtomic(credentialsPath, {
				...existing ?? {},
				version: "1.0",
				type: "oauth_token",
				access_token: result.token,
				expires_at: result.expiresAt
			});
		} catch (err) {
			onCacheWriteError?.(err);
		}
		return result;
	};
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/decoders/line.mjs
var _LineDecoder_buffer;
var _LineDecoder_carriageReturnIndex;
/**
* A re-implementation of httpx's `LineDecoder` in Python that handles incrementally
* reading lines from text.
*
* https://github.com/encode/httpx/blob/920333ea98118e9cf617f246905d7b202510941c/httpx/_decoders.py#L258
*/
var LineDecoder = class {
	constructor() {
		_LineDecoder_buffer.set(this, void 0);
		_LineDecoder_carriageReturnIndex.set(this, void 0);
		__classPrivateFieldSet(this, _LineDecoder_buffer, /* @__PURE__ */ new Uint8Array(), "f");
		__classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
	}
	decode(chunk) {
		if (chunk == null) return [];
		const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
		__classPrivateFieldSet(this, _LineDecoder_buffer, concatBytes([__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), binaryChunk]), "f");
		const lines = [];
		let patternIndex;
		while ((patternIndex = findNewlineIndex(__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f"))) != null) {
			if (patternIndex.carriage && __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") == null) {
				__classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, patternIndex.index, "f");
				continue;
			}
			if (__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") != null && (patternIndex.index !== __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") + 1 || patternIndex.carriage)) {
				lines.push(decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") - 1)));
				__classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f")), "f");
				__classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
				continue;
			}
			const endIndex = __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") !== null ? patternIndex.preceding - 1 : patternIndex.preceding;
			const line = decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, endIndex));
			lines.push(line);
			__classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(patternIndex.index), "f");
			__classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
		}
		return lines;
	}
	flush() {
		if (!__classPrivateFieldGet(this, _LineDecoder_buffer, "f").length) return [];
		return this.decode("\n");
	}
};
_LineDecoder_buffer = /* @__PURE__ */ new WeakMap(), _LineDecoder_carriageReturnIndex = /* @__PURE__ */ new WeakMap();
LineDecoder.NEWLINE_CHARS = /* @__PURE__ */ new Set(["\n", "\r"]);
LineDecoder.NEWLINE_REGEXP = /\r\n|[\n\r]/g;
/**
* This function searches the buffer for the end patterns, (\r or \n)
* and returns an object with the index preceding the matched newline and the
* index after the newline char. `null` is returned if no new line is found.
*
* ```ts
* findNewLineIndex('abc\ndef') -> { preceding: 2, index: 3 }
* ```
*/
function findNewlineIndex(buffer, startIndex) {
	const newline = 10;
	const carriage = 13;
	for (let i = startIndex ?? 0; i < buffer.length; i++) {
		if (buffer[i] === newline) return {
			preceding: i,
			index: i + 1,
			carriage: false
		};
		if (buffer[i] === carriage) return {
			preceding: i,
			index: i + 1,
			carriage: true
		};
	}
	return null;
}
function findDoubleNewlineIndex(buffer) {
	const newline = 10;
	const carriage = 13;
	for (let i = 0; i < buffer.length - 1; i++) {
		if (buffer[i] === newline && buffer[i + 1] === newline) return i + 2;
		if (buffer[i] === carriage && buffer[i + 1] === carriage) return i + 2;
		if (buffer[i] === carriage && buffer[i + 1] === newline && i + 3 < buffer.length && buffer[i + 2] === carriage && buffer[i + 3] === newline) return i + 4;
	}
	return -1;
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/core/streaming.mjs
var _Stream_client;
var Stream = class Stream {
	constructor(iterator, controller, client) {
		this.iterator = iterator;
		_Stream_client.set(this, void 0);
		this.controller = controller;
		__classPrivateFieldSet(this, _Stream_client, client, "f");
	}
	/**
	* Iterate the raw Server-Sent Events from `response` — `{event, data, raw}`
	* objects, before any JSON parsing or event-name filtering.
	*
	* This reads `response.body` directly (not a clone), so the response is
	* consumed. Use this in middleware that fully replaces the stream body; for
	* read-only observation of parsed events, use `ctx.parse()` instead.
	*/
	static rawEvents(response, controller = new AbortController()) {
		return _iterSSEMessages(response, controller);
	}
	static fromSSEResponse(response, controller, client) {
		let consumed = false;
		const logger = client ? loggerFor(client) : console;
		async function* iterator() {
			if (consumed) throw new AnthropicError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
			consumed = true;
			let done = false;
			try {
				for await (const sse of _iterSSEMessages(response, controller)) {
					if (sse.event === "completion") try {
						yield JSON.parse(sse.data);
					} catch (e) {
						logger.error(`Could not parse message into JSON:`, sse.data);
						logger.error(`From chunk:`, sse.raw);
						throw e;
					}
					if (sse.event === "message_start" || sse.event === "message_delta" || sse.event === "message_stop" || sse.event === "content_block_start" || sse.event === "content_block_delta" || sse.event === "content_block_stop" || sse.event === "message" || sse.event === "user.message" || sse.event === "user.interrupt" || sse.event === "user.tool_confirmation" || sse.event === "user.custom_tool_result" || sse.event === "user.tool_result" || sse.event === "agent.message" || sse.event === "agent.thinking" || sse.event === "agent.tool_use" || sse.event === "agent.tool_result" || sse.event === "agent.mcp_tool_use" || sse.event === "agent.mcp_tool_result" || sse.event === "agent.custom_tool_use" || sse.event === "agent.thread_context_compacted" || sse.event === "session.status_running" || sse.event === "session.status_idle" || sse.event === "session.status_rescheduled" || sse.event === "session.status_terminated" || sse.event === "session.error" || sse.event === "session.deleted" || sse.event === "session.updated" || sse.event === "span.model_request_start" || sse.event === "span.model_request_end" || sse.event === "span.outcome_evaluation_start" || sse.event === "span.outcome_evaluation_ongoing" || sse.event === "span.outcome_evaluation_end" || sse.event === "user.define_outcome" || sse.event === "agent.thread_message_received" || sse.event === "agent.thread_message_sent" || sse.event === "agent.session_thread_message_received" || sse.event === "agent.session_thread_message_sent" || sse.event === "session.thread_created" || sse.event === "session.thread_status_created" || sse.event === "session.thread_status_running" || sse.event === "session.thread_status_idle" || sse.event === "session.thread_status_rescheduled" || sse.event === "session.thread_status_terminated" || sse.event === "event_start" || sse.event === "event_delta" || sse.event === "system.message") try {
						yield JSON.parse(sse.data);
					} catch (e) {
						logger.error(`Could not parse message into JSON:`, sse.data);
						logger.error(`From chunk:`, sse.raw);
						throw e;
					}
					if (sse.event === "ping") continue;
					if (sse.event === "error") {
						const body = safeJSON(sse.data) ?? sse.data;
						const type = body?.error?.type;
						throw new APIError(void 0, body, void 0, response.headers, type);
					}
				}
				done = true;
			} catch (e) {
				if (isAbortError(e)) return;
				throw e;
			} finally {
				if (!done) controller.abort();
				releaseRequestSignal(controller);
			}
		}
		return new Stream(iterator, controller, client);
	}
	/**
	* Generates a Stream from a newline-separated ReadableStream
	* where each item is a JSON value.
	*/
	static fromReadableStream(readableStream, controller, client) {
		let consumed = false;
		async function* iterLines() {
			const lineDecoder = new LineDecoder();
			const iter = ReadableStreamToAsyncIterable(readableStream);
			for await (const chunk of iter) for (const line of lineDecoder.decode(chunk)) yield line;
			for (const line of lineDecoder.flush()) yield line;
		}
		async function* iterator() {
			if (consumed) throw new AnthropicError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
			consumed = true;
			let done = false;
			try {
				for await (const line of iterLines()) {
					if (done) continue;
					if (line) yield JSON.parse(line);
				}
				done = true;
			} catch (e) {
				if (isAbortError(e)) return;
				throw e;
			} finally {
				if (!done) controller.abort();
				releaseRequestSignal(controller);
			}
		}
		return new Stream(iterator, controller, client);
	}
	[(_Stream_client = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
		return this.iterator();
	}
	/**
	* Splits the stream into two streams which can be
	* independently read from at different speeds.
	*/
	tee() {
		const left = [];
		const right = [];
		const iterator = this.iterator();
		const teeIterator = (queue) => {
			return { next: () => {
				if (queue.length === 0) {
					const result = iterator.next();
					left.push(result);
					right.push(result);
				}
				return queue.shift();
			} };
		};
		return [new Stream(() => teeIterator(left), this.controller, __classPrivateFieldGet(this, _Stream_client, "f")), new Stream(() => teeIterator(right), this.controller, __classPrivateFieldGet(this, _Stream_client, "f"))];
	}
	/**
	* Converts this stream to a newline-separated ReadableStream of
	* JSON stringified values in the stream
	* which can be turned back into a Stream with `Stream.fromReadableStream()`.
	*/
	toReadableStream() {
		const self = this;
		let iter;
		return makeReadableStream({
			async start() {
				iter = self[Symbol.asyncIterator]();
			},
			async pull(ctrl) {
				try {
					const { value, done } = await iter.next();
					if (done) return ctrl.close();
					const bytes = encodeUTF8(JSON.stringify(value) + "\n");
					ctrl.enqueue(bytes);
				} catch (err) {
					ctrl.error(err);
				}
			},
			async cancel() {
				await iter.return?.();
			}
		});
	}
};
async function* _iterSSEMessages(response, controller) {
	if (!response.body) {
		controller.abort();
		if (typeof globalThis.navigator !== "undefined" && globalThis.navigator.product === "ReactNative") throw new AnthropicError(`The default react-native fetch implementation does not support streaming. Please use expo/fetch: https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api`);
		throw new AnthropicError(`Attempted to iterate over a response with no body`);
	}
	const sseDecoder = new SSEDecoder();
	const lineDecoder = new LineDecoder();
	const iter = ReadableStreamToAsyncIterable(response.body);
	for await (const sseChunk of iterSSEChunks(iter)) for (const line of lineDecoder.decode(sseChunk)) {
		const sse = sseDecoder.decode(line);
		if (sse) yield sse;
	}
	for (const line of lineDecoder.flush()) {
		const sse = sseDecoder.decode(line);
		if (sse) yield sse;
	}
}
/**
* Given an async iterable iterator, iterates over it and yields full
* SSE chunks, i.e. yields when a double new-line is encountered.
*/
async function* iterSSEChunks(iterator) {
	let data = /* @__PURE__ */ new Uint8Array();
	for await (const chunk of iterator) {
		if (chunk == null) continue;
		const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
		let newData = new Uint8Array(data.length + binaryChunk.length);
		newData.set(data);
		newData.set(binaryChunk, data.length);
		data = newData;
		let patternIndex;
		while ((patternIndex = findDoubleNewlineIndex(data)) !== -1) {
			yield data.slice(0, patternIndex);
			data = data.slice(patternIndex);
		}
	}
	if (data.length > 0) yield data;
}
var SSEDecoder = class {
	constructor() {
		this.event = null;
		this.data = [];
		this.chunks = [];
	}
	decode(line) {
		if (line.endsWith("\r")) line = line.substring(0, line.length - 1);
		if (!line) {
			if (!this.event && !this.data.length) return null;
			const sse = {
				event: this.event,
				data: this.data.join("\n"),
				raw: this.chunks
			};
			this.event = null;
			this.data = [];
			this.chunks = [];
			return sse;
		}
		this.chunks.push(line);
		if (line.startsWith(":")) return null;
		let [fieldname, _, value] = partition(line, ":");
		if (value.startsWith(" ")) value = value.substring(1);
		if (fieldname === "event") this.event = value;
		else if (fieldname === "data") this.data.push(value);
		return null;
	}
};
function partition(str, delimiter) {
	const index = str.indexOf(delimiter);
	if (index !== -1) return [
		str.substring(0, index),
		delimiter,
		str.substring(index + delimiter.length)
	];
	return [
		str,
		"",
		""
	];
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/parse.mjs
async function defaultParseResponse(client, props) {
	const { response, requestLogID, retryOfRequestLogID, startTime } = props;
	const body = await (async () => {
		if (props.options.stream) {
			loggerFor(client).debug("response", response.status, response.url, response.headers, response.body);
			return Stream.fromSSEResponse(response, props.controller, client);
		}
		if (response.status === 204) return null;
		if (props.options.__binaryResponse) return response;
		const mediaType = response.headers.get("content-type")?.split(";")[0]?.trim();
		if (mediaType?.includes("application/json") || mediaType?.endsWith("+json")) {
			if (response.headers.get("content-length") === "0") return;
			return addResponseIDs(await response.json(), response);
		}
		return await response.text();
	})().finally(() => {
		if (!props.options.stream && !props.options.__binaryResponse) releaseRequestSignal(props.controller);
	});
	loggerFor(client).debug(`[${requestLogID}] response parsed`, formatRequestDetails({
		retryOfRequestLogID,
		url: response.url,
		status: response.status,
		body,
		durationMs: Date.now() - startTime
	}));
	return body;
}
function addResponseIDs(value, response) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	return Object.defineProperties(value, {
		_request_id: {
			value: response.headers.get("request-id"),
			enumerable: false
		},
		_workspace_id: {
			value: response.headers.get("anthropic-workspace-id"),
			enumerable: false
		}
	});
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/core/middleware.mjs
/**
* Errors thrown by the underlying `fetch`, as opposed to by a middleware.
*
* Tracked so the client can apply its connection-error retry policy to
* transport failures while letting errors thrown by middleware propagate to
* the caller untouched.
*/
const fetchOriginErrors = /* @__PURE__ */ new WeakSet();
/** Whether `err` was thrown by the underlying `fetch` rather than by a middleware. */
function isFetchOriginError(err) {
	return typeof err === "object" && err !== null && fetchOriginErrors.has(err);
}
/**
* Whether an error thrown by middleware should stay on the SDK's
* connection-error retry policy: fetch-origin, abort, `APIConnectionError`, or
* `RetryableError` — checked through the error's `cause` chain.
*/
function isRetryableError(err) {
	const seen = /* @__PURE__ */ new Set();
	while (typeof err === "object" && err !== null && !seen.has(err)) {
		seen.add(err);
		if (isFetchOriginError(err) || isAbortError(err) || err instanceof APIConnectionError || err instanceof RetryableError) return true;
		err = err.cause;
	}
	return false;
}
/**
* Wraps `fetchFn` so each call runs through `middleware`, keeping the same
* call signature as `fetch` itself.
*
* With no middleware, calls are passed straight through to `fetchFn`.
* Otherwise the arguments are normalized into an {@link APIRequest} (headers
* coerced to a `Headers` instance, URL stringified) before entering the
* chain. The chain is composed per call, so mutations of a `middleware`
* array are picked up by later requests.
*
* `options` — the SDK request options behind this call, when there are any —
* is surfaced to middleware as `ctx.options` and drives `ctx.parse`.
*
* `client` supplies `ctx.logger` (the client's level-filtered logger);
* without it, `ctx.logger` falls back to the client defaults: `console`,
* filtered to `ANTHROPIC_LOG` or `'warn'`.
*/
function wrapFetchWithMiddleware(fetchFn, middleware, options, client) {
	return async (url, init = {}) => {
		if (middleware.length === 0) return fetchFn.call(void 0, url, init);
		const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers);
		const response = await applyMiddleware(fetchFn, middleware, options, client)({
			...init,
			headers,
			url: typeof url === "string" ? url : url instanceof URL ? url.href : url.url
		});
		if (response.bodyUsed || response.body?.locked) throw new AnthropicError("middleware consumed the response body; use response.clone() to inspect it, or return new Response(body, response) to consume and replace it");
		return response;
	};
}
/**
* Creates the {@link MiddlewareContext} shared by every middleware in one chain.
*/
function createMiddlewareContext(options, client) {
	const cache = /* @__PURE__ */ new WeakMap();
	return {
		options,
		logger: client ? loggerFor(client) : defaultLogger(),
		parse(response) {
			if (options?.stream && response.ok) return parseMiddlewareResponse(response, options, client);
			let parsed = cache.get(response);
			if (!parsed) {
				parsed = parseMiddlewareResponse(response, options, client);
				cache.set(response, parsed);
			}
			return parsed;
		}
	};
}
/**
* Mirrors the client's own response parsing (`defaultParseResponse` in
* `internal/parse.ts`), reading through a clone so the body stays available
* to the rest of the chain and the client itself.
*/
async function parseMiddlewareResponse(response, options, client) {
	if (response.bodyUsed || response.body?.locked) throw new AnthropicError("cannot ctx.parse() a response whose body was already consumed; call ctx.parse() instead of reading the body, or read via response.clone()");
	if (options?.stream && response.ok) return Stream.fromSSEResponse(response.clone(), new AbortController(), client);
	if (response.status === 204) return null;
	if (options?.__binaryResponse) return response;
	const mediaType = response.headers.get("content-type")?.split(";")[0]?.trim();
	if (mediaType?.includes("application/json") || mediaType?.endsWith("+json")) {
		if (response.headers.get("content-length") === "0") return;
		return addResponseIDs(await response.clone().json(), response);
	}
	return await response.clone().text();
}
/**
* Composes `middleware` around `fetchFn` and returns the entry point of the chain.
*/
function applyMiddleware(fetchFn, middleware, options, client) {
	let next = async ({ url, ...init }) => {
		try {
			return await fetchFn.call(void 0, url, init);
		} catch (err) {
			const error = castToError(err);
			fetchOriginErrors.add(error);
			throw error;
		}
	};
	const ctx = createMiddlewareContext(options, client);
	for (let i = middleware.length - 1; i >= 0; i--) {
		const mw = middleware[i];
		const nextInner = next;
		next = async (request) => mw(request, nextInner, ctx);
	}
	return next;
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/core/api-promise.mjs
var _APIPromise_client;
/**
* A subclass of `Promise` providing additional helper methods
* for interacting with the SDK.
*/
var APIPromise = class APIPromise extends Promise {
	constructor(client, responsePromise, parseResponse = defaultParseResponse) {
		super((resolve) => {
			resolve(null);
		});
		this.responsePromise = responsePromise;
		this.parseResponse = parseResponse;
		_APIPromise_client.set(this, void 0);
		__classPrivateFieldSet(this, _APIPromise_client, client, "f");
	}
	_thenUnwrap(transform) {
		return new APIPromise(__classPrivateFieldGet(this, _APIPromise_client, "f"), this.responsePromise, async (client, props) => addResponseIDs(transform(await this.parseResponse(client, props), props), props.response));
	}
	/**
	* Gets the raw `Response` instance instead of parsing the response
	* data.
	*
	* If you want to parse the response body but still get the `Response`
	* instance, you can use {@link withResponse()}.
	*
	* 👋 Getting the wrong TypeScript type for `Response`?
	* Try setting `"moduleResolution": "NodeNext"` or add `"lib": ["DOM"]`
	* to your `tsconfig.json`.
	*/
	asResponse() {
		return this.responsePromise.then((p) => p.response);
	}
	/**
	* Gets the parsed response data, the raw `Response` instance and the ID of the request,
	* returned via the `request-id` header which is useful for debugging requests and resporting
	* issues to Anthropic.
	*
	* If you just want to get the raw `Response` instance without parsing it,
	* you can use {@link asResponse()}.
	*
	* 👋 Getting the wrong TypeScript type for `Response`?
	* Try setting `"moduleResolution": "NodeNext"` or add `"lib": ["DOM"]`
	* to your `tsconfig.json`.
	*/
	async withResponse() {
		const [data, response] = await Promise.all([this.parse(), this.asResponse()]);
		return {
			data,
			response,
			request_id: response.headers.get("request-id"),
			workspace_id: response.headers.get("anthropic-workspace-id")
		};
	}
	parse() {
		if (!this.parsedPromise) this.parsedPromise = this.responsePromise.then((data) => this.parseResponse(__classPrivateFieldGet(this, _APIPromise_client, "f"), data));
		return this.parsedPromise;
	}
	then(onfulfilled, onrejected) {
		return this.parse().then(onfulfilled, onrejected);
	}
	catch(onrejected) {
		return this.parse().catch(onrejected);
	}
	finally(onfinally) {
		return this.parse().finally(onfinally);
	}
};
_APIPromise_client = /* @__PURE__ */ new WeakMap();
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/core/pagination.mjs
var _AbstractPage_client;
var AbstractPage = class {
	constructor(client, response, body, options) {
		_AbstractPage_client.set(this, void 0);
		__classPrivateFieldSet(this, _AbstractPage_client, client, "f");
		this.options = options;
		this.response = response;
		this.body = body;
	}
	hasNextPage() {
		if (!this.getPaginatedItems().length) return false;
		return this.nextPageRequestOptions() != null;
	}
	async getNextPage() {
		const nextOptions = this.nextPageRequestOptions();
		if (!nextOptions) throw new AnthropicError("No next page expected; please check `.hasNextPage()` before calling `.getNextPage()`.");
		return await __classPrivateFieldGet(this, _AbstractPage_client, "f").requestAPIList(this.constructor, nextOptions);
	}
	async *iterPages() {
		let page = this;
		yield page;
		while (page.hasNextPage()) {
			page = await page.getNextPage();
			yield page;
		}
	}
	async *[(_AbstractPage_client = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
		for await (const page of this.iterPages()) for (const item of page.getPaginatedItems()) yield item;
	}
};
/**
* This subclass of Promise will resolve to an instantiated Page once the request completes.
*
* It also implements AsyncIterable to allow auto-paginating iteration on an unawaited list call, eg:
*
*    for await (const item of client.items.list()) {
*      console.log(item)
*    }
*/
var PagePromise = class extends APIPromise {
	constructor(client, request, Page) {
		super(client, request, async (client, props) => new Page(client, props.response, await defaultParseResponse(client, props), props.options));
	}
	/**
	* Allow auto-paginating iteration on an unawaited list call, eg:
	*
	*    for await (const item of client.items.list()) {
	*      console.log(item)
	*    }
	*/
	async *[Symbol.asyncIterator]() {
		const page = await this;
		for await (const item of page) yield item;
	}
};
var Page = class extends AbstractPage {
	constructor(client, response, body, options) {
		super(client, response, body, options);
		this.data = body.data || [];
		this.has_more = body.has_more || false;
		this.first_id = body.first_id || null;
		this.last_id = body.last_id || null;
	}
	getPaginatedItems() {
		return this.data ?? [];
	}
	hasNextPage() {
		if (this.has_more === false) return false;
		return super.hasNextPage();
	}
	nextPageRequestOptions() {
		if (this.options.query?.["before_id"]) {
			const first_id = this.first_id;
			if (!first_id) return null;
			return {
				...this.options,
				query: {
					...maybeObj(this.options.query),
					before_id: first_id
				}
			};
		}
		const cursor = this.last_id;
		if (!cursor) return null;
		return {
			...this.options,
			query: {
				...maybeObj(this.options.query),
				after_id: cursor
			}
		};
	}
};
var PageCursor = class extends AbstractPage {
	constructor(client, response, body, options) {
		super(client, response, body, options);
		this.data = body.data || [];
		this.next_page = body.next_page || null;
	}
	getPaginatedItems() {
		return this.data ?? [];
	}
	nextPageRequestOptions() {
		const cursor = this.next_page;
		if (!cursor) return null;
		return {
			...this.options,
			query: {
				...maybeObj(this.options.query),
				page: cursor
			}
		};
	}
};
var BidirectionalPageCursor = class extends AbstractPage {
	constructor(client, response, body, options) {
		super(client, response, body, options);
		this.data = body.data || [];
		this.next_page = body.next_page || null;
		this.prev_page = body.prev_page || null;
	}
	getPaginatedItems() {
		return this.data ?? [];
	}
	nextPageRequestOptions() {
		const cursor = this.next_page;
		if (!cursor) return null;
		return {
			...this.options,
			query: {
				...maybeObj(this.options.query),
				page: cursor
			}
		};
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/uploads.mjs
const checkFileSupport = () => {
	if (typeof File === "undefined") {
		const { process } = globalThis;
		const isOldNode = typeof process?.versions?.node === "string" && parseInt(process.versions.node.split(".")) < 20;
		throw new Error("`File` is not defined as a global, which is required for file uploads." + (isOldNode ? " Update to Node 20 LTS or newer, or set `globalThis.File` to `import('node:buffer').File`." : ""));
	}
};
/**
* Construct a `File` instance. This is used to ensure a helpful error is thrown
* for environments that don't define a global `File` yet.
*/
function makeFile(fileBits, fileName, options) {
	checkFileSupport();
	return new File(fileBits, fileName ?? "unknown_file", options);
}
function getName(value, stripPath) {
	const val = typeof value === "object" && value !== null && ("name" in value && value.name && String(value.name) || "url" in value && value.url && String(value.url) || "filename" in value && value.filename && String(value.filename) || "path" in value && value.path && String(value.path)) || "";
	return stripPath ? val.split(/[\\/]/).pop() || void 0 : val;
}
const isAsyncIterable = (value) => value != null && typeof value === "object" && typeof value[Symbol.asyncIterator] === "function";
const multipartFormRequestOptions = async (opts, fetch, stripFilenames = true) => {
	return {
		...opts,
		body: await createForm(opts.body, fetch, stripFilenames)
	};
};
const supportsFormDataMap = /* @__PURE__ */ new WeakMap();
/**
* node-fetch doesn't support the global FormData object in recent node versions. Instead of sending
* properly-encoded form data, it just stringifies the object, resulting in a request body of "[object FormData]".
* This function detects if the fetch function provided supports the global FormData object to avoid
* confusing error messages later on.
*/
function supportsFormData(fetchObject) {
	const fetch = typeof fetchObject === "function" ? fetchObject : fetchObject.fetch;
	const cached = supportsFormDataMap.get(fetch);
	if (cached) return cached;
	const promise = (async () => {
		try {
			const FetchResponse = "Response" in fetch ? fetch.Response : (await fetch("data:,")).constructor;
			const data = new FormData();
			if (data.toString() === await new FetchResponse(data).text()) return false;
			return true;
		} catch {
			return true;
		}
	})();
	supportsFormDataMap.set(fetch, promise);
	return promise;
}
const createForm = async (body, fetch, stripFilenames = true) => {
	if (!await supportsFormData(fetch)) throw new TypeError("The provided fetch function does not support file uploads with the current global FormData class.");
	const form = new FormData();
	await Promise.all(Object.entries(body || {}).map(([key, value]) => addFormValue(form, key, value, stripFilenames)));
	return form;
};
const addFormValue = async (form, key, value, stripFilenames) => {
	if (value === void 0) return;
	if (value == null) throw new TypeError(`Received null for "${key}"; to pass null in FormData, you must use the string 'null'`);
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") form.append(key, String(value));
	else if (value instanceof Response) {
		let options = {};
		const contentType = value.headers.get("Content-Type");
		if (contentType) options = { type: contentType };
		form.append(key, makeFile([await value.blob()], getName(value, stripFilenames), options));
	} else if (isAsyncIterable(value)) form.append(key, makeFile([await new Response(ReadableStreamFrom(value)).blob()], getName(value, stripFilenames)));
	else if (value instanceof Blob) form.append(key, makeFile([value], getName(value, stripFilenames) || void 0, { type: value.type }));
	else if (Array.isArray(value)) await Promise.all(value.map((entry) => addFormValue(form, key + "[]", entry, stripFilenames)));
	else if (typeof value.then === "function") throw new TypeError(`Received a Promise for "${key}"; await it first, e.g. \`await toFile(...)\``);
	else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) throw new TypeError(`Received ${value.constructor.name} for "${key}"; to upload raw bytes, wrap them with \`await toFile(bytes, 'filename')\``);
	else if (typeof value === "object") await Promise.all(Object.entries(value).map(([name, prop]) => addFormValue(form, `${key}[${name}]`, prop, stripFilenames)));
	else throw new TypeError(`Invalid value given to form, expected a string, number, boolean, object, Array, File or Blob but got ${value} instead`);
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/to-file.mjs
/**
* This check adds the arrayBuffer() method type because it is available and used at runtime
*/
const isBlobLike = (value) => value != null && typeof value === "object" && typeof value.size === "number" && typeof value.type === "string" && typeof value.text === "function" && typeof value.slice === "function" && typeof value.arrayBuffer === "function";
/**
* This check adds the arrayBuffer() method type because it is available and used at runtime
*/
const isFileLike = (value) => value != null && typeof value === "object" && typeof value.name === "string" && typeof value.lastModified === "number" && isBlobLike(value);
const isResponseLike = (value) => value != null && typeof value === "object" && typeof value.url === "string" && typeof value.blob === "function";
/**
* Helper for creating a {@link File} to pass to an SDK upload method from a variety of different data formats
* @param value the raw content of the file. Can be an {@link Uploadable}, BlobLikePart, or AsyncIterable of BlobLikeParts
* @param {string=} name the name of the file. If omitted, toFile will try to determine a file name from bits if possible
* @param {Object=} options additional properties
* @param {string=} options.type the MIME type of the content
* @param {number=} options.lastModified the last modified timestamp
* @returns a {@link File} with the given properties
*/
async function toFile(value, name, options) {
	checkFileSupport();
	value = await value;
	name || (name = getName(value, true));
	if (isFileLike(value)) {
		if (value instanceof File && name == null && options == null) return value;
		return makeFile([await value.arrayBuffer()], name ?? value.name, {
			type: value.type,
			lastModified: value.lastModified,
			...options
		});
	}
	if (isResponseLike(value)) {
		const blob = await value.blob();
		name || (name = new URL(value.url).pathname.split(/[\\/]/).pop());
		return makeFile(await getBytes(blob), name, options);
	}
	const parts = await getBytes(value);
	if (!options?.type) {
		const type = parts.find((part) => typeof part === "object" && "type" in part && part.type);
		if (typeof type === "string") options = {
			...options,
			type
		};
	}
	return makeFile(parts, name, options);
}
async function getBytes(value) {
	let parts = [];
	if (typeof value === "string" || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) parts.push(value);
	else if (isBlobLike(value)) parts.push(value instanceof Blob ? value : await value.arrayBuffer());
	else if (isAsyncIterable(value)) for await (const chunk of value) parts.push(...await getBytes(chunk));
	else {
		const constructor = value?.constructor?.name;
		throw new Error(`Unexpected data type: ${typeof value}${constructor ? `; constructor: ${constructor}` : ""}${propsForError(value)}`);
	}
	return parts;
}
function propsForError(value) {
	if (typeof value !== "object" || value === null) return "";
	return `; props: [${Object.getOwnPropertyNames(value).map((p) => `"${p}"`).join(", ")}]`;
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/core/resource.mjs
var APIResource = class {
	constructor(client) {
		this._client = client;
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/headers.mjs
const brand_privateNullableHeaders = Symbol.for("brand.privateNullableHeaders");
function* iterateHeaders(headers) {
	if (!headers) return;
	if (brand_privateNullableHeaders in headers) {
		const { values, nulls } = headers;
		yield* values.entries();
		for (const name of nulls) yield [name, null];
		return;
	}
	let shouldClear = false;
	let iter;
	if (headers instanceof Headers) iter = headers.entries();
	else if (isReadonlyArray(headers)) iter = headers;
	else {
		shouldClear = true;
		iter = Object.entries(headers ?? {});
	}
	for (let row of iter) {
		const name = row[0];
		if (typeof name !== "string") throw new TypeError("expected header name to be a string");
		const values = isReadonlyArray(row[1]) ? row[1] : [row[1]];
		let didClear = false;
		for (const value of values) {
			if (value === void 0) continue;
			if (shouldClear && !didClear) {
				didClear = true;
				yield [name, clearSentinel];
			}
			yield [name, value];
		}
	}
}
/** Distinguishes iterateHeaders' synthetic clear-before-set from a user `null`. */
const clearSentinel = Symbol("clear");
/**
* Headers whose values accumulate across {@link buildHeaders} sources instead
* of the later source's value replacing the earlier one. Values are
* comma-appended (deduplicated, order-preserving) into a single header line.
*/
const APPEND_HEADERS = /* @__PURE__ */ new Set(["x-stainless-helper"]);
const appendHeaderValue = (existing, addition) => {
	const tokens = existing ? existing.split(",").map((t) => t.trim()).filter(Boolean) : [];
	for (const tok of addition.split(",").map((t) => t.trim())) if (tok && !tokens.includes(tok)) tokens.push(tok);
	return tokens.join(", ");
};
const buildHeaders = (newHeaders) => {
	const targetHeaders = new Headers();
	const nullHeaders = /* @__PURE__ */ new Set();
	for (const headers of newHeaders) {
		const seenHeaders = /* @__PURE__ */ new Set();
		for (const [name, value] of iterateHeaders(headers)) {
			const lowerName = name.toLowerCase();
			if (APPEND_HEADERS.has(lowerName)) {
				if (value === clearSentinel) continue;
				if (value === null) {
					targetHeaders.delete(name);
					nullHeaders.add(lowerName);
				} else {
					targetHeaders.set(name, appendHeaderValue(targetHeaders.get(name), value));
					nullHeaders.delete(lowerName);
				}
				continue;
			}
			if (value === clearSentinel || !seenHeaders.has(lowerName)) {
				targetHeaders.delete(name);
				seenHeaders.add(lowerName);
				if (value === clearSentinel) continue;
			}
			if (value === null) {
				targetHeaders.delete(name);
				nullHeaders.add(lowerName);
			} else {
				targetHeaders.append(name, value);
				nullHeaders.delete(lowerName);
			}
		}
	}
	return {
		[brand_privateNullableHeaders]: true,
		values: targetHeaders,
		nulls: nullHeaders
	};
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/path.mjs
/**
* Percent-encode everything that isn't safe to have in a path without encoding safe chars.
*
* Taken from https://datatracker.ietf.org/doc/html/rfc3986#section-3.3:
* > unreserved  = ALPHA / DIGIT / "-" / "." / "_" / "~"
* > sub-delims  = "!" / "$" / "&" / "'" / "(" / ")" / "*" / "+" / "," / ";" / "="
* > pchar       = unreserved / pct-encoded / sub-delims / ":" / "@"
*/
function encodeURIPath(str) {
	return str.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@]+/g, encodeURIComponent);
}
const EMPTY = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.create(null));
const createPathTagFunction = (pathEncoder = encodeURIPath) => function path(statics, ...params) {
	if (statics.length === 1) return statics[0];
	let postPath = false;
	const invalidSegments = [];
	const path = statics.reduce((previousValue, currentValue, index) => {
		if (/[?#]/.test(currentValue)) postPath = true;
		const value = params[index];
		let encoded = (postPath ? encodeURIComponent : pathEncoder)("" + value);
		if (index !== params.length && (value == null || typeof value === "object" && value.toString === Object.getPrototypeOf(Object.getPrototypeOf(value.hasOwnProperty ?? EMPTY) ?? EMPTY)?.toString)) {
			encoded = value + "";
			invalidSegments.push({
				start: previousValue.length + currentValue.length,
				length: encoded.length,
				error: `Value of type ${Object.prototype.toString.call(value).slice(8, -1)} is not a valid path parameter`
			});
		}
		return previousValue + currentValue + (index === params.length ? "" : encoded);
	}, "");
	const pathOnly = path.split(/[?#]/, 1)[0];
	const invalidSegmentPattern = /(?<=^|\/)(?:\.|%2e){1,2}(?=\/|$)/gi;
	let match;
	while ((match = invalidSegmentPattern.exec(pathOnly)) !== null) invalidSegments.push({
		start: match.index,
		length: match[0].length,
		error: `Value "${match[0]}" can\'t be safely passed as a path parameter`
	});
	invalidSegments.sort((a, b) => a.start - b.start);
	if (invalidSegments.length > 0) {
		let lastEnd = 0;
		const underline = invalidSegments.reduce((acc, segment) => {
			const spaces = " ".repeat(segment.start - lastEnd);
			const arrows = "^".repeat(segment.length);
			lastEnd = segment.start + segment.length;
			return acc + spaces + arrows;
		}, "");
		throw new AnthropicError(`Path parameters result in path with invalid segments:\n${invalidSegments.map((e) => e.error).join("\n")}\n${path}\n${underline}`);
	}
	return path;
};
/**
* URI-encodes path params and ensures no unsafe /./ or /../ path segments are introduced.
*/
const path = /* @__PURE__ */ createPathTagFunction(encodeURIPath);
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/deployment-runs.mjs
var DeploymentRuns = class extends APIResource {
	/**
	* Get Deployment Run
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeploymentRun =
	*   await client.beta.deploymentRuns.retrieve(
	*     'deployment_run_id',
	*   );
	* ```
	*/
	retrieve(deploymentRunID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/deployment_runs/${deploymentRunID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* List Deployment Runs
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsDeploymentRun of client.beta.deploymentRuns.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/deployment_runs?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/deployments.mjs
var Deployments = class extends APIResource {
	/**
	* Create Deployment
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeployment =
	*   await client.beta.deployments.create({
	*     agent: 'string',
	*     environment_id: 'x',
	*     initial_events: [
	*       {
	*         content: [
	*           {
	*             text: 'Where is my order #1234?',
	*             type: 'text',
	*           },
	*         ],
	*         type: 'user.message',
	*       },
	*     ],
	*     name: 'x',
	*   });
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/deployments?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Get Deployment
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeployment =
	*   await client.beta.deployments.retrieve(
	*     'depl_011CZkZcDH3vPqd7xnEfwTai',
	*   );
	* ```
	*/
	retrieve(deploymentID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/deployments/${deploymentID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Update Deployment
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeployment =
	*   await client.beta.deployments.update(
	*     'depl_011CZkZcDH3vPqd7xnEfwTai',
	*   );
	* ```
	*/
	update(deploymentID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/deployments/${deploymentID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* List Deployments
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsDeployment of client.beta.deployments.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/deployments?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Archive Deployment
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeployment =
	*   await client.beta.deployments.archive(
	*     'depl_011CZkZcDH3vPqd7xnEfwTai',
	*   );
	* ```
	*/
	archive(deploymentID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/deployments/${deploymentID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Pause Deployment
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeployment =
	*   await client.beta.deployments.pause(
	*     'depl_011CZkZcDH3vPqd7xnEfwTai',
	*   );
	* ```
	*/
	pause(deploymentID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/deployments/${deploymentID}/pause?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Run Deployment Now
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeploymentRun =
	*   await client.beta.deployments.run(
	*     'depl_011CZkZcDH3vPqd7xnEfwTai',
	*   );
	* ```
	*/
	run(deploymentID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/deployments/${deploymentID}/run?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Unpause Deployment
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeployment =
	*   await client.beta.deployments.unpause(
	*     'depl_011CZkZcDH3vPqd7xnEfwTai',
	*   );
	* ```
	*/
	unpause(deploymentID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/deployments/${deploymentID}/unpause?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/dreams.mjs
var Dreams = class extends APIResource {
	/**
	* Create a Dream
	*
	* @example
	* ```ts
	* const betaDream = await client.beta.dreams.create({
	*   inputs: [{ memory_store_id: 'x', type: 'memory_store' }],
	*   model: 'string',
	* });
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/dreams?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "dreaming-2026-04-21"].toString() }, options?.headers])
		});
	}
	/**
	* Get a Dream
	*
	* @example
	* ```ts
	* const betaDream = await client.beta.dreams.retrieve(
	*   'dream_id',
	* );
	* ```
	*/
	retrieve(dreamID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/dreams/${dreamID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "dreaming-2026-04-21"].toString() }, options?.headers])
		});
	}
	/**
	* List Dreams
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaDream of client.beta.dreams.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/dreams?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "dreaming-2026-04-21"].toString() }, options?.headers])
		});
	}
	/**
	* Archive a Dream
	*
	* @example
	* ```ts
	* const betaDream = await client.beta.dreams.archive(
	*   'dream_id',
	* );
	* ```
	*/
	archive(dreamID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/dreams/${dreamID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "dreaming-2026-04-21"].toString() }, options?.headers])
		});
	}
	/**
	* Cancel a Dream
	*
	* @example
	* ```ts
	* const betaDream = await client.beta.dreams.cancel(
	*   'dream_id',
	* );
	* ```
	*/
	cancel(dreamID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/dreams/${dreamID}/cancel?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "dreaming-2026-04-21"].toString() }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/stainless-helper-header.mjs
/**
* Single source of truth for the `x-stainless-helper` telemetry header — the
* key, the closed value vocabulary, and per-object helper tagging. The
* append-don't-clobber merge for the header itself lives in
* {@link import('../internal/headers').buildHeaders} via `APPEND_HEADERS`.
*/
/**
* Telemetry header naming the SDK helper(s) a request came from. Always this
* lowercase form; `buildHeaders` matches it case-insensitively for its append
* semantics, but a single canonical casing keeps every call site greppable.
*/
const STAINLESS_HELPER_HEADER = "x-stainless-helper";
/** Telemetry header naming the SDK method (e.g. `stream`) in use. */
const STAINLESS_HELPER_METHOD_HEADER = "x-stainless-helper-method";
/**
* The `{ 'x-stainless-helper': value }` header dict, for passing into
* `buildHeaders` (which comma-appends `x-stainless-helper` across sources)
* or as `defaultHeaders`/per-request `headers`.
*/
function helperHeader(value) {
	return { [STAINLESS_HELPER_HEADER]: value };
}
/**
* Symbol used to mark objects created by SDK helpers for tracking.
* The value is the helper name (e.g., 'mcpTool', 'betaZodTool').
*/
const SDK_HELPER_SYMBOL = Symbol("anthropic.sdk.stainlessHelper");
function wasCreatedByStainlessHelper(value) {
	return typeof value === "object" && value !== null && SDK_HELPER_SYMBOL in value;
}
/**
* Collects helper names from tools and messages arrays.
* Returns a deduplicated array of helper names found.
*/
function collectStainlessHelpers(tools, messages) {
	const helpers = /* @__PURE__ */ new Set();
	if (tools) {
		for (const tool of tools) if (wasCreatedByStainlessHelper(tool)) helpers.add(tool[SDK_HELPER_SYMBOL]);
	}
	if (messages) for (const message of messages) {
		if (wasCreatedByStainlessHelper(message)) helpers.add(message[SDK_HELPER_SYMBOL]);
		const content = message.content;
		if (Array.isArray(content)) {
			for (const block of content) if (wasCreatedByStainlessHelper(block)) helpers.add(block[SDK_HELPER_SYMBOL]);
		}
	}
	return Array.from(helpers);
}
/**
* Builds x-stainless-helper header value from tools and messages.
* Returns an empty object if no helpers are found.
*/
function stainlessHelperHeader(tools, messages) {
	const helpers = collectStainlessHelpers(tools, messages);
	if (helpers.length === 0) return {};
	return { [STAINLESS_HELPER_HEADER]: helpers.join(", ") };
}
/**
* Builds x-stainless-helper header value from a file object.
* Returns an empty object if the file is not marked with a helper.
*/
function stainlessHelperHeaderFromFile(file) {
	if (wasCreatedByStainlessHelper(file)) return { [STAINLESS_HELPER_HEADER]: file[SDK_HELPER_SYMBOL] };
	return {};
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/files.mjs
var Files$1 = class extends APIResource {
	/**
	* List Files
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaFileMetadata of client.beta.files.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/files?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* Delete File
	*
	* @example
	* ```ts
	* const betaDeletedFile = await client.beta.files.delete(
	*   'file_id',
	* );
	* ```
	*/
	delete(fileID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.delete(path`/v1/files/${fileID}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* Download File
	*
	* @example
	* ```ts
	* const response = await client.beta.files.download(
	*   'file_id',
	* );
	*
	* const content = await response.blob();
	* console.log(content);
	* ```
	*/
	download(fileID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/files/${fileID}/content?beta=true`, {
			...options,
			headers: buildHeaders([{
				Accept: "application/binary",
				...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0
			}, options?.headers]),
			__binaryResponse: true
		});
	}
	/**
	* Get File Metadata
	*
	* @example
	* ```ts
	* const betaFileMetadata =
	*   await client.beta.files.retrieveMetadata('file_id');
	* ```
	*/
	retrieveMetadata(fileID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/files/${fileID}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* Upload File
	*
	* @example
	* ```ts
	* const betaFileMetadata = await client.beta.files.upload({
	*   file: fs.createReadStream('path/to/file'),
	* });
	* ```
	*/
	upload(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/files?beta=true", multipartFormRequestOptions({
			body,
			...options,
			headers: buildHeaders([
				{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 },
				stainlessHelperHeaderFromFile(body.file),
				options?.headers
			])
		}, this._client));
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/models.mjs
var Models$1 = class extends APIResource {
	/**
	* Get a specific model.
	*
	* The Models API response can be used to determine information about a specific
	* model or resolve a model alias to a model ID.
	*
	* @example
	* ```ts
	* const betaModelInfo = await client.beta.models.retrieve(
	*   'model_id',
	* );
	* ```
	*/
	retrieve(modelID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/models/${modelID}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* List available models.
	*
	* The Models API response can be used to determine which models are available for
	* use in the API. More recently released models are listed first.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaModelInfo of client.beta.models.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/models?beta=true", Page, {
			query,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/user-profiles.mjs
var UserProfiles = class extends APIResource {
	/**
	* Create User Profile
	*
	* @example
	* ```ts
	* const betaUserProfile =
	*   await client.beta.userProfiles.create();
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/user_profiles?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "user-profiles-2026-08-18"].toString() }, options?.headers])
		});
	}
	/**
	* Get User Profile
	*
	* @example
	* ```ts
	* const betaUserProfile =
	*   await client.beta.userProfiles.retrieve(
	*     'uprof_011CZkZCu8hGbp5mYRQgUmz9',
	*   );
	* ```
	*/
	retrieve(userProfileID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/user_profiles/${userProfileID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "user-profiles-2026-08-18"].toString() }, options?.headers])
		});
	}
	/**
	* Update User Profile
	*
	* @example
	* ```ts
	* const betaUserProfile =
	*   await client.beta.userProfiles.update(
	*     'uprof_011CZkZCu8hGbp5mYRQgUmz9',
	*   );
	* ```
	*/
	update(userProfileID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/user_profiles/${userProfileID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "user-profiles-2026-08-18"].toString() }, options?.headers])
		});
	}
	/**
	* List User Profiles
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaUserProfile of client.beta.userProfiles.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/user_profiles?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "user-profiles-2026-08-18"].toString() }, options?.headers])
		});
	}
	/**
	* Create Enrollment URL
	*
	* @example
	* ```ts
	* const betaUserProfileEnrollmentURL =
	*   await client.beta.userProfiles.createEnrollmentURL(
	*     'uprof_011CZkZCu8hGbp5mYRQgUmz9',
	*   );
	* ```
	*/
	createEnrollmentURL(userProfileID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/user_profiles/${userProfileID}/enrollment_url?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "user-profiles-2026-08-18"].toString() }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@stablelib+base64@1.0.1/node_modules/@stablelib/base64/lib/base64.js
var require_base64 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __extends = exports && exports.__extends || (function() {
		var extendStatics = function(d, b) {
			extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d, b) {
				d.__proto__ = b;
			} || function(d, b) {
				for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
			};
			return extendStatics(d, b);
		};
		return function(d, b) {
			extendStatics(d, b);
			function __() {
				this.constructor = d;
			}
			d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
		};
	})();
	Object.defineProperty(exports, "__esModule", { value: true });
	/**
	* Package base64 implements Base64 encoding and decoding.
	*/
	var INVALID_BYTE = 256;
	/**
	* Implements standard Base64 encoding.
	*
	* Operates in constant time.
	*/
	var Coder = function() {
		function Coder(_paddingCharacter) {
			if (_paddingCharacter === void 0) _paddingCharacter = "=";
			this._paddingCharacter = _paddingCharacter;
		}
		Coder.prototype.encodedLength = function(length) {
			if (!this._paddingCharacter) return (length * 8 + 5) / 6 | 0;
			return (length + 2) / 3 * 4 | 0;
		};
		Coder.prototype.encode = function(data) {
			var out = "";
			var i = 0;
			for (; i < data.length - 2; i += 3) {
				var c = data[i] << 16 | data[i + 1] << 8 | data[i + 2];
				out += this._encodeByte(c >>> 18 & 63);
				out += this._encodeByte(c >>> 12 & 63);
				out += this._encodeByte(c >>> 6 & 63);
				out += this._encodeByte(c >>> 0 & 63);
			}
			var left = data.length - i;
			if (left > 0) {
				var c = data[i] << 16 | (left === 2 ? data[i + 1] << 8 : 0);
				out += this._encodeByte(c >>> 18 & 63);
				out += this._encodeByte(c >>> 12 & 63);
				if (left === 2) out += this._encodeByte(c >>> 6 & 63);
				else out += this._paddingCharacter || "";
				out += this._paddingCharacter || "";
			}
			return out;
		};
		Coder.prototype.maxDecodedLength = function(length) {
			if (!this._paddingCharacter) return (length * 6 + 7) / 8 | 0;
			return length / 4 * 3 | 0;
		};
		Coder.prototype.decodedLength = function(s) {
			return this.maxDecodedLength(s.length - this._getPaddingLength(s));
		};
		Coder.prototype.decode = function(s) {
			if (s.length === 0) return /* @__PURE__ */ new Uint8Array(0);
			var paddingLength = this._getPaddingLength(s);
			var length = s.length - paddingLength;
			var out = new Uint8Array(this.maxDecodedLength(length));
			var op = 0;
			var i = 0;
			var haveBad = 0;
			var v0 = 0, v1 = 0, v2 = 0, v3 = 0;
			for (; i < length - 4; i += 4) {
				v0 = this._decodeChar(s.charCodeAt(i + 0));
				v1 = this._decodeChar(s.charCodeAt(i + 1));
				v2 = this._decodeChar(s.charCodeAt(i + 2));
				v3 = this._decodeChar(s.charCodeAt(i + 3));
				out[op++] = v0 << 2 | v1 >>> 4;
				out[op++] = v1 << 4 | v2 >>> 2;
				out[op++] = v2 << 6 | v3;
				haveBad |= v0 & INVALID_BYTE;
				haveBad |= v1 & INVALID_BYTE;
				haveBad |= v2 & INVALID_BYTE;
				haveBad |= v3 & INVALID_BYTE;
			}
			if (i < length - 1) {
				v0 = this._decodeChar(s.charCodeAt(i));
				v1 = this._decodeChar(s.charCodeAt(i + 1));
				out[op++] = v0 << 2 | v1 >>> 4;
				haveBad |= v0 & INVALID_BYTE;
				haveBad |= v1 & INVALID_BYTE;
			}
			if (i < length - 2) {
				v2 = this._decodeChar(s.charCodeAt(i + 2));
				out[op++] = v1 << 4 | v2 >>> 2;
				haveBad |= v2 & INVALID_BYTE;
			}
			if (i < length - 3) {
				v3 = this._decodeChar(s.charCodeAt(i + 3));
				out[op++] = v2 << 6 | v3;
				haveBad |= v3 & INVALID_BYTE;
			}
			if (haveBad !== 0) throw new Error("Base64Coder: incorrect characters for decoding");
			return out;
		};
		Coder.prototype._encodeByte = function(b) {
			var result = b;
			result += 65;
			result += 25 - b >>> 8 & 6;
			result += 51 - b >>> 8 & -75;
			result += 61 - b >>> 8 & -15;
			result += 62 - b >>> 8 & 3;
			return String.fromCharCode(result);
		};
		Coder.prototype._decodeChar = function(c) {
			var result = INVALID_BYTE;
			result += (42 - c & c - 44) >>> 8 & -INVALID_BYTE + c - 43 + 62;
			result += (46 - c & c - 48) >>> 8 & -INVALID_BYTE + c - 47 + 63;
			result += (47 - c & c - 58) >>> 8 & -INVALID_BYTE + c - 48 + 52;
			result += (64 - c & c - 91) >>> 8 & -INVALID_BYTE + c - 65 + 0;
			result += (96 - c & c - 123) >>> 8 & -INVALID_BYTE + c - 97 + 26;
			return result;
		};
		Coder.prototype._getPaddingLength = function(s) {
			var paddingLength = 0;
			if (this._paddingCharacter) {
				for (var i = s.length - 1; i >= 0; i--) {
					if (s[i] !== this._paddingCharacter) break;
					paddingLength++;
				}
				if (s.length < 4 || paddingLength > 2) throw new Error("Base64Coder: incorrect padding");
			}
			return paddingLength;
		};
		return Coder;
	}();
	exports.Coder = Coder;
	var stdCoder = new Coder();
	function encode(data) {
		return stdCoder.encode(data);
	}
	exports.encode = encode;
	function decode(s) {
		return stdCoder.decode(s);
	}
	exports.decode = decode;
	/**
	* Implements URL-safe Base64 encoding.
	* (Same as Base64, but '+' is replaced with '-', and '/' with '_').
	*
	* Operates in constant time.
	*/
	var URLSafeCoder = function(_super) {
		__extends(URLSafeCoder, _super);
		function URLSafeCoder() {
			return _super !== null && _super.apply(this, arguments) || this;
		}
		URLSafeCoder.prototype._encodeByte = function(b) {
			var result = b;
			result += 65;
			result += 25 - b >>> 8 & 6;
			result += 51 - b >>> 8 & -75;
			result += 61 - b >>> 8 & -13;
			result += 62 - b >>> 8 & 49;
			return String.fromCharCode(result);
		};
		URLSafeCoder.prototype._decodeChar = function(c) {
			var result = INVALID_BYTE;
			result += (44 - c & c - 46) >>> 8 & -INVALID_BYTE + c - 45 + 62;
			result += (94 - c & c - 96) >>> 8 & -INVALID_BYTE + c - 95 + 63;
			result += (47 - c & c - 58) >>> 8 & -INVALID_BYTE + c - 48 + 52;
			result += (64 - c & c - 91) >>> 8 & -INVALID_BYTE + c - 65 + 0;
			result += (96 - c & c - 123) >>> 8 & -INVALID_BYTE + c - 97 + 26;
			return result;
		};
		return URLSafeCoder;
	}(Coder);
	exports.URLSafeCoder = URLSafeCoder;
	var urlSafeCoder = new URLSafeCoder();
	function encodeURLSafe(data) {
		return urlSafeCoder.encode(data);
	}
	exports.encodeURLSafe = encodeURLSafe;
	function decodeURLSafe(s) {
		return urlSafeCoder.decode(s);
	}
	exports.decodeURLSafe = decodeURLSafe;
	exports.encodedLength = function(length) {
		return stdCoder.encodedLength(length);
	};
	exports.maxDecodedLength = function(length) {
		return stdCoder.maxDecodedLength(length);
	};
	exports.decodedLength = function(s) {
		return stdCoder.decodedLength(s);
	};
}));
//#endregion
//#region node_modules/.pnpm/fast-sha256@1.3.0/node_modules/fast-sha256/sha256.js
var require_sha256 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	(function(root, factory) {
		var exports$1 = {};
		factory(exports$1);
		var sha256 = exports$1["default"];
		for (var k in exports$1) sha256[k] = exports$1[k];
		if (typeof module === "object" && typeof module.exports === "object") module.exports = sha256;
		else if (typeof define === "function" && define.amd) define(function() {
			return sha256;
		});
		else root.sha256 = sha256;
	})(exports, function(exports$2) {
		"use strict";
		exports$2.__esModule = true;
		exports$2.digestLength = 32;
		exports$2.blockSize = 64;
		var K = new Uint32Array([
			1116352408,
			1899447441,
			3049323471,
			3921009573,
			961987163,
			1508970993,
			2453635748,
			2870763221,
			3624381080,
			310598401,
			607225278,
			1426881987,
			1925078388,
			2162078206,
			2614888103,
			3248222580,
			3835390401,
			4022224774,
			264347078,
			604807628,
			770255983,
			1249150122,
			1555081692,
			1996064986,
			2554220882,
			2821834349,
			2952996808,
			3210313671,
			3336571891,
			3584528711,
			113926993,
			338241895,
			666307205,
			773529912,
			1294757372,
			1396182291,
			1695183700,
			1986661051,
			2177026350,
			2456956037,
			2730485921,
			2820302411,
			3259730800,
			3345764771,
			3516065817,
			3600352804,
			4094571909,
			275423344,
			430227734,
			506948616,
			659060556,
			883997877,
			958139571,
			1322822218,
			1537002063,
			1747873779,
			1955562222,
			2024104815,
			2227730452,
			2361852424,
			2428436474,
			2756734187,
			3204031479,
			3329325298
		]);
		function hashBlocks(w, v, p, pos, len) {
			var a, b, c, d, e, f, g, h, u, i, j, t1, t2;
			while (len >= 64) {
				a = v[0];
				b = v[1];
				c = v[2];
				d = v[3];
				e = v[4];
				f = v[5];
				g = v[6];
				h = v[7];
				for (i = 0; i < 16; i++) {
					j = pos + i * 4;
					w[i] = (p[j] & 255) << 24 | (p[j + 1] & 255) << 16 | (p[j + 2] & 255) << 8 | p[j + 3] & 255;
				}
				for (i = 16; i < 64; i++) {
					u = w[i - 2];
					t1 = (u >>> 17 | u << 15) ^ (u >>> 19 | u << 13) ^ u >>> 10;
					u = w[i - 15];
					t2 = (u >>> 7 | u << 25) ^ (u >>> 18 | u << 14) ^ u >>> 3;
					w[i] = (t1 + w[i - 7] | 0) + (t2 + w[i - 16] | 0);
				}
				for (i = 0; i < 64; i++) {
					t1 = (((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)) + (e & f ^ ~e & g) | 0) + (h + (K[i] + w[i] | 0) | 0) | 0;
					t2 = ((a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10)) + (a & b ^ a & c ^ b & c) | 0;
					h = g;
					g = f;
					f = e;
					e = d + t1 | 0;
					d = c;
					c = b;
					b = a;
					a = t1 + t2 | 0;
				}
				v[0] += a;
				v[1] += b;
				v[2] += c;
				v[3] += d;
				v[4] += e;
				v[5] += f;
				v[6] += g;
				v[7] += h;
				pos += 64;
				len -= 64;
			}
			return pos;
		}
		var Hash = function() {
			function Hash() {
				this.digestLength = exports$2.digestLength;
				this.blockSize = exports$2.blockSize;
				this.state = /* @__PURE__ */ new Int32Array(8);
				this.temp = /* @__PURE__ */ new Int32Array(64);
				this.buffer = /* @__PURE__ */ new Uint8Array(128);
				this.bufferLength = 0;
				this.bytesHashed = 0;
				this.finished = false;
				this.reset();
			}
			Hash.prototype.reset = function() {
				this.state[0] = 1779033703;
				this.state[1] = 3144134277;
				this.state[2] = 1013904242;
				this.state[3] = 2773480762;
				this.state[4] = 1359893119;
				this.state[5] = 2600822924;
				this.state[6] = 528734635;
				this.state[7] = 1541459225;
				this.bufferLength = 0;
				this.bytesHashed = 0;
				this.finished = false;
				return this;
			};
			Hash.prototype.clean = function() {
				for (var i = 0; i < this.buffer.length; i++) this.buffer[i] = 0;
				for (var i = 0; i < this.temp.length; i++) this.temp[i] = 0;
				this.reset();
			};
			Hash.prototype.update = function(data, dataLength) {
				if (dataLength === void 0) dataLength = data.length;
				if (this.finished) throw new Error("SHA256: can't update because hash was finished.");
				var dataPos = 0;
				this.bytesHashed += dataLength;
				if (this.bufferLength > 0) {
					while (this.bufferLength < 64 && dataLength > 0) {
						this.buffer[this.bufferLength++] = data[dataPos++];
						dataLength--;
					}
					if (this.bufferLength === 64) {
						hashBlocks(this.temp, this.state, this.buffer, 0, 64);
						this.bufferLength = 0;
					}
				}
				if (dataLength >= 64) {
					dataPos = hashBlocks(this.temp, this.state, data, dataPos, dataLength);
					dataLength %= 64;
				}
				while (dataLength > 0) {
					this.buffer[this.bufferLength++] = data[dataPos++];
					dataLength--;
				}
				return this;
			};
			Hash.prototype.finish = function(out) {
				if (!this.finished) {
					var bytesHashed = this.bytesHashed;
					var left = this.bufferLength;
					var bitLenHi = bytesHashed / 536870912 | 0;
					var bitLenLo = bytesHashed << 3;
					var padLength = bytesHashed % 64 < 56 ? 64 : 128;
					this.buffer[left] = 128;
					for (var i = left + 1; i < padLength - 8; i++) this.buffer[i] = 0;
					this.buffer[padLength - 8] = bitLenHi >>> 24 & 255;
					this.buffer[padLength - 7] = bitLenHi >>> 16 & 255;
					this.buffer[padLength - 6] = bitLenHi >>> 8 & 255;
					this.buffer[padLength - 5] = bitLenHi >>> 0 & 255;
					this.buffer[padLength - 4] = bitLenLo >>> 24 & 255;
					this.buffer[padLength - 3] = bitLenLo >>> 16 & 255;
					this.buffer[padLength - 2] = bitLenLo >>> 8 & 255;
					this.buffer[padLength - 1] = bitLenLo >>> 0 & 255;
					hashBlocks(this.temp, this.state, this.buffer, 0, padLength);
					this.finished = true;
				}
				for (var i = 0; i < 8; i++) {
					out[i * 4 + 0] = this.state[i] >>> 24 & 255;
					out[i * 4 + 1] = this.state[i] >>> 16 & 255;
					out[i * 4 + 2] = this.state[i] >>> 8 & 255;
					out[i * 4 + 3] = this.state[i] >>> 0 & 255;
				}
				return this;
			};
			Hash.prototype.digest = function() {
				var out = new Uint8Array(this.digestLength);
				this.finish(out);
				return out;
			};
			Hash.prototype._saveState = function(out) {
				for (var i = 0; i < this.state.length; i++) out[i] = this.state[i];
			};
			Hash.prototype._restoreState = function(from, bytesHashed) {
				for (var i = 0; i < this.state.length; i++) this.state[i] = from[i];
				this.bytesHashed = bytesHashed;
				this.finished = false;
				this.bufferLength = 0;
			};
			return Hash;
		}();
		exports$2.Hash = Hash;
		var HMAC = function() {
			function HMAC(key) {
				this.inner = new Hash();
				this.outer = new Hash();
				this.blockSize = this.inner.blockSize;
				this.digestLength = this.inner.digestLength;
				var pad = new Uint8Array(this.blockSize);
				if (key.length > this.blockSize) new Hash().update(key).finish(pad).clean();
				else for (var i = 0; i < key.length; i++) pad[i] = key[i];
				for (var i = 0; i < pad.length; i++) pad[i] ^= 54;
				this.inner.update(pad);
				for (var i = 0; i < pad.length; i++) pad[i] ^= 106;
				this.outer.update(pad);
				this.istate = /* @__PURE__ */ new Uint32Array(8);
				this.ostate = /* @__PURE__ */ new Uint32Array(8);
				this.inner._saveState(this.istate);
				this.outer._saveState(this.ostate);
				for (var i = 0; i < pad.length; i++) pad[i] = 0;
			}
			HMAC.prototype.reset = function() {
				this.inner._restoreState(this.istate, this.inner.blockSize);
				this.outer._restoreState(this.ostate, this.outer.blockSize);
				return this;
			};
			HMAC.prototype.clean = function() {
				for (var i = 0; i < this.istate.length; i++) this.ostate[i] = this.istate[i] = 0;
				this.inner.clean();
				this.outer.clean();
			};
			HMAC.prototype.update = function(data) {
				this.inner.update(data);
				return this;
			};
			HMAC.prototype.finish = function(out) {
				if (this.outer.finished) this.outer.finish(out);
				else {
					this.inner.finish(out);
					this.outer.update(out, this.digestLength).finish(out);
				}
				return this;
			};
			HMAC.prototype.digest = function() {
				var out = new Uint8Array(this.digestLength);
				this.finish(out);
				return out;
			};
			return HMAC;
		}();
		exports$2.HMAC = HMAC;
		function hash(data) {
			var h = new Hash().update(data);
			var digest = h.digest();
			h.clean();
			return digest;
		}
		exports$2.hash = hash;
		exports$2["default"] = hash;
		function hmac(key, data) {
			var h = new HMAC(key).update(data);
			var digest = h.digest();
			h.clean();
			return digest;
		}
		exports$2.hmac = hmac;
		function fillBuffer(buffer, hmac, info, counter) {
			var num = counter[0];
			if (num === 0) throw new Error("hkdf: cannot expand more");
			hmac.reset();
			if (num > 1) hmac.update(buffer);
			if (info) hmac.update(info);
			hmac.update(counter);
			hmac.finish(buffer);
			counter[0]++;
		}
		var hkdfSalt = new Uint8Array(exports$2.digestLength);
		function hkdf(key, salt, info, length) {
			if (salt === void 0) salt = hkdfSalt;
			if (length === void 0) length = 32;
			var counter = new Uint8Array([1]);
			var hmac_ = new HMAC(hmac(salt, key));
			var buffer = new Uint8Array(hmac_.digestLength);
			var bufpos = buffer.length;
			var out = new Uint8Array(length);
			for (var i = 0; i < length; i++) {
				if (bufpos === buffer.length) {
					fillBuffer(buffer, hmac_, info, counter);
					bufpos = 0;
				}
				out[i] = buffer[bufpos++];
			}
			hmac_.clean();
			buffer.fill(0);
			counter.fill(0);
			return out;
		}
		exports$2.hkdf = hkdf;
		function pbkdf2(password, salt, iterations, dkLen) {
			var prf = new HMAC(password);
			var len = prf.digestLength;
			var ctr = /* @__PURE__ */ new Uint8Array(4);
			var t = new Uint8Array(len);
			var u = new Uint8Array(len);
			var dk = new Uint8Array(dkLen);
			for (var i = 0; i * len < dkLen; i++) {
				var c = i + 1;
				ctr[0] = c >>> 24 & 255;
				ctr[1] = c >>> 16 & 255;
				ctr[2] = c >>> 8 & 255;
				ctr[3] = c >>> 0 & 255;
				prf.reset();
				prf.update(salt);
				prf.update(ctr);
				prf.finish(u);
				for (var j = 0; j < len; j++) t[j] = u[j];
				for (var j = 2; j <= iterations; j++) {
					prf.reset();
					prf.update(u).finish(u);
					for (var k = 0; k < len; k++) t[k] ^= u[k];
				}
				for (var j = 0; j < len && i * len + j < dkLen; j++) dk[i * len + j] = t[j];
			}
			for (var i = 0; i < len; i++) t[i] = u[i] = 0;
			for (var i = 0; i < 4; i++) ctr[i] = 0;
			prf.clean();
			return dk;
		}
		exports$2.pbkdf2 = pbkdf2;
	});
}));
//#endregion
//#region node_modules/.pnpm/standardwebhooks@1.1.1/node_modules/standardwebhooks/dist/timing_safe_equal.js
var require_timing_safe_equal = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.timingSafeEqual = timingSafeEqual;
	function assert(expr, msg = "") {
		if (!expr) throw new Error(msg);
	}
	function timingSafeEqual(a, b) {
		if (a.byteLength !== b.byteLength) return false;
		if (!(a instanceof DataView)) a = new DataView(ArrayBuffer.isView(a) ? a.buffer : a);
		if (!(b instanceof DataView)) b = new DataView(ArrayBuffer.isView(b) ? b.buffer : b);
		assert(a instanceof DataView);
		assert(b instanceof DataView);
		const length = a.byteLength;
		let out = 0;
		let i = -1;
		while (++i < length) out |= a.getUint8(i) ^ b.getUint8(i);
		return out === 0;
	}
}));
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/webhooks.mjs
var import_dist = (/* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Webhook = exports.WebhookVerificationError = void 0;
	const base64 = require_base64();
	const sha256 = require_sha256();
	const timing_safe_equal_1 = require_timing_safe_equal();
	const WEBHOOK_TOLERANCE_IN_SECONDS = 300;
	var ExtendableError = class ExtendableError extends Error {
		constructor(message) {
			super(message);
			Object.setPrototypeOf(this, ExtendableError.prototype);
			this.name = "ExtendableError";
			this.stack = new Error(message).stack;
		}
	};
	var WebhookVerificationError = class WebhookVerificationError extends ExtendableError {
		constructor(message) {
			super(message);
			Object.setPrototypeOf(this, WebhookVerificationError.prototype);
			this.name = "WebhookVerificationError";
		}
	};
	exports.WebhookVerificationError = WebhookVerificationError;
	var Webhook = class Webhook {
		constructor(secret, options) {
			if ((options === null || options === void 0 ? void 0 : options.format) === "raw") {
				if (secret instanceof Uint8Array) this.key = secret;
				else this.key = Uint8Array.from(secret, (c) => c.charCodeAt(0));
			} else {
				if (typeof secret !== "string") throw new Error("Expected secret to be of type string");
				if (secret.startsWith(Webhook.prefix)) secret = secret.substring(Webhook.prefix.length);
				this.key = base64.decode(secret);
			}
			if (this.key.length === 0) throw new Error("Secret can't be empty.");
		}
		verify(payload, headers, options) {
			var _a;
			const jsonParse = (_a = options === null || options === void 0 ? void 0 : options.jsonParse) !== null && _a !== void 0 ? _a : true;
			const normalizedHeaders = {};
			for (const key of Object.keys(headers)) normalizedHeaders[key.toLowerCase()] = headers[key];
			const msgId = normalizedHeaders["webhook-id"];
			const msgSignature = normalizedHeaders["webhook-signature"];
			const msgTimestamp = normalizedHeaders["webhook-timestamp"];
			if (!msgSignature || !msgId || !msgTimestamp) throw new WebhookVerificationError("Missing required headers");
			const timestamp = this.verifyTimestamp(msgTimestamp);
			const expectedSignature = this.sign(msgId, timestamp, payload).split(",")[1];
			const passedSignatures = msgSignature.split(" ");
			const encoder = new globalThis.TextEncoder();
			for (const versionedSignature of passedSignatures) {
				const [version, signature] = versionedSignature.split(",");
				if (version !== "v1") continue;
				if ((0, timing_safe_equal_1.timingSafeEqual)(encoder.encode(signature), encoder.encode(expectedSignature))) {
					const payloadString = payload.toString();
					if (payloadString === "") return;
					if (jsonParse) return JSON.parse(payloadString);
					else return;
				}
			}
			throw new WebhookVerificationError("No matching signature found");
		}
		sign(msgId, timestamp, payload) {
			if (typeof payload === "string") {} else if (payload.constructor.name === "Buffer") payload = payload.toString();
			else throw new Error("Expected payload to be of type string or Buffer.");
			const encoder = new TextEncoder();
			const timestampNumber = Math.floor(timestamp.getTime() / 1e3);
			const toSign = encoder.encode(`${msgId}.${timestampNumber}.${payload}`);
			return `v1,${base64.encode(sha256.hmac(this.key, toSign))}`;
		}
		verifyTimestamp(timestampHeader) {
			const now = Math.floor(Date.now() / 1e3);
			const timestamp = parseInt(timestampHeader, 10);
			if (Number.isNaN(timestamp)) throw new WebhookVerificationError("Invalid Signature Headers");
			if (now - timestamp > WEBHOOK_TOLERANCE_IN_SECONDS) throw new WebhookVerificationError("Message timestamp too old");
			if (timestamp > now + WEBHOOK_TOLERANCE_IN_SECONDS) throw new WebhookVerificationError("Message timestamp too new");
			return /* @__PURE__ */ new Date(timestamp * 1e3);
		}
	};
	exports.Webhook = Webhook;
	Webhook.prefix = "whsec_";
})))();
var Webhooks = class extends APIResource {
	/**
	* Parses a webhook payload into an event without verifying its signature. Prefer
	* `unwrap()` unless you have already verified the signature yourself.
	*/
	parseUnverified(body) {
		return JSON.parse(body);
	}
	/**
	* Verifies the webhook signature from the `webhook-id`, `webhook-timestamp` and
	* `webhook-signature` headers using your webhook signing key, then parses the
	* payload into an event. Fails if the signature is missing or invalid.
	*/
	unwrap(body, options) {
		const headers = options?.headers;
		if (headers == null) throw new Error("Webhook headers are required in order to verify the signature");
		const keyStr = options.key === void 0 ? this._client.webhookKey : options.key;
		if (!keyStr) throw new Error("Webhook key must not be null or empty in order to unwrap");
		new import_dist.Webhook(keyStr).verify(body, headers);
		return JSON.parse(body);
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/agents/versions.mjs
var Versions$2 = class extends APIResource {
	/**
	* List Agent Versions
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsAgent of client.beta.agents.versions.list(
	*   'agent_011CZkYpogX7uDKUyvBTophP',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(agentID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/agents/${agentID}/versions?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/agents/agents.mjs
var Agents = class extends APIResource {
	constructor() {
		super(...arguments);
		this.versions = new Versions$2(this._client);
	}
	/**
	* Create Agent
	*
	* @example
	* ```ts
	* const betaManagedAgentsAgent =
	*   await client.beta.agents.create({
	*     model: 'claude-opus-5',
	*     name: 'My First Agent',
	*   });
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/agents?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Get Agent
	*
	* @example
	* ```ts
	* const betaManagedAgentsAgent =
	*   await client.beta.agents.retrieve(
	*     'agent_011CZkYpogX7uDKUyvBTophP',
	*   );
	* ```
	*/
	retrieve(agentID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.get(path`/v1/agents/${agentID}?beta=true`, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Update Agent
	*
	* @example
	* ```ts
	* const betaManagedAgentsAgent =
	*   await client.beta.agents.update(
	*     'agent_011CZkYpogX7uDKUyvBTophP',
	*     { description: 'updated' },
	*   );
	* ```
	*/
	update(agentID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/agents/${agentID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* List Agents
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsAgent of client.beta.agents.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/agents?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Archive Agent
	*
	* @example
	* ```ts
	* const betaManagedAgentsAgent =
	*   await client.beta.agents.archive(
	*     'agent_011CZkYpogX7uDKUyvBTophP',
	*   );
	* ```
	*/
	archive(agentID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/agents/${agentID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
};
Agents.Versions = Versions$2;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/abort.mjs
/**
* Chain an external {@link AbortSignal} into a local {@link AbortController}:
* the controller aborts whenever `external` aborts (synchronously if it is
* already aborted).
*
* Returns a cleanup function that detaches the listener. Callers MUST invoke it
* on their normal teardown path — `{ once: true }` only removes the listener if
* abort actually fires, so a long-lived `external` signal (e.g. a daemon-wide
* signal reused across many short-lived controllers) would otherwise leak one
* listener per controller.
*/
function linkAbort(external, controller) {
	if (!external) return () => {};
	if (external.aborted) {
		controller.abort();
		return () => {};
	}
	const onAbort = () => controller.abort();
	external.addEventListener("abort", onAbort);
	return () => external.removeEventListener("abort", onAbort);
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/backoff.mjs
/** True when `e` is an {@link APIError} whose HTTP status equals `code`. */
function isStatus(e, code) {
	return e instanceof APIError && e.status === code;
}
/** True when `e` is an {@link APIError} with a 4xx status. */
function is4xx(e) {
	return e instanceof APIError && typeof e.status === "number" && e.status >= 400 && e.status < 500;
}
/**
* True for a 4xx that the core client's retry policy would *not* retry, i.e. a
* permanent client error. 408 (request timeout), 409 (lock timeout) and 429
* (rate limit) are retryable for the base client (`Anthropic.shouldRetry`), so
* they are not treated as fatal here — keeping helper retry behaviour aligned
* with the rest of the SDK.
*/
function isFatal4xx(e) {
	return is4xx(e) && !isStatus(e, 408) && !isStatus(e, 409) && !isStatus(e, 429);
}
/** Exponential backoff: `baseMs * 2 ** attempt`, clamped to `capMs`. */
function backoff$1(attempt, baseMs, capMs) {
	return Math.min(baseMs * 2 ** attempt, capMs);
}
/** Uniform random delay in the half-open interval `[lowMs, highMs)`. */
function jitter(lowMs, highMs) {
	return lowMs + Math.random() * (highMs - lowMs);
}
/**
* Trim up to 25% off `ms` at random so a fleet of clients backing off after a
* shared outage does not retry in lockstep — mirrors the jitter the core client
* applies to its own retry timeout.
*/
function applyJitter(ms) {
	return ms * (1 - Math.random() * .25);
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/helper-client.mjs
/**
* Return a `withOptions()` clone of `client` set up for use *by* one of the
* runner helpers: authenticated with `authToken` as Bearer credentials, with
* the parent's `X-Api-Key` cleared, and tagged with the helper's
* `x-stainless-helper` value on every outgoing request.
*
* The returned sub-client inherits the parent's full configuration
* (`baseURL`, `timeout`, `maxRetries`, `fetch`, `fetchOptions`, custom
* `defaultHeaders`, `defaultQuery`). Overrides applied:
*
* - `authToken: authToken` — the new credential.
* - `apiKey: null` — the parent's `X-Api-Key` is cleared. `withOptions`
*   inherits the parent's `apiKey` by default; without this, both
*   `X-Api-Key` *and* `Authorization: Bearer …` would land on the wire.
*   `client.ts` only triggers the env-var fallback when `apiKey === undefined`,
*   so explicit `null` is honored.
* - `credentials: undefined` — opts the clone out of any inherited
*   credentials/config/profile so the explicit bearer is the unambiguous auth.
* - `baseURL: client.baseURL` — pins the parent's resolved host (auth override otherwise resets it).
* - `defaultHeaders` is rebuilt as `parent._authState.extraHeaders ⊕ parent.defaultHeaders ⊕
*   {'x-stainless-helper': helper}`. `withOptions` *replaces* (does not
*   merge) `defaultHeaders`, so we merge here so any custom headers the
*   caller set on the parent client survive on the sub-client.
*/
function copyClientForHelper(client, { authToken, helper }) {
	if (!authToken) throw new AnthropicError(`copyClientForHelper: expected a non-empty authToken but received ${JSON.stringify(authToken)}`);
	const internal = client;
	const parentDefaults = internal._options.defaultHeaders;
	const parentAuthExtraHeaders = internal._authState?.extraHeaders;
	const inheritedAuthExtraHeaders = parentAuthExtraHeaders ? Object.fromEntries(Object.entries(parentAuthExtraHeaders).filter(([name]) => {
		const lower = name.toLowerCase();
		return lower !== "authorization" && lower !== "x-api-key";
	})) : void 0;
	const defaultHeaders = buildHeaders([
		inheritedAuthExtraHeaders,
		parentDefaults,
		{ [STAINLESS_HELPER_HEADER]: helper }
	]);
	return client.withOptions({
		apiKey: null,
		authToken,
		baseURL: client.baseURL,
		credentials: void 0,
		defaultHeaders
	});
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/environments/poller.mjs
var _WorkPoller_runnerClient;
var _WorkPoller_consumed;
var _WorkPoller_controller;
var _WorkPoller_detachExternal;
var _WorkPoller_autoStop;
var _WorkPoller_drain;
var _WorkPoller_blockMs;
var _WorkPoller_reclaimOlderThanMs;
var _WorkPoller_requestOpts;
var _IdleLog_log;
var _IdleLog_environmentId;
var _IdleLog_idleSince;
var _IdleLog_lastReport;
const POLL_BACKOFF_BASE_MS = 1e3;
const POLL_BACKOFF_CAP_MS = 6e4;
const IDLE_REPORT_INTERVAL_MS = 3e5;
/**
* Async-iterable that long-polls a self-hosted environment for work, ack's
* each item, yields the {@link BetaSelfHostedWork} item, and posts `stop` after
* the consumer's loop body returns (or when the consumer `break`s).
*
* A yielded item may carry a per-item `secret` payload (populated only by the
* poll response); the poller passes it through untouched — consumers such as
* {@link EnvironmentWorker} extract the sessions token it carries and prefer
* that over the environment key for the item's downstream calls. Treat it as
* opaque and never log it.
*
* @example
* ```ts
* for await (const work of client.beta.environments.work.poller({
*   environmentId,
*   environmentKey,
* })) {
*   // ...service the work...
* }
* ```
*/
var WorkPoller = class {
	constructor(opts) {
		_WorkPoller_runnerClient.set(this, void 0);
		_WorkPoller_consumed.set(this, false);
		_WorkPoller_controller.set(this, void 0);
		_WorkPoller_detachExternal.set(this, void 0);
		_WorkPoller_autoStop.set(this, void 0);
		_WorkPoller_drain.set(this, void 0);
		_WorkPoller_blockMs.set(this, void 0);
		_WorkPoller_reclaimOlderThanMs.set(this, void 0);
		_WorkPoller_requestOpts.set(this, void 0);
		this.client = opts.client;
		this.environmentId = opts.environmentId;
		this.environmentKey = opts.environmentKey;
		this.workerId = opts.workerId ?? defaultWorkerId();
		__classPrivateFieldSet(this, _WorkPoller_runnerClient, copyClientForHelper(opts.client, {
			authToken: opts.environmentKey,
			helper: "environments-work-poller"
		}), "f");
		__classPrivateFieldSet(this, _WorkPoller_autoStop, opts.autoStop ?? true, "f");
		__classPrivateFieldSet(this, _WorkPoller_drain, opts.drain ?? false, "f");
		__classPrivateFieldSet(this, _WorkPoller_blockMs, opts.blockMs === void 0 ? 999 : opts.blockMs, "f");
		__classPrivateFieldSet(this, _WorkPoller_reclaimOlderThanMs, opts.reclaimOlderThanMs ?? null, "f");
		__classPrivateFieldSet(this, _WorkPoller_requestOpts, opts.requestOptions, "f");
		__classPrivateFieldSet(this, _WorkPoller_controller, new AbortController(), "f");
		__classPrivateFieldSet(this, _WorkPoller_detachExternal, linkAbort(opts.signal, __classPrivateFieldGet(this, _WorkPoller_controller, "f")), "f");
	}
	/** Read-only view of this iterator's abort signal. */
	get signal() {
		return __classPrivateFieldGet(this, _WorkPoller_controller, "f").signal;
	}
	/** Abort the iterator. The current `for await` will exit cleanly. */
	abort() {
		__classPrivateFieldGet(this, _WorkPoller_controller, "f").abort();
	}
	async *[(_WorkPoller_runnerClient = /* @__PURE__ */ new WeakMap(), _WorkPoller_consumed = /* @__PURE__ */ new WeakMap(), _WorkPoller_controller = /* @__PURE__ */ new WeakMap(), _WorkPoller_detachExternal = /* @__PURE__ */ new WeakMap(), _WorkPoller_autoStop = /* @__PURE__ */ new WeakMap(), _WorkPoller_drain = /* @__PURE__ */ new WeakMap(), _WorkPoller_blockMs = /* @__PURE__ */ new WeakMap(), _WorkPoller_reclaimOlderThanMs = /* @__PURE__ */ new WeakMap(), _WorkPoller_requestOpts = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
		if (__classPrivateFieldGet(this, _WorkPoller_consumed, "f")) throw new AnthropicError("Cannot iterate over a consumed WorkPoller");
		__classPrivateFieldSet(this, _WorkPoller_consumed, true, "f");
		const log = loggerFor(this.client);
		log.info("poller starting", {
			component: "work-poller",
			environment_id: this.environmentId
		});
		const idle = new IdleLog(log, this.environmentId);
		try {
			let attempt = 0;
			while (!__classPrivateFieldGet(this, _WorkPoller_controller, "f").signal.aborted) {
				let work;
				try {
					work = await __classPrivateFieldGet(this, _WorkPoller_runnerClient, "f").beta.environments.work.poll(this.environmentId, {
						"Anthropic-Worker-ID": this.workerId,
						...__classPrivateFieldGet(this, _WorkPoller_blockMs, "f") !== null ? { block_ms: __classPrivateFieldGet(this, _WorkPoller_blockMs, "f") } : {},
						...__classPrivateFieldGet(this, _WorkPoller_reclaimOlderThanMs, "f") !== null ? { reclaim_older_than_ms: __classPrivateFieldGet(this, _WorkPoller_reclaimOlderThanMs, "f") } : {}
					}, {
						headers: buildHeaders([__classPrivateFieldGet(this, _WorkPoller_requestOpts, "f")?.headers]),
						signal: __classPrivateFieldGet(this, _WorkPoller_controller, "f").signal
					});
				} catch (e) {
					if (__classPrivateFieldGet(this, _WorkPoller_controller, "f").signal.aborted) return;
					if (isFatal4xx(e)) {
						log.error("poll failed permanently, stopping poller", { error: String(e) });
						throw e;
					}
					const wait = applyJitter(backoff(attempt));
					log.warn("poll failed, backing off", {
						error: String(e),
						backoff_ms: wait
					});
					attempt++;
					await sleep(wait, __classPrivateFieldGet(this, _WorkPoller_controller, "f").signal);
					continue;
				}
				attempt = 0;
				if (work == null) {
					if (__classPrivateFieldGet(this, _WorkPoller_drain, "f")) return;
					idle.onEmptyPoll();
					await sleep(jitter(1e3, 3e3), __classPrivateFieldGet(this, _WorkPoller_controller, "f").signal);
					continue;
				}
				idle.onClaim();
				log.info("claimed work", {
					component: "work-poller",
					environment_id: this.environmentId,
					work_id: work.id,
					work_type: work.data.type
				});
				try {
					await __classPrivateFieldGet(this, _WorkPoller_runnerClient, "f").beta.environments.work.ack(work.id, { environment_id: work.environment_id }, {
						headers: buildHeaders([__classPrivateFieldGet(this, _WorkPoller_requestOpts, "f")?.headers]),
						signal: __classPrivateFieldGet(this, _WorkPoller_controller, "f").signal
					});
				} catch (e) {
					log.error("ack failed", {
						work_id: work.id,
						error: String(e)
					});
					continue;
				}
				try {
					yield work;
				} finally {
					if (__classPrivateFieldGet(this, _WorkPoller_autoStop, "f")) try {
						await __classPrivateFieldGet(this, _WorkPoller_runnerClient, "f").beta.environments.work.stop(work.id, { environment_id: work.environment_id }, { headers: buildHeaders([__classPrivateFieldGet(this, _WorkPoller_requestOpts, "f")?.headers]) });
					} catch (e) {
						if (!isStatus(e, 409)) log.warn("stop failed", {
							work_id: work.id,
							error: String(e)
						});
					}
				}
			}
		} finally {
			__classPrivateFieldGet(this, _WorkPoller_detachExternal, "f").call(this);
		}
	}
};
/** Exponential poll backoff: 1s, 2s, 4s … clamped to a 60s cap. */
function backoff(attempt) {
	return backoff$1(attempt, POLL_BACKOFF_BASE_MS, POLL_BACKOFF_CAP_MS);
}
/**
* Keeps an idle poll loop visible in the logs without an INFO line per poll:
* the first empty poll after start-up or after a claim logs at INFO and later
* ones at DEBUG, with an INFO reminder every `IDLE_REPORT_INTERVAL_MS` while
* the loop stays idle.
*/
var IdleLog = class {
	constructor(log, environmentId) {
		_IdleLog_log.set(this, void 0);
		_IdleLog_environmentId.set(this, void 0);
		_IdleLog_idleSince.set(this, void 0);
		_IdleLog_lastReport.set(this, 0);
		__classPrivateFieldSet(this, _IdleLog_log, log, "f");
		__classPrivateFieldSet(this, _IdleLog_environmentId, environmentId, "f");
	}
	onEmptyPoll() {
		const now = Date.now();
		const fields = {
			component: "work-poller",
			environment_id: __classPrivateFieldGet(this, _IdleLog_environmentId, "f")
		};
		if (__classPrivateFieldGet(this, _IdleLog_idleSince, "f") === void 0) {
			__classPrivateFieldSet(this, _IdleLog_idleSince, __classPrivateFieldSet(this, _IdleLog_lastReport, now, "f"), "f");
			__classPrivateFieldGet(this, _IdleLog_log, "f").info("idle; polling for work", fields);
		} else if (now - __classPrivateFieldGet(this, _IdleLog_lastReport, "f") >= IDLE_REPORT_INTERVAL_MS) {
			__classPrivateFieldSet(this, _IdleLog_lastReport, now, "f");
			__classPrivateFieldGet(this, _IdleLog_log, "f").info(`still polling; idle for ${Math.round((now - __classPrivateFieldGet(this, _IdleLog_idleSince, "f")) / 1e3)}s`, fields);
		} else __classPrivateFieldGet(this, _IdleLog_log, "f").debug("poll returned no work", fields);
	}
	onClaim() {
		__classPrivateFieldSet(this, _IdleLog_idleSince, void 0, "f");
	}
};
_IdleLog_log = /* @__PURE__ */ new WeakMap(), _IdleLog_environmentId = /* @__PURE__ */ new WeakMap(), _IdleLog_idleSince = /* @__PURE__ */ new WeakMap(), _IdleLog_lastReport = /* @__PURE__ */ new WeakMap();
function defaultWorkerId() {
	const host = (globalThis.process?.env)?.["HOSTNAME"];
	return host ? `${host}-${uuid4()}` : uuid4();
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/async-queue.mjs
var _AsyncQueue_items;
var _AsyncQueue_waiters;
var _AsyncQueue_closed;
/**
* Single-consumer async queue that bridges background producers to an
* `AsyncIterator`-style reader. Producers `push()` items; the consumer awaits
* `next()`. `close()` is idempotent and wakes any pending `next()` with
* `done: true`. `tryShift()` synchronously drains remaining items after
* iteration has been signalled to stop.
*/
var AsyncQueue = class {
	constructor() {
		_AsyncQueue_items.set(this, []);
		_AsyncQueue_waiters.set(this, []);
		_AsyncQueue_closed.set(this, false);
	}
	/** Enqueue an item, or hand it directly to a waiting reader. Returns `false` once closed. */
	push(item) {
		if (__classPrivateFieldGet(this, _AsyncQueue_closed, "f")) return false;
		const w = __classPrivateFieldGet(this, _AsyncQueue_waiters, "f").shift();
		if (w) w({
			done: false,
			value: item
		});
		else __classPrivateFieldGet(this, _AsyncQueue_items, "f").push(item);
		return true;
	}
	/** Mark the queue done. Idempotent; wakes every pending reader with `done: true`. */
	close() {
		if (__classPrivateFieldGet(this, _AsyncQueue_closed, "f")) return;
		__classPrivateFieldSet(this, _AsyncQueue_closed, true, "f");
		while (__classPrivateFieldGet(this, _AsyncQueue_waiters, "f").length > 0) __classPrivateFieldGet(this, _AsyncQueue_waiters, "f").shift()({
			done: true,
			value: void 0
		});
	}
	/**
	* Resolve with the next item, or `done: true` once the queue is closed and
	* drained. When `signal` is supplied, aborting it resolves a pending read
	* with `done: true` (cancellation is pushed down here rather than handled by
	* an outer `Promise.race`).
	*/
	next(signal) {
		if (__classPrivateFieldGet(this, _AsyncQueue_items, "f").length > 0) return Promise.resolve({
			done: false,
			value: __classPrivateFieldGet(this, _AsyncQueue_items, "f").shift()
		});
		if (__classPrivateFieldGet(this, _AsyncQueue_closed, "f") || signal?.aborted) return Promise.resolve({
			done: true,
			value: void 0
		});
		return new Promise((resolve) => {
			const waiter = (r) => {
				signal?.removeEventListener("abort", onAbort);
				resolve(r);
			};
			const onAbort = () => {
				const idx = __classPrivateFieldGet(this, _AsyncQueue_waiters, "f").indexOf(waiter);
				if (idx >= 0) __classPrivateFieldGet(this, _AsyncQueue_waiters, "f").splice(idx, 1);
				resolve({
					done: true,
					value: void 0
				});
			};
			__classPrivateFieldGet(this, _AsyncQueue_waiters, "f").push(waiter);
			signal?.addEventListener("abort", onAbort, { once: true });
		});
	}
	/** Synchronously remove and return the next buffered item, or `undefined` if empty. */
	tryShift() {
		return __classPrivateFieldGet(this, _AsyncQueue_items, "f").shift();
	}
};
_AsyncQueue_items = /* @__PURE__ */ new WeakMap(), _AsyncQueue_waiters = /* @__PURE__ */ new WeakMap(), _AsyncQueue_closed = /* @__PURE__ */ new WeakMap();
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/tools/BetaRunnableTool.mjs
/**
* The name the model calls a tool by: `mcp_server_name` for MCP toolsets, `type` for nameless server
* toolsets (browser/computer), `name` for everything else.
*/
function toolName(tool) {
	return "name" in tool ? tool.name : "mcp_server_name" in tool ? tool.mcp_server_name : tool.type;
}
/** Tool-result content for a thrown value: a {@link ToolError}'s own content, otherwise `Error: <message>`. */
function toolErrorContent(e) {
	return e instanceof ToolError ? e.content : `Error: ${e instanceof Error ? e.message : String(e)}`;
}
/** Parse the input, run the tool, and turn anything thrown into an error result. */
async function runRunnableTool(tool, rawInput, context) {
	try {
		const input = tool.parse ? tool.parse(rawInput) : rawInput;
		return {
			content: await tool.run(input, context),
			isError: false
		};
	} catch (e) {
		return {
			content: toolErrorContent(e),
			isError: true
		};
	}
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/tools/SessionToolRunner.mjs
var _IdleClock_maxIdleMs;
var _IdleClock_onExpire;
var _IdleClock_blockers;
var _IdleClock_armPending;
var _IdleClock_timer;
var _SessionToolRunner_instances;
var _SessionToolRunner_consumed;
var _SessionToolRunner_controller;
var _SessionToolRunner_detachExternal;
var _SessionToolRunner_requestOpts;
var _SessionToolRunner_toolByName;
var _SessionToolRunner_logger;
var _SessionToolRunner_seen;
var _SessionToolRunner_answered;
var _SessionToolRunner_confirmationVerdicts;
var _SessionToolRunner_awaitingConfirmation;
var _SessionToolRunner_results;
var _SessionToolRunner_inFlightCount;
var _SessionToolRunner_sendRetryWindowMs;
var _SessionToolRunner_onIdle;
var _SessionToolRunner_idleClock;
var _SessionToolRunner_requestOptions;
var _SessionToolRunner_streamLoop;
var _SessionToolRunner_reconcile;
var _SessionToolRunner_ingestHistory;
var _SessionToolRunner_handleStreamEvent;
var _SessionToolRunner_routeToolEvent;
var _SessionToolRunner_noteConfirmation;
var _SessionToolRunner_applyVerdict;
var _SessionToolRunner_surfaceCall;
var _SessionToolRunner_execute;
var _SessionToolRunner_sendResult;
var _SessionToolRunner_drain;
const STREAM_BACKOFF_START_MS = 500;
const STREAM_BACKOFF_CAP_MS = 1e4;
const TOOL_TIMEOUT_MS = 12e4;
const DRAIN_TIMEOUT_MS = 3e4;
const SEND_BACKOFF_START_MS = 1e3;
const SEND_BACKOFF_CAP_MS = 3e4;
/**
* How long a transiently failing tool-result send keeps retrying when the
* runner is used on its own: the server's default work-item lease TTL.
* `EnvironmentWorker` overrides it with the live TTL from each lease heartbeat
* (`_setSendRetryWindow`), so a send is only abandoned once the lease can no
* longer be ours.
*/
const SEND_RETRY_WINDOW_MS = 3e5;
/** Returns true if `ev` is a `session.status_idle` with `stop_reason` `end_turn`. */
function isEndTurnIdle(ev) {
	return ev.type === "session.status_idle" && ev.stop_reason?.type === "end_turn";
}
/**
* The `maxIdleMs` stop-countdown, including its deferral. {@link noteEvent}
* arms on `session.status_idle` with `stop_reason: end_turn` and disarms on
* anything else. Gated tool work registered via {@link block} — a call held for
* user confirmation, or a user-approved call still dispatching — keeps
* {@link arm} pending until {@link unblock} retires the last blocker, at which
* point the countdown starts. Event-driven — there is no polling watchdog.
*/
var IdleClock = class {
	constructor(maxIdleMs, onExpire) {
		_IdleClock_maxIdleMs.set(this, void 0);
		_IdleClock_onExpire.set(this, void 0);
		_IdleClock_blockers.set(this, /* @__PURE__ */ new Set());
		_IdleClock_armPending.set(this, false);
		_IdleClock_timer.set(this, void 0);
		__classPrivateFieldSet(this, _IdleClock_maxIdleMs, maxIdleMs, "f");
		__classPrivateFieldSet(this, _IdleClock_onExpire, onExpire, "f");
	}
	/**
	* Arm on `status_idle{end_turn}`; disarm otherwise. `user.tool_confirmation`
	* is neutral: it signals neither agent activity nor an idle, and its effect
	* on the clock flows through {@link block} / {@link unblock} instead —
	* disarming here would discard the pending arm the verdict is about to
	* settle.
	*/
	noteEvent(ev) {
		if (ev.type === "user.tool_confirmation") return;
		if (isEndTurnIdle(ev)) this.arm();
		else this.disarm();
	}
	/** Register gated work that must resolve before an idle countdown starts. */
	block(toolUseId) {
		__classPrivateFieldGet(this, _IdleClock_blockers, "f").add(toolUseId);
		if (__classPrivateFieldGet(this, _IdleClock_timer, "f") !== void 0) {
			__classPrivateFieldSet(this, _IdleClock_armPending, true, "f");
			clearTimeout(__classPrivateFieldGet(this, _IdleClock_timer, "f"));
			__classPrivateFieldSet(this, _IdleClock_timer, void 0, "f");
		}
	}
	/**
	* Retire gated work (a no-op for ids never blocked); applies a pending arm —
	* with a fresh full `maxIdleMs` window — once the last blocker retires.
	*/
	unblock(toolUseId) {
		__classPrivateFieldGet(this, _IdleClock_blockers, "f").delete(toolUseId);
		if (__classPrivateFieldGet(this, _IdleClock_blockers, "f").size === 0 && __classPrivateFieldGet(this, _IdleClock_armPending, "f")) this.arm();
	}
	/**
	* (Re)start the idle countdown — or, while blockers are outstanding, hold
	* the arm pending instead. Stopping then would drop a held call when its
	* verdict later arrives, or cut the runner off before a released call's
	* result can drive the next turn.
	*/
	arm() {
		if (__classPrivateFieldGet(this, _IdleClock_maxIdleMs, "f") <= 0) return;
		if (__classPrivateFieldGet(this, _IdleClock_blockers, "f").size > 0) {
			__classPrivateFieldSet(this, _IdleClock_armPending, true, "f");
			return;
		}
		__classPrivateFieldSet(this, _IdleClock_armPending, false, "f");
		if (__classPrivateFieldGet(this, _IdleClock_timer, "f") !== void 0) clearTimeout(__classPrivateFieldGet(this, _IdleClock_timer, "f"));
		__classPrivateFieldSet(this, _IdleClock_timer, setTimeout(__classPrivateFieldGet(this, _IdleClock_onExpire, "f"), __classPrivateFieldGet(this, _IdleClock_maxIdleMs, "f")), "f");
	}
	/**
	* Cancel the idle countdown and any pending arm. Blockers persist — they
	* track real outstanding work, retired only by {@link unblock}.
	*/
	disarm() {
		__classPrivateFieldSet(this, _IdleClock_armPending, false, "f");
		if (__classPrivateFieldGet(this, _IdleClock_timer, "f") !== void 0) {
			clearTimeout(__classPrivateFieldGet(this, _IdleClock_timer, "f"));
			__classPrivateFieldSet(this, _IdleClock_timer, void 0, "f");
		}
	}
};
_IdleClock_maxIdleMs = /* @__PURE__ */ new WeakMap(), _IdleClock_onExpire = /* @__PURE__ */ new WeakMap(), _IdleClock_blockers = /* @__PURE__ */ new WeakMap(), _IdleClock_armPending = /* @__PURE__ */ new WeakMap(), _IdleClock_timer = /* @__PURE__ */ new WeakMap();
/**
* The sessions-side counterpart to `client.beta.messages.toolRunner`: an
* async-iterable that attaches to a managed-agents session, executes every
* incoming `agent.tool_use` and `agent.custom_tool_use` event against a local
* tool registry, posts the matching result back (`user.tool_result` for the
* former, `user.custom_tool_result` for the latter), and yields one
* {@link DispatchedToolCall} per completed call. Server-side `agent.mcp_tool_use`
* calls are not dispatched. Internally drives event-stream reconnect and result
* posting.
*
* A call the server gated with `evaluated_permission: "ask"` (the `always_ask`
* policy — or any value this SDK doesn't recognize, which fails closed) is held
* until its `user.tool_confirmation` arrives: only an explicit `allow` runs it;
* `deny` — or any verdict this SDK doesn't recognize, failing closed — is never
* executed and posts nothing (the denial resolves the call server-side), but is
* still yielded (`confirmation="deny"`, `posted=false`, `result=undefined`) so
* the consumer can observe it. A held call — and a user-approved one still
* dispatching — defers the `maxIdleMs` countdown, so an `end_turn` idle
* observed in the meantime cannot stop the runner: it waits until the verdict
* arrives, the session terminates, or the abort signal fires — pass
* `AbortSignal.timeout(...)` for a wall-clock bound.
*
* Iteration ends when the session terminates (`session.status_terminated` /
* `session.deleted`), when the consumer `break`s out of the loop or aborts the
* supplied signal, or — once the session has gone idle with
* `stop_reason.type === "end_turn"` — when `maxIdleMs` elapses with no new
* event (any new event resets that countdown; it re-arms on the next `end_turn`
* idle; `maxIdleMs <= 0` disables it). The `finally` branch drains any in-flight
* tool calls and runs each tool's `close()` cleanup hook. It does *not* touch
* the work-item lease — wrap it in an `EnvironmentWorker` if you need
* heartbeating / force-stop.
*
* @example
* ```ts
* import { betaAgentToolset20260401 } from '@anthropic-ai/sdk/tools/agent-toolset/node';
*
* for await (const call of client.beta.sessions.events.toolRunner(work.data.id, {
*   tools: [...betaAgentToolset20260401({ workdir }), myTool],
* })) {
*   console.log(`${call.name} -> ${call.isError ? 'error' : 'ok'}`);
* }
* ```
*/
var SessionToolRunner = class {
	constructor(sessionId, opts) {
		_SessionToolRunner_instances.add(this);
		_SessionToolRunner_consumed.set(this, false);
		_SessionToolRunner_controller.set(this, void 0);
		_SessionToolRunner_detachExternal.set(this, void 0);
		_SessionToolRunner_requestOpts.set(this, void 0);
		_SessionToolRunner_toolByName.set(this, void 0);
		_SessionToolRunner_logger.set(this, void 0);
		_SessionToolRunner_seen.set(this, /* @__PURE__ */ new Set());
		_SessionToolRunner_answered.set(this, /* @__PURE__ */ new Set());
		_SessionToolRunner_confirmationVerdicts.set(this, /* @__PURE__ */ new Map());
		_SessionToolRunner_awaitingConfirmation.set(this, /* @__PURE__ */ new Map());
		_SessionToolRunner_results.set(this, new AsyncQueue());
		_SessionToolRunner_inFlightCount.set(this, 0);
		_SessionToolRunner_sendRetryWindowMs.set(this, SEND_RETRY_WINDOW_MS);
		_SessionToolRunner_onIdle.set(this, null);
		_SessionToolRunner_idleClock.set(this, void 0);
		this.client = opts.client;
		this.sessionId = sessionId;
		this.tools = opts.tools;
		this.maxIdleMs = opts.maxIdleMs ?? 6e4;
		__classPrivateFieldSet(this, _SessionToolRunner_logger, loggerFor(opts.client), "f");
		__classPrivateFieldSet(this, _SessionToolRunner_toolByName, new Map(opts.tools.map((t) => [toolName(t), t])), "f");
		__classPrivateFieldSet(this, _SessionToolRunner_controller, new AbortController(), "f");
		__classPrivateFieldSet(this, _SessionToolRunner_detachExternal, linkAbort(opts.signal, __classPrivateFieldGet(this, _SessionToolRunner_controller, "f")), "f");
		__classPrivateFieldSet(this, _SessionToolRunner_requestOpts, opts.requestOptions, "f");
		__classPrivateFieldSet(this, _SessionToolRunner_idleClock, new IdleClock(this.maxIdleMs, () => {
			__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").info("session idle after end_turn; stopping", {
				component: "session-tool-runner",
				session_id: this.sessionId,
				max_idle_ms: this.maxIdleMs
			});
			__classPrivateFieldGet(this, _SessionToolRunner_controller, "f").abort();
		}), "f");
	}
	/** Read-only view of this runner's abort signal. */
	get signal() {
		return __classPrivateFieldGet(this, _SessionToolRunner_controller, "f").signal;
	}
	/** Abort the runner. Background tasks will wind down and `for await` will exit cleanly. */
	abort() {
		__classPrivateFieldGet(this, _SessionToolRunner_controller, "f").abort();
	}
	/**
	* @internal
	* `EnvironmentWorker` keeps this equal to the lease TTL each heartbeat
	* reports; applies to a send already retrying.
	*/
	_setSendRetryWindow(ms) {
		__classPrivateFieldSet(this, _SessionToolRunner_sendRetryWindowMs, ms, "f");
	}
	async *[(_SessionToolRunner_consumed = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_controller = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_detachExternal = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_requestOpts = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_toolByName = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_logger = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_seen = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_answered = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_confirmationVerdicts = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_awaitingConfirmation = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_results = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_inFlightCount = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_sendRetryWindowMs = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_onIdle = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_idleClock = /* @__PURE__ */ new WeakMap(), _SessionToolRunner_instances = /* @__PURE__ */ new WeakSet(), Symbol.asyncIterator)]() {
		if (__classPrivateFieldGet(this, _SessionToolRunner_consumed, "f")) throw new AnthropicError("Cannot iterate over a consumed SessionToolRunner");
		__classPrivateFieldSet(this, _SessionToolRunner_consumed, true, "f");
		__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").info("session tool runner starting", {
			component: "session-tool-runner",
			session_id: this.sessionId
		});
		const streamPromise = __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_streamLoop).call(this).catch((e) => {
			if (!__classPrivateFieldGet(this, _SessionToolRunner_controller, "f").signal.aborted) __classPrivateFieldGet(this, _SessionToolRunner_logger, "f").error("stream loop failed", { error: String(e) });
			__classPrivateFieldGet(this, _SessionToolRunner_controller, "f").abort();
		});
		try {
			while (true) {
				const next = await __classPrivateFieldGet(this, _SessionToolRunner_results, "f").next(__classPrivateFieldGet(this, _SessionToolRunner_controller, "f").signal);
				if (next.done) break;
				yield next.value;
			}
			await streamPromise;
			let pending;
			while ((pending = __classPrivateFieldGet(this, _SessionToolRunner_results, "f").tryShift()) !== void 0) yield pending;
		} finally {
			__classPrivateFieldGet(this, _SessionToolRunner_controller, "f").abort();
			__classPrivateFieldGet(this, _SessionToolRunner_idleClock, "f").disarm();
			await streamPromise;
			try {
				await __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_drain).call(this);
			} catch (e) {
				__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").warn("drain failed", { error: String(e) });
			}
			__classPrivateFieldGet(this, _SessionToolRunner_results, "f").close();
			for (const t of this.tools) try {
				await t.close?.();
			} catch (e) {
				__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").warn("tool.close failed", {
					tool: toolName(t),
					error: String(e)
				});
			}
			__classPrivateFieldGet(this, _SessionToolRunner_detachExternal, "f").call(this);
		}
	}
};
_SessionToolRunner_requestOptions = function _SessionToolRunner_requestOptions() {
	return {
		...__classPrivateFieldGet(this, _SessionToolRunner_requestOpts, "f"),
		headers: buildHeaders([helperHeader("session-tool-runner"), __classPrivateFieldGet(this, _SessionToolRunner_requestOpts, "f")?.headers]),
		signal: __classPrivateFieldGet(this, _SessionToolRunner_controller, "f").signal
	};
}, _SessionToolRunner_streamLoop = async function _SessionToolRunner_streamLoop() {
	const ctrl = __classPrivateFieldGet(this, _SessionToolRunner_controller, "f");
	let backoff = STREAM_BACKOFF_START_MS;
	while (!ctrl.signal.aborted) {
		try {
			const stream = await this.client.beta.sessions.events.stream(this.sessionId, {}, __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_requestOptions).call(this));
			await __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_reconcile).call(this);
			for await (const ev of stream) {
				backoff = STREAM_BACKOFF_START_MS;
				if (await __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_handleStreamEvent).call(this, ev)) return;
			}
		} catch (e) {
			ctrl.signal.throwIfAborted();
			if (isFatal4xx(e)) {
				__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").error("permanent stream failure, shutting down", { error: String(e) });
				ctrl.abort();
				throw e;
			}
			__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").warn("stream disconnected, reconnecting", {
				error: String(e),
				backoff_ms: backoff
			});
		}
		ctrl.signal.throwIfAborted();
		await sleep(backoff, ctrl.signal);
		backoff = Math.min(backoff * 2, STREAM_BACKOFF_CAP_MS);
	}
}, _SessionToolRunner_reconcile = async function _SessionToolRunner_reconcile() {
	const ctrl = __classPrivateFieldGet(this, _SessionToolRunner_controller, "f");
	const pending = [];
	let lastWasEndTurn = false;
	try {
		for await (const ev of this.client.beta.sessions.events.list(this.sessionId, { limit: 1e3 }, __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_requestOptions).call(this))) {
			__classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_ingestHistory).call(this, ev, pending);
			lastWasEndTurn = isEndTurnIdle(ev);
		}
	} catch (e) {
		ctrl.signal.throwIfAborted();
		__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").warn("reconcile list failed", { error: String(e) });
		for (const ev of pending) __classPrivateFieldGet(this, _SessionToolRunner_seen, "f").delete(ev.id);
		return;
	}
	const unanswered = pending.filter((ev) => !__classPrivateFieldGet(this, _SessionToolRunner_answered, "f").has(ev.id));
	__classPrivateFieldGet(this, _SessionToolRunner_idleClock, "f").disarm();
	for (const ev of unanswered) await __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_routeToolEvent).call(this, ev);
	for (const held of [...__classPrivateFieldGet(this, _SessionToolRunner_awaitingConfirmation, "f").values()]) {
		const verdict = __classPrivateFieldGet(this, _SessionToolRunner_confirmationVerdicts, "f").get(held.id);
		if (verdict !== void 0) await __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_applyVerdict).call(this, held, verdict);
	}
	const outstanding = unanswered.filter((ev) => !__classPrivateFieldGet(this, _SessionToolRunner_answered, "f").has(ev.id) && !__classPrivateFieldGet(this, _SessionToolRunner_awaitingConfirmation, "f").has(ev.id));
	if (lastWasEndTurn && outstanding.length === 0) __classPrivateFieldGet(this, _SessionToolRunner_idleClock, "f").arm();
	else __classPrivateFieldGet(this, _SessionToolRunner_idleClock, "f").disarm();
}, _SessionToolRunner_ingestHistory = function _SessionToolRunner_ingestHistory(ev, pending) {
	if (ev.type === "agent.tool_use" || ev.type === "agent.custom_tool_use") {
		__classPrivateFieldGet(this, _SessionToolRunner_seen, "f").add(ev.id);
		if (!__classPrivateFieldGet(this, _SessionToolRunner_answered, "f").has(ev.id)) pending.push(ev);
	} else if (ev.type === "user.tool_result") __classPrivateFieldGet(this, _SessionToolRunner_answered, "f").add(ev.tool_use_id);
	else if (ev.type === "user.custom_tool_result") __classPrivateFieldGet(this, _SessionToolRunner_answered, "f").add(ev.custom_tool_use_id);
	else if (ev.type === "user.tool_confirmation") {
		if (!__classPrivateFieldGet(this, _SessionToolRunner_answered, "f").has(ev.tool_use_id)) __classPrivateFieldGet(this, _SessionToolRunner_confirmationVerdicts, "f").set(ev.tool_use_id, ev.result);
	}
}, _SessionToolRunner_handleStreamEvent = async function _SessionToolRunner_handleStreamEvent(ev) {
	__classPrivateFieldGet(this, _SessionToolRunner_idleClock, "f").noteEvent(ev);
	switch (ev.type) {
		case "agent.tool_use":
		case "agent.custom_tool_use":
			if (!__classPrivateFieldGet(this, _SessionToolRunner_seen, "f").has(ev.id)) {
				__classPrivateFieldGet(this, _SessionToolRunner_seen, "f").add(ev.id);
				await __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_routeToolEvent).call(this, ev);
			}
			return false;
		case "user.tool_confirmation":
			await __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_noteConfirmation).call(this, ev);
			return false;
		case "user.tool_result":
			__classPrivateFieldGet(this, _SessionToolRunner_answered, "f").add(ev.tool_use_id);
			return false;
		case "user.custom_tool_result":
			__classPrivateFieldGet(this, _SessionToolRunner_answered, "f").add(ev.custom_tool_use_id);
			return false;
		case "session.status_terminated":
		case "session.deleted":
			__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").info("session terminated", {
				component: "session-tool-runner",
				session_id: this.sessionId
			});
			__classPrivateFieldGet(this, _SessionToolRunner_controller, "f").abort();
			return true;
		default: return false;
	}
}, _SessionToolRunner_routeToolEvent = async function _SessionToolRunner_routeToolEvent(ev) {
	const permission = ev.evaluated_permission;
	const verdict = permission === "deny" ? "deny" : __classPrivateFieldGet(this, _SessionToolRunner_confirmationVerdicts, "f").get(ev.id);
	if (verdict === void 0) {
		if (permission === void 0 || permission === "allow") await __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_execute).call(this, ev, void 0);
		else if (!__classPrivateFieldGet(this, _SessionToolRunner_awaitingConfirmation, "f").has(ev.id)) {
			__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").info("tool call awaiting confirmation; holding", {
				component: "session-tool-runner",
				session_id: this.sessionId,
				tool: ev.name,
				tool_use_id: ev.id
			});
			__classPrivateFieldGet(this, _SessionToolRunner_awaitingConfirmation, "f").set(ev.id, ev);
			__classPrivateFieldGet(this, _SessionToolRunner_idleClock, "f").block(ev.id);
		}
		return;
	}
	await __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_applyVerdict).call(this, ev, verdict);
}, _SessionToolRunner_noteConfirmation = async function _SessionToolRunner_noteConfirmation(ev) {
	__classPrivateFieldGet(this, _SessionToolRunner_confirmationVerdicts, "f").set(ev.tool_use_id, ev.result);
	const held = __classPrivateFieldGet(this, _SessionToolRunner_awaitingConfirmation, "f").get(ev.tool_use_id);
	if (held === void 0) return;
	await __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_applyVerdict).call(this, held, ev.result);
}, _SessionToolRunner_applyVerdict = async function _SessionToolRunner_applyVerdict(ev, verdict) {
	const wasHeld = __classPrivateFieldGet(this, _SessionToolRunner_awaitingConfirmation, "f").delete(ev.id);
	if (verdict === "allow") {
		__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").info("tool call confirmed", {
			component: "session-tool-runner",
			session_id: this.sessionId,
			tool: ev.name,
			tool_use_id: ev.id
		});
		if (!wasHeld) __classPrivateFieldGet(this, _SessionToolRunner_idleClock, "f").block(ev.id);
		try {
			await __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_execute).call(this, ev, "allow");
		} finally {
			__classPrivateFieldGet(this, _SessionToolRunner_idleClock, "f").unblock(ev.id);
		}
		return;
	}
	if (wasHeld) __classPrivateFieldGet(this, _SessionToolRunner_idleClock, "f").unblock(ev.id);
	__classPrivateFieldGet(this, _SessionToolRunner_answered, "f").add(ev.id);
	__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").info("tool call denied; not executing", {
		component: "session-tool-runner",
		session_id: this.sessionId,
		tool: ev.name,
		tool_use_id: ev.id
	});
	__classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_surfaceCall).call(this, {
		event: ev,
		toolUseId: ev.id,
		name: ev.name,
		isError: false,
		posted: false,
		confirmation: "deny"
	});
}, _SessionToolRunner_surfaceCall = function _SessionToolRunner_surfaceCall(call) {
	__classPrivateFieldGet(this, _SessionToolRunner_results, "f").push(call);
}, _SessionToolRunner_execute = async function _SessionToolRunner_execute(ev, confirmation) {
	var _a, _b;
	if (__classPrivateFieldGet(this, _SessionToolRunner_answered, "f").has(ev.id)) return;
	__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").info("executing tool", {
		component: "session-tool-runner",
		session_id: this.sessionId,
		tool: ev.name,
		tool_use_id: ev.id
	});
	__classPrivateFieldSet(this, _SessionToolRunner_inFlightCount, (_a = __classPrivateFieldGet(this, _SessionToolRunner_inFlightCount, "f"), _a++, _a), "f");
	try {
		const tool = __classPrivateFieldGet(this, _SessionToolRunner_toolByName, "f").get(ev.name);
		if (!tool) {
			__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").info("tool not owned by this runner; leaving the tool_use_id pending for its owner", {
				component: "session-tool-runner",
				session_id: this.sessionId,
				tool: ev.name,
				tool_use_id: ev.id
			});
			__classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_surfaceCall).call(this, {
				event: ev,
				toolUseId: ev.id,
				name: ev.name,
				isError: false,
				posted: false,
				confirmation
			});
			return;
		}
		let content;
		let isError;
		const toolCtrl = new AbortController();
		const detachTool = linkAbort(__classPrivateFieldGet(this, _SessionToolRunner_controller, "f").signal, toolCtrl);
		const timer = setTimeout(() => toolCtrl.abort(), TOOL_TIMEOUT_MS);
		try {
			const outcome = await runRunnableTool(tool, ev.input, {
				toolUse: ev,
				toolUseBlock: ev,
				signal: toolCtrl.signal
			});
			content = outcome.content;
			isError = outcome.isError;
		} finally {
			clearTimeout(timer);
			detachTool();
		}
		const result = buildResultEvent(ev, isError, toSessionContent(content));
		const posted = await __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_sendResult).call(this, result, ev.id);
		__classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_surfaceCall).call(this, {
			event: ev,
			result,
			toolUseId: ev.id,
			name: ev.name,
			isError,
			posted,
			confirmation
		});
	} finally {
		__classPrivateFieldSet(this, _SessionToolRunner_inFlightCount, (_b = __classPrivateFieldGet(this, _SessionToolRunner_inFlightCount, "f"), _b--, _b), "f");
		if (__classPrivateFieldGet(this, _SessionToolRunner_inFlightCount, "f") === 0) __classPrivateFieldGet(this, _SessionToolRunner_onIdle, "f")?.call(this);
	}
}, _SessionToolRunner_sendResult = async function _SessionToolRunner_sendResult(result, toolUseId) {
	const ctrl = __classPrivateFieldGet(this, _SessionToolRunner_controller, "f");
	const start = Date.now();
	let lastErr;
	let attempt = 0;
	while (true) {
		attempt++;
		ctrl.signal.throwIfAborted();
		try {
			await this.client.beta.sessions.events.send(this.sessionId, { events: [result] }, __classPrivateFieldGet(this, _SessionToolRunner_instances, "m", _SessionToolRunner_requestOptions).call(this));
			__classPrivateFieldGet(this, _SessionToolRunner_answered, "f").add(toolUseId);
			return true;
		} catch (e) {
			lastErr = e;
			if (isFatal4xx(e)) break;
			const remainingMs = __classPrivateFieldGet(this, _SessionToolRunner_sendRetryWindowMs, "f") - (Date.now() - start);
			if (remainingMs <= 0) break;
			const waitMs = Math.min(applyJitter(backoff$1(attempt - 1, SEND_BACKOFF_START_MS, SEND_BACKOFF_CAP_MS)), remainingMs);
			__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").warn("tool result send failed; retrying", {
				tool_use_id: toolUseId,
				attempt,
				backoff_ms: waitMs,
				error: String(e)
			});
			await sleep(waitMs, ctrl.signal);
		}
	}
	__classPrivateFieldGet(this, _SessionToolRunner_logger, "f").error("failed to send tool result", {
		tool_use_id: toolUseId,
		attempts: attempt,
		error: String(lastErr)
	});
	return false;
}, _SessionToolRunner_drain = async function _SessionToolRunner_drain() {
	if (__classPrivateFieldGet(this, _SessionToolRunner_inFlightCount, "f") === 0) return;
	await Promise.race([new Promise((r) => __classPrivateFieldSet(this, _SessionToolRunner_onIdle, r, "f")), sleep(DRAIN_TIMEOUT_MS)]);
	__classPrivateFieldSet(this, _SessionToolRunner_onIdle, null, "f");
	if (__classPrivateFieldGet(this, _SessionToolRunner_inFlightCount, "f") > 0) __classPrivateFieldGet(this, _SessionToolRunner_logger, "f").warn("drain timeout exceeded");
};
/**
* Build the result event that answers `ev`: a `user.tool_result` for a builtin
* `agent.tool_use`, a `user.custom_tool_result` for a custom
* `agent.custom_tool_use`. The two `(use, result)` pairs are distinct API event
* types and must be matched exactly — a `user.tool_result` does not answer a
* custom tool call.
*/
function buildResultEvent(ev, isError, content) {
	if (ev.type === "agent.custom_tool_use") return {
		type: "user.custom_tool_result",
		custom_tool_use_id: ev.id,
		is_error: isError,
		content
	};
	return {
		type: "user.tool_result",
		tool_use_id: ev.id,
		is_error: isError,
		content
	};
}
function toSessionContent(content) {
	if (typeof content === "string") return [{
		type: "text",
		text: content || "(no output)"
	}];
	const out = content.map((b) => {
		if (b.type === "text") return {
			type: "text",
			text: b.text || "(no output)"
		};
		if (b.type === "image" || b.type === "document") return b;
		if (b.type === "search_result") return {
			type: "search_result",
			source: b.source,
			title: b.title,
			content: b.content.map((c) => ({
				type: "text",
				text: c.text
			})),
			citations: { enabled: b.citations?.enabled ?? false }
		};
		return {
			type: "text",
			text: JSON.stringify(b)
		};
	});
	return out.length > 0 ? out : [{
		type: "text",
		text: "(no output)"
	}];
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/tools/agent-toolset/sync-interval.mjs
/**
* The memory sync cadence, split out of `memories.ts` so runtime-agnostic
* callers (the environment worker) can validate an interval up front without
* reaching into the Node-only toolset module.
*/
/**
* How often (milliseconds) the worker syncs the session's memory stores back
* while the session runs. Checked after each dispatched tool call.
*/
const DEFAULT_MEMORY_SYNC_INTERVAL_MS = 15e3;
/**
* The shortest sync interval accepted. Each sync lists every attached store,
* so anything tighter mostly spends requests rediscovering that nothing
* changed.
*/
const MIN_MEMORY_SYNC_INTERVAL_MS = 5e3;
/** Throw unless `ms` is a usable sync interval. `option` names it in the message. */
function checkMemorySyncInterval(ms, option) {
	if (!(ms >= 5e3)) throw new AnthropicError(`${option} must be at least ${MIN_MEMORY_SYNC_INTERVAL_MS}ms (got ${ms}); to run without memory sync, pass \`memorySyncIntervalMs: null\` to the worker instead`);
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/environments/worker.mjs
var _EnvironmentWorker_instances;
var _EnvironmentWorker_signal;
var _EnvironmentWorker_handleItem;
var _Lease_ctrl;
var _Lease_endReason;
const HEARTBEAT_DEFAULT_MS = 3e4;
const HEARTBEAT_TTL_DEFAULT_MS = 9e4;
const NO_HEARTBEAT_SENTINEL = "NO_HEARTBEAT";
/** True when the session has at least one memory store attached. */
function hasMemoryStore(session) {
	return session.resources.some((r) => r.type === "memory_store");
}
/**
* Extract the per-item sessions token from a work item's `secret` payload.
*
* The `secret` the poll response populates is not itself a credential: it is a
* URL-safe base64 JSON payload matching {@link BetaWorkSecret} — the
* `sessions_token` (the bearer for this item's work lifecycle and
* session-level calls) plus fields this worker does not consume. Returns the
* sessions token, or `null` (meaning: fall back to the environment key) when
* the payload is missing, doesn't decode, or carries no token. Never log the
* payload or anything extracted from it.
*/
function sessionsTokenFromSecret(secret) {
	if (!secret) return null;
	let parsed;
	try {
		const normalized = secret.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
		parsed = JSON.parse(decodeUTF8(fromBase64(padded)));
	} catch {
		return null;
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
	const token = parsed.sessions_token;
	return typeof token === "string" && token !== "" ? token : null;
}
/**
* The self-hosted environment runner, composed from the control-plane
* {@link WorkPoller} and the per-session {@link SessionToolRunner}.
*
* For each claimed `session` work item it: builds the per-session
* {@link AgentToolContext}, downloads the session agent's skills
* (`setupSkills`), then runs a {@link SessionToolRunner} for the session
* while heartbeating the work-item lease on the same event loop; on exit it
* force-stops the work item (unless the lease was lost, in which case the item
* is left to whoever holds it now), cleans up the downloaded skills, and loops
* to the next one. The lease heartbeat reports `state === "stopping"` / a lost
* lease back into the run by aborting the session runner.
*
* The `environmentKey` is the worker's standing credential. When a claimed
* work item carries a per-item `secret` (a short-lived payload the poll
* response may populate), the sessions token extracted from it is preferred
* over the environment key for that item's heartbeat / force-stop /
* skill-download / session calls; polling itself always uses the environment
* key, and items without a usable secret fall back to it entirely.
*
* Use {@link EnvironmentWorker.handleItem} if you already hold a claimed work
* item (e.g. a `worker poll --on-work` script handed one to a fresh process) and
* just want the per-item flow without the poll loop — with no arguments it reads
* the `ANTHROPIC_*` env vars that command sets.
*
* Construct it via `client.beta.environments.work.worker({ ... })` (or
* `new EnvironmentWorker({ client, ... })` directly).
*
* @example
* ```ts
* // Long-running daemon: poll for work, serve each session, loop.
* await client.beta.environments.work
*   .worker({ environmentId, environmentKey, workdir: '/workspace' })
*   .run(AbortSignal.timeout(60 * 60_000));
*
* // Already-claimed item (e.g. inside `ant worker poll --on-work ...`):
* await client.beta.environments.work.worker({ workdir: '/workspace' }).handleItem();
* ```
*/
var EnvironmentWorker = class {
	constructor(opts) {
		_EnvironmentWorker_instances.add(this);
		_EnvironmentWorker_signal.set(this, void 0);
		if (opts.unrestrictedPaths !== void 0) throw new AnthropicError("The `unrestrictedPaths` option you passed to EnvironmentWorker (or client.beta.environments.work.worker()) is no longer supported. The worker's file tools (read, write, edit, glob, grep) are now always confined to `workdir` plus the session's memory folders. Remove `unrestrictedPaths` from your options; to let the file tools reach any other directory, add it to `AgentToolContext.allowedRoots` from a `tools` factory.");
		this.client = opts.client;
		this.environmentId = opts.environmentId;
		this.environmentKey = opts.environmentKey;
		this.tools = opts.tools;
		this.workdir = opts.workdir ?? process.cwd();
		this.maxFileBytes = opts.maxFileBytes;
		this.maxIdleMs = opts.maxIdleMs;
		if (opts.memorySyncIntervalMs != null) checkMemorySyncInterval(opts.memorySyncIntervalMs, "memorySyncIntervalMs");
		this.memorySyncIntervalMs = opts.memorySyncIntervalMs;
		this.memorySyncDeletions = opts.memorySyncDeletions ?? "enabled";
		this.workerId = opts.workerId;
		this.requestOptions = opts.requestOptions;
		__classPrivateFieldSet(this, _EnvironmentWorker_signal, opts.signal, "f");
	}
	/**
	* Poll the environment and service each claimed session until the supplied
	* signal (or the one passed to the constructor) aborts. Throws if
	* `environmentId` / `environmentKey` were not provided to the constructor.
	*/
	async run(signal) {
		const { environmentId, environmentKey } = this;
		if (environmentId === void 0 || environmentKey === void 0) throw new AnthropicError("EnvironmentWorker.run: environmentId and environmentKey are required to poll for work");
		const externalSignal = signal ?? __classPrivateFieldGet(this, _EnvironmentWorker_signal, "f");
		const poller = new WorkPoller({
			client: this.client,
			environmentId,
			environmentKey,
			...this.workerId !== void 0 ? { workerId: this.workerId } : {},
			...externalSignal ? { signal: externalSignal } : {},
			...this.requestOptions !== void 0 ? { requestOptions: this.requestOptions } : {},
			autoStop: false
		});
		for await (const work of poller) try {
			await __classPrivateFieldGet(this, _EnvironmentWorker_instances, "m", _EnvironmentWorker_handleItem).call(this, work, environmentKey, poller.signal);
		} catch (e) {
			if (poller.signal?.aborted) throw e;
			loggerFor(this.client).error("work item failed", {
				work_id: work.id,
				error: String(e)
			});
		}
	}
	/**
	* Service a single, already-claimed work item without the poll loop: build the
	* per-session {@link AgentToolContext} (workdir from this worker's options),
	* download the session agent's skills (`setupSkills`), run a
	* {@link SessionToolRunner} for the session while heartbeating the work-item
	* lease, and force-stop the work item on exit (whether the runner finishes
	* normally, throws, or the control plane signals shutdown). The one
	* exception is a lost lease: the item then belongs to the queue or another
	* worker and is left alone.
	*
	* Use this when something else does the claiming — e.g. a `worker poll
	* --on-work` script that hands an already-claimed item to a fresh process. The
	* work id / environment id / session id each fall back to `ANTHROPIC_WORK_ID` /
	* `ANTHROPIC_ENVIRONMENT_ID` / `ANTHROPIC_SESSION_ID` (the env vars that
	* command sets) when not passed; the environment key resolves from this
	* option, then the worker's own `environmentKey`, then
	* `ANTHROPIC_ENVIRONMENT_KEY`. With no arguments inside that command it just
	* works. Throws a clear error naming the first of the four required values
	* still missing after resolution. Throws `SessionMemoryError` when the
	* session has memory stores attached but they cannot be mounted — the work
	* item carried no sessions token (unless `memorySyncIntervalMs` turned
	* memory off), or a store failed to download.
	*
	* `workSecret` is the work item's per-item `secret` payload from the poll
	* response, falling back to `ANTHROPIC_WORK_SECRET`; unlike the others it is
	* optional — when present, the sessions token extracted from it is preferred
	* as the Bearer credential for this item's heartbeat / force-stop / session
	* calls; when absent (or undecodable) those calls use the environment key.
	*/
	async handleItem(opts) {
		const workId = opts?.workId ?? readEnv("ANTHROPIC_WORK_ID");
		const environmentId = opts?.environmentId ?? readEnv("ANTHROPIC_ENVIRONMENT_ID");
		const sessionId = opts?.sessionId ?? readEnv("ANTHROPIC_SESSION_ID");
		const environmentKey = opts?.environmentKey ?? this.environmentKey ?? readEnv("ANTHROPIC_ENVIRONMENT_KEY");
		const workSecret = opts?.workSecret || readEnv("ANTHROPIC_WORK_SECRET") || null;
		if (!workId) throw new AnthropicError("handleItem: workId is required — pass it or set ANTHROPIC_WORK_ID");
		if (!environmentId) throw new AnthropicError("handleItem: environmentId is required — pass it or set ANTHROPIC_ENVIRONMENT_ID");
		if (!sessionId) throw new AnthropicError("handleItem: sessionId is required — pass it or set ANTHROPIC_SESSION_ID");
		if (!environmentKey) throw new AnthropicError("handleItem: environmentKey is required — pass it, construct the worker with it, or set ANTHROPIC_ENVIRONMENT_KEY");
		const work = {
			id: workId,
			environment_id: environmentId,
			secret: workSecret,
			data: {
				type: "session",
				id: sessionId
			}
		};
		await __classPrivateFieldGet(this, _EnvironmentWorker_instances, "m", _EnvironmentWorker_handleItem).call(this, work, environmentKey, opts?.signal ?? __classPrivateFieldGet(this, _EnvironmentWorker_signal, "f"));
	}
};
_EnvironmentWorker_signal = /* @__PURE__ */ new WeakMap(), _EnvironmentWorker_instances = /* @__PURE__ */ new WeakSet(), _EnvironmentWorker_handleItem = async function _EnvironmentWorker_handleItem(work, environmentKey, externalSignal) {
	const log = loggerFor(this.client);
	const sessionsToken = sessionsTokenFromSecret(work.secret);
	if (work.secret && sessionsToken === null) log.warn("work item carried a secret payload but no sessions token could be extracted; falling back to the environment key", { work_id: work.id });
	const itemCredential = sessionsToken ?? environmentKey;
	const sessionClient = copyClientForHelper(this.client, {
		authToken: itemCredential,
		helper: "environments-worker"
	});
	const sessionId = work.data.id;
	const ctrl = new AbortController();
	const detachExternal = linkAbort(externalSignal, ctrl);
	const lease = new Lease(ctrl);
	const agentToolset = await import("./node-DEc0kenY.js");
	let leaseTtlMs;
	let runner;
	const heartbeatPromise = heartbeatLoop(sessionClient, work, lease, log, this.requestOptions, (ttlMs) => {
		leaseTtlMs = ttlMs;
		runner?._setSendRetryWindow(ttlMs);
	}).catch((e) => {
		if (!ctrl.signal.aborted) log.error("heartbeat loop failed", {
			work_id: work.id,
			error: String(e)
		});
		ctrl.abort();
	});
	let cleanupSkills = async () => {};
	let stores;
	let cleanEnd = false;
	try {
		if (work.data.type !== "session") {
			log.debug("skipping non-session work item", {
				work_id: work.id,
				type: work.data.type
			});
			return;
		}
		const session = await sessionClient.beta.sessions.retrieve(sessionId);
		if (sessionsToken === null && this.memorySyncIntervalMs !== null && hasMemoryStore(session)) throw new agentToolset.SessionMemoryError(`cannot mount the session's memories: the work item carried no sessions token (work_id=${work.id}, session_id=${sessionId}); the memory endpoints reject the environment key, so the poller must issue a per-item \`secret\` carrying \`sessions_token\`, or set \`memorySyncIntervalMs: null\` to run without memory`);
		const ctx = {
			workdir: this.workdir,
			client: sessionClient,
			session,
			...this.maxFileBytes !== void 0 ? { maxFileBytes: this.maxFileBytes } : {}
		};
		try {
			cleanupSkills = await agentToolset.setupSkills(ctx);
		} catch (e) {
			log.warn("skill setup failed", {
				session_id: sessionId,
				work_id: work.id,
				error: String(e)
			});
		}
		if (sessionsToken !== null && this.memorySyncIntervalMs !== null) {
			stores = new agentToolset.SessionMemoryStores(sessionClient, {
				workdir: this.workdir,
				...this.memorySyncIntervalMs !== void 0 ? { syncIntervalMs: this.memorySyncIntervalMs } : {},
				syncDeletions: this.memorySyncDeletions
			});
			await stores.download(session);
			ctx.allowedRoots = stores.roots;
			ctx.readOnlyRoots = stores.readOnlyRoots;
		} else log.debug("memory stores disabled for this item", { work_id: work.id });
		runner = new SessionToolRunner(sessionId, {
			client: sessionClient,
			tools: typeof this.tools === "function" ? this.tools(ctx) : this.tools ?? agentToolset.betaAgentToolset20260401(ctx),
			...this.maxIdleMs !== void 0 ? { maxIdleMs: this.maxIdleMs } : {},
			...this.requestOptions !== void 0 ? { requestOptions: this.requestOptions } : {},
			signal: ctrl.signal
		});
		if (leaseTtlMs !== void 0) runner._setSendRetryWindow(leaseTtlMs);
		for await (const _ of runner) if (stores) await stores.syncIfDue();
		cleanEnd = !ctrl.signal.aborted;
	} finally {
		try {
			await cleanupSkills().catch((e) => {
				log.warn("skill cleanup failed", {
					session_id: sessionId,
					work_id: work.id,
					error: String(e)
				});
			});
		} finally {
			if (stores) {
				const boundMs = agentToolset.MEMORY_FLUSH_TIMEOUT_MS;
				if (cleanEnd) {
					if (await withTimeout(stores.finish(), boundMs)) log.warn(`final memory sync cut off after ${boundMs}ms; the flush that follows still uploads changed files`, {
						session_id: sessionId,
						work_id: work.id
					});
				}
				const flushBound = new AbortController();
				if (await withTimeout(stores.flushWrites(flushBound.signal), boundMs)) {
					flushBound.abort();
					log.warn(`memory flush cut off after ${boundMs}ms; changed files it had not uploaded yet are not saved`, {
						session_id: sessionId,
						work_id: work.id
					});
				}
				await stores.dispose().catch((e) => {
					log.warn("memory store cleanup failed", {
						session_id: sessionId,
						work_id: work.id,
						error: String(e)
					});
				});
			}
		}
		lease.finish("runner_done");
		detachExternal();
		await heartbeatPromise;
		if (lease.lost) log.info("lease lost; released without stopping it", {
			session_id: sessionId,
			work_id: work.id
		});
		else await forceStop(sessionClient, work, log, this.requestOptions);
	}
};
/**
* Resolve when `p` settles or `ms` elapses — `true` when `ms` elapsed
* first. A timed-out `p` keeps running — JS cannot cancel a promise.
*/
async function withTimeout(p, ms) {
	let timer;
	try {
		return await Promise.race([p.then(() => false, () => false), new Promise((resolve) => {
			timer = setTimeout(() => resolve(true), ms);
		})]);
	} finally {
		if (timer !== void 0) clearTimeout(timer);
	}
}
/** Force-stop a claimed work item, swallowing the 409 that means it's already stopped. */
async function forceStop(client, work, log, requestOptions) {
	try {
		await client.beta.environments.work.stop(work.id, {
			environment_id: work.environment_id,
			force: true
		}, {
			...requestOptions,
			headers: buildHeaders([requestOptions?.headers])
		});
	} catch (e) {
		if (!isStatus(e, 409)) log.error("force-stop on exit failed", {
			work_id: work.id,
			error: String(e)
		});
	}
}
/**
* This worker's view of one work-item lease: the per-item abort signal plus
* why heartbeating ended. The first recorded reason wins, so a run aborted
* *because* the lease was lost still reads as lost afterwards; an abort with
* no recorded reason (the external signal) is not lost.
*/
var Lease = class {
	constructor(ctrl) {
		_Lease_ctrl.set(this, void 0);
		_Lease_endReason.set(this, void 0);
		__classPrivateFieldSet(this, _Lease_ctrl, ctrl, "f");
	}
	get signal() {
		return __classPrivateFieldGet(this, _Lease_ctrl, "f").signal;
	}
	finish(reason) {
		__classPrivateFieldSet(this, _Lease_endReason, __classPrivateFieldGet(this, _Lease_endReason, "f") ?? reason, "f");
		__classPrivateFieldGet(this, _Lease_ctrl, "f").abort();
	}
	/** True once the item belongs to the queue or another worker. */
	get lost() {
		return __classPrivateFieldGet(this, _Lease_endReason, "f") === "lease_lost" || __classPrivateFieldGet(this, _Lease_endReason, "f") === "assumed_lost";
	}
};
_Lease_ctrl = /* @__PURE__ */ new WeakMap(), _Lease_endReason = /* @__PURE__ */ new WeakMap();
/** The server's view of the lease carried by a 412 heartbeat response, or empty if absent. */
function serverLeaseState(e) {
	let node = e instanceof APIError ? e.error : void 0;
	for (const key of [
		"error",
		"details",
		"current_state"
	]) {
		if (!isObj(node)) return {};
		node = node[key];
	}
	return isObj(node) ? node : {};
}
/**
* Keep the work-item lease alive while a session is being served. Runs until
* `lease` ends, and ends it itself when the control plane reports the work is
* `stopping`/`stopped` or no longer extends the lease, when a heartbeat is
* rejected (a 412 means the lease already belongs to someone else), or when no
* heartbeat has succeeded for longer than the lease ttl (the lease is assumed
* lost, so two runners don't end up serving the same work). Each heartbeat
* call is cut off after the current beat interval so a hung request cannot
* outlive the lease it is meant to renew.
*/
async function heartbeatLoop(client, work, lease, logger, requestOptions, onLeaseTtl) {
	let intervalMs = HEARTBEAT_DEFAULT_MS;
	let ttlMs = HEARTBEAT_TTL_DEFAULT_MS;
	let lastSuccessMs = Date.now();
	let last = NO_HEARTBEAT_SENTINEL;
	const beat = async () => {
		const beatCtrl = new AbortController();
		const detach = linkAbort(lease.signal, beatCtrl);
		const cutoff = setTimeout(() => beatCtrl.abort(), intervalMs);
		try {
			const resp = await client.beta.environments.work.heartbeat(work.id, {
				environment_id: work.environment_id,
				expected_last_heartbeat: last
			}, {
				...requestOptions,
				headers: buildHeaders([requestOptions?.headers]),
				signal: beatCtrl.signal
			});
			lastSuccessMs = Date.now();
			last = resp.last_heartbeat;
			if (resp.ttl_seconds > 0) {
				ttlMs = resp.ttl_seconds * 1e3;
				intervalMs = Math.max(1e3, Math.min(ttlMs / 2, HEARTBEAT_DEFAULT_MS));
				onLeaseTtl?.(ttlMs);
			}
			if (resp.state === "stopping" || resp.state === "stopped") {
				logger.info("heartbeat signals shutdown", {
					work_id: work.id,
					state: resp.state
				});
				lease.finish("control_plane_stop");
			}
			if (!resp.lease_extended) {
				logger.warn("lease not extended, shutting down", { work_id: work.id });
				lease.finish("control_plane_stop");
			}
		} catch (e) {
			lease.signal.throwIfAborted();
			if (isStatus(e, 412)) {
				const server = serverLeaseState(e);
				logger.error("lease lost: heartbeat precondition failed", {
					work_id: work.id,
					server_state: server["state"],
					server_ttl_seconds: server["ttl_seconds"],
					server_last_heartbeat: server["last_heartbeat"]
				});
				lease.finish("lease_lost");
				return;
			}
			if (isFatal4xx(e)) {
				logger.error("permanent heartbeat failure", {
					work_id: work.id,
					error: String(e)
				});
				lease.finish("heartbeat_rejected");
				throw e;
			}
			if (Date.now() - lastSuccessMs > ttlMs) {
				logger.error("lease assumed lost: no successful heartbeat in ttl", {
					work_id: work.id,
					ttl_ms: ttlMs,
					error: String(e)
				});
				lease.finish("assumed_lost");
				return;
			}
			logger.warn("transient heartbeat failure", {
				work_id: work.id,
				error: String(e)
			});
		} finally {
			clearTimeout(cutoff);
			detach();
		}
	};
	await beat();
	while (!lease.signal.aborted) {
		await sleep(intervalMs, lease.signal);
		lease.signal.throwIfAborted();
		await beat();
	}
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/environments/work.mjs
var Work = class extends APIResource {
	/**
	* Note: these endpoints are called automatically by the pre-built environment
	* worker provided in the SDKs and CLI, for orchestrating sessions with self-hosted
	* sandbox environments. They are included here as a reference; you do not need to
	* invoke them directly.
	*
	* Retrieve detailed information about a specific work item.
	*
	* @example
	* ```ts
	* const betaSelfHostedWork =
	*   await client.beta.environments.work.retrieve('work_id', {
	*     environment_id: 'env_011CZkZ9X2dpNyB7HsEFoRfW',
	*   });
	* ```
	*/
	retrieve(workID, params, options) {
		const { environment_id, betas } = params;
		return this._client.get(path`/v1/environments/${environment_id}/work/${workID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Note: these endpoints are called automatically by the pre-built environment
	* worker provided in the SDKs and CLI, for orchestrating sessions with self-hosted
	* sandbox environments. They are included here as a reference; you do not need to
	* invoke them directly.
	*
	* Update work item metadata with merge semantics.
	*
	* @example
	* ```ts
	* const betaSelfHostedWork =
	*   await client.beta.environments.work.update('work_id', {
	*     environment_id: 'env_011CZkZ9X2dpNyB7HsEFoRfW',
	*     metadata: { foo: 'string' },
	*   });
	* ```
	*/
	update(workID, params, options) {
		const { environment_id, betas, ...body } = params;
		return this._client.post(path`/v1/environments/${environment_id}/work/${workID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Note: these endpoints are called automatically by the pre-built environment
	* worker provided in the SDKs and CLI, for orchestrating sessions with self-hosted
	* sandbox environments. They are included here as a reference; you do not need to
	* invoke them directly.
	*
	* List work items in an environment.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaSelfHostedWork of client.beta.environments.work.list(
	*   'env_011CZkZ9X2dpNyB7HsEFoRfW',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(environmentID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/environments/${environmentID}/work?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Note: these endpoints are called automatically by the pre-built environment
	* worker provided in the SDKs and CLI, for orchestrating sessions with self-hosted
	* sandbox environments. They are included here as a reference; you do not need to
	* invoke them directly.
	*
	* Acknowledge receipt of a work item, transitioning it from 'queued' to 'starting'
	* and removing it from the queue.
	*
	* @example
	* ```ts
	* const betaSelfHostedWork =
	*   await client.beta.environments.work.ack('work_id', {
	*     environment_id: 'env_011CZkZ9X2dpNyB7HsEFoRfW',
	*   });
	* ```
	*/
	ack(workID, params, options) {
		const { environment_id, betas } = params;
		return this._client.post(path`/v1/environments/${environment_id}/work/${workID}/ack?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Note: these endpoints are called automatically by the pre-built environment
	* worker provided in the SDKs and CLI, for orchestrating sessions with self-hosted
	* sandbox environments. They are included here as a reference; you do not need to
	* invoke them directly.
	*
	* Record a heartbeat for a work item to maintain the lease.
	*
	* @example
	* ```ts
	* const betaSelfHostedWorkHeartbeatResponse =
	*   await client.beta.environments.work.heartbeat('work_id', {
	*     environment_id: 'env_011CZkZ9X2dpNyB7HsEFoRfW',
	*   });
	* ```
	*/
	heartbeat(workID, params, options) {
		const { environment_id, desired_ttl_seconds, expected_last_heartbeat, betas } = params;
		return this._client.post(path`/v1/environments/${environment_id}/work/${workID}/heartbeat?beta=true`, {
			query: {
				desired_ttl_seconds,
				expected_last_heartbeat
			},
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Note: these endpoints are called automatically by the pre-built environment
	* worker provided in the SDKs and CLI, for orchestrating sessions with self-hosted
	* sandbox environments. They are included here as a reference; you do not need to
	* invoke them directly.
	*
	* Long poll for work items in the queue.
	*
	* @example
	* ```ts
	* const betaSelfHostedWork =
	*   await client.beta.environments.work.poll(
	*     'env_011CZkZ9X2dpNyB7HsEFoRfW',
	*   );
	* ```
	*/
	poll(environmentID, params = {}, options) {
		const { betas, "Anthropic-Worker-ID": anthropicWorkerID, ...query } = params ?? {};
		return this._client.get(path`/v1/environments/${environmentID}/work/poll?beta=true`, {
			query,
			...options,
			headers: buildHeaders([{
				"anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString(),
				...anthropicWorkerID != null ? { "Anthropic-Worker-ID": anthropicWorkerID } : void 0
			}, options?.headers])
		});
	}
	/**
	* Get statistics about the work queue for an environment.
	*
	* @example
	* ```ts
	* const betaSelfHostedWorkQueueStats =
	*   await client.beta.environments.work.stats(
	*     'env_011CZkZ9X2dpNyB7HsEFoRfW',
	*   );
	* ```
	*/
	stats(environmentID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/environments/${environmentID}/work/stats?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Note: these endpoints are called automatically by the pre-built environment
	* worker provided in the SDKs and CLI, for orchestrating sessions with self-hosted
	* sandbox environments. They are included here as a reference; you do not need to
	* invoke them directly.
	*
	* Stop a work item, initiating graceful or forced shutdown.
	*
	* @example
	* ```ts
	* const betaSelfHostedWork =
	*   await client.beta.environments.work.stop('work_id', {
	*     environment_id: 'env_011CZkZ9X2dpNyB7HsEFoRfW',
	*   });
	* ```
	*/
	stop(workID, params, options) {
		const { environment_id, betas, ...body } = params;
		return this._client.post(path`/v1/environments/${environment_id}/work/${workID}/stop?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Continuously claim work from a self-hosted environment, ack each item,
	* and yield it. Posts `stop` automatically when the consumer's loop body
	* returns or when iteration ends.
	*
	* @example
	* ```ts
	* for await (const work of client.beta.environments.work.poller({
	*   environmentId,
	*   environmentKey,
	* })) {
	*   if (work.data.type !== 'session') continue;
	*   // ...service the work...
	* }
	* ```
	*/
	poller(opts) {
		return new WorkPoller({
			...opts,
			client: this._client
		});
	}
	worker(opts) {
		return new EnvironmentWorker({
			...opts,
			client: this._client
		});
	}
};
Work.WorkPoller = WorkPoller;
Work.EnvironmentWorker = EnvironmentWorker;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/environments/environments.mjs
var Environments = class extends APIResource {
	constructor() {
		super(...arguments);
		this.work = new Work(this._client);
	}
	/**
	* Create a new environment with the specified configuration.
	*
	* @example
	* ```ts
	* const betaEnvironment =
	*   await client.beta.environments.create({
	*     name: 'python-data-analysis',
	*   });
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/environments?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Retrieve a specific environment by ID.
	*
	* @example
	* ```ts
	* const betaEnvironment =
	*   await client.beta.environments.retrieve(
	*     'env_011CZkZ9X2dpNyB7HsEFoRfW',
	*   );
	* ```
	*/
	retrieve(environmentID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/environments/${environmentID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Update an existing environment's configuration.
	*
	* @example
	* ```ts
	* const betaEnvironment =
	*   await client.beta.environments.update(
	*     'env_011CZkZ9X2dpNyB7HsEFoRfW',
	*   );
	* ```
	*/
	update(environmentID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/environments/${environmentID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* List environments with pagination support.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaEnvironment of client.beta.environments.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/environments?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Delete an environment by ID. Returns a confirmation of the deletion.
	*
	* @example
	* ```ts
	* const betaEnvironmentDeleteResponse =
	*   await client.beta.environments.delete(
	*     'env_011CZkZ9X2dpNyB7HsEFoRfW',
	*   );
	* ```
	*/
	delete(environmentID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.delete(path`/v1/environments/${environmentID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Archive an environment by ID. Archived environments cannot be used to create new
	* sessions.
	*
	* @example
	* ```ts
	* const betaEnvironment =
	*   await client.beta.environments.archive(
	*     'env_011CZkZ9X2dpNyB7HsEFoRfW',
	*   );
	* ```
	*/
	archive(environmentID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/environments/${environmentID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
};
Environments.Work = Work;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/memory-stores/memories.mjs
var Memories = class extends APIResource {
	/**
	* Create a memory
	*
	* @example
	* ```ts
	* const betaManagedAgentsMemory =
	*   await client.beta.memoryStores.memories.create(
	*     'memory_store_id',
	*     { content: 'content', path: 'xx' },
	*   );
	* ```
	*/
	create(memoryStoreID, params, options) {
		const { view, betas, ...body } = params;
		return this._client.post(path`/v1/memory_stores/${memoryStoreID}/memories?beta=true`, {
			query: { view },
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
	/**
	* Retrieve a memory
	*
	* @example
	* ```ts
	* const betaManagedAgentsMemory =
	*   await client.beta.memoryStores.memories.retrieve(
	*     'memory_id',
	*     { memory_store_id: 'memory_store_id' },
	*   );
	* ```
	*/
	retrieve(memoryID, params, options) {
		const { memory_store_id, betas, ...query } = params;
		return this._client.get(path`/v1/memory_stores/${memory_store_id}/memories/${memoryID}?beta=true`, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
	/**
	* Update a memory
	*
	* @example
	* ```ts
	* const betaManagedAgentsMemory =
	*   await client.beta.memoryStores.memories.update(
	*     'memory_id',
	*     { memory_store_id: 'memory_store_id' },
	*   );
	* ```
	*/
	update(memoryID, params, options) {
		const { memory_store_id, view, betas, ...body } = params;
		return this._client.post(path`/v1/memory_stores/${memory_store_id}/memories/${memoryID}?beta=true`, {
			query: { view },
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
	/**
	* List memories
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsMemoryListItem of client.beta.memoryStores.memories.list(
	*   'memory_store_id',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(memoryStoreID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/memory_stores/${memoryStoreID}/memories?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
	/**
	* Delete a memory
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeletedMemory =
	*   await client.beta.memoryStores.memories.delete(
	*     'memory_id',
	*     { memory_store_id: 'memory_store_id' },
	*   );
	* ```
	*/
	delete(memoryID, params, options) {
		const { memory_store_id, expected_content_sha256, betas } = params;
		return this._client.delete(path`/v1/memory_stores/${memory_store_id}/memories/${memoryID}?beta=true`, {
			query: { expected_content_sha256 },
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/memory-stores/memory-versions.mjs
var MemoryVersions = class extends APIResource {
	/**
	* Retrieve a memory version
	*
	* @example
	* ```ts
	* const betaManagedAgentsMemoryVersion =
	*   await client.beta.memoryStores.memoryVersions.retrieve(
	*     'memory_version_id',
	*     { memory_store_id: 'memory_store_id' },
	*   );
	* ```
	*/
	retrieve(memoryVersionID, params, options) {
		const { memory_store_id, betas, ...query } = params;
		return this._client.get(path`/v1/memory_stores/${memory_store_id}/memory_versions/${memoryVersionID}?beta=true`, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
	/**
	* List memory versions
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsMemoryVersion of client.beta.memoryStores.memoryVersions.list(
	*   'memory_store_id',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(memoryStoreID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/memory_stores/${memoryStoreID}/memory_versions?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
	/**
	* Redact a memory version
	*
	* @example
	* ```ts
	* const betaManagedAgentsMemoryVersion =
	*   await client.beta.memoryStores.memoryVersions.redact(
	*     'memory_version_id',
	*     { memory_store_id: 'memory_store_id' },
	*   );
	* ```
	*/
	redact(memoryVersionID, params, options) {
		const { memory_store_id, betas } = params;
		return this._client.post(path`/v1/memory_stores/${memory_store_id}/memory_versions/${memoryVersionID}/redact?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/memory-stores/memory-stores.mjs
var MemoryStores = class extends APIResource {
	constructor() {
		super(...arguments);
		this.memories = new Memories(this._client);
		this.memoryVersions = new MemoryVersions(this._client);
	}
	/**
	* Create a memory store
	*
	* @example
	* ```ts
	* const betaManagedAgentsMemoryStore =
	*   await client.beta.memoryStores.create({ name: 'x' });
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/memory_stores?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
	/**
	* Retrieve a memory store
	*
	* @example
	* ```ts
	* const betaManagedAgentsMemoryStore =
	*   await client.beta.memoryStores.retrieve(
	*     'memory_store_id',
	*   );
	* ```
	*/
	retrieve(memoryStoreID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/memory_stores/${memoryStoreID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
	/**
	* Update a memory store
	*
	* @example
	* ```ts
	* const betaManagedAgentsMemoryStore =
	*   await client.beta.memoryStores.update('memory_store_id');
	* ```
	*/
	update(memoryStoreID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/memory_stores/${memoryStoreID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
	/**
	* List memory stores
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsMemoryStore of client.beta.memoryStores.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/memory_stores?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
	/**
	* Delete a memory store
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeletedMemoryStore =
	*   await client.beta.memoryStores.delete('memory_store_id');
	* ```
	*/
	delete(memoryStoreID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.delete(path`/v1/memory_stores/${memoryStoreID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
	/**
	* Archive a memory store
	*
	* @example
	* ```ts
	* const betaManagedAgentsMemoryStore =
	*   await client.beta.memoryStores.archive('memory_store_id');
	* ```
	*/
	archive(memoryStoreID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/memory_stores/${memoryStoreID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "agent-memory-2026-07-22"].toString() }, options?.headers])
		});
	}
};
MemoryStores.Memories = Memories;
MemoryStores.MemoryVersions = MemoryVersions;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/decoders/jsonl.mjs
var JSONLDecoder = class JSONLDecoder {
	constructor(iterator, controller) {
		this.iterator = iterator;
		this.controller = controller;
	}
	async *decoder() {
		const lineDecoder = new LineDecoder();
		for await (const chunk of this.iterator) for (const line of lineDecoder.decode(chunk)) yield JSON.parse(line);
		for (const line of lineDecoder.flush()) yield JSON.parse(line);
	}
	[Symbol.asyncIterator]() {
		return this.decoder();
	}
	static fromResponse(response, controller) {
		if (!response.body) {
			controller.abort();
			if (typeof globalThis.navigator !== "undefined" && globalThis.navigator.product === "ReactNative") throw new AnthropicError(`The default react-native fetch implementation does not support streaming. Please use expo/fetch: https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api`);
			throw new AnthropicError(`Attempted to iterate over a response with no body`);
		}
		return new JSONLDecoder(ReadableStreamToAsyncIterable(response.body), controller);
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/messages/batches.mjs
var Batches$1 = class extends APIResource {
	/**
	* Send a batch of Message creation requests.
	*
	* The Message Batches API can be used to process multiple Messages API requests at
	* once. Once a Message Batch is created, it begins processing immediately. Batches
	* can take up to 24 hours to complete.
	*
	* Learn more about the Message Batches API in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
	*
	* @example
	* ```ts
	* const betaMessageBatch =
	*   await client.beta.messages.batches.create({
	*     requests: [
	*       {
	*         custom_id: 'my-custom-id-1',
	*         params: {
	*           max_tokens: 1024,
	*           messages: [
	*             { content: 'Hello, world', role: 'user' },
	*           ],
	*           model: 'claude-opus-5',
	*         },
	*       },
	*     ],
	*   });
	* ```
	*/
	create(params, options) {
		const { betas, user_profile_id, ...body } = params;
		return this._client.post("/v1/messages/batches?beta=true", {
			body,
			...options,
			headers: buildHeaders([{
				"anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString(),
				...user_profile_id != null ? { "anthropic-user-profile-id": user_profile_id } : void 0
			}, options?.headers])
		});
	}
	/**
	* This endpoint is idempotent and can be used to poll for Message Batch
	* completion. To access the results of a Message Batch, make a request to the
	* `results_url` field in the response.
	*
	* Learn more about the Message Batches API in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
	*
	* @example
	* ```ts
	* const betaMessageBatch =
	*   await client.beta.messages.batches.retrieve(
	*     'message_batch_id',
	*   );
	* ```
	*/
	retrieve(messageBatchID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/messages/batches/${messageBatchID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() }, options?.headers])
		});
	}
	/**
	* List all Message Batches within a Workspace. Most recently created batches are
	* returned first.
	*
	* Learn more about the Message Batches API in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaMessageBatch of client.beta.messages.batches.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/messages/batches?beta=true", Page, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() }, options?.headers])
		});
	}
	/**
	* Delete a Message Batch.
	*
	* Message Batches can only be deleted once they've finished processing. If you'd
	* like to delete an in-progress batch, you must first cancel it.
	*
	* Learn more about the Message Batches API in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
	*
	* @example
	* ```ts
	* const betaDeletedMessageBatch =
	*   await client.beta.messages.batches.delete(
	*     'message_batch_id',
	*   );
	* ```
	*/
	delete(messageBatchID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.delete(path`/v1/messages/batches/${messageBatchID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() }, options?.headers])
		});
	}
	/**
	* Batches may be canceled any time before processing ends. Once cancellation is
	* initiated, the batch enters a `canceling` state, at which time the system may
	* complete any in-progress, non-interruptible requests before finalizing
	* cancellation.
	*
	* The number of canceled requests is specified in `request_counts`. To determine
	* which requests were canceled, check the individual results within the batch.
	* Note that cancellation may not result in any canceled requests if they were
	* non-interruptible.
	*
	* Learn more about the Message Batches API in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
	*
	* @example
	* ```ts
	* const betaMessageBatch =
	*   await client.beta.messages.batches.cancel(
	*     'message_batch_id',
	*   );
	* ```
	*/
	cancel(messageBatchID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/messages/batches/${messageBatchID}/cancel?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() }, options?.headers])
		});
	}
	/**
	* Streams the results of a Message Batch as a `.jsonl` file.
	*
	* Each line in the file is a JSON object containing the result of a single request
	* in the Message Batch. Results are not guaranteed to be in the same order as
	* requests. Use the `custom_id` field to match results to requests.
	*
	* Learn more about the Message Batches API in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
	*
	* @example
	* ```ts
	* const betaMessageBatchIndividualResponse =
	*   await client.beta.messages.batches.results(
	*     'message_batch_id',
	*   );
	* ```
	*/
	async results(messageBatchID, params = {}, options) {
		const batch = await this.retrieve(messageBatchID);
		if (!batch.results_url) throw new AnthropicError(`No batch \`results_url\`; Has it finished processing? ${batch.processing_status} - ${batch.id}`);
		const { betas } = params ?? {};
		return this._client.get(batch.results_url, {
			...options,
			headers: buildHeaders([{
				"anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString(),
				Accept: "application/binary"
			}, options?.headers]),
			stream: true,
			__binaryResponse: true
		})._thenUnwrap((_, props) => JSONLDecoder.fromResponse(props.response, props.controller));
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/constants.mjs
/**
* Model-specific timeout constraints for non-streaming requests
*/
const MODEL_NONSTREAMING_TOKENS = {
	"claude-opus-4@20250514": 8192,
	"anthropic.claude-opus-4-1-20250805-v1:0": 8192,
	"claude-opus-4-1@20250805": 8192
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/beta-parser.mjs
function getOutputFormat$1(params) {
	return params?.output_format ?? params?.output_config?.format;
}
function maybeParseBetaMessage(message, params, opts) {
	const outputFormat = getOutputFormat$1(params);
	if (!params || !("parse" in (outputFormat ?? {}))) return {
		...message,
		content: message.content.map((block) => {
			if (block.type === "text") {
				const parsedBlock = Object.defineProperty({ ...block }, "parsed_output", {
					value: null,
					enumerable: false
				});
				return Object.defineProperty(parsedBlock, "parsed", {
					get() {
						opts.logger.warn("The `parsed` property on `text` blocks is deprecated, please use `parsed_output` instead.");
						return null;
					},
					enumerable: false
				});
			}
			return block;
		}),
		parsed_output: null
	};
	return parseBetaMessage(message, params, opts);
}
function parseBetaMessage(message, params, opts) {
	let firstParsedOutput = null;
	const content = message.content.map((block) => {
		if (block.type === "text") {
			const parsedOutput = parseBetaOutputFormat(params, block.text);
			if (firstParsedOutput === null) firstParsedOutput = parsedOutput;
			const parsedBlock = Object.defineProperty({ ...block }, "parsed_output", {
				value: parsedOutput,
				enumerable: false
			});
			return Object.defineProperty(parsedBlock, "parsed", {
				get() {
					opts.logger.warn("The `parsed` property on `text` blocks is deprecated, please use `parsed_output` instead.");
					return parsedOutput;
				},
				enumerable: false
			});
		}
		return block;
	});
	return {
		...message,
		content,
		parsed_output: firstParsedOutput
	};
}
function parseBetaOutputFormat(params, content) {
	const outputFormat = getOutputFormat$1(params);
	if (outputFormat?.type !== "json_schema") return null;
	try {
		if ("parse" in outputFormat) return outputFormat.parse(content);
		return JSON.parse(content);
	} catch (error) {
		throw new AnthropicError(`Failed to parse structured output: ${error}`);
	}
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.mjs
const tokenize = (input) => {
	let current = 0;
	let tokens = [];
	while (current < input.length) {
		let char = input[current];
		if (char === "\\") {
			current++;
			continue;
		}
		if (char === "{") {
			tokens.push({
				type: "brace",
				value: "{"
			});
			current++;
			continue;
		}
		if (char === "}") {
			tokens.push({
				type: "brace",
				value: "}"
			});
			current++;
			continue;
		}
		if (char === "[") {
			tokens.push({
				type: "paren",
				value: "["
			});
			current++;
			continue;
		}
		if (char === "]") {
			tokens.push({
				type: "paren",
				value: "]"
			});
			current++;
			continue;
		}
		if (char === ":") {
			tokens.push({
				type: "separator",
				value: ":"
			});
			current++;
			continue;
		}
		if (char === ",") {
			tokens.push({
				type: "delimiter",
				value: ","
			});
			current++;
			continue;
		}
		if (char === "\"") {
			let value = "";
			let danglingQuote = false;
			char = input[++current];
			while (char !== "\"") {
				if (current === input.length) {
					danglingQuote = true;
					break;
				}
				if (char === "\\") {
					current++;
					if (current === input.length) {
						danglingQuote = true;
						break;
					}
					value += char + input[current];
					char = input[++current];
				} else {
					value += char;
					char = input[++current];
				}
			}
			char = input[++current];
			if (!danglingQuote) tokens.push({
				type: "string",
				value
			});
			continue;
		}
		if (char && /\s/.test(char)) {
			current++;
			continue;
		}
		let NUMBERS = /[0-9]/;
		if (char && NUMBERS.test(char) || char === "-" || char === ".") {
			let value = "";
			if (char === "-") {
				value += char;
				char = input[++current];
			}
			while (char && (NUMBERS.test(char) || char === "." || char === "e" || char === "E" || (char === "-" || char === "+") && (value[value.length - 1] === "e" || value[value.length - 1] === "E"))) {
				value += char;
				char = input[++current];
			}
			tokens.push({
				type: "number",
				value
			});
			continue;
		}
		let LETTERS = /[a-z]/i;
		if (char && LETTERS.test(char)) {
			let value = "";
			while (char && LETTERS.test(char)) {
				if (current === input.length) break;
				value += char;
				char = input[++current];
			}
			if (value == "true" || value == "false" || value === "null") tokens.push({
				type: "name",
				value
			});
			else {
				current++;
				continue;
			}
			continue;
		}
		current++;
	}
	return tokens;
};
const strip = (tokens) => {
	if (tokens.length === 0) return tokens;
	let lastToken = tokens[tokens.length - 1];
	switch (lastToken.type) {
		case "separator":
			tokens = tokens.slice(0, tokens.length - 1);
			return strip(tokens);
		case "number":
			let lastCharacterOfLastToken = lastToken.value[lastToken.value.length - 1];
			if (lastCharacterOfLastToken === "." || lastCharacterOfLastToken === "-" || lastCharacterOfLastToken === "+" || lastCharacterOfLastToken === "e" || lastCharacterOfLastToken === "E") {
				tokens = tokens.slice(0, tokens.length - 1);
				return strip(tokens);
			}
		case "string":
			let tokenBeforeTheLastToken = tokens[tokens.length - 2];
			if (tokenBeforeTheLastToken?.type === "delimiter") {
				tokens = tokens.slice(0, tokens.length - 1);
				return strip(tokens);
			} else if (tokenBeforeTheLastToken?.type === "brace" && tokenBeforeTheLastToken.value === "{") {
				tokens = tokens.slice(0, tokens.length - 1);
				return strip(tokens);
			}
			break;
		case "delimiter":
			tokens = tokens.slice(0, tokens.length - 1);
			return strip(tokens);
	}
	return tokens;
};
const unstrip = (tokens) => {
	let tail = [];
	tokens.map((token) => {
		if (token.type === "brace") {
			if (token.value === "{") tail.push("}");
			else tail.splice(tail.lastIndexOf("}"), 1);
		}
		if (token.type === "paren") {
			if (token.value === "[") tail.push("]");
			else tail.splice(tail.lastIndexOf("]"), 1);
		}
	});
	if (tail.length > 0) tail.reverse().map((item) => {
		if (item === "}") tokens.push({
			type: "brace",
			value: "}"
		});
		else if (item === "]") tokens.push({
			type: "paren",
			value: "]"
		});
	});
	return tokens;
};
const generate = (tokens) => {
	let output = "";
	tokens.map((token) => {
		switch (token.type) {
			case "string":
				output += "\"" + token.value + "\"";
				break;
			default: output += token.value;
		}
	});
	return output;
};
const partialParse = (input) => JSON.parse(generate(unstrip(strip(tokenize(input)))));
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/message-stream-utils.mjs
const JSON_BUF_PROPERTY = "__json_buf";
/**
* Copies a tool-use block with an updated `__json_buf`, installing `.input` as
* a memoized getter so the partial-JSON parse happens on first read instead of
* on every delta.
*/
function withLazyInput(prev, jsonBuf) {
	const next = {};
	for (const key of Object.keys(prev)) if (key !== "input") next[key] = prev[key];
	Object.defineProperty(next, JSON_BUF_PROPERTY, {
		value: jsonBuf,
		enumerable: false,
		writable: true
	});
	let input;
	let parsed = false;
	Object.defineProperty(next, "input", {
		enumerable: true,
		configurable: true,
		get() {
			if (!parsed) {
				input = jsonBuf ? partialParse(jsonBuf) : {};
				parsed = true;
			}
			return input;
		}
	});
	return next;
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/BetaMessageStream.mjs
var _BetaMessageStream_instances;
var _BetaMessageStream_currentMessageSnapshot;
var _BetaMessageStream_params;
var _BetaMessageStream_connectedPromise;
var _BetaMessageStream_resolveConnectedPromise;
var _BetaMessageStream_rejectConnectedPromise;
var _BetaMessageStream_endPromise;
var _BetaMessageStream_resolveEndPromise;
var _BetaMessageStream_rejectEndPromise;
var _BetaMessageStream_listeners;
var _BetaMessageStream_ended;
var _BetaMessageStream_errored;
var _BetaMessageStream_aborted;
var _BetaMessageStream_catchingPromiseCreated;
var _BetaMessageStream_response;
var _BetaMessageStream_request_id;
var _BetaMessageStream_workspace_id;
var _BetaMessageStream_logger;
var _BetaMessageStream_getFinalMessage;
var _BetaMessageStream_getFinalText;
var _BetaMessageStream_handleError;
var _BetaMessageStream_beginRequest;
var _BetaMessageStream_addStreamEvent;
var _BetaMessageStream_endRequest;
var _BetaMessageStream_accumulateMessage;
var _BetaMessageStream_toolInputParseError;
function tracksToolInput$1(content) {
	return content.type === "tool_use" || content.type === "server_tool_use" || content.type === "mcp_tool_use";
}
var BetaMessageStream = class BetaMessageStream {
	constructor(params, opts) {
		_BetaMessageStream_instances.add(this);
		this.messages = [];
		this.receivedMessages = [];
		_BetaMessageStream_currentMessageSnapshot.set(this, void 0);
		_BetaMessageStream_params.set(this, null);
		this.controller = new AbortController();
		_BetaMessageStream_connectedPromise.set(this, void 0);
		_BetaMessageStream_resolveConnectedPromise.set(this, () => {});
		_BetaMessageStream_rejectConnectedPromise.set(this, () => {});
		_BetaMessageStream_endPromise.set(this, void 0);
		_BetaMessageStream_resolveEndPromise.set(this, () => {});
		_BetaMessageStream_rejectEndPromise.set(this, () => {});
		_BetaMessageStream_listeners.set(this, {});
		_BetaMessageStream_ended.set(this, false);
		_BetaMessageStream_errored.set(this, false);
		_BetaMessageStream_aborted.set(this, false);
		_BetaMessageStream_catchingPromiseCreated.set(this, false);
		_BetaMessageStream_response.set(this, void 0);
		_BetaMessageStream_request_id.set(this, void 0);
		_BetaMessageStream_workspace_id.set(this, void 0);
		_BetaMessageStream_logger.set(this, void 0);
		_BetaMessageStream_handleError.set(this, (error) => {
			__classPrivateFieldSet(this, _BetaMessageStream_errored, true, "f");
			if (isAbortError(error)) error = new APIUserAbortError();
			if (error instanceof APIUserAbortError) {
				__classPrivateFieldSet(this, _BetaMessageStream_aborted, true, "f");
				return this._emit("abort", error);
			}
			if (error instanceof AnthropicError) return this._emit("error", error);
			if (error instanceof Error) {
				const anthropicError = new AnthropicError(error.message);
				anthropicError.cause = error;
				return this._emit("error", anthropicError);
			}
			return this._emit("error", new AnthropicError(String(error)));
		});
		__classPrivateFieldSet(this, _BetaMessageStream_connectedPromise, new Promise((resolve, reject) => {
			__classPrivateFieldSet(this, _BetaMessageStream_resolveConnectedPromise, resolve, "f");
			__classPrivateFieldSet(this, _BetaMessageStream_rejectConnectedPromise, reject, "f");
		}), "f");
		__classPrivateFieldSet(this, _BetaMessageStream_endPromise, new Promise((resolve, reject) => {
			__classPrivateFieldSet(this, _BetaMessageStream_resolveEndPromise, resolve, "f");
			__classPrivateFieldSet(this, _BetaMessageStream_rejectEndPromise, reject, "f");
		}), "f");
		__classPrivateFieldGet(this, _BetaMessageStream_connectedPromise, "f").catch(() => {});
		__classPrivateFieldGet(this, _BetaMessageStream_endPromise, "f").catch(() => {});
		__classPrivateFieldSet(this, _BetaMessageStream_params, params, "f");
		__classPrivateFieldSet(this, _BetaMessageStream_logger, opts?.logger ?? console, "f");
	}
	get response() {
		return __classPrivateFieldGet(this, _BetaMessageStream_response, "f");
	}
	get request_id() {
		return __classPrivateFieldGet(this, _BetaMessageStream_request_id, "f");
	}
	get workspace_id() {
		return __classPrivateFieldGet(this, _BetaMessageStream_workspace_id, "f");
	}
	/**
	* Returns the `MessageStream` data, the raw `Response` instance and the ID of the request,
	* returned vie the `request-id` header which is useful for debugging requests and resporting
	* issues to Anthropic.
	*
	* This is the same as the `APIPromise.withResponse()` method.
	*
	* This method will raise an error if you created the stream using `MessageStream.fromReadableStream`
	* as no `Response` is available.
	*/
	async withResponse() {
		__classPrivateFieldSet(this, _BetaMessageStream_catchingPromiseCreated, true, "f");
		const response = await __classPrivateFieldGet(this, _BetaMessageStream_connectedPromise, "f");
		if (!response) throw new Error("Could not resolve a `Response` object");
		return {
			data: this,
			response,
			request_id: response.headers.get("request-id"),
			workspace_id: response.headers.get("anthropic-workspace-id")
		};
	}
	/**
	* Intended for use on the frontend, consuming a stream produced with
	* `.toReadableStream()` on the backend.
	*
	* Note that messages sent to the model do not appear in `.on('message')`
	* in this context.
	*/
	static fromReadableStream(stream) {
		const runner = new BetaMessageStream(null);
		runner._run(() => runner._fromReadableStream(stream));
		return runner;
	}
	static createMessage(messages, params, options, { logger } = {}) {
		const runner = new BetaMessageStream(params, { logger });
		for (const message of params.messages) runner._addMessageParam(message);
		__classPrivateFieldSet(runner, _BetaMessageStream_params, {
			...params,
			stream: true
		}, "f");
		runner._run(() => runner._createMessage(messages, {
			...params,
			stream: true
		}, {
			...options,
			headers: {
				...options?.headers,
				[STAINLESS_HELPER_METHOD_HEADER]: "stream"
			}
		}));
		return runner;
	}
	_run(executor) {
		executor().then(() => {
			this._emitFinal();
			this._emit("end");
		}, __classPrivateFieldGet(this, _BetaMessageStream_handleError, "f"));
	}
	_addMessageParam(message) {
		this.messages.push(message);
	}
	_addMessage(message, emit = true) {
		this.receivedMessages.push(message);
		if (emit) this._emit("message", message);
	}
	async _createMessage(messages, params, options) {
		const signal = options?.signal;
		let abortHandler;
		if (signal) {
			if (signal.aborted) this.controller.abort();
			abortHandler = this.controller.abort.bind(this.controller);
			signal.addEventListener("abort", abortHandler);
		}
		try {
			__classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_beginRequest).call(this);
			const { response, data: stream } = await messages.create({
				...params,
				stream: true
			}, {
				...options,
				signal: this.controller.signal
			}).withResponse();
			this._connected(response);
			for await (const event of stream) __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_addStreamEvent).call(this, event);
			if (stream.controller.signal?.aborted) throw new APIUserAbortError();
			__classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_endRequest).call(this);
		} finally {
			if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
		}
	}
	_connected(response) {
		if (this.ended) return;
		__classPrivateFieldSet(this, _BetaMessageStream_response, response, "f");
		__classPrivateFieldSet(this, _BetaMessageStream_request_id, response?.headers.get("request-id"), "f");
		__classPrivateFieldSet(this, _BetaMessageStream_workspace_id, response?.headers.get("anthropic-workspace-id"), "f");
		__classPrivateFieldGet(this, _BetaMessageStream_resolveConnectedPromise, "f").call(this, response);
		this._emit("connect");
	}
	get ended() {
		return __classPrivateFieldGet(this, _BetaMessageStream_ended, "f");
	}
	get errored() {
		return __classPrivateFieldGet(this, _BetaMessageStream_errored, "f");
	}
	get aborted() {
		return __classPrivateFieldGet(this, _BetaMessageStream_aborted, "f");
	}
	abort() {
		this.controller.abort();
	}
	/**
	* Adds the listener function to the end of the listeners array for the event.
	* No checks are made to see if the listener has already been added. Multiple calls passing
	* the same combination of event and listener will result in the listener being added, and
	* called, multiple times.
	* @returns this MessageStream, so that calls can be chained
	*/
	on(event, listener) {
		(__classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] = [])).push({ listener });
		return this;
	}
	/**
	* Removes the specified listener from the listener array for the event.
	* off() will remove, at most, one instance of a listener from the listener array. If any single
	* listener has been added multiple times to the listener array for the specified event, then
	* off() must be called multiple times to remove each instance.
	* @returns this MessageStream, so that calls can be chained
	*/
	off(event, listener) {
		const listeners = __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event];
		if (!listeners) return this;
		const index = listeners.findIndex((l) => l.listener === listener);
		if (index >= 0) listeners.splice(index, 1);
		return this;
	}
	/**
	* Adds a one-time listener function for the event. The next time the event is triggered,
	* this listener is removed and then invoked.
	* @returns this MessageStream, so that calls can be chained
	*/
	once(event, listener) {
		(__classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] = [])).push({
			listener,
			once: true
		});
		return this;
	}
	/**
	* This is similar to `.once()`, but returns a Promise that resolves the next time
	* the event is triggered, instead of calling a listener callback.
	* @returns a Promise that resolves the next time given event is triggered,
	* or rejects if an error is emitted.  (If you request the 'error' event,
	* returns a promise that resolves with the error).
	*
	* Example:
	*
	*   const message = await stream.emitted('message') // rejects if the stream errors
	*/
	emitted(event) {
		return new Promise((resolve, reject) => {
			__classPrivateFieldSet(this, _BetaMessageStream_catchingPromiseCreated, true, "f");
			if (event !== "error") this.once("error", reject);
			this.once(event, resolve);
		});
	}
	async done() {
		__classPrivateFieldSet(this, _BetaMessageStream_catchingPromiseCreated, true, "f");
		await __classPrivateFieldGet(this, _BetaMessageStream_endPromise, "f");
	}
	get currentMessage() {
		return __classPrivateFieldGet(this, _BetaMessageStream_currentMessageSnapshot, "f");
	}
	/**
	* @returns a promise that resolves with the the final assistant Message response,
	* or rejects if an error occurred or the stream ended prematurely without producing a Message.
	* If structured outputs were used, this will be a ParsedMessage with a `parsed` field.
	*/
	async finalMessage() {
		await this.done();
		return __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_getFinalMessage).call(this);
	}
	/**
	* @returns a promise that resolves with the the final assistant Message's text response, concatenated
	* together if there are more than one text blocks.
	* Rejects if an error occurred or the stream ended prematurely without producing a Message.
	*/
	async finalText() {
		await this.done();
		return __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_getFinalText).call(this);
	}
	_emit(event, ...args) {
		if (__classPrivateFieldGet(this, _BetaMessageStream_ended, "f")) return;
		if (event === "end") {
			__classPrivateFieldSet(this, _BetaMessageStream_ended, true, "f");
			__classPrivateFieldGet(this, _BetaMessageStream_resolveEndPromise, "f").call(this);
		}
		const listeners = __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event];
		if (listeners) {
			__classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] = listeners.filter((l) => !l.once);
			listeners.forEach(({ listener }) => listener(...args));
		}
		if (event === "abort") {
			const error = args[0];
			if (!__classPrivateFieldGet(this, _BetaMessageStream_catchingPromiseCreated, "f") && !listeners?.length) Promise.reject(error);
			__classPrivateFieldGet(this, _BetaMessageStream_rejectConnectedPromise, "f").call(this, error);
			__classPrivateFieldGet(this, _BetaMessageStream_rejectEndPromise, "f").call(this, error);
			this._emit("end");
			return;
		}
		if (event === "error") {
			const error = args[0];
			if (!__classPrivateFieldGet(this, _BetaMessageStream_catchingPromiseCreated, "f") && !listeners?.length) Promise.reject(error);
			__classPrivateFieldGet(this, _BetaMessageStream_rejectConnectedPromise, "f").call(this, error);
			__classPrivateFieldGet(this, _BetaMessageStream_rejectEndPromise, "f").call(this, error);
			this._emit("end");
		}
	}
	_emitFinal() {
		if (this.receivedMessages.at(-1)) this._emit("finalMessage", __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_getFinalMessage).call(this));
	}
	async _fromReadableStream(readableStream, options) {
		const signal = options?.signal;
		let abortHandler;
		if (signal) {
			if (signal.aborted) this.controller.abort();
			abortHandler = this.controller.abort.bind(this.controller);
			signal.addEventListener("abort", abortHandler);
		}
		try {
			__classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_beginRequest).call(this);
			this._connected(null);
			const stream = Stream.fromReadableStream(readableStream, this.controller);
			for await (const event of stream) __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_addStreamEvent).call(this, event);
			if (stream.controller.signal?.aborted) throw new APIUserAbortError();
			__classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_endRequest).call(this);
		} finally {
			if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
		}
	}
	[(_BetaMessageStream_currentMessageSnapshot = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_params = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_connectedPromise = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_resolveConnectedPromise = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_rejectConnectedPromise = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_endPromise = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_resolveEndPromise = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_rejectEndPromise = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_listeners = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_ended = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_errored = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_aborted = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_catchingPromiseCreated = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_response = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_request_id = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_workspace_id = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_logger = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_handleError = /* @__PURE__ */ new WeakMap(), _BetaMessageStream_instances = /* @__PURE__ */ new WeakSet(), _BetaMessageStream_getFinalMessage = function _BetaMessageStream_getFinalMessage() {
		if (this.receivedMessages.length === 0) throw new AnthropicError("stream ended without producing a Message with role=assistant");
		return this.receivedMessages.at(-1);
	}, _BetaMessageStream_getFinalText = function _BetaMessageStream_getFinalText() {
		if (this.receivedMessages.length === 0) throw new AnthropicError("stream ended without producing a Message with role=assistant");
		const textBlocks = this.receivedMessages.at(-1).content.filter((block) => block.type === "text").map((block) => block.text);
		if (textBlocks.length === 0) throw new AnthropicError("stream ended without producing a content block with type=text");
		return textBlocks.join(" ");
	}, _BetaMessageStream_beginRequest = function _BetaMessageStream_beginRequest() {
		if (this.ended) return;
		__classPrivateFieldSet(this, _BetaMessageStream_currentMessageSnapshot, void 0, "f");
	}, _BetaMessageStream_addStreamEvent = function _BetaMessageStream_addStreamEvent(event) {
		if (this.ended) return;
		const messageSnapshot = __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_accumulateMessage).call(this, event);
		this._emit("streamEvent", event, messageSnapshot);
		switch (event.type) {
			case "content_block_delta": {
				const content = messageSnapshot.content.at(-1);
				switch (event.delta.type) {
					case "text_delta":
						if (content.type === "text") this._emit("text", event.delta.text, content.text || "");
						break;
					case "citations_delta":
						if (content.type === "text") this._emit("citation", event.delta.citation, content.citations ?? []);
						break;
					case "input_json_delta":
						if (tracksToolInput$1(content) && __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f").inputJson?.length) {
							let jsonSnapshot;
							try {
								jsonSnapshot = content.input;
							} catch (err) {
								__classPrivateFieldGet(this, _BetaMessageStream_handleError, "f").call(this, __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_toolInputParseError).call(this, content, err));
								break;
							}
							this._emit("inputJson", event.delta.partial_json, jsonSnapshot);
						}
						break;
					case "thinking_delta":
						if (content.type === "thinking") this._emit("thinking", event.delta.thinking, content.thinking);
						break;
					case "signature_delta":
						if (content.type === "thinking") this._emit("signature", content.signature);
						break;
					case "compaction_delta":
						if (content.type === "compaction" && content.content) this._emit("compaction", content.content);
						break;
					default: event.delta;
				}
				break;
			}
			case "message_stop":
				this._addMessageParam(messageSnapshot);
				this._addMessage(maybeParseBetaMessage(messageSnapshot, __classPrivateFieldGet(this, _BetaMessageStream_params, "f"), { logger: __classPrivateFieldGet(this, _BetaMessageStream_logger, "f") }), true);
				break;
			case "content_block_stop":
				this._emit("contentBlock", messageSnapshot.content.at(-1));
				break;
			case "message_start": __classPrivateFieldSet(this, _BetaMessageStream_currentMessageSnapshot, messageSnapshot, "f");
		}
	}, _BetaMessageStream_endRequest = function _BetaMessageStream_endRequest() {
		if (this.ended) throw new AnthropicError(`stream has ended, this shouldn't happen`);
		const snapshot = __classPrivateFieldGet(this, _BetaMessageStream_currentMessageSnapshot, "f");
		if (!snapshot) throw new AnthropicError(`request ended without sending any chunks`);
		__classPrivateFieldSet(this, _BetaMessageStream_currentMessageSnapshot, void 0, "f");
		return maybeParseBetaMessage(snapshot, __classPrivateFieldGet(this, _BetaMessageStream_params, "f"), { logger: __classPrivateFieldGet(this, _BetaMessageStream_logger, "f") });
	}, _BetaMessageStream_accumulateMessage = function _BetaMessageStream_accumulateMessage(event) {
		let snapshot = __classPrivateFieldGet(this, _BetaMessageStream_currentMessageSnapshot, "f");
		if (event.type === "message_start") {
			if (snapshot) throw new AnthropicError(`Unexpected event order, got ${event.type} before receiving "message_stop"`);
			return event.message;
		}
		if (!snapshot) throw new AnthropicError(`Unexpected event order, got ${event.type} before "message_start"`);
		switch (event.type) {
			case "message_stop": return snapshot;
			case "message_delta":
				snapshot.stop_reason = event.delta.stop_reason;
				snapshot.stop_sequence = event.delta.stop_sequence;
				snapshot.stop_details = event.delta.stop_details;
				snapshot.usage.output_tokens = event.usage.output_tokens;
				if (event.delta.container != null) snapshot.container = event.delta.container;
				if (event.context_management != null) snapshot.context_management = event.context_management;
				if (event.input_transformations != null) snapshot.input_transformations = event.input_transformations;
				if (event.usage.input_tokens != null) snapshot.usage.input_tokens = event.usage.input_tokens;
				if (event.usage.cache_creation_input_tokens != null) snapshot.usage.cache_creation_input_tokens = event.usage.cache_creation_input_tokens;
				if (event.usage.cache_read_input_tokens != null) snapshot.usage.cache_read_input_tokens = event.usage.cache_read_input_tokens;
				if (event.usage.server_tool_use != null) snapshot.usage.server_tool_use = event.usage.server_tool_use;
				if (event.usage.iterations != null) snapshot.usage.iterations = event.usage.iterations;
				if (event.usage.fallback_credit != null) snapshot.usage.fallback_credit = event.usage.fallback_credit;
				if (event.usage.output_tokens_details != null) snapshot.usage.output_tokens_details = event.usage.output_tokens_details;
				return snapshot;
			case "content_block_start":
				snapshot.content.push(event.content_block);
				if (event.content_block.type === "fallback") snapshot.model = event.content_block.to.model;
				return snapshot;
			case "content_block_delta": {
				const snapshotContent = snapshot.content.at(event.index);
				switch (event.delta.type) {
					case "text_delta":
						if (snapshotContent?.type === "text") snapshot.content[event.index] = {
							...snapshotContent,
							text: (snapshotContent.text || "") + event.delta.text
						};
						break;
					case "citations_delta":
						if (snapshotContent?.type === "text") snapshot.content[event.index] = {
							...snapshotContent,
							citations: [...snapshotContent.citations ?? [], event.delta.citation]
						};
						break;
					case "input_json_delta":
						if (snapshotContent && tracksToolInput$1(snapshotContent)) {
							const jsonBuf = (snapshotContent["__json_buf"] || "") + event.delta.partial_json;
							snapshot.content[event.index] = withLazyInput(snapshotContent, jsonBuf);
						}
						break;
					case "thinking_delta":
						if (snapshotContent?.type === "thinking") snapshot.content[event.index] = {
							...snapshotContent,
							thinking: snapshotContent.thinking + event.delta.thinking
						};
						break;
					case "signature_delta":
						if (snapshotContent?.type === "thinking") snapshot.content[event.index] = {
							...snapshotContent,
							signature: event.delta.signature
						};
						break;
					case "compaction_delta":
						if (snapshotContent?.type === "compaction") snapshot.content[event.index] = {
							...snapshotContent,
							content: (snapshotContent.content || "") + event.delta.content,
							encrypted_content: event.delta.encrypted_content
						};
						break;
					default: event.delta;
				}
				return snapshot;
			}
			case "content_block_stop": {
				const snapshotContent = snapshot.content.at(event.index);
				if (snapshotContent && tracksToolInput$1(snapshotContent) && "__json_buf" in snapshotContent) {
					let input;
					try {
						input = snapshotContent.input;
					} catch (err) {
						input = {};
						__classPrivateFieldGet(this, _BetaMessageStream_handleError, "f").call(this, __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_toolInputParseError).call(this, snapshotContent, err));
					}
					Object.defineProperty(snapshotContent, "input", {
						value: input,
						enumerable: true,
						configurable: true,
						writable: true
					});
				}
				return snapshot;
			}
		}
	}, _BetaMessageStream_toolInputParseError = function _BetaMessageStream_toolInputParseError(block, err) {
		const jsonBuf = block[JSON_BUF_PROPERTY];
		return new AnthropicError(`Unable to parse tool parameter JSON from model. Please retry your request or adjust your prompt. Error: ${err}. JSON: ${jsonBuf}`);
	}, Symbol.asyncIterator)]() {
		const pushQueue = [];
		const readQueue = [];
		let done = false;
		this.on("streamEvent", (event) => {
			const reader = readQueue.shift();
			if (reader) reader.resolve(event);
			else pushQueue.push(event);
		});
		this.on("end", () => {
			done = true;
			for (const reader of readQueue) reader.resolve(void 0);
			readQueue.length = 0;
		});
		this.on("abort", (err) => {
			done = true;
			for (const reader of readQueue) reader.reject(err);
			readQueue.length = 0;
		});
		this.on("error", (err) => {
			done = true;
			for (const reader of readQueue) reader.reject(err);
			readQueue.length = 0;
		});
		return {
			next: async () => {
				if (!pushQueue.length) {
					if (done) return {
						value: void 0,
						done: true
					};
					return new Promise((resolve, reject) => readQueue.push({
						resolve,
						reject
					})).then((chunk) => chunk ? {
						value: chunk,
						done: false
					} : {
						value: void 0,
						done: true
					});
				}
				return {
					value: pushQueue.shift(),
					done: false
				};
			},
			return: async () => {
				this.abort();
				return {
					value: void 0,
					done: true
				};
			}
		};
	}
	toReadableStream() {
		return new Stream(this[Symbol.asyncIterator].bind(this), this.controller).toReadableStream();
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/utils/promise.mjs
/**
* A deferred: a `Promise` together with its `resolve` / `reject` functions.
* This is `Promise.withResolvers()`, which is not available in all supported
* runtimes.
*/
function promiseWithResolvers() {
	let resolve;
	let reject;
	return {
		promise: new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		}),
		resolve,
		reject
	};
}
const DEFAULT_SUMMARY_PROMPT = `You have been working on the task described above but have not yet completed it. Write a continuation summary that will allow you (or another instance of yourself) to resume work efficiently in a future context window where the conversation history will be replaced with this summary. Your summary should be structured, concise, and actionable. Include:
1. Task Overview
The user's core request and success criteria
Any clarifications or constraints they specified
2. Current State
What has been completed so far
Files created, modified, or analyzed (with paths if relevant)
Key outputs or artifacts produced
3. Important Discoveries
Technical constraints or requirements uncovered
Decisions made and their rationale
Errors encountered and how they were resolved
What approaches were tried that didn't work (and why)
4. Next Steps
Specific actions needed to complete the task
Any blockers or open questions to resolve
Priority order if multiple steps remain
5. Context to Preserve
User preferences or style requirements
Domain-specific details that aren't obvious
Any promises made to the user
Be concise but complete—err on the side of including information that would prevent duplicate work or repeated mistakes. Write in a way that enables immediate resumption of the task.
Wrap your summary in <summary></summary> tags.`;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/tools/BetaToolRunner.mjs
var _BetaToolRunner_instances;
var _BetaToolRunner_consumed;
var _BetaToolRunner_mutated;
var _BetaToolRunner_state;
var _BetaToolRunner_options;
var _BetaToolRunner_message;
var _BetaToolRunner_toolResponse;
var _BetaToolRunner_completion;
var _BetaToolRunner_iterationCount;
var _BetaToolRunner_checkAndCompact;
var _BetaToolRunner_generateToolResponse;
/**
* A ToolRunner handles the automatic conversation loop between the assistant and tools.
*
* A ToolRunner is an async iterable that yields either BetaMessage or BetaMessageStream objects
* depending on the streaming configuration.
*/
var BetaToolRunner = class {
	constructor(client, params, options) {
		_BetaToolRunner_instances.add(this);
		this.client = client;
		/** Whether the async iterator has been consumed */
		_BetaToolRunner_consumed.set(this, false);
		/** Whether parameters have been mutated since the last API call */
		_BetaToolRunner_mutated.set(this, false);
		/** Current state containing the request parameters */
		_BetaToolRunner_state.set(this, void 0);
		_BetaToolRunner_options.set(this, void 0);
		/** Promise for the last message received from the assistant */
		_BetaToolRunner_message.set(this, void 0);
		/** Cached tool response to avoid redundant executions */
		_BetaToolRunner_toolResponse.set(this, void 0);
		/** Promise resolvers for waiting on completion */
		_BetaToolRunner_completion.set(this, void 0);
		/** Number of iterations (API requests) made so far */
		_BetaToolRunner_iterationCount.set(this, 0);
		__classPrivateFieldSet(this, _BetaToolRunner_state, { params: {
			...params,
			messages: structuredClone(params.messages)
		} }, "f");
		const collected = collectStainlessHelpers(params.tools, params.messages);
		__classPrivateFieldSet(this, _BetaToolRunner_options, {
			...options,
			headers: buildHeaders([
				helperHeader("BetaToolRunner"),
				collected.length ? { [STAINLESS_HELPER_HEADER]: collected.join(", ") } : void 0,
				options?.headers
			])
		}, "f");
		__classPrivateFieldSet(this, _BetaToolRunner_completion, promiseWithResolvers(), "f");
		if (params.compactionControl?.enabled) console.warn("Anthropic: The `compactionControl` parameter is deprecated and will be removed in a future version. Use server-side compaction instead by passing `edits: [{ type: \"compact_20260112\" }]` in the params passed to `toolRunner()`. See https://platform.claude.com/docs/en/build-with-claude/compaction");
	}
	async *[(_BetaToolRunner_consumed = /* @__PURE__ */ new WeakMap(), _BetaToolRunner_mutated = /* @__PURE__ */ new WeakMap(), _BetaToolRunner_state = /* @__PURE__ */ new WeakMap(), _BetaToolRunner_options = /* @__PURE__ */ new WeakMap(), _BetaToolRunner_message = /* @__PURE__ */ new WeakMap(), _BetaToolRunner_toolResponse = /* @__PURE__ */ new WeakMap(), _BetaToolRunner_completion = /* @__PURE__ */ new WeakMap(), _BetaToolRunner_iterationCount = /* @__PURE__ */ new WeakMap(), _BetaToolRunner_instances = /* @__PURE__ */ new WeakSet(), _BetaToolRunner_checkAndCompact = async function _BetaToolRunner_checkAndCompact() {
		const compactionControl = __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.compactionControl;
		if (!compactionControl || !compactionControl.enabled) return false;
		let tokensUsed = 0;
		if (__classPrivateFieldGet(this, _BetaToolRunner_message, "f") !== void 0) try {
			const message = await __classPrivateFieldGet(this, _BetaToolRunner_message, "f");
			tokensUsed = message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0) + message.usage.output_tokens;
		} catch {
			return false;
		}
		const threshold = compactionControl.contextTokenThreshold ?? 1e5;
		if (tokensUsed < threshold) return false;
		const model = compactionControl.model ?? __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.model;
		const summaryPrompt = compactionControl.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT;
		const messages = __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages;
		if (messages[messages.length - 1].role === "assistant") {
			const lastMessage = messages[messages.length - 1];
			if (Array.isArray(lastMessage.content)) {
				const nonToolBlocks = lastMessage.content.filter((block) => block.type !== "tool_use");
				if (nonToolBlocks.length === 0) messages.pop();
				else lastMessage.content = nonToolBlocks;
			}
		}
		const response = await this.client.beta.messages.create({
			model,
			messages: [...messages, {
				role: "user",
				content: [{
					type: "text",
					text: summaryPrompt
				}]
			}],
			max_tokens: __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.max_tokens
		}, {
			signal: __classPrivateFieldGet(this, _BetaToolRunner_options, "f").signal,
			headers: buildHeaders([__classPrivateFieldGet(this, _BetaToolRunner_options, "f").headers, helperHeader("compaction")])
		});
		if (response.content[0]?.type !== "text") throw new AnthropicError("Expected text response for compaction");
		__classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages = [{
			role: "user",
			content: response.content
		}];
		return true;
	}, Symbol.asyncIterator)]() {
		var _a;
		if (__classPrivateFieldGet(this, _BetaToolRunner_consumed, "f")) throw new AnthropicError("Cannot iterate over a consumed stream");
		__classPrivateFieldSet(this, _BetaToolRunner_consumed, true, "f");
		__classPrivateFieldSet(this, _BetaToolRunner_mutated, true, "f");
		__classPrivateFieldSet(this, _BetaToolRunner_toolResponse, void 0, "f");
		try {
			while (true) {
				let stream;
				try {
					if (__classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.max_iterations && __classPrivateFieldGet(this, _BetaToolRunner_iterationCount, "f") >= __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.max_iterations) break;
					__classPrivateFieldSet(this, _BetaToolRunner_mutated, false, "f");
					__classPrivateFieldSet(this, _BetaToolRunner_toolResponse, void 0, "f");
					__classPrivateFieldSet(this, _BetaToolRunner_iterationCount, (_a = __classPrivateFieldGet(this, _BetaToolRunner_iterationCount, "f"), _a++, _a), "f");
					__classPrivateFieldSet(this, _BetaToolRunner_message, void 0, "f");
					const { max_iterations, compactionControl, ...params } = __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params;
					if (params.stream) {
						stream = this.client.beta.messages.stream({ ...params }, __classPrivateFieldGet(this, _BetaToolRunner_options, "f"));
						__classPrivateFieldSet(this, _BetaToolRunner_message, stream.finalMessage(), "f");
						__classPrivateFieldGet(this, _BetaToolRunner_message, "f").catch(() => {});
						yield stream;
					} else {
						__classPrivateFieldSet(this, _BetaToolRunner_message, this.client.beta.messages.create({
							...params,
							stream: false
						}, __classPrivateFieldGet(this, _BetaToolRunner_options, "f")), "f");
						yield __classPrivateFieldGet(this, _BetaToolRunner_message, "f");
					}
					if (!await __classPrivateFieldGet(this, _BetaToolRunner_instances, "m", _BetaToolRunner_checkAndCompact).call(this)) {
						if (!__classPrivateFieldGet(this, _BetaToolRunner_mutated, "f")) {
							const message = await __classPrivateFieldGet(this, _BetaToolRunner_message, "f");
							const nextStep = determineNextStepFromStopReason(message.stop_reason);
							__classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages.push({
								role: message.role,
								content: message.content
							});
							const { container } = __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params;
							if (message.container) {
								if (container == null) __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.container = message.container.id;
								else if (typeof container === "object" && container.id == null) __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.container = {
									...container,
									id: message.container.id
								};
							}
							if (nextStep === "stop") break;
							if (nextStep === "resume") continue;
						}
						const toolMessage = await __classPrivateFieldGet(this, _BetaToolRunner_instances, "m", _BetaToolRunner_generateToolResponse).call(this, __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages.at(-1));
						if (toolMessage) __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages.push(toolMessage);
						else if (!__classPrivateFieldGet(this, _BetaToolRunner_mutated, "f")) break;
					}
				} finally {
					if (stream) stream.abort();
				}
			}
			if (!__classPrivateFieldGet(this, _BetaToolRunner_message, "f")) throw new AnthropicError("ToolRunner concluded without a message from the server");
			__classPrivateFieldGet(this, _BetaToolRunner_completion, "f").resolve(await __classPrivateFieldGet(this, _BetaToolRunner_message, "f"));
		} catch (error) {
			__classPrivateFieldSet(this, _BetaToolRunner_consumed, false, "f");
			__classPrivateFieldGet(this, _BetaToolRunner_completion, "f").promise.catch(() => {});
			__classPrivateFieldGet(this, _BetaToolRunner_completion, "f").reject(error);
			__classPrivateFieldSet(this, _BetaToolRunner_completion, promiseWithResolvers(), "f");
			throw error;
		}
	}
	setMessagesParams(paramsOrMutator) {
		if (typeof paramsOrMutator === "function") __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params = paramsOrMutator(__classPrivateFieldGet(this, _BetaToolRunner_state, "f").params);
		else __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params = paramsOrMutator;
		__classPrivateFieldSet(this, _BetaToolRunner_mutated, true, "f");
		__classPrivateFieldSet(this, _BetaToolRunner_toolResponse, void 0, "f");
	}
	setRequestOptions(optionsOrMutator) {
		if (typeof optionsOrMutator === "function") __classPrivateFieldSet(this, _BetaToolRunner_options, optionsOrMutator(__classPrivateFieldGet(this, _BetaToolRunner_options, "f")), "f");
		else __classPrivateFieldSet(this, _BetaToolRunner_options, {
			...__classPrivateFieldGet(this, _BetaToolRunner_options, "f"),
			...optionsOrMutator
		}, "f");
	}
	/**
	* Get the tool response for the last message from the assistant.
	* Avoids redundant tool executions by caching results.
	*
	* @returns A promise that resolves to a BetaMessageParam containing tool results, or null if no tools need to be executed
	*
	* @example
	* const toolResponse = await runner.generateToolResponse();
	* if (toolResponse) {
	*   console.log('Tool results:', toolResponse.content);
	* }
	*/
	async generateToolResponse(signal = __classPrivateFieldGet(this, _BetaToolRunner_options, "f").signal) {
		const message = await __classPrivateFieldGet(this, _BetaToolRunner_message, "f") ?? this.params.messages.at(-1);
		if (!message) return null;
		return __classPrivateFieldGet(this, _BetaToolRunner_instances, "m", _BetaToolRunner_generateToolResponse).call(this, message, signal);
	}
	/**
	* Wait for the async iterator to complete. This works even if the async iterator hasn't yet started, and
	* will wait for an instance to start and go to completion.
	*
	* @returns A promise that resolves to the final BetaMessage when the iterator completes
	*
	* @example
	* // Start consuming the iterator
	* for await (const message of runner) {
	*   console.log('Message:', message.content);
	* }
	*
	* // Meanwhile, wait for completion from another part of the code
	* const finalMessage = await runner.done();
	* console.log('Final response:', finalMessage.content);
	*/
	done() {
		return __classPrivateFieldGet(this, _BetaToolRunner_completion, "f").promise;
	}
	/**
	* Returns a promise indicating that the stream is done. Unlike .done(), this will eagerly read the stream:
	* * If the iterator has not been consumed, consume the entire iterator and return the final message from the
	* assistant.
	* * If the iterator has been consumed, waits for it to complete and returns the final message.
	*
	* @returns A promise that resolves to the final BetaMessage from the conversation
	* @throws {AnthropicError} If no messages were processed during the conversation
	*
	* @example
	* const finalMessage = await runner.runUntilDone();
	* console.log('Final response:', finalMessage.content);
	*/
	async runUntilDone() {
		if (!__classPrivateFieldGet(this, _BetaToolRunner_consumed, "f")) for await (const _ of this);
		return this.done();
	}
	/**
	* Get the current parameters being used by the ToolRunner.
	*
	* @returns A readonly view of the current ToolRunnerParams
	*
	* @example
	* const currentParams = runner.params;
	* console.log('Current model:', currentParams.model);
	* console.log('Message count:', currentParams.messages.length);
	*/
	get params() {
		return __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params;
	}
	/**
	* Add one or more messages to the conversation history.
	*
	* @param messages - One or more BetaMessageParam objects to add to the conversation
	*
	* @example
	* runner.pushMessages(
	*   { role: 'user', content: 'Also, what about the weather in NYC?' }
	* );
	*
	* @example
	* // Adding multiple messages
	* runner.pushMessages(
	*   { role: 'user', content: 'What about NYC?' },
	*   { role: 'user', content: 'And Boston?' }
	* );
	*/
	pushMessages(...messages) {
		this.setMessagesParams((params) => ({
			...params,
			messages: [...params.messages, ...messages]
		}));
	}
	/**
	* Makes the ToolRunner directly awaitable, equivalent to calling .runUntilDone()
	* This allows using `await runner` instead of `await runner.runUntilDone()`
	*/
	then(onfulfilled, onrejected) {
		return this.runUntilDone().then(onfulfilled, onrejected);
	}
};
_BetaToolRunner_generateToolResponse = async function _BetaToolRunner_generateToolResponse(lastMessage, signal = __classPrivateFieldGet(this, _BetaToolRunner_options, "f").signal) {
	if (__classPrivateFieldGet(this, _BetaToolRunner_toolResponse, "f") !== void 0) return __classPrivateFieldGet(this, _BetaToolRunner_toolResponse, "f");
	__classPrivateFieldSet(this, _BetaToolRunner_toolResponse, generateToolResponse(__classPrivateFieldGet(this, _BetaToolRunner_state, "f").params, lastMessage, {
		...__classPrivateFieldGet(this, _BetaToolRunner_options, "f"),
		signal
	}), "f");
	return __classPrivateFieldGet(this, _BetaToolRunner_toolResponse, "f");
};
async function generateToolResponse(params, lastMessage = params.messages.at(-1), requestOptions) {
	if (!lastMessage || lastMessage.role !== "assistant" || !lastMessage.content || typeof lastMessage.content === "string") return null;
	const toolUseBlocks = lastMessage.content.filter((content) => content.type === "tool_use");
	if (toolUseBlocks.length === 0) return null;
	const available = availableToolNames(params);
	return {
		role: "user",
		content: await Promise.all(toolUseBlocks.map(async (toolUse) => {
			const tool = params.tools.find((t) => ("name" in t ? t.name : "mcp_server_name" in t ? t.mcp_server_name : t.type) === toolUse.name);
			if (!tool || !("run" in tool) || !available.has(toolUse.name)) return toolNotFoundResult(toolUse);
			try {
				let input = toolUse.input;
				if ("parse" in tool && tool.parse) input = tool.parse(input);
				const result = await tool.run(input, {
					toolUse,
					toolUseBlock: toolUse,
					signal: requestOptions?.signal
				});
				return {
					type: "tool_result",
					tool_use_id: toolUse.id,
					content: result
				};
			} catch (error) {
				return {
					type: "tool_result",
					tool_use_id: toolUse.id,
					content: error instanceof ToolError ? error.content : `Error: ${error instanceof Error ? error.message : String(error)}`,
					is_error: true
				};
			}
		}))
	};
}
function toolNotFoundResult(toolUse) {
	return {
		type: "tool_result",
		tool_use_id: toolUse.id,
		content: `Error: Tool '${toolUse.name}' not found`,
		is_error: true
	};
}
/**
* Computes the names of locally runnable tools that are still available for the assistant
* turn being answered, by folding `tool_removal` / `tool_addition` blocks from the
* `role: "system"` messages over the runnable tools. The assistant turn being answered is
* terminal-or-absent and only `system` messages are inspected, so folding the whole current
* history is exactly folding the messages preceding that turn — call this before appending
* anything after it. MCP references are ignored — those tools are executed server-side and
* never dispatched by this runner.
*/
function availableToolNames(params) {
	const available = /* @__PURE__ */ new Set();
	for (const tool of params.tools) if ("run" in tool) available.add(tool.name);
	for (const message of params.messages) {
		if (message.role !== "system" || typeof message.content === "string") continue;
		for (const block of message.content) applyToolChange(block, available);
	}
	return available;
}
function applyToolChange(block, available) {
	switch (block.type) {
		case "tool_removal":
		case "tool_addition": applyToolReference(block, available);
	}
}
function applyToolReference(block, available) {
	const name = referencedToolName(block.tool);
	if (name === void 0) return;
	if (block.type === "tool_removal") available.delete(name);
	else available.add(name);
}
function referencedToolName(ref) {
	switch (ref.type) {
		case "tool_reference": return ref.name;
		default: return;
	}
}
/**
* Sorts every stop reason into one of three buckets: `run_tools` turns run their client tool
* calls and continue the loop; `resume` turns are sent back unchanged so the server continues
* them; `stop` turns end the loop without running any tool calls.
*/
function determineNextStepFromStopReason(stopReason) {
	if (stopReason === null) return "stop";
	switch (stopReason) {
		case "tool_use": return "run_tools";
		case "pause_turn":
		case "compaction": return "resume";
		case "end_turn":
		case "stop_sequence":
		case "max_tokens":
		case "model_context_window_exceeded":
		case "refusal": return "stop";
		default: return "stop";
	}
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.mjs
const DEPRECATED_MODELS$1 = {};
const MODELS_TO_WARN_WITH_THINKING_ENABLED$1 = ["claude-mythos-preview", "claude-opus-4-6"];
var Messages$1 = class extends APIResource {
	constructor() {
		super(...arguments);
		this.batches = new Batches$1(this._client);
	}
	create(params, options) {
		const modifiedParams = transformOutputFormat(params);
		const { betas, user_profile_id, ...body } = modifiedParams;
		if (body.model in DEPRECATED_MODELS$1) console.warn(`The model '${body.model}' is deprecated and will reach end-of-life on ${DEPRECATED_MODELS$1[body.model]}\nPlease migrate to a newer model. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.`);
		if (MODELS_TO_WARN_WITH_THINKING_ENABLED$1.includes(body.model) && body.thinking && body.thinking.type === "enabled") console.warn(`Using Claude with ${body.model} and 'thinking.type=enabled' is deprecated. Use 'thinking.type=adaptive' instead which results in better model performance in our testing: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking`);
		let timeout = options?.timeout ?? this._client._options.timeout;
		if (!body.stream && timeout == null) {
			const maxNonstreamingTokens = MODEL_NONSTREAMING_TOKENS[body.model] ?? void 0;
			timeout = this._client.calculateNonstreamingTimeout(body.max_tokens, maxNonstreamingTokens);
		}
		const helperHeader = stainlessHelperHeader(body.tools, body.messages);
		return this._client.post("/v1/messages?beta=true", {
			body,
			timeout: timeout ?? 6e5,
			...options,
			headers: buildHeaders([
				{
					...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0,
					...user_profile_id != null ? { "anthropic-user-profile-id": user_profile_id } : void 0
				},
				helperHeader,
				options?.headers
			]),
			stream: modifiedParams.stream ?? false
		});
	}
	/**
	* Send a structured list of input messages with text and/or image content, along with an expected `output_format` and
	* the response will be automatically parsed and available in the `parsed_output` property of the message.
	*
	* @example
	* ```ts
	* const message = await client.beta.messages.parse({
	*   model: 'claude-3-5-sonnet-20241022',
	*   max_tokens: 1024,
	*   messages: [{ role: 'user', content: 'What is 2+2?' }],
	*   output_format: zodOutputFormat(z.object({ answer: z.number() }), 'math'),
	* });
	*
	* console.log(message.parsed_output?.answer); // 4
	* ```
	*/
	parse(params, options) {
		options = {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...params.betas ?? [], "structured-outputs-2025-12-15"].toString() }, options?.headers])
		};
		return this.create(params, options).then((message) => parseBetaMessage(message, params, { logger: this._client.logger ?? console }));
	}
	/**
	* Create a Message stream
	*/
	stream(body, options) {
		return BetaMessageStream.createMessage(this, body, options);
	}
	/**
	* Count the number of tokens in a Message.
	*
	* The Token Count API can be used to count the number of tokens in a Message,
	* including tools, images, and documents, without creating it.
	*
	* Learn more about token counting in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/token-counting)
	*
	* @example
	* ```ts
	* const betaMessageTokensCount =
	*   await client.beta.messages.countTokens({
	*     messages: [{ content: 'Hello, world', role: 'user' }],
	*     model: 'claude-opus-5',
	*   });
	* ```
	*/
	countTokens(params, options) {
		const { betas, user_profile_id, ...body } = transformOutputFormat(params);
		return this._client.post("/v1/messages/count_tokens?beta=true", {
			body,
			...options,
			headers: buildHeaders([{
				"anthropic-beta": [...betas ?? [], "token-counting-2024-11-01"].toString(),
				...user_profile_id != null ? { "anthropic-user-profile-id": user_profile_id } : void 0
			}, options?.headers])
		});
	}
	toolRunner(body, options) {
		return new BetaToolRunner(this._client, body, options);
	}
};
/**
* Transform deprecated output_format to output_config.format
* Returns a modified copy of the params without mutating the original
*/
function transformOutputFormat(params) {
	if (!params.output_format) return params;
	if (params.output_config?.format) throw new AnthropicError("Both output_format and output_config.format were provided. Please use only output_config.format (output_format is deprecated).");
	const { output_format, ...rest } = params;
	return {
		...rest,
		output_config: {
			...params.output_config,
			format: output_format
		}
	};
}
Messages$1.Batches = Batches$1;
Messages$1.BetaToolRunner = BetaToolRunner;
Messages$1.ToolError = ToolError;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/api-keys.mjs
var APIKeys = class extends APIResource {
	/**
	* Get API Key
	*
	* @example
	* ```ts
	* const betaAPIKey =
	*   await client.beta.organization.apiKeys.retrieve(
	*     'api_key_id',
	*   );
	* ```
	*/
	retrieve(apiKeyID, options) {
		return this._client.get(path`/v1/organizations/api_keys/${apiKeyID}?beta=true`, options);
	}
	/**
	* Update API Key
	*
	* @example
	* ```ts
	* const betaAPIKey =
	*   await client.beta.organization.apiKeys.update(
	*     'api_key_id',
	*   );
	* ```
	*/
	update(apiKeyID, body, options) {
		return this._client.post(path`/v1/organizations/api_keys/${apiKeyID}?beta=true`, {
			body,
			...options
		});
	}
	/**
	* List API Keys
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaAPIKey of client.beta.organization.apiKeys.list()) {
	*   // ...
	* }
	* ```
	*/
	list(query = {}, options) {
		return this._client.getAPIList("/v1/organizations/api_keys?beta=true", Page, {
			query,
			...options
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/compliance-settings.mjs
var ComplianceSettings = class extends APIResource {
	/**
	* Retrieve your organization's Compliance Settings.
	*
	* Compliance Settings is a singleton resource: there is exactly one per
	* organization, addressed without an identifier. The `state` field reflects
	* whether the Compliance API is enabled. An organization with a parent
	* organization reads the state inherited from the parent's configuration.
	*
	* @example
	* ```ts
	* const betaComplianceSettings =
	*   await client.beta.organization.complianceSettings.retrieve();
	* ```
	*/
	retrieve(options) {
		return this._client.get("/v1/organizations/compliance_settings?beta=true", options);
	}
	/**
	* Update your organization's Compliance Settings.
	*
	* Setting `state` to `enabled` turns on the Compliance API and begins capturing
	* organization activity events. Setting it to `disabled` turns both off. `state`
	* reflects whether the Compliance API is enabled.
	*
	* A request that sets `state` to its current value succeeds and leaves the
	* resource unchanged. A `disabled` request stays in effect until a later `enabled`
	* request or the organization's next provisioning action that enables Access
	* Transparency: enabling Access Transparency also enables the Compliance API,
	* which serves its activity events, so such provisioning (including re-runs)
	* re-enables the Compliance API even after a `disabled` request. Automated
	* provisioning never disables compliance settings.
	*
	* @example
	* ```ts
	* const betaComplianceSettings =
	*   await client.beta.organization.complianceSettings.update({
	*     state: { type: 'enabled' },
	*   });
	* ```
	*/
	update(body, options) {
		return this._client.post("/v1/organizations/compliance_settings?beta=true", {
			body,
			...options
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/external-keys.mjs
var ExternalKeys = class extends APIResource {
	/**
	* Create an external key config owned by the caller's organization.
	*
	* @example
	* ```ts
	* const betaExternalKey =
	*   await client.beta.organization.externalKeys.create({
	*     provider_config: {
	*       kms_arn:
	*         'arn:aws:kms:us-east-1:111122223333:key/abcd1234-5678-90ab-cdef-000011112222',
	*       type: 'aws',
	*     },
	*   });
	* ```
	*/
	create(body, options) {
		return this._client.post("/v1/organizations/external_keys?beta=true", {
			body,
			...options
		});
	}
	/**
	* Retrieve a single external key config in the caller's organization by ID.
	*
	* @example
	* ```ts
	* const betaExternalKey =
	*   await client.beta.organization.externalKeys.retrieve(
	*     'external_key_id',
	*   );
	* ```
	*/
	retrieve(externalKeyID, options) {
		return this._client.get(path`/v1/organizations/external_keys/${externalKeyID}?beta=true`, options);
	}
	/**
	* Partially update an external key config. Omitted fields are left unchanged.
	*
	* `display_name` is always editable. `geo` and `provider_config` cannot be changed
	* once any workspace references this config, because previously encrypted data
	* requires the original key identity to decrypt.
	*
	* @example
	* ```ts
	* const betaExternalKey =
	*   await client.beta.organization.externalKeys.update(
	*     'external_key_id',
	*   );
	* ```
	*/
	update(externalKeyID, body, options) {
		return this._client.post(path`/v1/organizations/external_keys/${externalKeyID}?beta=true`, {
			body,
			...options
		});
	}
	/**
	* List external key configs in the caller's organization.
	*
	* Results are ordered by creation time (newest first). Use the `next_page` cursor
	* from the response to fetch subsequent pages.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaExternalKey of client.beta.organization.externalKeys.list()) {
	*   // ...
	* }
	* ```
	*/
	list(query = {}, options) {
		return this._client.getAPIList("/v1/organizations/external_keys?beta=true", PageCursor, {
			query,
			...options
		});
	}
	/**
	* Delete an external key config.
	*
	* The request is rejected if any workspace still references this config.
	*
	* @example
	* ```ts
	* const externalKey =
	*   await client.beta.organization.externalKeys.delete(
	*     'external_key_id',
	*   );
	* ```
	*/
	delete(externalKeyID, options) {
		return this._client.delete(path`/v1/organizations/external_keys/${externalKeyID}?beta=true`, options);
	}
	/**
	* Validate an external key config against the customer's KMS.
	*
	* Anthropic performs an encrypt/decrypt roundtrip against the configured KMS key
	* and waits up to 30 seconds for the result. The response status is `success` if
	* the roundtrip succeeded, or `failure` with an error message if it failed or
	* timed out.
	*
	* @example
	* ```ts
	* const response =
	*   await client.beta.organization.externalKeys.validate(
	*     'external_key_id',
	*   );
	* ```
	*/
	validate(externalKeyID, options) {
		return this._client.post(path`/v1/organizations/external_keys/${externalKeyID}/validate?beta=true`, options);
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/invites.mjs
var Invites = class extends APIResource {
	/**
	* Invite a user to join the organization by email.
	*
	* On plans that draw members from a finite pool of purchased seats, the invite
	* automatically consumes a seat from the lowest tier with availability; there is
	* no seat-tier parameter. When no seat is free the request fails with a 400 error
	* rather than purchasing a seat.
	*
	* @example
	* ```ts
	* const betaOrganizationInvite =
	*   await client.beta.organization.invites.create({
	*     email: 'user@emaildomain.com',
	*     role: 'user',
	*   });
	* ```
	*/
	create(body, options) {
		return this._client.post("/v1/organizations/invites?beta=true", {
			body,
			...options
		});
	}
	/**
	* Retrieve an invite by ID.
	*
	* @example
	* ```ts
	* const betaOrganizationInvite =
	*   await client.beta.organization.invites.retrieve(
	*     'invite_id',
	*   );
	* ```
	*/
	retrieve(inviteID, options) {
		return this._client.get(path`/v1/organizations/invites/${inviteID}?beta=true`, options);
	}
	/**
	* List the organization's invites.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaOrganizationInvite of client.beta.organization.invites.list()) {
	*   // ...
	* }
	* ```
	*/
	list(query = {}, options) {
		return this._client.getAPIList("/v1/organizations/invites?beta=true", Page, {
			query,
			...options
		});
	}
	/**
	* Delete a pending invite.
	*
	* @example
	* ```ts
	* const invite =
	*   await client.beta.organization.invites.delete(
	*     'invite_id',
	*   );
	* ```
	*/
	delete(inviteID, options) {
		return this._client.delete(path`/v1/organizations/invites/${inviteID}?beta=true`, options);
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/rate-limits.mjs
var RateLimits$1 = class extends APIResource {
	/**
	* List Messages API rate limits for your organization.
	*
	* Each entry corresponds to one rate-limit group (either a model family or an
	* API-surface category such as the Files API or Message Batches) and contains the
	* set of limiter values that apply to it.
	*
	* When `limit` is omitted, every matching entry is returned in a single page; when
	* `limit` truncates the result, follow `next_page` to fetch the remaining entries.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaOrganizationRateLimit of client.beta.organization.rateLimits.list()) {
	*   // ...
	* }
	* ```
	*/
	list(query = {}, options) {
		return this._client.getAPIList("/v1/organizations/rate_limits?beta=true", PageCursor, {
			query,
			...options
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/users.mjs
var Users = class extends APIResource {
	/**
	* Retrieve a member of the organization by user ID.
	*
	* @example
	* ```ts
	* const betaOrganizationUser =
	*   await client.beta.organization.users.retrieve('user_id');
	* ```
	*/
	retrieve(userID, options) {
		return this._client.get(path`/v1/organizations/users/${userID}?beta=true`, options);
	}
	/**
	* Update a member's organization role.
	*
	* @example
	* ```ts
	* const betaOrganizationUser =
	*   await client.beta.organization.users.update('user_id', {
	*     role: 'user',
	*   });
	* ```
	*/
	update(userID, body, options) {
		return this._client.post(path`/v1/organizations/users/${userID}?beta=true`, {
			body,
			...options
		});
	}
	/**
	* List the organization's members.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaOrganizationUser of client.beta.organization.users.list()) {
	*   // ...
	* }
	* ```
	*/
	list(query = {}, options) {
		return this._client.getAPIList("/v1/organizations/users?beta=true", Page, {
			query,
			...options
		});
	}
	/**
	* Remove a member from the organization.
	*
	* @example
	* ```ts
	* const user = await client.beta.organization.users.remove(
	*   'user_id',
	* );
	* ```
	*/
	remove(userID, options) {
		return this._client.delete(path`/v1/organizations/users/${userID}?beta=true`, options);
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/federation/issuers.mjs
var Issuers = class extends APIResource {
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Register an OIDC issuer that Anthropic will trust for workload identity
	* federation in your organization.
	*
	* The `jwks` field controls how the issuer's signing keys are obtained and takes
	* one of three shapes selected by `type`: `discovery` (resolve keys through OIDC
	* discovery), `explicit_url` (fetch keys from a fixed JWKS URL), or `inline`
	* (provide a static key set). When `jwks.type` is `discovery` and no
	* `discovery_base` is set, the issuer URL must be publicly reachable over HTTPS so
	* Anthropic can fetch the discovery document; for `explicit_url` and `inline`
	* modes the issuer URL is only matched as the JWT's `iss` claim and is not
	* fetched.
	*
	* @example
	* ```ts
	* const betaFederationIssuer =
	*   await client.beta.organization.federation.issuers.create({
	*     issuer_url: 'x',
	*     name: 'x',
	*   });
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/organizations/federation_issuers?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Retrieve a federation issuer by its ID (`fdis_...`).
	*
	* @example
	* ```ts
	* const betaFederationIssuer =
	*   await client.beta.organization.federation.issuers.retrieve(
	*     'federation_issuer_id',
	*   );
	* ```
	*/
	retrieve(federationIssuerID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/organizations/federation_issuers/${federationIssuerID}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Partially update a federation issuer.
	*
	* Setting `jwks` replaces the full JWKS shape at once. Archived issuers cannot be
	* updated; this returns 400. Create a new issuer instead.
	*
	* Updating an issuer that backs a rule with a scope outside `workspace:developer`
	* or `workspace:inference` requires a Console session.
	*
	* @example
	* ```ts
	* const betaFederationIssuer =
	*   await client.beta.organization.federation.issuers.update(
	*     'federation_issuer_id',
	*   );
	* ```
	*/
	update(federationIssuerID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/organizations/federation_issuers/${federationIssuerID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* List federation issuers in your organization.
	*
	* Archived issuers are excluded unless `include_archived=true`.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaFederationIssuer of client.beta.organization.federation.issuers.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/organizations/federation_issuers?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Archive a federation issuer.
	*
	* Idempotent; re-archiving returns the issuer with its original `archived_at`.
	* Rejected with 400 if any live (non-archived) federation rule still references
	* the issuer; archive those rules first (a rule's issuer cannot be changed), or
	* recreate them against another issuer.
	*
	* @example
	* ```ts
	* const betaFederationIssuer =
	*   await client.beta.organization.federation.issuers.archive(
	*     'federation_issuer_id',
	*   );
	* ```
	*/
	archive(federationIssuerID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/organizations/federation_issuers/${federationIssuerID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/federation/rules/workspaces.mjs
var Workspaces$2 = class extends APIResource {
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* List workspaces where this federation rule is enabled.
	*
	* Returns all workspace enablements in a single response; the `limit` and `page`
	* parameters are accepted but have no effect, and `next_page` is always `null`.
	* Returns explicit per-workspace enablements only; for rules with
	* `applies_to_all_workspaces` or a legacy single `workspace_id`, check those
	* fields on the rule itself.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaFederationRuleWorkspace of client.beta.organization.federation.rules.workspaces.list(
	*   'federation_rule_id',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(federationRuleID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/organizations/federation_rules/${federationRuleID}/workspaces?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Enable a federation rule for a workspace.
	*
	* Idempotent; re-enabling returns the existing enablement. The rule and workspace
	* must both belong to your organization. Membership of the rule's target service
	* account in this workspace is not checked at enablement: token exchange into this
	* workspace is rejected unless the target is a member (it is implicitly a member
	* of the default workspace). Archived rules are rejected with 400. OAuth callers
	* may only manage rules whose `oauth_scope` is `workspace:developer` or
	* `workspace:inference`; other scopes require a Console session.
	*
	* @example
	* ```ts
	* const betaFederationRuleWorkspace =
	*   await client.beta.organization.federation.rules.workspaces.add(
	*     'federation_rule_id',
	*     { workspace_id: 'workspace_id' },
	*   );
	* ```
	*/
	add(federationRuleID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/organizations/federation_rules/${federationRuleID}/workspaces?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Disable a federation rule for a workspace.
	*
	* Idempotent; succeeds even if the enablement was already removed. OAuth callers
	* may only manage rules whose `oauth_scope` is `workspace:developer` or
	* `workspace:inference`; other scopes require a Console session.
	*
	* @example
	* ```ts
	* const workspace =
	*   await client.beta.organization.federation.rules.workspaces.remove(
	*     'workspace_id',
	*     { federation_rule_id: 'federation_rule_id' },
	*   );
	* ```
	*/
	remove(workspaceID, params, options) {
		const { federation_rule_id, betas } = params;
		return this._client.delete(path`/v1/organizations/federation_rules/${federation_rule_id}/workspaces/${workspaceID}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/federation/rules/rules.mjs
var Rules = class extends APIResource {
	constructor() {
		super(...arguments);
		this.workspaces = new Workspaces$2(this._client);
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Create a federation rule owned by your organization.
	*
	* The referenced issuer and the target service account must already exist in the
	* same organization; invalid references are rejected with a 400 error. The
	* workspace reference is validated. Membership is not checked at rule creation:
	* token exchange resolves a single enabled workspace per call and is rejected
	* unless the target service account is a member of that workspace (it is
	* implicitly a member of the default workspace). Rules on well-known shared
	* issuers (GitHub Actions, GitLab, Buildkite, Terraform Cloud, Google) must
	* constrain tenant identity via an identity-bearing claim, a tenant-pinning
	* subject prefix (such as `repo:YOUR_ORG/...`), or a CEL condition referencing one
	* of those identity claims (e.g. `claims.repository_owner`). OAuth callers may
	* only manage rules whose `oauth_scope` is `workspace:developer` or
	* `workspace:inference`; other scopes require a Console session.
	*
	* @example
	* ```ts
	* const betaFederationRule =
	*   await client.beta.organization.federation.rules.create({
	*     issuer_id: 'issuer_id',
	*     match: {},
	*     name: 'x',
	*     oauth_scope: 'x',
	*     target: {
	*       service_account_id: 'svac_01SDCCSbTxrXDpWc1phhtcfK',
	*       type: 'service_account',
	*     },
	*   });
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/organizations/federation_rules?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Retrieve a federation rule by its ID (`fdrl_...`).
	*
	* @example
	* ```ts
	* const betaFederationRule =
	*   await client.beta.organization.federation.rules.retrieve(
	*     'federation_rule_id',
	*   );
	* ```
	*/
	retrieve(federationRuleID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/organizations/federation_rules/${federationRuleID}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Partially update a federation rule.
	*
	* `issuer_id` is immutable. `match` and `target` are replaced as whole objects
	* when set. Referenced service accounts and workspaces must exist in your
	* organization; invalid references are rejected with a 400 error. Archived rules
	* cannot be updated; this returns 400. Create a new rule instead. Rules on
	* well-known shared issuers (GitHub Actions, GitLab, Buildkite, Terraform Cloud,
	* Google) must constrain tenant identity via an identity-bearing claim, a
	* tenant-pinning subject prefix (such as `repo:YOUR_ORG/...`), or a CEL condition
	* referencing one of those identity claims (e.g. `claims.repository_owner`). On
	* these issuers the requirement is re-checked on every update; if an existing
	* rule's stored match does not yet constrain tenant identity, any update (even a
	* rename or description change) must also supply a conforming `match` in the same
	* request. OAuth callers may only manage rules whose `oauth_scope` is
	* `workspace:developer` or `workspace:inference`; other scopes require a Console
	* session.
	*
	* @example
	* ```ts
	* const betaFederationRule =
	*   await client.beta.organization.federation.rules.update(
	*     'federation_rule_id',
	*   );
	* ```
	*/
	update(federationRuleID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/organizations/federation_rules/${federationRuleID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* List federation rules in your organization.
	*
	* Optionally filter by issuer with `issuer_id`. Archived rules are excluded unless
	* `include_archived=true`.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaFederationRule of client.beta.organization.federation.rules.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/organizations/federation_rules?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Archive a federation rule.
	*
	* Token exchange through this rule stops immediately. Idempotent; re-archiving
	* returns the rule with its original `archived_at`. Archiving clears the rule's
	* workspace targeting (`workspace_id` and `workspace_ids` are emptied). Tokens
	* already minted before archive remain valid until they expire. OAuth callers may
	* only manage rules whose `oauth_scope` is `workspace:developer` or
	* `workspace:inference`; other scopes require a Console session.
	*
	* @example
	* ```ts
	* const betaFederationRule =
	*   await client.beta.organization.federation.rules.archive(
	*     'federation_rule_id',
	*   );
	* ```
	*/
	archive(federationRuleID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/organizations/federation_rules/${federationRuleID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
};
Rules.Workspaces = Workspaces$2;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/federation/federation.mjs
var Federation = class extends APIResource {
	constructor() {
		super(...arguments);
		this.issuers = new Issuers(this._client);
		this.rules = new Rules(this._client);
	}
};
Federation.Issuers = Issuers;
Federation.Rules = Rules;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/service-accounts/workspaces.mjs
var Workspaces$1 = class extends APIResource {
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* List the workspaces a service account is a member of.
	*
	* Each entry includes the service account's `workspace_role` in that workspace.
	* Use `limit` and the `next_page` cursor to paginate. When the service account has
	* no explicit default-workspace membership, the implicit (`implicit: true`)
	* membership is returned as the first entry on the first page; with `limit=1` the
	* first page may return up to 2 entries (the implicit entry plus one explicit
	* membership) so a pagination cursor can be derived. Memberships are returned only
	* while the service account is active. Without a `page` cursor, an archived
	* service account returns an empty list. A `page` cursor that does not match an
	* active membership returns a 400 invalid-request error. A cursor stops matching
	* when the membership is removed, the workspace is deleted, or the service account
	* is archived. Restart pagination from the first page to recover.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaServiceAccountWorkspaceMember of client.beta.organization.serviceAccounts.workspaces.list(
	*   'service_account_id',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(serviceAccountID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/organizations/service_accounts/${serviceAccountID}/workspaces?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Add a service account to a workspace with the given `workspace_role`.
	*
	* Mirror of `POST /workspaces/{workspace_id}/service_accounts`, addressed from the
	* service-account side; both create the same membership. If the service account is
	* already an explicit member of the workspace, its `workspace_role` is replaced
	* with the value supplied here. Archived workspaces return 400. Archived service
	* accounts cannot be added and are rejected.
	*
	* @example
	* ```ts
	* const betaServiceAccountWorkspaceMember =
	*   await client.beta.organization.serviceAccounts.workspaces.add(
	*     'service_account_id',
	*     {
	*       workspace_id: 'workspace_id',
	*       workspace_role: 'workspace_admin',
	*     },
	*   );
	* ```
	*/
	add(serviceAccountID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/organizations/service_accounts/${serviceAccountID}/workspaces?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Remove a service account from a workspace.
	*
	* Mirror of
	* `DELETE /workspaces/{workspace_id}/service_accounts/{service_account_id}`,
	* addressed from the service-account side. Removal is idempotent (returns 200 even
	* if the membership was already removed). A DELETE against the implicit
	* default-workspace membership returns 200 but is a no-op and the membership
	* persists; deleting an explicit default-workspace row reverts to the implicit
	* `workspace_user` membership. Archived workspaces return 400.
	*
	* @example
	* ```ts
	* const workspace =
	*   await client.beta.organization.serviceAccounts.workspaces.remove(
	*     'workspace_id',
	*     { service_account_id: 'service_account_id' },
	*   );
	* ```
	*/
	remove(workspaceID, params, options) {
		const { service_account_id, betas } = params;
		return this._client.delete(path`/v1/organizations/service_accounts/${service_account_id}/workspaces/${workspaceID}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/service-accounts/service-accounts.mjs
var ServiceAccounts$1 = class extends APIResource {
	constructor() {
		super(...arguments);
		this.workspaces = new Workspaces$1(this._client);
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Create a service account.
	*
	* A service account is a named workload identity that federation rules target.
	* `organization_role` is `developer` (default) or `admin`; a rule may only be
	* created or retargeted to grant `org:admin` scope when the target's
	* `organization_role` is `admin`. Creating an `admin`-role service account
	* requires an interactive credential (a user OAuth token or a Console session) — a
	* workload may only create `developer`-role service accounts.
	*
	* @example
	* ```ts
	* const betaServiceAccount =
	*   await client.beta.organization.serviceAccounts.create({
	*     name: 'ci-deploy-bot',
	*   });
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/organizations/service_accounts?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Retrieve a service account by its ID (`svac_...`).
	*
	* @example
	* ```ts
	* const betaServiceAccount =
	*   await client.beta.organization.serviceAccounts.retrieve(
	*     'service_account_id',
	*   );
	* ```
	*/
	retrieve(serviceAccountID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/organizations/service_accounts/${serviceAccountID}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Update a service account.
	*
	* Only `description` and `organization_role` are mutable; `name` cannot be
	* changed. Archived service accounts cannot be updated; this returns 400. Setting
	* `organization_role` to `admin` (even when unchanged) requires an interactive
	* credential (a user OAuth token or a Console session).
	*
	* @example
	* ```ts
	* const betaServiceAccount =
	*   await client.beta.organization.serviceAccounts.update(
	*     'service_account_id',
	*   );
	* ```
	*/
	update(serviceAccountID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/organizations/service_accounts/${serviceAccountID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* List service accounts in the caller's organization.
	*
	* Results are ordered by creation time, newest first. Use `limit` and the
	* `next_page` cursor to paginate; set `include_archived=true` to include archived
	* service accounts.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaServiceAccount of client.beta.organization.serviceAccounts.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/organizations/service_accounts?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Archive a service account.
	*
	* Idempotent; re-archiving returns the service account with its original
	* `archived_at`. Rejected with 400 if any live (non-archived) federation rule
	* still targets this service account, same as issuer archival; archive those rules
	* first or change their target to another service account.
	*
	* @example
	* ```ts
	* const betaServiceAccount =
	*   await client.beta.organization.serviceAccounts.archive(
	*     'service_account_id',
	*   );
	* ```
	*/
	archive(serviceAccountID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/organizations/service_accounts/${serviceAccountID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
};
ServiceAccounts$1.Workspaces = Workspaces$1;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/workspaces/members.mjs
var Members = class extends APIResource {
	/**
	* Get Workspace Member
	*
	* @example
	* ```ts
	* const betaWorkspaceMember =
	*   await client.beta.organization.workspaces.members.retrieve(
	*     'user_id',
	*     { workspace_id: 'workspace_id' },
	*   );
	* ```
	*/
	retrieve(userID, params, options) {
		const { workspace_id } = params;
		return this._client.get(path`/v1/organizations/workspaces/${workspace_id}/members/${userID}?beta=true`, options);
	}
	/**
	* Update Workspace Member
	*
	* @example
	* ```ts
	* const betaWorkspaceMember =
	*   await client.beta.organization.workspaces.members.update(
	*     'user_id',
	*     {
	*       workspace_id: 'workspace_id',
	*       workspace_role: 'workspace_admin',
	*     },
	*   );
	* ```
	*/
	update(userID, params, options) {
		const { workspace_id, ...body } = params;
		return this._client.post(path`/v1/organizations/workspaces/${workspace_id}/members/${userID}?beta=true`, {
			body,
			...options
		});
	}
	/**
	* List Workspace Members
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaWorkspaceMember of client.beta.organization.workspaces.members.list(
	*   'workspace_id',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(workspaceID, query = {}, options) {
		return this._client.getAPIList(path`/v1/organizations/workspaces/${workspaceID}/members?beta=true`, Page, {
			query,
			...options
		});
	}
	/**
	* Create Workspace Member
	*
	* @example
	* ```ts
	* const betaWorkspaceMember =
	*   await client.beta.organization.workspaces.members.add(
	*     'workspace_id',
	*     {
	*       user_id: 'user_01WCz1FkmYMm4gnmykNKUu3Q',
	*       workspace_role: 'workspace_admin',
	*     },
	*   );
	* ```
	*/
	add(workspaceID, body, options) {
		return this._client.post(path`/v1/organizations/workspaces/${workspaceID}/members?beta=true`, {
			body,
			...options
		});
	}
	/**
	* Delete Workspace Member
	*
	* @example
	* ```ts
	* const member =
	*   await client.beta.organization.workspaces.members.remove(
	*     'user_id',
	*     { workspace_id: 'workspace_id' },
	*   );
	* ```
	*/
	remove(userID, params, options) {
		const { workspace_id } = params;
		return this._client.delete(path`/v1/organizations/workspaces/${workspace_id}/members/${userID}?beta=true`, options);
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/workspaces/rate-limits.mjs
var RateLimits = class extends APIResource {
	/**
	* List rate-limit overrides configured for a workspace.
	*
	* Returns only the groups and limiter types that have a workspace-level override.
	* Groups without overrides inherit the organization limits and are not listed; use
	* `GET /v1/organizations/rate_limits` to see those.
	*
	* When `limit` is omitted, every matching entry is returned in a single page; when
	* `limit` truncates the result, follow `next_page` to fetch the remaining entries.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaWorkspaceRateLimit of client.beta.organization.workspaces.rateLimits.list(
	*   'workspace_id',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(workspaceID, query = {}, options) {
		return this._client.getAPIList(path`/v1/organizations/workspaces/${workspaceID}/rate_limits?beta=true`, PageCursor, {
			query,
			...options
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/workspaces/service-accounts.mjs
var ServiceAccounts = class extends APIResource {
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Retrieve a service account's membership in a workspace.
	*
	* Returns the membership record, including the service account's `workspace_role`
	* in this workspace. Archived workspaces return 400. For the default workspace,
	* returns the implicit (`implicit: true`) membership when no explicit membership
	* exists; an explicitly added membership is returned with its assigned role. An
	* archived service account returns 404.
	*
	* @example
	* ```ts
	* const betaServiceAccountWorkspaceMember =
	*   await client.beta.organization.workspaces.serviceAccounts.retrieve(
	*     'service_account_id',
	*     { workspace_id: 'workspace_id' },
	*   );
	* ```
	*/
	retrieve(serviceAccountID, params, options) {
		const { workspace_id, betas } = params;
		return this._client.get(path`/v1/organizations/workspaces/${workspace_id}/service_accounts/${serviceAccountID}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Change a service account's role in a workspace.
	*
	* The new `workspace_role` replaces the current one. Only explicit memberships can
	* be updated; to set a role on the implicit default-workspace membership, add the
	* service account explicitly with
	* `POST /workspaces/{workspace_id}/service_accounts`. Archived workspaces
	* return 400. Archived service accounts cannot be updated and are rejected.
	*
	* @example
	* ```ts
	* const betaServiceAccountWorkspaceMember =
	*   await client.beta.organization.workspaces.serviceAccounts.update(
	*     'service_account_id',
	*     {
	*       workspace_id: 'workspace_id',
	*       workspace_role: 'workspace_admin',
	*     },
	*   );
	* ```
	*/
	update(serviceAccountID, params, options) {
		const { workspace_id, betas, ...body } = params;
		return this._client.post(path`/v1/organizations/workspaces/${workspace_id}/service_accounts/${serviceAccountID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* List the service accounts that are members of a workspace.
	*
	* Each entry includes the service account's `workspace_role`. Use `limit` and the
	* `next_page` cursor to paginate. Archived workspaces return 400; use
	* `GET /service_accounts/{id}/workspaces` to audit memberships of an archived
	* workspace. The implicit default-workspace membership is not included in this
	* list. Memberships of archived service accounts are omitted from the results.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaServiceAccountWorkspaceMember of client.beta.organization.workspaces.serviceAccounts.list(
	*   'workspace_id',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(workspaceID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/organizations/workspaces/${workspaceID}/service_accounts?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Add a service account to a workspace with the given `workspace_role`.
	*
	* The role determines what the service account can do in the workspace and which
	* workspace-scoped permissions it can be granted when authenticating through
	* federation. Every service account is already an implicit `workspace_user` member
	* of the default workspace; adding it explicitly assigns a chosen role. If the
	* service account is already an explicit member of the workspace, its
	* `workspace_role` is replaced with the value supplied here. Archived workspaces
	* return 400. Archived service accounts cannot be added and are rejected.
	*
	* @example
	* ```ts
	* const betaServiceAccountWorkspaceMember =
	*   await client.beta.organization.workspaces.serviceAccounts.add(
	*     'workspace_id',
	*     {
	*       service_account_id: 'service_account_id',
	*       workspace_role: 'workspace_admin',
	*     },
	*   );
	* ```
	*/
	add(workspaceID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/organizations/workspaces/${workspaceID}/service_accounts?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* **Requires an OAuth access token with the `org:admin` scope**, from
	* `ant auth login --scope org:admin` or a workload identity federation rule; Admin
	* API keys are not accepted. See
	* [Manage WIF with the Admin API](/docs/en/manage-claude/wif-admin-api).
	*
	* Remove a service account from a workspace.
	*
	* Removal is idempotent (returns 200 even if the membership was already removed).
	* A DELETE against the implicit default-workspace membership returns 200 but is a
	* no-op and the membership persists; deleting an explicit default-workspace row
	* reverts to the implicit `workspace_user` membership. Archived workspaces
	* return 400.
	*
	* @example
	* ```ts
	* const serviceAccount =
	*   await client.beta.organization.workspaces.serviceAccounts.remove(
	*     'service_account_id',
	*     { workspace_id: 'workspace_id' },
	*   );
	* ```
	*/
	remove(serviceAccountID, params, options) {
		const { workspace_id, betas } = params;
		return this._client.delete(path`/v1/organizations/workspaces/${workspace_id}/service_accounts/${serviceAccountID}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/workspaces/workspaces.mjs
var Workspaces = class extends APIResource {
	constructor() {
		super(...arguments);
		this.rateLimits = new RateLimits(this._client);
		this.members = new Members(this._client);
		this.serviceAccounts = new ServiceAccounts(this._client);
	}
	/**
	* Create Workspace
	*
	* @example
	* ```ts
	* const betaWorkspace =
	*   await client.beta.organization.workspaces.create({
	*     name: 'x',
	*   });
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/organizations/workspaces?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* Get Workspace
	*
	* @example
	* ```ts
	* const betaWorkspace =
	*   await client.beta.organization.workspaces.retrieve(
	*     'workspace_id',
	*   );
	* ```
	*/
	retrieve(workspaceID, options) {
		return this._client.get(path`/v1/organizations/workspaces/${workspaceID}?beta=true`, options);
	}
	/**
	* Update Workspace
	*
	* @example
	* ```ts
	* const betaWorkspace =
	*   await client.beta.organization.workspaces.update(
	*     'workspace_id',
	*   );
	* ```
	*/
	update(workspaceID, body, options) {
		return this._client.post(path`/v1/organizations/workspaces/${workspaceID}?beta=true`, {
			body,
			...options
		});
	}
	/**
	* List Workspaces
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaWorkspace of client.beta.organization.workspaces.list()) {
	*   // ...
	* }
	* ```
	*/
	list(query = {}, options) {
		return this._client.getAPIList("/v1/organizations/workspaces?beta=true", Page, {
			query,
			...options
		});
	}
	/**
	* Archive Workspace
	*
	* @example
	* ```ts
	* const betaWorkspace =
	*   await client.beta.organization.workspaces.archive(
	*     'workspace_id',
	*   );
	* ```
	*/
	archive(workspaceID, options) {
		return this._client.post(path`/v1/organizations/workspaces/${workspaceID}/archive?beta=true`, options);
	}
};
Workspaces.RateLimits = RateLimits;
Workspaces.Members = Members;
Workspaces.ServiceAccounts = ServiceAccounts;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/organization/organization.mjs
var Organization = class extends APIResource {
	constructor() {
		super(...arguments);
		this.apiKeys = new APIKeys(this._client);
		this.externalKeys = new ExternalKeys(this._client);
		this.federation = new Federation(this._client);
		this.invites = new Invites(this._client);
		this.serviceAccounts = new ServiceAccounts$1(this._client);
		this.users = new Users(this._client);
		this.workspaces = new Workspaces(this._client);
		this.rateLimits = new RateLimits$1(this._client);
		this.complianceSettings = new ComplianceSettings(this._client);
	}
	/**
	* Retrieve information about the organization associated with the authenticated
	* API key.
	*
	* @example
	* ```ts
	* const betaOrganization =
	*   await client.beta.organization.retrieve();
	* ```
	*/
	retrieve(options) {
		return this._client.get("/v1/organizations/me?beta=true", options);
	}
};
Organization.APIKeys = APIKeys;
Organization.ExternalKeys = ExternalKeys;
Organization.Federation = Federation;
Organization.Invites = Invites;
Organization.ServiceAccounts = ServiceAccounts$1;
Organization.Users = Users;
Organization.Workspaces = Workspaces;
Organization.RateLimits = RateLimits$1;
Organization.ComplianceSettings = ComplianceSettings;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/sessions/events.mjs
var Events$1 = class extends APIResource {
	/**
	* List Events
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsSessionEvent of client.beta.sessions.events.list(
	*   'sesn_011CZkZAtmR3yMPDzynEDxu7',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(sessionID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/sessions/${sessionID}/events?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Send Events
	*
	* @example
	* ```ts
	* const betaManagedAgentsSendSessionEvents =
	*   await client.beta.sessions.events.send(
	*     'sesn_011CZkZAtmR3yMPDzynEDxu7',
	*     {
	*       events: [
	*         {
	*           content: [
	*             {
	*               text: 'Where is my order #1234?',
	*               type: 'text',
	*             },
	*           ],
	*           type: 'user.message',
	*         },
	*       ],
	*     },
	*   );
	* ```
	*/
	send(sessionID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/sessions/${sessionID}/events?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Stream Events
	*
	* @example
	* ```ts
	* const betaManagedAgentsStreamSessionEvents =
	*   await client.beta.sessions.events.stream(
	*     'sesn_011CZkZAtmR3yMPDzynEDxu7',
	*   );
	* ```
	*/
	stream(sessionID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.get(path`/v1/sessions/${sessionID}/events/stream?beta=true`, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers]),
			stream: true
		});
	}
	/**
	* Attach to a session and dispatch every incoming `agent.tool_use` and
	* `agent.custom_tool_use` event to a local tool registry, sending the matching
	* result back (`user.tool_result` / `user.custom_tool_result`). The
	* sessions-side counterpart to `client.beta.messages.toolRunner`: yields one
	* entry per completed tool call so callers can observe each dispatch (and
	* `break` to abort cleanly).
	*
	* @example
	* ```ts
	* import { betaAgentToolset20260401 } from '@anthropic-ai/sdk/tools/agent-toolset/node';
	*
	* for await (const call of client.beta.sessions.events.toolRunner(work.data.id, {
	*   tools: [...betaAgentToolset20260401({ workdir }), myTool],
	* })) {
	*   console.log(`${call.name} -> ${call.isError ? 'error' : 'ok'}`);
	* }
	* ```
	*/
	toolRunner(sessionID, opts) {
		return new SessionToolRunner(sessionID, {
			...opts,
			client: this._client
		});
	}
};
Events$1.SessionToolRunner = SessionToolRunner;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/sessions/resources.mjs
var Resources = class extends APIResource {
	/**
	* Get Session Resource
	*
	* @example
	* ```ts
	* const resource =
	*   await client.beta.sessions.resources.retrieve(
	*     'sesrsc_011CZkZBJq5dWxk9fVLNcPht',
	*     { session_id: 'sesn_011CZkZAtmR3yMPDzynEDxu7' },
	*   );
	* ```
	*/
	retrieve(resourceID, params, options) {
		const { session_id, betas } = params;
		return this._client.get(path`/v1/sessions/${session_id}/resources/${resourceID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Update Session Resource
	*
	* @example
	* ```ts
	* const resource =
	*   await client.beta.sessions.resources.update(
	*     'sesrsc_011CZkZBJq5dWxk9fVLNcPht',
	*     {
	*       session_id: 'sesn_011CZkZAtmR3yMPDzynEDxu7',
	*       authorization_token: 'ghp_exampletoken',
	*     },
	*   );
	* ```
	*/
	update(resourceID, params, options) {
		const { session_id, betas, ...body } = params;
		return this._client.post(path`/v1/sessions/${session_id}/resources/${resourceID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* List Session Resources
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsSessionResource of client.beta.sessions.resources.list(
	*   'sesn_011CZkZAtmR3yMPDzynEDxu7',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(sessionID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/sessions/${sessionID}/resources?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Delete Session Resource
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeleteSessionResource =
	*   await client.beta.sessions.resources.delete(
	*     'sesrsc_011CZkZBJq5dWxk9fVLNcPht',
	*     { session_id: 'sesn_011CZkZAtmR3yMPDzynEDxu7' },
	*   );
	* ```
	*/
	delete(resourceID, params, options) {
		const { session_id, betas } = params;
		return this._client.delete(path`/v1/sessions/${session_id}/resources/${resourceID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Add Session Resource
	*
	* @example
	* ```ts
	* const betaManagedAgentsFileResource =
	*   await client.beta.sessions.resources.add(
	*     'sesn_011CZkZAtmR3yMPDzynEDxu7',
	*     {
	*       file_id: 'file_011CNha8iCJcU1wXNR6q4V8w',
	*       type: 'file',
	*     },
	*   );
	* ```
	*/
	add(sessionID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/sessions/${sessionID}/resources?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/sessions/threads/events.mjs
var Events = class extends APIResource {
	/**
	* List Session Thread Events
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsSessionEvent of client.beta.sessions.threads.events.list(
	*   'sthr_011CZkZVWa6oIjw0rgXZpnBt',
	*   { session_id: 'sesn_011CZkZAtmR3yMPDzynEDxu7' },
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(threadID, params, options) {
		const { session_id, betas, ...query } = params;
		return this._client.getAPIList(path`/v1/sessions/${session_id}/threads/${threadID}/events?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Stream Session Thread Events
	*
	* @example
	* ```ts
	* const betaManagedAgentsStreamSessionThreadEvents =
	*   await client.beta.sessions.threads.events.stream(
	*     'sthr_011CZkZVWa6oIjw0rgXZpnBt',
	*     { session_id: 'sesn_011CZkZAtmR3yMPDzynEDxu7' },
	*   );
	* ```
	*/
	stream(threadID, params, options) {
		const { session_id, betas, ...query } = params;
		return this._client.get(path`/v1/sessions/${session_id}/threads/${threadID}/stream?beta=true`, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers]),
			stream: true
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/sessions/threads/threads.mjs
var Threads = class extends APIResource {
	constructor() {
		super(...arguments);
		this.events = new Events(this._client);
	}
	/**
	* Get Session Thread
	*
	* @example
	* ```ts
	* const betaManagedAgentsSessionThread =
	*   await client.beta.sessions.threads.retrieve(
	*     'sthr_011CZkZVWa6oIjw0rgXZpnBt',
	*     { session_id: 'sesn_011CZkZAtmR3yMPDzynEDxu7' },
	*   );
	* ```
	*/
	retrieve(threadID, params, options) {
		const { session_id, betas } = params;
		return this._client.get(path`/v1/sessions/${session_id}/threads/${threadID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* List Session Threads
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsSessionThread of client.beta.sessions.threads.list(
	*   'sesn_011CZkZAtmR3yMPDzynEDxu7',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(sessionID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/sessions/${sessionID}/threads?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Archive Session Thread
	*
	* @example
	* ```ts
	* const betaManagedAgentsSessionThread =
	*   await client.beta.sessions.threads.archive(
	*     'sthr_011CZkZVWa6oIjw0rgXZpnBt',
	*     { session_id: 'sesn_011CZkZAtmR3yMPDzynEDxu7' },
	*   );
	* ```
	*/
	archive(threadID, params, options) {
		const { session_id, betas } = params;
		return this._client.post(path`/v1/sessions/${session_id}/threads/${threadID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
};
Threads.Events = Events;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/sessions/sessions.mjs
var Sessions = class extends APIResource {
	constructor() {
		super(...arguments);
		this.events = new Events$1(this._client);
		this.resources = new Resources(this._client);
		this.threads = new Threads(this._client);
	}
	/**
	* Create Session
	*
	* @example
	* ```ts
	* const betaManagedAgentsSession =
	*   await client.beta.sessions.create({
	*     agent: 'agent_011CZkYpogX7uDKUyvBTophP',
	*     environment_id: 'env_011CZkZ9X2dpNyB7HsEFoRfW',
	*   });
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/sessions?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Get Session
	*
	* @example
	* ```ts
	* const betaManagedAgentsSession =
	*   await client.beta.sessions.retrieve(
	*     'sesn_011CZkZAtmR3yMPDzynEDxu7',
	*   );
	* ```
	*/
	retrieve(sessionID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/sessions/${sessionID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Update Session
	*
	* @example
	* ```ts
	* const betaManagedAgentsSession =
	*   await client.beta.sessions.update(
	*     'sesn_011CZkZAtmR3yMPDzynEDxu7',
	*   );
	* ```
	*/
	update(sessionID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/sessions/${sessionID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* List Sessions
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsSession of client.beta.sessions.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/sessions?beta=true", BidirectionalPageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Delete Session
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeletedSession =
	*   await client.beta.sessions.delete(
	*     'sesn_011CZkZAtmR3yMPDzynEDxu7',
	*   );
	* ```
	*/
	delete(sessionID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.delete(path`/v1/sessions/${sessionID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Archive Session
	*
	* @example
	* ```ts
	* const betaManagedAgentsSession =
	*   await client.beta.sessions.archive(
	*     'sesn_011CZkZAtmR3yMPDzynEDxu7',
	*   );
	* ```
	*/
	archive(sessionID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/sessions/${sessionID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
};
Sessions.Events = Events$1;
Sessions.Resources = Resources;
Sessions.Threads = Threads;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/skills/versions.mjs
var Versions$1 = class extends APIResource {
	/**
	* Create Skill Version
	*
	* @example
	* ```ts
	* const betaSkillVersion =
	*   await client.beta.skills.versions.create('skill_id', {
	*     files: [fs.createReadStream('path/to/file')],
	*   });
	* ```
	*/
	create(skillID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/skills/${skillID}/versions?beta=true`, multipartFormRequestOptions({
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		}, this._client, false));
	}
	/**
	* Get Skill Version
	*
	* @example
	* ```ts
	* const betaSkillVersion =
	*   await client.beta.skills.versions.retrieve('version', {
	*     skill_id: 'skill_id',
	*   });
	* ```
	*/
	retrieve(version, params, options) {
		const { skill_id, betas } = params;
		return this._client.get(path`/v1/skills/${skill_id}/versions/${version}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* List Skill Versions
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaSkillVersion of client.beta.skills.versions.list(
	*   'skill_id',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(skillID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/skills/${skillID}/versions?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* Delete Skill Version
	*
	* @example
	* ```ts
	* const betaDeletedSkillVersion =
	*   await client.beta.skills.versions.delete('version', {
	*     skill_id: 'skill_id',
	*   });
	* ```
	*/
	delete(version, params, options) {
		const { skill_id, betas } = params;
		return this._client.delete(path`/v1/skills/${skill_id}/versions/${version}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* Download a skill version's content as a zip archive.
	*
	* @example
	* ```ts
	* const response = await client.beta.skills.versions.download(
	*   'version',
	*   { skill_id: 'skill_id' },
	* );
	*
	* const content = await response.blob();
	* console.log(content);
	* ```
	*/
	download(version, params, options) {
		const { skill_id, betas } = params;
		return this._client.get(path`/v1/skills/${skill_id}/versions/${version}/content?beta=true`, {
			...options,
			headers: buildHeaders([{
				Accept: "application/binary",
				...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0
			}, options?.headers]),
			__binaryResponse: true
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/skills/skills.mjs
var Skills$1 = class extends APIResource {
	constructor() {
		super(...arguments);
		this.versions = new Versions$1(this._client);
	}
	/**
	* Create Skill
	*
	* @example
	* ```ts
	* const betaSkill = await client.beta.skills.create({
	*   files: [fs.createReadStream('path/to/file')],
	* });
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/skills?beta=true", multipartFormRequestOptions({
			body,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		}, this._client, false));
	}
	/**
	* Get Skill
	*
	* @example
	* ```ts
	* const betaSkill = await client.beta.skills.retrieve(
	*   'skill_id',
	* );
	* ```
	*/
	retrieve(skillID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/skills/${skillID}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* List Skills
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaSkill of client.beta.skills.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/skills?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* Delete Skill
	*
	* @example
	* ```ts
	* const betaDeletedSkill = await client.beta.skills.delete(
	*   'skill_id',
	* );
	* ```
	*/
	delete(skillID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.delete(path`/v1/skills/${skillID}?beta=true`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
};
Skills$1.Versions = Versions$1;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/tunnels/certificates.mjs
var Certificates = class extends APIResource {
	/**
	* The Tunnels API is in research preview. It requires the
	* `anthropic-beta: mcp-tunnels-2026-06-22` header and may change without a
	* deprecation period. It supersedes the Admin API endpoints at
	* `/v1/organizations/tunnels`, which remain available during a migration window.
	*
	* Registers a public CA certificate on a tunnel. Anthropic verifies the gateway's
	* server certificate against this CA when it terminates the inner TLS session. A
	* tunnel holds at most two non-archived certificates.
	*
	* @example
	* ```ts
	* const betaTunnelCertificate =
	*   await client.beta.tunnels.certificates.create(
	*     'tunnel_id',
	*     { ca_certificate_pem: 'ca_certificate_pem' },
	*   );
	* ```
	*/
	create(tunnelID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/tunnels/${tunnelID}/certificates?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "mcp-tunnels-2026-06-22"].toString() }, options?.headers])
		});
	}
	/**
	* The Tunnels API is in research preview. It requires the
	* `anthropic-beta: mcp-tunnels-2026-06-22` header and may change without a
	* deprecation period. It supersedes the Admin API endpoints at
	* `/v1/organizations/tunnels`, which remain available during a migration window.
	*
	* Fetches a tunnel certificate by ID.
	*
	* @example
	* ```ts
	* const betaTunnelCertificate =
	*   await client.beta.tunnels.certificates.retrieve(
	*     'certificate_id',
	*     { tunnel_id: 'tunnel_id' },
	*   );
	* ```
	*/
	retrieve(certificateID, params, options) {
		const { tunnel_id, betas } = params;
		return this._client.get(path`/v1/tunnels/${tunnel_id}/certificates/${certificateID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "mcp-tunnels-2026-06-22"].toString() }, options?.headers])
		});
	}
	/**
	* The Tunnels API is in research preview. It requires the
	* `anthropic-beta: mcp-tunnels-2026-06-22` header and may change without a
	* deprecation period. It supersedes the Admin API endpoints at
	* `/v1/organizations/tunnels`, which remain available during a migration window.
	*
	* Lists the certificates registered on a tunnel. Archived certificates are
	* excluded unless include_archived is set.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaTunnelCertificate of client.beta.tunnels.certificates.list(
	*   'tunnel_id',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(tunnelID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/tunnels/${tunnelID}/certificates?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "mcp-tunnels-2026-06-22"].toString() }, options?.headers])
		});
	}
	/**
	* The Tunnels API is in research preview. It requires the
	* `anthropic-beta: mcp-tunnels-2026-06-22` header and may change without a
	* deprecation period. It supersedes the Admin API endpoints at
	* `/v1/organizations/tunnels`, which remain available during a migration window.
	*
	* Archives a tunnel certificate, removing it from the set Anthropic trusts for the
	* tunnel. The certificate record is retained. Archiving the last non-archived
	* certificate is permitted; the tunnel rejects MCP traffic until a new certificate
	* is added.
	*
	* @example
	* ```ts
	* const betaTunnelCertificate =
	*   await client.beta.tunnels.certificates.archive(
	*     'certificate_id',
	*     { tunnel_id: 'tunnel_id' },
	*   );
	* ```
	*/
	archive(certificateID, params, options) {
		const { tunnel_id, betas } = params;
		return this._client.post(path`/v1/tunnels/${tunnel_id}/certificates/${certificateID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "mcp-tunnels-2026-06-22"].toString() }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/tunnels/tunnels.mjs
var Tunnels = class extends APIResource {
	constructor() {
		super(...arguments);
		this.certificates = new Certificates(this._client);
	}
	/**
	* The Tunnels API is in research preview. It requires the
	* `anthropic-beta: mcp-tunnels-2026-06-22` header and may change without a
	* deprecation period. It supersedes the Admin API endpoints at
	* `/v1/organizations/tunnels`, which remain available during a migration window.
	*
	* Creates a tunnel. Creation allocates a fresh hostname and provisions the tunnel;
	* it is not idempotent. The new tunnel rejects MCP traffic until at least one CA
	* certificate is added.
	*
	* @example
	* ```ts
	* const betaTunnel = await client.beta.tunnels.create();
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/tunnels?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "mcp-tunnels-2026-06-22"].toString() }, options?.headers])
		});
	}
	/**
	* The Tunnels API is in research preview. It requires the
	* `anthropic-beta: mcp-tunnels-2026-06-22` header and may change without a
	* deprecation period. It supersedes the Admin API endpoints at
	* `/v1/organizations/tunnels`, which remain available during a migration window.
	*
	* Fetches a tunnel by ID.
	*
	* @example
	* ```ts
	* const betaTunnel = await client.beta.tunnels.retrieve(
	*   'tunnel_id',
	* );
	* ```
	*/
	retrieve(tunnelID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/tunnels/${tunnelID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "mcp-tunnels-2026-06-22"].toString() }, options?.headers])
		});
	}
	/**
	* The Tunnels API is in research preview. It requires the
	* `anthropic-beta: mcp-tunnels-2026-06-22` header and may change without a
	* deprecation period. It supersedes the Admin API endpoints at
	* `/v1/organizations/tunnels`, which remain available during a migration window.
	*
	* Lists tunnels. Results are ordered by creation time, newest first; archived
	* tunnels are excluded unless include_archived is set.
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaTunnel of client.beta.tunnels.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/tunnels?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "mcp-tunnels-2026-06-22"].toString() }, options?.headers])
		});
	}
	/**
	* The Tunnels API is in research preview. It requires the
	* `anthropic-beta: mcp-tunnels-2026-06-22` header and may change without a
	* deprecation period. It supersedes the Admin API endpoints at
	* `/v1/organizations/tunnels`, which remain available during a migration window.
	*
	* Archives a tunnel. Archival is irreversible: every non-archived certificate on
	* the tunnel is archived in the same operation, the hostname is retired and never
	* re-allocated, and the tunnel token is invalidated. Retrying against an
	* already-archived tunnel returns the existing record unchanged.
	*
	* @example
	* ```ts
	* const betaTunnel = await client.beta.tunnels.archive(
	*   'tunnel_id',
	* );
	* ```
	*/
	archive(tunnelID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/tunnels/${tunnelID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "mcp-tunnels-2026-06-22"].toString() }, options?.headers])
		});
	}
	/**
	* The Tunnels API is in research preview. It requires the
	* `anthropic-beta: mcp-tunnels-2026-06-22` header and may change without a
	* deprecation period. It supersedes the Admin API endpoints at
	* `/v1/organizations/tunnels`, which remain available during a migration window.
	*
	* Reveals a tunnel's connector token. The value is fetched live on each call;
	* Anthropic does not store it. Repeated calls return the same value until the
	* token is rotated. Exposed as POST so the token does not appear in intermediary
	* access logs.
	*
	* @example
	* ```ts
	* const betaTunnelToken =
	*   await client.beta.tunnels.revealToken('tunnel_id');
	* ```
	*/
	revealToken(tunnelID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/tunnels/${tunnelID}/reveal_token?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "mcp-tunnels-2026-06-22"].toString() }, options?.headers])
		});
	}
	/**
	* The Tunnels API is in research preview. It requires the
	* `anthropic-beta: mcp-tunnels-2026-06-22` header and may change without a
	* deprecation period. It supersedes the Admin API endpoints at
	* `/v1/organizations/tunnels`, which remain available during a migration window.
	*
	* Rotates a tunnel's connector token. Rotation invalidates the current token for
	* new connections and returns a fresh value; established connections are not
	* severed. A connector restarted after rotation must use the new value.
	*
	* @example
	* ```ts
	* const betaTunnelToken =
	*   await client.beta.tunnels.rotateToken('tunnel_id');
	* ```
	*/
	rotateToken(tunnelID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/tunnels/${tunnelID}/rotate_token?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "mcp-tunnels-2026-06-22"].toString() }, options?.headers])
		});
	}
};
Tunnels.Certificates = Certificates;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/vaults/credentials.mjs
var Credentials = class extends APIResource {
	/**
	* Create Credential
	*
	* @example
	* ```ts
	* const betaManagedAgentsCredential =
	*   await client.beta.vaults.credentials.create(
	*     'vlt_011CZkZDLs7fYzm1hXNPeRjv',
	*     {
	*       auth: {
	*         token: 'bearer_exampletoken',
	*         mcp_server_url:
	*           'https://example-server.modelcontextprotocol.io/sse',
	*         type: 'static_bearer',
	*       },
	*     },
	*   );
	* ```
	*/
	create(vaultID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/vaults/${vaultID}/credentials?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Get Credential
	*
	* @example
	* ```ts
	* const betaManagedAgentsCredential =
	*   await client.beta.vaults.credentials.retrieve(
	*     'vcrd_011CZkZEMt8gZan2iYOQfSkw',
	*     { vault_id: 'vlt_011CZkZDLs7fYzm1hXNPeRjv' },
	*   );
	* ```
	*/
	retrieve(credentialID, params, options) {
		const { vault_id, betas } = params;
		return this._client.get(path`/v1/vaults/${vault_id}/credentials/${credentialID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Update Credential
	*
	* @example
	* ```ts
	* const betaManagedAgentsCredential =
	*   await client.beta.vaults.credentials.update(
	*     'vcrd_011CZkZEMt8gZan2iYOQfSkw',
	*     { vault_id: 'vlt_011CZkZDLs7fYzm1hXNPeRjv' },
	*   );
	* ```
	*/
	update(credentialID, params, options) {
		const { vault_id, betas, ...body } = params;
		return this._client.post(path`/v1/vaults/${vault_id}/credentials/${credentialID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* List Credentials
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsCredential of client.beta.vaults.credentials.list(
	*   'vlt_011CZkZDLs7fYzm1hXNPeRjv',
	* )) {
	*   // ...
	* }
	* ```
	*/
	list(vaultID, params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList(path`/v1/vaults/${vaultID}/credentials?beta=true`, PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Delete Credential
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeletedCredential =
	*   await client.beta.vaults.credentials.delete(
	*     'vcrd_011CZkZEMt8gZan2iYOQfSkw',
	*     { vault_id: 'vlt_011CZkZDLs7fYzm1hXNPeRjv' },
	*   );
	* ```
	*/
	delete(credentialID, params, options) {
		const { vault_id, betas } = params;
		return this._client.delete(path`/v1/vaults/${vault_id}/credentials/${credentialID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Archive Credential
	*
	* @example
	* ```ts
	* const betaManagedAgentsCredential =
	*   await client.beta.vaults.credentials.archive(
	*     'vcrd_011CZkZEMt8gZan2iYOQfSkw',
	*     { vault_id: 'vlt_011CZkZDLs7fYzm1hXNPeRjv' },
	*   );
	* ```
	*/
	archive(credentialID, params, options) {
		const { vault_id, betas } = params;
		return this._client.post(path`/v1/vaults/${vault_id}/credentials/${credentialID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Validate Credential
	*
	* @example
	* ```ts
	* const betaManagedAgentsCredentialValidation =
	*   await client.beta.vaults.credentials.mcpOAuthValidate(
	*     'vcrd_011CZkZEMt8gZan2iYOQfSkw',
	*     { vault_id: 'vlt_011CZkZDLs7fYzm1hXNPeRjv' },
	*   );
	* ```
	*/
	mcpOAuthValidate(credentialID, params, options) {
		const { vault_id, betas } = params;
		return this._client.post(path`/v1/vaults/${vault_id}/credentials/${credentialID}/mcp_oauth_validate?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/vaults/vaults.mjs
var Vaults = class extends APIResource {
	constructor() {
		super(...arguments);
		this.credentials = new Credentials(this._client);
	}
	/**
	* Create Vault
	*
	* @example
	* ```ts
	* const betaManagedAgentsVault =
	*   await client.beta.vaults.create({
	*     display_name: 'Example vault',
	*   });
	* ```
	*/
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/vaults?beta=true", {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Get Vault
	*
	* @example
	* ```ts
	* const betaManagedAgentsVault =
	*   await client.beta.vaults.retrieve(
	*     'vlt_011CZkZDLs7fYzm1hXNPeRjv',
	*   );
	* ```
	*/
	retrieve(vaultID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/vaults/${vaultID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Update Vault
	*
	* @example
	* ```ts
	* const betaManagedAgentsVault =
	*   await client.beta.vaults.update(
	*     'vlt_011CZkZDLs7fYzm1hXNPeRjv',
	*   );
	* ```
	*/
	update(vaultID, params, options) {
		const { betas, ...body } = params;
		return this._client.post(path`/v1/vaults/${vaultID}?beta=true`, {
			body,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* List Vaults
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const betaManagedAgentsVault of client.beta.vaults.list()) {
	*   // ...
	* }
	* ```
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/vaults?beta=true", PageCursor, {
			query,
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Delete Vault
	*
	* @example
	* ```ts
	* const betaManagedAgentsDeletedVault =
	*   await client.beta.vaults.delete(
	*     'vlt_011CZkZDLs7fYzm1hXNPeRjv',
	*   );
	* ```
	*/
	delete(vaultID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.delete(path`/v1/vaults/${vaultID}?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
	/**
	* Archive Vault
	*
	* @example
	* ```ts
	* const betaManagedAgentsVault =
	*   await client.beta.vaults.archive(
	*     'vlt_011CZkZDLs7fYzm1hXNPeRjv',
	*   );
	* ```
	*/
	archive(vaultID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.post(path`/v1/vaults/${vaultID}/archive?beta=true`, {
			...options,
			headers: buildHeaders([{ "anthropic-beta": [...betas ?? [], "managed-agents-2026-04-01"].toString() }, options?.headers])
		});
	}
};
Vaults.Credentials = Credentials;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/beta/beta.mjs
var Beta = class extends APIResource {
	constructor() {
		super(...arguments);
		this.models = new Models$1(this._client);
		this.messages = new Messages$1(this._client);
		this.agents = new Agents(this._client);
		this.environments = new Environments(this._client);
		this.sessions = new Sessions(this._client);
		this.deployments = new Deployments(this._client);
		this.deploymentRuns = new DeploymentRuns(this._client);
		this.vaults = new Vaults(this._client);
		this.memoryStores = new MemoryStores(this._client);
		this.files = new Files$1(this._client);
		this.skills = new Skills$1(this._client);
		this.webhooks = new Webhooks(this._client);
		this.userProfiles = new UserProfiles(this._client);
		this.dreams = new Dreams(this._client);
		this.tunnels = new Tunnels(this._client);
		this.organization = new Organization(this._client);
	}
};
Beta.Models = Models$1;
Beta.Messages = Messages$1;
Beta.Agents = Agents;
Beta.Environments = Environments;
Beta.Sessions = Sessions;
Beta.Deployments = Deployments;
Beta.DeploymentRuns = DeploymentRuns;
Beta.Vaults = Vaults;
Beta.MemoryStores = MemoryStores;
Beta.Files = Files$1;
Beta.Skills = Skills$1;
Beta.Webhooks = Webhooks;
Beta.UserProfiles = UserProfiles;
Beta.Dreams = Dreams;
Beta.Tunnels = Tunnels;
Beta.Organization = Organization;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/completions.mjs
var Completions = class extends APIResource {
	create(params, options) {
		const { betas, ...body } = params;
		return this._client.post("/v1/complete", {
			body,
			timeout: this._client._options.timeout ?? 6e5,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers]),
			stream: params.stream ?? false
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/files.mjs
var Files = class extends APIResource {
	/**
	* List Files
	*/
	list(query = {}, options) {
		return this._client.getAPIList("/v1/files", PageCursor, {
			query,
			...options
		});
	}
	/**
	* Delete File
	*/
	delete(fileID, options) {
		return this._client.delete(path`/v1/files/${fileID}`, options);
	}
	/**
	* Download File
	*/
	download(fileID, options) {
		return this._client.get(path`/v1/files/${fileID}/content`, {
			...options,
			headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
			__binaryResponse: true
		});
	}
	/**
	* Get File Metadata
	*/
	retrieveMetadata(fileID, options) {
		return this._client.get(path`/v1/files/${fileID}`, options);
	}
	/**
	* Upload File
	*/
	upload(body, options) {
		return this._client.post("/v1/files", multipartFormRequestOptions({
			body,
			...options,
			headers: buildHeaders([stainlessHelperHeaderFromFile(body.file), options?.headers])
		}, this._client));
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/parser.mjs
function getOutputFormat(params) {
	return params?.output_config?.format;
}
function maybeParseMessage(message, params, opts) {
	const outputFormat = getOutputFormat(params);
	if (!params || !("parse" in (outputFormat ?? {}))) return {
		...message,
		content: message.content.map((block) => {
			if (block.type === "text") return Object.defineProperty({ ...block }, "parsed_output", {
				value: null,
				enumerable: false
			});
			return block;
		}),
		parsed_output: null
	};
	return parseMessage(message, params, opts);
}
function parseMessage(message, params, opts) {
	let firstParsedOutput = null;
	const content = message.content.map((block) => {
		if (block.type === "text") {
			const parsedOutput = parseOutputFormat(params, block.text);
			if (firstParsedOutput === null) firstParsedOutput = parsedOutput;
			return Object.defineProperty({ ...block }, "parsed_output", {
				value: parsedOutput,
				enumerable: false
			});
		}
		return block;
	});
	return {
		...message,
		content,
		parsed_output: firstParsedOutput
	};
}
function parseOutputFormat(params, content) {
	const outputFormat = getOutputFormat(params);
	if (outputFormat?.type !== "json_schema") return null;
	try {
		if ("parse" in outputFormat) return outputFormat.parse(content);
		return JSON.parse(content);
	} catch (error) {
		throw new AnthropicError(`Failed to parse structured output: ${error}`);
	}
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/lib/MessageStream.mjs
var _MessageStream_instances;
var _MessageStream_currentMessageSnapshot;
var _MessageStream_params;
var _MessageStream_connectedPromise;
var _MessageStream_resolveConnectedPromise;
var _MessageStream_rejectConnectedPromise;
var _MessageStream_endPromise;
var _MessageStream_resolveEndPromise;
var _MessageStream_rejectEndPromise;
var _MessageStream_listeners;
var _MessageStream_ended;
var _MessageStream_errored;
var _MessageStream_aborted;
var _MessageStream_catchingPromiseCreated;
var _MessageStream_response;
var _MessageStream_request_id;
var _MessageStream_workspace_id;
var _MessageStream_logger;
var _MessageStream_getFinalMessage;
var _MessageStream_getFinalText;
var _MessageStream_handleError;
var _MessageStream_beginRequest;
var _MessageStream_addStreamEvent;
var _MessageStream_endRequest;
var _MessageStream_accumulateMessage;
function tracksToolInput(content) {
	return content.type === "tool_use" || content.type === "server_tool_use";
}
var MessageStream = class MessageStream {
	constructor(params, opts) {
		_MessageStream_instances.add(this);
		this.messages = [];
		this.receivedMessages = [];
		_MessageStream_currentMessageSnapshot.set(this, void 0);
		_MessageStream_params.set(this, null);
		this.controller = new AbortController();
		_MessageStream_connectedPromise.set(this, void 0);
		_MessageStream_resolveConnectedPromise.set(this, () => {});
		_MessageStream_rejectConnectedPromise.set(this, () => {});
		_MessageStream_endPromise.set(this, void 0);
		_MessageStream_resolveEndPromise.set(this, () => {});
		_MessageStream_rejectEndPromise.set(this, () => {});
		_MessageStream_listeners.set(this, {});
		_MessageStream_ended.set(this, false);
		_MessageStream_errored.set(this, false);
		_MessageStream_aborted.set(this, false);
		_MessageStream_catchingPromiseCreated.set(this, false);
		_MessageStream_response.set(this, void 0);
		_MessageStream_request_id.set(this, void 0);
		_MessageStream_workspace_id.set(this, void 0);
		_MessageStream_logger.set(this, void 0);
		_MessageStream_handleError.set(this, (error) => {
			__classPrivateFieldSet(this, _MessageStream_errored, true, "f");
			if (isAbortError(error)) error = new APIUserAbortError();
			if (error instanceof APIUserAbortError) {
				__classPrivateFieldSet(this, _MessageStream_aborted, true, "f");
				return this._emit("abort", error);
			}
			if (error instanceof AnthropicError) return this._emit("error", error);
			if (error instanceof Error) {
				const anthropicError = new AnthropicError(error.message);
				anthropicError.cause = error;
				return this._emit("error", anthropicError);
			}
			return this._emit("error", new AnthropicError(String(error)));
		});
		__classPrivateFieldSet(this, _MessageStream_connectedPromise, new Promise((resolve, reject) => {
			__classPrivateFieldSet(this, _MessageStream_resolveConnectedPromise, resolve, "f");
			__classPrivateFieldSet(this, _MessageStream_rejectConnectedPromise, reject, "f");
		}), "f");
		__classPrivateFieldSet(this, _MessageStream_endPromise, new Promise((resolve, reject) => {
			__classPrivateFieldSet(this, _MessageStream_resolveEndPromise, resolve, "f");
			__classPrivateFieldSet(this, _MessageStream_rejectEndPromise, reject, "f");
		}), "f");
		__classPrivateFieldGet(this, _MessageStream_connectedPromise, "f").catch(() => {});
		__classPrivateFieldGet(this, _MessageStream_endPromise, "f").catch(() => {});
		__classPrivateFieldSet(this, _MessageStream_params, params, "f");
		__classPrivateFieldSet(this, _MessageStream_logger, opts?.logger ?? console, "f");
	}
	get response() {
		return __classPrivateFieldGet(this, _MessageStream_response, "f");
	}
	get request_id() {
		return __classPrivateFieldGet(this, _MessageStream_request_id, "f");
	}
	get workspace_id() {
		return __classPrivateFieldGet(this, _MessageStream_workspace_id, "f");
	}
	/**
	* Returns the `MessageStream` data, the raw `Response` instance and the ID of the request,
	* returned vie the `request-id` header which is useful for debugging requests and resporting
	* issues to Anthropic.
	*
	* This is the same as the `APIPromise.withResponse()` method.
	*
	* This method will raise an error if you created the stream using `MessageStream.fromReadableStream`
	* as no `Response` is available.
	*/
	async withResponse() {
		__classPrivateFieldSet(this, _MessageStream_catchingPromiseCreated, true, "f");
		const response = await __classPrivateFieldGet(this, _MessageStream_connectedPromise, "f");
		if (!response) throw new Error("Could not resolve a `Response` object");
		return {
			data: this,
			response,
			request_id: response.headers.get("request-id"),
			workspace_id: response.headers.get("anthropic-workspace-id")
		};
	}
	/**
	* Intended for use on the frontend, consuming a stream produced with
	* `.toReadableStream()` on the backend.
	*
	* Note that messages sent to the model do not appear in `.on('message')`
	* in this context.
	*/
	static fromReadableStream(stream) {
		const runner = new MessageStream(null);
		runner._run(() => runner._fromReadableStream(stream));
		return runner;
	}
	static createMessage(messages, params, options, { logger } = {}) {
		const runner = new MessageStream(params, { logger });
		for (const message of params.messages) runner._addMessageParam(message);
		__classPrivateFieldSet(runner, _MessageStream_params, {
			...params,
			stream: true
		}, "f");
		runner._run(() => runner._createMessage(messages, {
			...params,
			stream: true
		}, {
			...options,
			headers: {
				...options?.headers,
				[STAINLESS_HELPER_METHOD_HEADER]: "stream"
			}
		}));
		return runner;
	}
	_run(executor) {
		executor().then(() => {
			this._emitFinal();
			this._emit("end");
		}, __classPrivateFieldGet(this, _MessageStream_handleError, "f"));
	}
	_addMessageParam(message) {
		this.messages.push(message);
	}
	_addMessage(message, emit = true) {
		this.receivedMessages.push(message);
		if (emit) this._emit("message", message);
	}
	async _createMessage(messages, params, options) {
		const signal = options?.signal;
		let abortHandler;
		if (signal) {
			if (signal.aborted) this.controller.abort();
			abortHandler = this.controller.abort.bind(this.controller);
			signal.addEventListener("abort", abortHandler);
		}
		try {
			__classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_beginRequest).call(this);
			const { response, data: stream } = await messages.create({
				...params,
				stream: true
			}, {
				...options,
				signal: this.controller.signal
			}).withResponse();
			this._connected(response);
			for await (const event of stream) __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_addStreamEvent).call(this, event);
			if (stream.controller.signal?.aborted) throw new APIUserAbortError();
			__classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_endRequest).call(this);
		} finally {
			if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
		}
	}
	_connected(response) {
		if (this.ended) return;
		__classPrivateFieldSet(this, _MessageStream_response, response, "f");
		__classPrivateFieldSet(this, _MessageStream_request_id, response?.headers.get("request-id"), "f");
		__classPrivateFieldSet(this, _MessageStream_workspace_id, response?.headers.get("anthropic-workspace-id"), "f");
		__classPrivateFieldGet(this, _MessageStream_resolveConnectedPromise, "f").call(this, response);
		this._emit("connect");
	}
	get ended() {
		return __classPrivateFieldGet(this, _MessageStream_ended, "f");
	}
	get errored() {
		return __classPrivateFieldGet(this, _MessageStream_errored, "f");
	}
	get aborted() {
		return __classPrivateFieldGet(this, _MessageStream_aborted, "f");
	}
	abort() {
		this.controller.abort();
	}
	/**
	* Adds the listener function to the end of the listeners array for the event.
	* No checks are made to see if the listener has already been added. Multiple calls passing
	* the same combination of event and listener will result in the listener being added, and
	* called, multiple times.
	* @returns this MessageStream, so that calls can be chained
	*/
	on(event, listener) {
		(__classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] = [])).push({ listener });
		return this;
	}
	/**
	* Removes the specified listener from the listener array for the event.
	* off() will remove, at most, one instance of a listener from the listener array. If any single
	* listener has been added multiple times to the listener array for the specified event, then
	* off() must be called multiple times to remove each instance.
	* @returns this MessageStream, so that calls can be chained
	*/
	off(event, listener) {
		const listeners = __classPrivateFieldGet(this, _MessageStream_listeners, "f")[event];
		if (!listeners) return this;
		const index = listeners.findIndex((l) => l.listener === listener);
		if (index >= 0) listeners.splice(index, 1);
		return this;
	}
	/**
	* Adds a one-time listener function for the event. The next time the event is triggered,
	* this listener is removed and then invoked.
	* @returns this MessageStream, so that calls can be chained
	*/
	once(event, listener) {
		(__classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] = [])).push({
			listener,
			once: true
		});
		return this;
	}
	/**
	* This is similar to `.once()`, but returns a Promise that resolves the next time
	* the event is triggered, instead of calling a listener callback.
	* @returns a Promise that resolves the next time given event is triggered,
	* or rejects if an error is emitted.  (If you request the 'error' event,
	* returns a promise that resolves with the error).
	*
	* Example:
	*
	*   const message = await stream.emitted('message') // rejects if the stream errors
	*/
	emitted(event) {
		return new Promise((resolve, reject) => {
			__classPrivateFieldSet(this, _MessageStream_catchingPromiseCreated, true, "f");
			if (event !== "error") this.once("error", reject);
			this.once(event, resolve);
		});
	}
	async done() {
		__classPrivateFieldSet(this, _MessageStream_catchingPromiseCreated, true, "f");
		await __classPrivateFieldGet(this, _MessageStream_endPromise, "f");
	}
	get currentMessage() {
		return __classPrivateFieldGet(this, _MessageStream_currentMessageSnapshot, "f");
	}
	/**
	* @returns a promise that resolves with the the final assistant Message response,
	* or rejects if an error occurred or the stream ended prematurely without producing a Message.
	* If structured outputs were used, this will be a ParsedMessage with a `parsed_output` field.
	*/
	async finalMessage() {
		await this.done();
		return __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_getFinalMessage).call(this);
	}
	/**
	* @returns a promise that resolves with the the final assistant Message's text response, concatenated
	* together if there are more than one text blocks.
	* Rejects if an error occurred or the stream ended prematurely without producing a Message.
	*/
	async finalText() {
		await this.done();
		return __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_getFinalText).call(this);
	}
	_emit(event, ...args) {
		if (__classPrivateFieldGet(this, _MessageStream_ended, "f")) return;
		if (event === "end") {
			__classPrivateFieldSet(this, _MessageStream_ended, true, "f");
			__classPrivateFieldGet(this, _MessageStream_resolveEndPromise, "f").call(this);
		}
		const listeners = __classPrivateFieldGet(this, _MessageStream_listeners, "f")[event];
		if (listeners) {
			__classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] = listeners.filter((l) => !l.once);
			listeners.forEach(({ listener }) => listener(...args));
		}
		if (event === "abort") {
			const error = args[0];
			if (!__classPrivateFieldGet(this, _MessageStream_catchingPromiseCreated, "f") && !listeners?.length) Promise.reject(error);
			__classPrivateFieldGet(this, _MessageStream_rejectConnectedPromise, "f").call(this, error);
			__classPrivateFieldGet(this, _MessageStream_rejectEndPromise, "f").call(this, error);
			this._emit("end");
			return;
		}
		if (event === "error") {
			const error = args[0];
			if (!__classPrivateFieldGet(this, _MessageStream_catchingPromiseCreated, "f") && !listeners?.length) Promise.reject(error);
			__classPrivateFieldGet(this, _MessageStream_rejectConnectedPromise, "f").call(this, error);
			__classPrivateFieldGet(this, _MessageStream_rejectEndPromise, "f").call(this, error);
			this._emit("end");
		}
	}
	_emitFinal() {
		if (this.receivedMessages.at(-1)) this._emit("finalMessage", __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_getFinalMessage).call(this));
	}
	async _fromReadableStream(readableStream, options) {
		const signal = options?.signal;
		let abortHandler;
		if (signal) {
			if (signal.aborted) this.controller.abort();
			abortHandler = this.controller.abort.bind(this.controller);
			signal.addEventListener("abort", abortHandler);
		}
		try {
			__classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_beginRequest).call(this);
			this._connected(null);
			const stream = Stream.fromReadableStream(readableStream, this.controller);
			for await (const event of stream) __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_addStreamEvent).call(this, event);
			if (stream.controller.signal?.aborted) throw new APIUserAbortError();
			__classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_endRequest).call(this);
		} finally {
			if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
		}
	}
	[(_MessageStream_currentMessageSnapshot = /* @__PURE__ */ new WeakMap(), _MessageStream_params = /* @__PURE__ */ new WeakMap(), _MessageStream_connectedPromise = /* @__PURE__ */ new WeakMap(), _MessageStream_resolveConnectedPromise = /* @__PURE__ */ new WeakMap(), _MessageStream_rejectConnectedPromise = /* @__PURE__ */ new WeakMap(), _MessageStream_endPromise = /* @__PURE__ */ new WeakMap(), _MessageStream_resolveEndPromise = /* @__PURE__ */ new WeakMap(), _MessageStream_rejectEndPromise = /* @__PURE__ */ new WeakMap(), _MessageStream_listeners = /* @__PURE__ */ new WeakMap(), _MessageStream_ended = /* @__PURE__ */ new WeakMap(), _MessageStream_errored = /* @__PURE__ */ new WeakMap(), _MessageStream_aborted = /* @__PURE__ */ new WeakMap(), _MessageStream_catchingPromiseCreated = /* @__PURE__ */ new WeakMap(), _MessageStream_response = /* @__PURE__ */ new WeakMap(), _MessageStream_request_id = /* @__PURE__ */ new WeakMap(), _MessageStream_workspace_id = /* @__PURE__ */ new WeakMap(), _MessageStream_logger = /* @__PURE__ */ new WeakMap(), _MessageStream_handleError = /* @__PURE__ */ new WeakMap(), _MessageStream_instances = /* @__PURE__ */ new WeakSet(), _MessageStream_getFinalMessage = function _MessageStream_getFinalMessage() {
		if (this.receivedMessages.length === 0) throw new AnthropicError("stream ended without producing a Message with role=assistant");
		return this.receivedMessages.at(-1);
	}, _MessageStream_getFinalText = function _MessageStream_getFinalText() {
		if (this.receivedMessages.length === 0) throw new AnthropicError("stream ended without producing a Message with role=assistant");
		const textBlocks = this.receivedMessages.at(-1).content.filter((block) => block.type === "text").map((block) => block.text);
		if (textBlocks.length === 0) throw new AnthropicError("stream ended without producing a content block with type=text");
		return textBlocks.join(" ");
	}, _MessageStream_beginRequest = function _MessageStream_beginRequest() {
		if (this.ended) return;
		__classPrivateFieldSet(this, _MessageStream_currentMessageSnapshot, void 0, "f");
	}, _MessageStream_addStreamEvent = function _MessageStream_addStreamEvent(event) {
		if (this.ended) return;
		const messageSnapshot = __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_accumulateMessage).call(this, event);
		this._emit("streamEvent", event, messageSnapshot);
		switch (event.type) {
			case "content_block_delta": {
				const content = messageSnapshot.content.at(-1);
				switch (event.delta.type) {
					case "text_delta":
						if (content.type === "text") this._emit("text", event.delta.text, content.text || "");
						break;
					case "citations_delta":
						if (content.type === "text") this._emit("citation", event.delta.citation, content.citations ?? []);
						break;
					case "input_json_delta":
						if (tracksToolInput(content) && __classPrivateFieldGet(this, _MessageStream_listeners, "f").inputJson?.length) this._emit("inputJson", event.delta.partial_json, content.input);
						break;
					case "thinking_delta":
						if (content.type === "thinking") this._emit("thinking", event.delta.thinking, content.thinking);
						break;
					case "signature_delta":
						if (content.type === "thinking") this._emit("signature", content.signature);
						break;
					default: event.delta;
				}
				break;
			}
			case "message_stop":
				this._addMessageParam(messageSnapshot);
				this._addMessage(maybeParseMessage(messageSnapshot, __classPrivateFieldGet(this, _MessageStream_params, "f"), { logger: __classPrivateFieldGet(this, _MessageStream_logger, "f") }), true);
				break;
			case "content_block_stop":
				this._emit("contentBlock", messageSnapshot.content.at(-1));
				break;
			case "message_start": __classPrivateFieldSet(this, _MessageStream_currentMessageSnapshot, messageSnapshot, "f");
		}
	}, _MessageStream_endRequest = function _MessageStream_endRequest() {
		if (this.ended) throw new AnthropicError(`stream has ended, this shouldn't happen`);
		const snapshot = __classPrivateFieldGet(this, _MessageStream_currentMessageSnapshot, "f");
		if (!snapshot) throw new AnthropicError(`request ended without sending any chunks`);
		__classPrivateFieldSet(this, _MessageStream_currentMessageSnapshot, void 0, "f");
		return maybeParseMessage(snapshot, __classPrivateFieldGet(this, _MessageStream_params, "f"), { logger: __classPrivateFieldGet(this, _MessageStream_logger, "f") });
	}, _MessageStream_accumulateMessage = function _MessageStream_accumulateMessage(event) {
		let snapshot = __classPrivateFieldGet(this, _MessageStream_currentMessageSnapshot, "f");
		if (event.type === "message_start") {
			if (snapshot) throw new AnthropicError(`Unexpected event order, got ${event.type} before receiving "message_stop"`);
			return event.message;
		}
		if (!snapshot) throw new AnthropicError(`Unexpected event order, got ${event.type} before "message_start"`);
		switch (event.type) {
			case "message_stop": return snapshot;
			case "message_delta":
				snapshot.stop_reason = event.delta.stop_reason;
				snapshot.stop_sequence = event.delta.stop_sequence;
				snapshot.stop_details = event.delta.stop_details;
				snapshot.usage.output_tokens = event.usage.output_tokens;
				if (event.delta.container != null) snapshot.container = event.delta.container;
				if (event.usage.input_tokens != null) snapshot.usage.input_tokens = event.usage.input_tokens;
				if (event.usage.cache_creation_input_tokens != null) snapshot.usage.cache_creation_input_tokens = event.usage.cache_creation_input_tokens;
				if (event.usage.cache_read_input_tokens != null) snapshot.usage.cache_read_input_tokens = event.usage.cache_read_input_tokens;
				if (event.usage.server_tool_use != null) snapshot.usage.server_tool_use = event.usage.server_tool_use;
				if (event.usage.output_tokens_details != null) snapshot.usage.output_tokens_details = event.usage.output_tokens_details;
				return snapshot;
			case "content_block_start":
				snapshot.content.push({ ...event.content_block });
				return snapshot;
			case "content_block_delta": {
				const snapshotContent = snapshot.content.at(event.index);
				switch (event.delta.type) {
					case "text_delta":
						if (snapshotContent?.type === "text") snapshot.content[event.index] = {
							...snapshotContent,
							text: (snapshotContent.text || "") + event.delta.text
						};
						break;
					case "citations_delta":
						if (snapshotContent?.type === "text") snapshot.content[event.index] = {
							...snapshotContent,
							citations: [...snapshotContent.citations ?? [], event.delta.citation]
						};
						break;
					case "input_json_delta":
						if (snapshotContent && tracksToolInput(snapshotContent)) {
							const jsonBuf = (snapshotContent["__json_buf"] || "") + event.delta.partial_json;
							snapshot.content[event.index] = withLazyInput(snapshotContent, jsonBuf);
						}
						break;
					case "thinking_delta":
						if (snapshotContent?.type === "thinking") snapshot.content[event.index] = {
							...snapshotContent,
							thinking: snapshotContent.thinking + event.delta.thinking
						};
						break;
					case "signature_delta":
						if (snapshotContent?.type === "thinking") snapshot.content[event.index] = {
							...snapshotContent,
							signature: event.delta.signature
						};
						break;
					default: event.delta;
				}
				return snapshot;
			}
			case "content_block_stop": {
				const snapshotContent = snapshot.content.at(event.index);
				if (snapshotContent && tracksToolInput(snapshotContent) && "__json_buf" in snapshotContent) Object.defineProperty(snapshotContent, "input", {
					value: snapshotContent.input,
					enumerable: true,
					configurable: true,
					writable: true
				});
				return snapshot;
			}
		}
	}, Symbol.asyncIterator)]() {
		const pushQueue = [];
		const readQueue = [];
		let done = false;
		this.on("streamEvent", (event) => {
			const reader = readQueue.shift();
			if (reader) reader.resolve(event);
			else pushQueue.push(event);
		});
		this.on("end", () => {
			done = true;
			for (const reader of readQueue) reader.resolve(void 0);
			readQueue.length = 0;
		});
		this.on("abort", (err) => {
			done = true;
			for (const reader of readQueue) reader.reject(err);
			readQueue.length = 0;
		});
		this.on("error", (err) => {
			done = true;
			for (const reader of readQueue) reader.reject(err);
			readQueue.length = 0;
		});
		return {
			next: async () => {
				if (!pushQueue.length) {
					if (done) return {
						value: void 0,
						done: true
					};
					return new Promise((resolve, reject) => readQueue.push({
						resolve,
						reject
					})).then((chunk) => chunk ? {
						value: chunk,
						done: false
					} : {
						value: void 0,
						done: true
					});
				}
				return {
					value: pushQueue.shift(),
					done: false
				};
			},
			return: async () => {
				this.abort();
				return {
					value: void 0,
					done: true
				};
			}
		};
	}
	toReadableStream() {
		return new Stream(this[Symbol.asyncIterator].bind(this), this.controller).toReadableStream();
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/messages/batches.mjs
var Batches = class extends APIResource {
	/**
	* Send a batch of Message creation requests.
	*
	* The Message Batches API can be used to process multiple Messages API requests at
	* once. Once a Message Batch is created, it begins processing immediately. Batches
	* can take up to 24 hours to complete.
	*
	* Learn more about the Message Batches API in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
	*
	* @example
	* ```ts
	* const messageBatch = await client.messages.batches.create({
	*   requests: [
	*     {
	*       custom_id: 'my-custom-id-1',
	*       params: {
	*         max_tokens: 1024,
	*         messages: [
	*           { content: 'Hello, world', role: 'user' },
	*         ],
	*         model: 'claude-opus-5',
	*       },
	*     },
	*   ],
	* });
	* ```
	*/
	create(params, options) {
		const { user_profile_id, ...body } = params;
		return this._client.post("/v1/messages/batches", {
			body,
			...options,
			headers: buildHeaders([{ ...user_profile_id != null ? { "anthropic-user-profile-id": user_profile_id } : void 0 }, options?.headers])
		});
	}
	/**
	* This endpoint is idempotent and can be used to poll for Message Batch
	* completion. To access the results of a Message Batch, make a request to the
	* `results_url` field in the response.
	*
	* Learn more about the Message Batches API in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
	*
	* @example
	* ```ts
	* const messageBatch = await client.messages.batches.retrieve(
	*   'message_batch_id',
	* );
	* ```
	*/
	retrieve(messageBatchID, options) {
		return this._client.get(path`/v1/messages/batches/${messageBatchID}`, options);
	}
	/**
	* List all Message Batches within a Workspace. Most recently created batches are
	* returned first.
	*
	* Learn more about the Message Batches API in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
	*
	* @example
	* ```ts
	* // Automatically fetches more pages as needed.
	* for await (const messageBatch of client.messages.batches.list()) {
	*   // ...
	* }
	* ```
	*/
	list(query = {}, options) {
		return this._client.getAPIList("/v1/messages/batches", Page, {
			query,
			...options
		});
	}
	/**
	* Delete a Message Batch.
	*
	* Message Batches can only be deleted once they've finished processing. If you'd
	* like to delete an in-progress batch, you must first cancel it.
	*
	* Learn more about the Message Batches API in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
	*
	* @example
	* ```ts
	* const deletedMessageBatch =
	*   await client.messages.batches.delete('message_batch_id');
	* ```
	*/
	delete(messageBatchID, options) {
		return this._client.delete(path`/v1/messages/batches/${messageBatchID}`, options);
	}
	/**
	* Batches may be canceled any time before processing ends. Once cancellation is
	* initiated, the batch enters a `canceling` state, at which time the system may
	* complete any in-progress, non-interruptible requests before finalizing
	* cancellation.
	*
	* The number of canceled requests is specified in `request_counts`. To determine
	* which requests were canceled, check the individual results within the batch.
	* Note that cancellation may not result in any canceled requests if they were
	* non-interruptible.
	*
	* Learn more about the Message Batches API in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
	*
	* @example
	* ```ts
	* const messageBatch = await client.messages.batches.cancel(
	*   'message_batch_id',
	* );
	* ```
	*/
	cancel(messageBatchID, options) {
		return this._client.post(path`/v1/messages/batches/${messageBatchID}/cancel`, options);
	}
	/**
	* Streams the results of a Message Batch as a `.jsonl` file.
	*
	* Each line in the file is a JSON object containing the result of a single request
	* in the Message Batch. Results are not guaranteed to be in the same order as
	* requests. Use the `custom_id` field to match results to requests.
	*
	* Learn more about the Message Batches API in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
	*
	* @example
	* ```ts
	* const messageBatchIndividualResponse =
	*   await client.messages.batches.results('message_batch_id');
	* ```
	*/
	async results(messageBatchID, options) {
		const batch = await this.retrieve(messageBatchID);
		if (!batch.results_url) throw new AnthropicError(`No batch \`results_url\`; Has it finished processing? ${batch.processing_status} - ${batch.id}`);
		return this._client.get(batch.results_url, {
			...options,
			headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
			stream: true,
			__binaryResponse: true
		})._thenUnwrap((_, props) => JSONLDecoder.fromResponse(props.response, props.controller));
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/messages/messages.mjs
var Messages = class extends APIResource {
	constructor() {
		super(...arguments);
		this.batches = new Batches(this._client);
	}
	create(params, options) {
		const { user_profile_id, ...body } = params;
		if (body.model in DEPRECATED_MODELS) console.warn(`The model '${body.model}' is deprecated and will reach end-of-life on ${DEPRECATED_MODELS[body.model]}\nPlease migrate to a newer model. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.`);
		if (MODELS_TO_WARN_WITH_THINKING_ENABLED.includes(body.model) && body.thinking && body.thinking.type === "enabled") console.warn(`Using Claude with ${body.model} and 'thinking.type=enabled' is deprecated. Use 'thinking.type=adaptive' instead which results in better model performance in our testing: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking`);
		let timeout = options?.timeout ?? this._client._options.timeout;
		if (!body.stream && timeout == null) {
			const maxNonstreamingTokens = MODEL_NONSTREAMING_TOKENS[body.model] ?? void 0;
			timeout = this._client.calculateNonstreamingTimeout(body.max_tokens, maxNonstreamingTokens);
		}
		const helperHeader = stainlessHelperHeader(body.tools, body.messages);
		return this._client.post("/v1/messages", {
			body,
			timeout: timeout ?? 6e5,
			...options,
			headers: buildHeaders([
				{ ...user_profile_id != null ? { "anthropic-user-profile-id": user_profile_id } : void 0 },
				helperHeader,
				options?.headers
			]),
			stream: params.stream ?? false
		});
	}
	/**
	* Send a structured list of input messages with text and/or image content, along with an expected `output_config.format` and
	* the response will be automatically parsed and available in the `parsed_output` property of the message.
	*
	* @example
	* ```ts
	* const message = await client.messages.parse({
	*   model: 'claude-sonnet-4-5-20250929',
	*   max_tokens: 1024,
	*   messages: [{ role: 'user', content: 'What is 2+2?' }],
	*   output_config: {
	*     format: zodOutputFormat(z.object({ answer: z.number() })),
	*   },
	* });
	*
	* console.log(message.parsed_output?.answer); // 4
	* ```
	*/
	parse(params, options) {
		return this.create(params, options).then((message) => parseMessage(message, params, { logger: this._client.logger ?? console }));
	}
	/**
	* Create a Message stream.
	*
	* If `output_config.format` is provided with a parseable format (like `zodOutputFormat()`),
	* the final message will include a `parsed_output` property with the parsed content.
	*
	* @example
	* ```ts
	* const stream = client.messages.stream({
	*   model: 'claude-sonnet-4-5-20250929',
	*   max_tokens: 1024,
	*   messages: [{ role: 'user', content: 'What is 2+2?' }],
	*   output_config: {
	*     format: zodOutputFormat(z.object({ answer: z.number() })),
	*   },
	* });
	*
	* const message = await stream.finalMessage();
	* console.log(message.parsed_output?.answer); // 4
	* ```
	*/
	stream(body, options) {
		return MessageStream.createMessage(this, body, options, { logger: this._client.logger ?? console });
	}
	/**
	* Count the number of tokens in a Message.
	*
	* The Token Count API can be used to count the number of tokens in a Message,
	* including tools, images, and documents, without creating it.
	*
	* Learn more about token counting in our
	* [user guide](https://platform.claude.com/docs/en/build-with-claude/token-counting)
	*
	* @example
	* ```ts
	* const messageTokensCount =
	*   await client.messages.countTokens({
	*     messages: [{ content: 'Hello, world', role: 'user' }],
	*     model: 'claude-opus-5',
	*   });
	* ```
	*/
	countTokens(params, options) {
		const { user_profile_id, ...body } = params;
		return this._client.post("/v1/messages/count_tokens", {
			body,
			...options,
			headers: buildHeaders([{ ...user_profile_id != null ? { "anthropic-user-profile-id": user_profile_id } : void 0 }, options?.headers])
		});
	}
};
const DEPRECATED_MODELS = {};
const MODELS_TO_WARN_WITH_THINKING_ENABLED = ["claude-mythos-preview", "claude-opus-4-6"];
Messages.Batches = Batches;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/models.mjs
var Models = class extends APIResource {
	/**
	* Get a specific model.
	*
	* The Models API response can be used to determine information about a specific
	* model or resolve a model alias to a model ID.
	*/
	retrieve(modelID, params = {}, options) {
		const { betas } = params ?? {};
		return this._client.get(path`/v1/models/${modelID}`, {
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
	/**
	* List available models.
	*
	* The Models API response can be used to determine which models are available for
	* use in the API. More recently released models are listed first.
	*/
	list(params = {}, options) {
		const { betas, ...query } = params ?? {};
		return this._client.getAPIList("/v1/models", Page, {
			query,
			...options,
			headers: buildHeaders([{ ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : void 0 }, options?.headers])
		});
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/skills/versions.mjs
var Versions = class extends APIResource {
	/**
	* Create Skill Version
	*/
	create(skillID, body, options) {
		return this._client.post(path`/v1/skills/${skillID}/versions`, multipartFormRequestOptions({
			body,
			...options
		}, this._client, false));
	}
	/**
	* Get Skill Version
	*/
	retrieve(version, params, options) {
		const { skill_id } = params;
		return this._client.get(path`/v1/skills/${skill_id}/versions/${version}`, options);
	}
	/**
	* List Skill Versions
	*/
	list(skillID, query = {}, options) {
		return this._client.getAPIList(path`/v1/skills/${skillID}/versions`, PageCursor, {
			query,
			...options
		});
	}
	/**
	* Delete Skill Version
	*/
	delete(version, params, options) {
		const { skill_id } = params;
		return this._client.delete(path`/v1/skills/${skill_id}/versions/${version}`, options);
	}
};
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/resources/skills/skills.mjs
var Skills = class extends APIResource {
	constructor() {
		super(...arguments);
		this.versions = new Versions(this._client);
	}
	/**
	* Create Skill
	*/
	create(body, options) {
		return this._client.post("/v1/skills", multipartFormRequestOptions({
			body,
			...options
		}, this._client, false));
	}
	/**
	* Get Skill
	*/
	retrieve(skillID, options) {
		return this._client.get(path`/v1/skills/${skillID}`, options);
	}
	/**
	* List Skills
	*/
	list(query = {}, options) {
		return this._client.getAPIList("/v1/skills", PageCursor, {
			query,
			...options
		});
	}
	/**
	* Delete Skill
	*/
	delete(skillID, options) {
		return this._client.delete(path`/v1/skills/${skillID}`, options);
	}
};
Skills.Versions = Versions;
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/client.mjs
var _BaseAnthropic_instances;
var _a;
var _BaseAnthropic_encoder;
var _BaseAnthropic_baseURLOverridden;
const HUMAN_PROMPT = "\\n\\nHuman:";
const AI_PROMPT = "\\n\\nAssistant:";
/**
* Base class for Anthropic API clients.
*/
var BaseAnthropic = class {
	/**
	* The active credential provider. Default credential resolution runs once
	* at construction time. If it fails, the error is surfaced on every
	* request and the client must be reconstructed — there is no retry path.
	*
	* Clones returned by {@link withOptions} share the parent's auth state
	* (provider, token cache, pending resolution, and any resolution error)
	* unless the caller passes an explicit `apiKey`, `authToken`,
	* `credentials`, `config`, or `profile` override.
	*/
	get credentials() {
		return this._authState.provider;
	}
	/**
	* API Client for interfacing with the Anthropic API.
	*
	* @param {string | null | undefined} [opts.apiKey=process.env['ANTHROPIC_API_KEY'] ?? null]
	* @param {string | null | undefined} [opts.authToken=process.env['ANTHROPIC_AUTH_TOKEN'] ?? null]
	* @param {string | null | undefined} [opts.webhookKey=process.env['ANTHROPIC_WEBHOOK_SIGNING_KEY'] ?? null]
	* @param {string} [opts.baseURL=process.env['ANTHROPIC_BASE_URL'] ?? https://api.anthropic.com] - Override the default base URL for the API.
	* @param {number} [opts.timeout=10 minutes] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
	* @param {MergedRequestInit} [opts.fetchOptions] - Additional `RequestInit` options to be passed to `fetch` calls.
	* @param {Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
	* @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
	* @param {HeadersLike} opts.defaultHeaders - Default headers to include with every request to the API.
	* @param {Record<string, string | undefined>} opts.defaultQuery - Default query parameters to include with every request to the API.
	* @param {boolean} [opts.dangerouslyAllowBrowser=false] - By default, client-side use of this library is not allowed, as it risks exposing your secret API credentials to attackers.
	*/
	constructor({ baseURL = readEnv("ANTHROPIC_BASE_URL"), apiKey, authToken, webhookKey = readEnv("ANTHROPIC_WEBHOOK_SIGNING_KEY") ?? null, ...opts } = {}) {
		_BaseAnthropic_instances.add(this);
		this._requestAuthFlags = /* @__PURE__ */ new WeakMap();
		_BaseAnthropic_encoder.set(this, void 0);
		if (apiKey === void 0) apiKey = opts.profile != null ? null : readEnv("ANTHROPIC_API_KEY") ?? null;
		if (authToken === void 0) authToken = opts.profile != null ? null : readEnv("ANTHROPIC_AUTH_TOKEN") ?? null;
		if (opts.profile != null && (opts.credentials != null || opts.config != null)) throw new TypeError("Pass at most one of `profile`, `credentials`, or `config`.");
		const options = {
			apiKey,
			authToken,
			webhookKey,
			...opts,
			baseURL: baseURL || `https://api.anthropic.com`
		};
		if (!options.dangerouslyAllowBrowser && isRunningInBrowser()) throw new AnthropicError("It looks like you're running in a browser-like environment.\n\nThis is disabled by default, as it risks exposing your secret API credentials to attackers.\nIf you understand the risks and have appropriate mitigations in place,\nyou can set the `dangerouslyAllowBrowser` option to `true`, e.g.,\n\nnew Anthropic({ apiKey, dangerouslyAllowBrowser: true });\n");
		this.baseURL = options.baseURL;
		this._baseURLIsExplicit = opts.__baseURLIsExplicit ?? !!baseURL;
		this.timeout = options.timeout ?? _a.DEFAULT_TIMEOUT;
		this.logger = options.logger ?? console;
		this.logLevel = defaultLogLevel;
		this.logLevel = parseLogLevel(options.logLevel, "ClientOptions.logLevel", loggerFor(this)) ?? parseLogLevel(readEnv("ANTHROPIC_LOG"), "process.env['ANTHROPIC_LOG']", loggerFor(this)) ?? "warn";
		this.fetchOptions = options.fetchOptions;
		this.maxRetries = options.maxRetries ?? 2;
		this.fetch = options.fetch ?? getDefaultFetch();
		__classPrivateFieldSet(this, _BaseAnthropic_encoder, FallbackEncoder, "f");
		this.middleware = [...options.middleware ?? []];
		const customHeadersEnv = readEnv("ANTHROPIC_CUSTOM_HEADERS");
		if (customHeadersEnv) {
			const parsed = {};
			for (const line of customHeadersEnv.split("\n")) {
				const colon = line.indexOf(":");
				if (colon >= 0) parsed[line.substring(0, colon).trim()] = line.substring(colon + 1).trim();
			}
			options.defaultHeaders = {
				...parsed,
				...options.defaultHeaders
			};
		}
		const inherited = opts.__auth;
		delete options.__auth;
		delete options.__baseURLIsExplicit;
		this._options = options;
		this.apiKey = typeof apiKey === "string" ? apiKey : null;
		this.authToken = authToken;
		this.webhookKey = webhookKey;
		if (inherited) {
			this._authState = inherited;
			if (!this._baseURLIsExplicit && inherited.baseURL) this.baseURL = inherited.baseURL;
		} else {
			this._authState = {
				provider: null,
				tokenCache: null,
				resolution: null,
				error: null,
				extraHeaders: {}
			};
			if (this.apiKey == null && this.authToken == null) {
				const credentials = options.credentials ?? null;
				if (credentials) {
					this._authState.provider = credentials;
					this._authState.tokenCache = this._makeTokenCache(credentials);
				} else if (options.config != null) {
					const result = resolveCredentialsFromConfig(options.config, this._credentialResolverOptions());
					this._authState.provider = result.provider;
					this._authState.tokenCache = this._makeTokenCache(result.provider);
					this._authState.extraHeaders = result.extraHeaders;
					this._applyCredentialBaseURL(result.baseURL);
				} else if (options.profile != null) this._authState.resolution = this._resolveDefaultCredentials(options.profile);
				else if (this._shouldResolveDefaultCredentials()) this._authState.resolution = this._resolveDefaultCredentials();
			}
		}
	}
	/**
	* Whether to lazily resolve auth from the default credential chain when no
	* explicit auth is configured. Called once from the constructor, so
	* overrides must not depend on subclass instance state. Subclasses that
	* bring their own auth scheme return false so unrelated local credentials
	* are never resolved or allowed to supply a base URL.
	*/
	_shouldResolveDefaultCredentials() {
		return true;
	}
	/**
	* Stores a profile/config-supplied base URL on the shared auth state and, if
	* the caller did not pin `baseURL` via constructor option or env, adopts it
	* as this client's outbound API host. Precedence: ctor opt > env > profile >
	* hardcoded default.
	*/
	_applyCredentialBaseURL(baseURL) {
		if (!baseURL) return;
		const normalized = baseURL.replace(/\/+$/, "");
		this._authState.baseURL = normalized;
		if (!this._baseURLIsExplicit) this.baseURL = normalized;
	}
	/**
	* Options bag passed into the credential chain. `baseURL` here is only the
	* fallback host for the token-exchange POST when the config itself omits
	* `base_url`; the chain returns the config's own `base_url` (if any) on
	* {@link CredentialResult.baseURL}, which {@link _applyCredentialBaseURL}
	* then adopts for outbound API requests. The two are deliberately decoupled
	* so this fallback never round-trips into precedence.
	*/
	_credentialResolverOptions() {
		return {
			baseURL: this.baseURL,
			fetch: this._credentialsFetch(),
			userAgent: this.getUserAgent(),
			onCacheWriteError: (err) => {
				loggerFor(this).debug("credential cache write failed (best-effort)", err);
			},
			onSafetyWarning: (msg) => {
				loggerFor(this).warn(msg);
			}
		};
	}
	/**
	* A `Fetch` for first-party credential token-exchange requests (OIDC
	* federation jwt-bearer grants, user-OAuth refresh grants) that routes
	* through this client's middleware chain, so middleware observes token
	* traffic like any other request. Only client-level middleware applies:
	* a minted token is shared across requests, so attributing the exchange
	* to any one request's per-request middleware would be arbitrary. For the
	* same reason, `ctx.options` is undefined for these requests.
	*/
	_credentialsFetch() {
		return wrapFetchWithMiddleware(this.fetch, this.middleware, void 0, this);
	}
	_makeTokenCache(provider) {
		return new TokenCache(provider, (err) => {
			loggerFor(this).debug("advisory token refresh failed; serving cached token", err);
		});
	}
	/**
	* Create a new client instance re-using the same options given to the current client with optional overriding.
	*/
	withOptions(options) {
		const overridesStructuredAuth = "credentials" in options || "config" in options || "profile" in options;
		const overridesAuth = "apiKey" in options || "authToken" in options || overridesStructuredAuth;
		const internal = {
			...this._options,
			...this._baseURLIsExplicit ? { baseURL: this.baseURL } : {},
			maxRetries: this.maxRetries,
			timeout: this.timeout,
			logger: this.logger,
			logLevel: this.logLevel,
			fetch: this.fetch,
			fetchOptions: this.fetchOptions,
			middleware: this.middleware,
			apiKey: this.apiKey,
			authToken: this.authToken,
			webhookKey: this.webhookKey,
			credentials: this.credentials,
			...overridesStructuredAuth ? {
				credentials: void 0,
				config: void 0,
				profile: void 0
			} : {},
			...options,
			__auth: overridesAuth ? void 0 : this._authState,
			__baseURLIsExplicit: "baseURL" in options ? true : this._baseURLIsExplicit
		};
		return new this.constructor(internal);
	}
	/**
	* Lazily resolves credentials from config files or environment variables.
	* Called once from the constructor when no explicit auth is provided, or
	* when an explicit `profile` was passed (in which case a missing/unresolved
	* profile is surfaced as an error instead of falling through to "no auth").
	* The returned promise is stored and awaited on the first request.
	*/
	async _resolveDefaultCredentials(profile) {
		try {
			const result = await defaultCredentials(this._credentialResolverOptions(), profile);
			if (result) {
				this._authState.provider = result.provider;
				this._authState.tokenCache = this._makeTokenCache(result.provider);
				this._authState.extraHeaders = result.extraHeaders;
				this._applyCredentialBaseURL(result.baseURL);
			} else if (profile != null) throw new AnthropicError(`Profile "${profile}" could not be resolved (no <config_dir>/configs/${profile}.json found).`);
		} catch (err) {
			this._authState.error = err;
		} finally {
			this._authState.resolution = null;
		}
	}
	defaultQuery() {
		return this._options.defaultQuery;
	}
	validateHeaders({ values, nulls }) {
		if (values.get("x-api-key") || values.get("authorization")) return;
		if (this._authState.error) throw this._authState.error;
		if (this._authState.tokenCache || this._authState.resolution) return;
		if (this.apiKey && values.get("x-api-key")) return;
		if (nulls.has("x-api-key")) return;
		if (this.authToken && values.get("authorization")) return;
		if (nulls.has("authorization")) return;
		throw new Error("Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set. Or for one of the \"X-Api-Key\" or \"Authorization\" headers to be explicitly omitted");
	}
	_authFlags(opts) {
		let flags = this._requestAuthFlags.get(opts);
		if (!flags) {
			flags = {
				usedTokenCache: false,
				didRefreshFor401: false
			};
			this._requestAuthFlags.set(opts, flags);
		}
		return flags;
	}
	async authHeaders(opts) {
		if (this._authState.resolution) await this._authState.resolution;
		if (this._authState.error) return;
		if (this._authState.tokenCache && this.apiKey == null) {
			const token = await this._authState.tokenCache.getToken();
			this._authFlags(opts).usedTokenCache = true;
			return buildHeaders([{ Authorization: `Bearer ${token}` }]);
		}
		return buildHeaders([await this.apiKeyAuth(opts), await this.bearerAuth(opts)]);
	}
	async apiKeyAuth(opts) {
		if (this.apiKey == null) return;
		return buildHeaders([{ "X-Api-Key": this.apiKey }]);
	}
	async bearerAuth(opts) {
		if (this.authToken == null) return;
		return buildHeaders([{ Authorization: `Bearer ${this.authToken}` }]);
	}
	stringifyQuery(query) {
		return stringifyQuery(query);
	}
	getUserAgent() {
		return `Anthropic/JS ${VERSION}`;
	}
	defaultIdempotencyKey() {
		return `stainless-node-retry-${uuid4()}`;
	}
	makeStatusError(status, error, message, headers) {
		return APIError.generate(status, error, message, headers);
	}
	buildURL(path, query, defaultBaseURL) {
		const baseURL = !__classPrivateFieldGet(this, _BaseAnthropic_instances, "m", _BaseAnthropic_baseURLOverridden).call(this) && defaultBaseURL || this.baseURL;
		const url = isAbsoluteURL(path) ? new URL(path) : new URL(baseURL + (baseURL.endsWith("/") && path.startsWith("/") ? path.slice(1) : path));
		const defaultQuery = this.defaultQuery();
		const pathQuery = Object.fromEntries(url.searchParams);
		if (!isEmptyObj(defaultQuery) || !isEmptyObj(pathQuery)) query = {
			...pathQuery,
			...defaultQuery,
			...query
		};
		if (typeof query === "object" && query && !Array.isArray(query)) url.search = this.stringifyQuery(query);
		return url.toString();
	}
	_calculateNonstreamingTimeout(maxTokens) {
		const defaultTimeout = 600;
		if (3600 * maxTokens / 128e3 > defaultTimeout) throw new AnthropicError("Streaming is required for operations that may take longer than 10 minutes. See https://github.com/anthropics/anthropic-sdk-typescript#streaming-responses for more details");
		return defaultTimeout * 1e3;
	}
	/**
	* Used as a callback for mutating the given `FinalRequestOptions` object.
	*/
	async prepareOptions(options) {}
	/**
	* Used as a callback for mutating the given `RequestInit` object.
	*
	* This is useful for cases where you want to add certain headers based off of
	* the request properties, e.g. `method` or `url`.
	*
	* Runs after all middleware (including {@link backendMiddleware}),
	* immediately before each underlying fetch call, so it sees exactly what
	* goes over the wire. Middleware may replay a request by calling `next()`
	* more than once, so this hook can run multiple times per attempt:
	* overrides must be idempotent and overwrite headers from a previous
	* invocation rather than append to them.
	*/
	async prepareRequest(request, { url, options }) {
		if (this._authState.tokenCache && this.apiKey == null) {
			const headers = request.headers instanceof Headers ? request.headers : new Headers(request.headers);
			for (const [k, v] of Object.entries(this._authState.extraHeaders)) if (!headers.has(k)) headers.set(k, v);
			if (!(headers.get("anthropic-beta")?.split(",").map((s) => s.trim()))?.includes("oauth-2025-04-20")) headers.append("anthropic-beta", OAUTH_API_BETA_HEADER);
			request.headers = headers;
		}
	}
	/**
	* Internal {@link Middleware} composed innermost in the chain — inside both
	* client-level and per-request middleware, immediately around the underlying
	* `fetch`. Subclasses for third-party backends override this to adapt the
	* canonical Anthropic-shaped request to the backend's wire shape (URL/body
	* rewriting, request signing) and to normalize the wire response back to the
	* canonical shape (e.g. AWS EventStream to SSE).
	*
	* Running inside the user's middleware means user middleware always observes
	* canonical Anthropic-shaped traffic, and the adaptation re-runs (e.g.
	* re-signs) on every `next()` invocation, covering whatever the middleware
	* mutated.
	*
	* Errors thrown here follow the middleware error policy: they propagate to
	* the caller as-is — no retries, no `APIConnectionError` wrapping — unless
	* retryable (see {@link Middleware}); throw a `RetryableError` to opt into
	* the retry path.
	*/
	backendMiddleware() {
		return [];
	}
	get(path, opts) {
		return this.methodRequest("get", path, opts);
	}
	post(path, opts) {
		return this.methodRequest("post", path, opts);
	}
	patch(path, opts) {
		return this.methodRequest("patch", path, opts);
	}
	put(path, opts) {
		return this.methodRequest("put", path, opts);
	}
	delete(path, opts) {
		return this.methodRequest("delete", path, opts);
	}
	methodRequest(method, path, opts) {
		return this.request(Promise.resolve(opts).then((opts) => {
			return {
				method,
				path,
				...opts
			};
		}));
	}
	request(options, remainingRetries = null) {
		return new APIPromise(this, this.makeRequest(options, remainingRetries, void 0));
	}
	async makeRequest(optionsInput, retriesRemaining, retryOfRequestLogID) {
		const options = await optionsInput;
		const maxRetries = options.maxRetries ?? this.maxRetries;
		if (retriesRemaining == null) {
			retriesRemaining = maxRetries;
			this._requestAuthFlags.delete(options);
		}
		await this.prepareOptions(options);
		const { req, url, timeout } = await this.buildRequest(options, { retryCount: maxRetries - retriesRemaining });
		/** Not an API request ID, just for correlating local log entries. */
		const requestLogID = "log_" + (Math.random() * (1 << 24) | 0).toString(16).padStart(6, "0");
		const retryLogStr = retryOfRequestLogID === void 0 ? "" : `, retryOf: ${retryOfRequestLogID}`;
		const startTime = Date.now();
		if (options.signal?.aborted) throw new APIUserAbortError();
		const controller = new AbortController();
		const response = await this.fetchWithTimeout(url, req, timeout, controller, options, {
			requestLogID,
			retryOfRequestLogID
		}).catch(castToError);
		const headersTime = Date.now();
		if (response instanceof globalThis.Error) {
			releaseRequestSignal(controller);
			const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;
			if (options.signal?.aborted) throw new APIUserAbortError();
			const isTimeout = isAbortError(response) || /timed? ?out/i.test(String(response) + ("cause" in response ? String(response.cause) : ""));
			const hasMiddleware = this.middleware.length > 0 || !!options.middleware?.length || this.backendMiddleware().length > 0;
			if (hasMiddleware && !isTimeout && !isRetryableError(response)) {
				loggerFor(this).info(`[${requestLogID}] middleware error (not retryable)`);
				loggerFor(this).debug(`[${requestLogID}] middleware error (not retryable)`, formatRequestDetails({
					retryOfRequestLogID,
					url,
					durationMs: headersTime - startTime,
					message: response.message
				}));
				throw response;
			}
			if (retriesRemaining) {
				loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - ${retryMessage}`);
				loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (${retryMessage})`, formatRequestDetails({
					retryOfRequestLogID,
					url,
					durationMs: headersTime - startTime,
					message: response.message
				}));
				return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID);
			}
			loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - error; no more retries left`);
			loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (error; no more retries left)`, formatRequestDetails({
				retryOfRequestLogID,
				url,
				durationMs: headersTime - startTime,
				message: response.message
			}));
			if (isTimeout) throw new APIConnectionTimeoutError();
			if (hasMiddleware && !isFetchOriginError(response)) throw response;
			throw new APIConnectionError({ cause: response });
		}
		const responseInfo = `[${requestLogID}${retryLogStr}${[...response.headers.entries()].filter(([name]) => name === "request-id" || name === "anthropic-workspace-id").map(([name, value]) => ", " + name + ": " + JSON.stringify(value)).join("")}] ${req.method} ${url} ${response.ok ? "succeeded" : "failed"} with status ${response.status} in ${headersTime - startTime}ms`;
		if (!response.ok) {
			const shouldRetry = await this.shouldRetry(response, options);
			if (retriesRemaining && shouldRetry) {
				const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;
				await CancelReadableStream(response.body);
				releaseRequestSignal(controller);
				loggerFor(this).info(`${responseInfo} - ${retryMessage}`);
				loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage})`, formatRequestDetails({
					retryOfRequestLogID,
					url: response.url,
					status: response.status,
					headers: response.headers,
					durationMs: headersTime - startTime
				}));
				return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID, response.headers);
			}
			const retryMessage = shouldRetry ? `error; no more retries left` : `error; not retryable`;
			loggerFor(this).info(`${responseInfo} - ${retryMessage}`);
			const errText = await response.text().catch((err) => castToError(err).message);
			const errJSON = safeJSON(errText);
			const errMessage = errJSON ? void 0 : errText;
			loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage})`, formatRequestDetails({
				retryOfRequestLogID,
				url: response.url,
				status: response.status,
				headers: response.headers,
				message: errMessage,
				durationMs: Date.now() - startTime
			}));
			releaseRequestSignal(controller);
			throw this.makeStatusError(response.status, errJSON, errMessage, response.headers);
		}
		loggerFor(this).info(responseInfo);
		loggerFor(this).debug(`[${requestLogID}] response start`, formatRequestDetails({
			retryOfRequestLogID,
			url: response.url,
			status: response.status,
			headers: response.headers,
			durationMs: headersTime - startTime
		}));
		armAbandonmentBackstop(response.body ?? response, controller);
		return {
			response,
			options,
			controller,
			requestLogID,
			retryOfRequestLogID,
			startTime
		};
	}
	getAPIList(path, Page, opts) {
		return this.requestAPIList(Page, opts && "then" in opts ? opts.then((opts) => ({
			method: "get",
			path,
			...opts
		})) : {
			method: "get",
			path,
			...opts
		});
	}
	requestAPIList(Page, options) {
		const request = this.makeRequest(options, null, void 0);
		return new PagePromise(this, request, Page);
	}
	async fetchWithTimeout(url, init, ms, controller, requestOptions, logCtx) {
		const { signal, method, ...options } = init || {};
		const abort = this._makeAbort(controller);
		if (signal) {
			signal.addEventListener("abort", abort, { once: true });
			registerRequestSignalCleanup(controller, signal, abort);
		}
		const isReadableBody = globalThis.ReadableStream && options.body instanceof globalThis.ReadableStream || typeof options.body === "object" && options.body !== null && Symbol.asyncIterator in options.body;
		const fetchOptions = {
			signal: controller.signal,
			...isReadableBody ? { duplex: "half" } : {},
			method: "GET",
			...options
		};
		if (method) fetchOptions.method = method.toUpperCase();
		const baseFetch = this.fetch;
		const timedFetch = async (innerUrl, innerInit) => {
			const timeout = setTimeout(abort, ms);
			try {
				return await baseFetch.call(void 0, innerUrl, innerInit);
			} finally {
				clearTimeout(timeout);
			}
		};
		const innerFetch = requestOptions === void 0 ? timedFetch : (async (innerUrl, innerInit = {}) => {
			const innerUrlStr = typeof innerUrl === "string" ? innerUrl : innerUrl instanceof URL ? innerUrl.href : innerUrl.url;
			innerInit.headers = innerInit.headers instanceof Headers ? innerInit.headers : new Headers(innerInit.headers);
			await this.prepareRequest(innerInit, {
				url: innerUrlStr,
				options: requestOptions
			});
			if (logCtx) loggerFor(this).debug(`[${logCtx.requestLogID}] sending request`, formatRequestDetails({
				retryOfRequestLogID: logCtx.retryOfRequestLogID,
				method: innerInit.method,
				url: innerUrlStr,
				options: requestOptions,
				headers: innerInit.headers
			}));
			return timedFetch(innerUrl, innerInit);
		});
		const requestMiddleware = requestOptions?.middleware;
		const backendMiddleware = this.backendMiddleware();
		return await wrapFetchWithMiddleware(innerFetch, requestMiddleware?.length || backendMiddleware.length ? [
			...this.middleware,
			...requestMiddleware ?? [],
			...backendMiddleware
		] : this.middleware, requestOptions, this)(url, fetchOptions);
	}
	async shouldRetry(response, options) {
		const flags = this._authFlags(options);
		if (response.status === 401 && this._authState.tokenCache && flags.usedTokenCache && !flags.didRefreshFor401) {
			flags.didRefreshFor401 = true;
			this._authState.tokenCache.invalidate();
			return true;
		}
		const shouldRetryHeader = response.headers.get("x-should-retry");
		if (shouldRetryHeader === "true") return true;
		if (shouldRetryHeader === "false") return false;
		if (response.status === 408) return true;
		if (response.status === 409) return true;
		if (response.status === 429) return true;
		if (response.status >= 500) return true;
		return false;
	}
	async retryRequest(options, retriesRemaining, requestLogID, responseHeaders) {
		let timeoutMillis;
		const retryAfterMillisHeader = responseHeaders?.get("retry-after-ms");
		if (retryAfterMillisHeader) {
			const timeoutMs = parseFloat(retryAfterMillisHeader);
			if (!Number.isNaN(timeoutMs)) timeoutMillis = timeoutMs;
		}
		const retryAfterHeader = responseHeaders?.get("retry-after");
		if (retryAfterHeader && !timeoutMillis) {
			const timeoutSeconds = parseFloat(retryAfterHeader);
			if (!Number.isNaN(timeoutSeconds)) timeoutMillis = timeoutSeconds * 1e3;
			else timeoutMillis = Date.parse(retryAfterHeader) - Date.now();
		}
		if (timeoutMillis === void 0) {
			const maxRetries = options.maxRetries ?? this.maxRetries;
			timeoutMillis = this.calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries);
		}
		await sleep(timeoutMillis);
		return this.makeRequest(options, retriesRemaining - 1, requestLogID);
	}
	calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries) {
		const initialRetryDelay = .5;
		const maxRetryDelay = 8;
		const numRetries = maxRetries - retriesRemaining;
		return Math.min(initialRetryDelay * Math.pow(2, numRetries), maxRetryDelay) * (1 - Math.random() * .25) * 1e3;
	}
	calculateNonstreamingTimeout(maxTokens, maxNonstreamingTokens) {
		const maxTime = 36e5;
		const defaultTime = 6e5;
		if (maxTime * maxTokens / 128e3 > defaultTime || maxNonstreamingTokens != null && maxTokens > maxNonstreamingTokens) throw new AnthropicError("Streaming is required for operations that may take longer than 10 minutes. See https://github.com/anthropics/anthropic-sdk-typescript#long-requests for more details");
		return defaultTime;
	}
	async buildRequest(inputOptions, { retryCount = 0 } = {}) {
		const options = { ...inputOptions };
		const { method, path, query, defaultBaseURL } = options;
		if (this._authState.resolution) await this._authState.resolution;
		if (!this._baseURLIsExplicit && this._authState.baseURL && this.baseURL !== this._authState.baseURL) this.baseURL = this._authState.baseURL;
		const url = this.buildURL(path, query, defaultBaseURL);
		if ("timeout" in options) validatePositiveInteger("timeout", options.timeout);
		options.timeout = options.timeout ?? this.timeout;
		const { bodyHeaders, body } = this.buildBody({ options });
		return {
			req: {
				method,
				headers: await this.buildHeaders({
					options: inputOptions,
					method,
					bodyHeaders,
					retryCount
				}),
				...options.signal && { signal: options.signal },
				...globalThis.ReadableStream && body instanceof globalThis.ReadableStream && { duplex: "half" },
				...body && { body },
				...this.fetchOptions ?? {},
				...options.fetchOptions ?? {}
			},
			url,
			timeout: options.timeout
		};
	}
	async buildHeaders({ options, method, bodyHeaders, retryCount }) {
		let idempotencyHeaders = {};
		if (this.idempotencyHeader && method !== "get") {
			if (!options.idempotencyKey) options.idempotencyKey = this.defaultIdempotencyKey();
			idempotencyHeaders[this.idempotencyHeader] = options.idempotencyKey;
		}
		const headers = buildHeaders([
			idempotencyHeaders,
			{
				Accept: "application/json",
				"User-Agent": this.getUserAgent(),
				"X-Stainless-Retry-Count": String(retryCount),
				...options.timeout ? { "X-Stainless-Timeout": String(Math.trunc(options.timeout / 1e3)) } : {},
				...getPlatformHeaders(),
				...this._options.dangerouslyAllowBrowser ? { "anthropic-dangerous-direct-browser-access": "true" } : void 0,
				"anthropic-version": "2023-06-01"
			},
			await this.authHeaders(options),
			this._options.defaultHeaders,
			bodyHeaders,
			options.headers
		]);
		this.validateHeaders(headers);
		return headers.values;
	}
	_makeAbort(controller) {
		return () => controller.abort();
	}
	buildBody({ options: { body, headers: rawHeaders } }) {
		if (!body) return {
			bodyHeaders: void 0,
			body: void 0
		};
		const headers = buildHeaders([rawHeaders]);
		if (ArrayBuffer.isView(body) || body instanceof ArrayBuffer || body instanceof DataView || typeof body === "string" && headers.values.has("content-type") || globalThis.Blob && body instanceof globalThis.Blob || body instanceof FormData || body instanceof URLSearchParams || globalThis.ReadableStream && body instanceof globalThis.ReadableStream) return {
			bodyHeaders: void 0,
			body
		};
		else if (typeof body === "object" && (Symbol.asyncIterator in body || Symbol.iterator in body && "next" in body && typeof body.next === "function")) return {
			bodyHeaders: void 0,
			body: ReadableStreamFrom(body)
		};
		else if (typeof body === "object" && headers.values.get("content-type") === "application/x-www-form-urlencoded") return {
			bodyHeaders: { "content-type": "application/x-www-form-urlencoded" },
			body: this.stringifyQuery(body)
		};
		else return __classPrivateFieldGet(this, _BaseAnthropic_encoder, "f").call(this, {
			body,
			headers
		});
	}
};
_a = BaseAnthropic, _BaseAnthropic_encoder = /* @__PURE__ */ new WeakMap(), _BaseAnthropic_instances = /* @__PURE__ */ new WeakSet(), _BaseAnthropic_baseURLOverridden = function _BaseAnthropic_baseURLOverridden() {
	return this.baseURL !== "https://api.anthropic.com";
};
BaseAnthropic.Anthropic = _a;
BaseAnthropic.HUMAN_PROMPT = HUMAN_PROMPT;
BaseAnthropic.AI_PROMPT = AI_PROMPT;
BaseAnthropic.DEFAULT_TIMEOUT = 6e5;
BaseAnthropic.AnthropicError = AnthropicError;
BaseAnthropic.APIError = APIError;
BaseAnthropic.APIConnectionError = APIConnectionError;
BaseAnthropic.APIConnectionTimeoutError = APIConnectionTimeoutError;
BaseAnthropic.APIUserAbortError = APIUserAbortError;
BaseAnthropic.NotFoundError = NotFoundError;
BaseAnthropic.ConflictError = ConflictError;
BaseAnthropic.RateLimitError = RateLimitError;
BaseAnthropic.BadRequestError = BadRequestError;
BaseAnthropic.AuthenticationError = AuthenticationError;
BaseAnthropic.InternalServerError = InternalServerError;
BaseAnthropic.PermissionDeniedError = PermissionDeniedError;
BaseAnthropic.UnprocessableEntityError = UnprocessableEntityError;
BaseAnthropic.toFile = toFile;
/**
* API Client for interfacing with the Anthropic API.
*/
var Anthropic = class extends BaseAnthropic {
	constructor() {
		super(...arguments);
		this.completions = new Completions(this);
		this.messages = new Messages(this);
		this.models = new Models(this);
		this.files = new Files(this);
		this.skills = new Skills(this);
		this.beta = new Beta(this);
	}
};
Anthropic.Completions = Completions;
Anthropic.Messages = Messages;
Anthropic.Models = Models;
Anthropic.Files = Files;
Anthropic.Skills = Skills;
Anthropic.Beta = Beta;
new TextEncoder();
//#endregion
export { checkMemorySyncInterval as a, decodeUTF8 as c, AnthropicError as d, __classPrivateFieldGet as f, MIN_MEMORY_SYNC_INTERVAL_MS as i, encodeUTF8 as l, promiseWithResolvers as n, isStatus as o, __classPrivateFieldSet as p, DEFAULT_MEMORY_SYNC_INTERVAL_MS as r, loggerFor as s, Anthropic as t, ToolError as u };
