import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { deepEqualJson, installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { createModels } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { createUserMessage, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { lstat, mkdir, readFile, rm, stat } from "node:fs/promises";
import { basename, dirname, join, parse, resolve } from "node:path";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { ProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { fileURLToPath } from "node:url";
import { AttachmentId } from "@deepseek-ai/dsh-attachment";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { lookup } from "node:dns/promises";
import { request } from "node:http";
import { request as request$1 } from "node:https";
import { BlockList, isIP } from "node:net";
import { KNOWN_SESSION_EVENT_TYPES } from "@deepseek-ai/dsh-session";
import { WebError } from "@deepseek-ai/dsh-web";
//#region \0rolldown/runtime.js
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __require = /* #__PURE__ */ (() => createRequire(import.meta.url))();
//#endregion
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
function parseDocument$1(text, filename) {
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
		return cloneCredential(parseDocument$1(text, this.filename).credential);
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
			const document = parseDocument$1(JSON.stringify({
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
//#region node_modules/.pnpm/ms@2.1.3/node_modules/ms/index.js
var require_ms = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* Helpers.
	*/
	var s = 1e3;
	var m = s * 60;
	var h = m * 60;
	var d = h * 24;
	var w = d * 7;
	var y = d * 365.25;
	/**
	* Parse or format the given `val`.
	*
	* Options:
	*
	*  - `long` verbose formatting [false]
	*
	* @param {String|Number} val
	* @param {Object} [options]
	* @throws {Error} throw an error if val is not a non-empty string or a number
	* @return {String|Number}
	* @api public
	*/
	module.exports = function(val, options) {
		options = options || {};
		var type = typeof val;
		if (type === "string" && val.length > 0) return parse(val);
		else if (type === "number" && isFinite(val)) return options.long ? fmtLong(val) : fmtShort(val);
		throw new Error("val is not a non-empty string or a valid number. val=" + JSON.stringify(val));
	};
	/**
	* Parse the given `str` and return milliseconds.
	*
	* @param {String} str
	* @return {Number}
	* @api private
	*/
	function parse(str) {
		str = String(str);
		if (str.length > 100) return;
		var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(str);
		if (!match) return;
		var n = parseFloat(match[1]);
		switch ((match[2] || "ms").toLowerCase()) {
			case "years":
			case "year":
			case "yrs":
			case "yr":
			case "y": return n * y;
			case "weeks":
			case "week":
			case "w": return n * w;
			case "days":
			case "day":
			case "d": return n * d;
			case "hours":
			case "hour":
			case "hrs":
			case "hr":
			case "h": return n * h;
			case "minutes":
			case "minute":
			case "mins":
			case "min":
			case "m": return n * m;
			case "seconds":
			case "second":
			case "secs":
			case "sec":
			case "s": return n * s;
			case "milliseconds":
			case "millisecond":
			case "msecs":
			case "msec":
			case "ms": return n;
			default: return;
		}
	}
	/**
	* Short format for `ms`.
	*
	* @param {Number} ms
	* @return {String}
	* @api private
	*/
	function fmtShort(ms) {
		var msAbs = Math.abs(ms);
		if (msAbs >= d) return Math.round(ms / d) + "d";
		if (msAbs >= h) return Math.round(ms / h) + "h";
		if (msAbs >= m) return Math.round(ms / m) + "m";
		if (msAbs >= s) return Math.round(ms / s) + "s";
		return ms + "ms";
	}
	/**
	* Long format for `ms`.
	*
	* @param {Number} ms
	* @return {String}
	* @api private
	*/
	function fmtLong(ms) {
		var msAbs = Math.abs(ms);
		if (msAbs >= d) return plural(ms, msAbs, d, "day");
		if (msAbs >= h) return plural(ms, msAbs, h, "hour");
		if (msAbs >= m) return plural(ms, msAbs, m, "minute");
		if (msAbs >= s) return plural(ms, msAbs, s, "second");
		return ms + " ms";
	}
	/**
	* Pluralization helper.
	*/
	function plural(ms, msAbs, n, name) {
		var isPlural = msAbs >= n * 1.5;
		return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
	}
}));
//#endregion
//#region node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/common.js
var require_common = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* This is the common logic for both the Node.js and web browser
	* implementations of `debug()`.
	*/
	function setup(env) {
		createDebug.debug = createDebug;
		createDebug.default = createDebug;
		createDebug.coerce = coerce;
		createDebug.disable = disable;
		createDebug.enable = enable;
		createDebug.enabled = enabled;
		createDebug.humanize = require_ms();
		createDebug.destroy = destroy;
		Object.keys(env).forEach((key) => {
			createDebug[key] = env[key];
		});
		/**
		* The currently active debug mode names, and names to skip.
		*/
		createDebug.names = [];
		createDebug.skips = [];
		/**
		* Map of special "%n" handling functions, for the debug "format" argument.
		*
		* Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
		*/
		createDebug.formatters = {};
		/**
		* Selects a color for a debug namespace
		* @param {String} namespace The namespace string for the debug instance to be colored
		* @return {Number|String} An ANSI color code for the given namespace
		* @api private
		*/
		function selectColor(namespace) {
			let hash = 0;
			for (let i = 0; i < namespace.length; i++) {
				hash = (hash << 5) - hash + namespace.charCodeAt(i);
				hash |= 0;
			}
			return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
		}
		createDebug.selectColor = selectColor;
		/**
		* Create a debugger with the given `namespace`.
		*
		* @param {String} namespace
		* @return {Function}
		* @api public
		*/
		function createDebug(namespace) {
			let prevTime;
			let enableOverride = null;
			let namespacesCache;
			let enabledCache;
			function debug(...args) {
				if (!debug.enabled) return;
				const self = debug;
				const curr = Number(/* @__PURE__ */ new Date());
				self.diff = curr - (prevTime || curr);
				self.prev = prevTime;
				self.curr = curr;
				prevTime = curr;
				args[0] = createDebug.coerce(args[0]);
				if (typeof args[0] !== "string") args.unshift("%O");
				let index = 0;
				args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
					if (match === "%%") return "%";
					index++;
					const formatter = createDebug.formatters[format];
					if (typeof formatter === "function") {
						const val = args[index];
						match = formatter.call(self, val);
						args.splice(index, 1);
						index--;
					}
					return match;
				});
				createDebug.formatArgs.call(self, args);
				(self.log || createDebug.log).apply(self, args);
			}
			debug.namespace = namespace;
			debug.useColors = createDebug.useColors();
			debug.color = createDebug.selectColor(namespace);
			debug.extend = extend;
			debug.destroy = createDebug.destroy;
			Object.defineProperty(debug, "enabled", {
				enumerable: true,
				configurable: false,
				get: () => {
					if (enableOverride !== null) return enableOverride;
					if (namespacesCache !== createDebug.namespaces) {
						namespacesCache = createDebug.namespaces;
						enabledCache = createDebug.enabled(namespace);
					}
					return enabledCache;
				},
				set: (v) => {
					enableOverride = v;
				}
			});
			if (typeof createDebug.init === "function") createDebug.init(debug);
			return debug;
		}
		function extend(namespace, delimiter) {
			const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
			newDebug.log = this.log;
			return newDebug;
		}
		/**
		* Enables a debug mode by namespaces. This can include modes
		* separated by a colon and wildcards.
		*
		* @param {String} namespaces
		* @api public
		*/
		function enable(namespaces) {
			createDebug.save(namespaces);
			createDebug.namespaces = namespaces;
			createDebug.names = [];
			createDebug.skips = [];
			const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
			for (const ns of split) if (ns[0] === "-") createDebug.skips.push(ns.slice(1));
			else createDebug.names.push(ns);
		}
		/**
		* Checks if the given string matches a namespace template, honoring
		* asterisks as wildcards.
		*
		* @param {String} search
		* @param {String} template
		* @return {Boolean}
		*/
		function matchesTemplate(search, template) {
			let searchIndex = 0;
			let templateIndex = 0;
			let starIndex = -1;
			let matchIndex = 0;
			while (searchIndex < search.length) if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
				if (template[templateIndex] === "*") {
					starIndex = templateIndex;
					matchIndex = searchIndex;
					templateIndex++;
				} else {
					searchIndex++;
					templateIndex++;
				}
			} else if (starIndex !== -1) {
				templateIndex = starIndex + 1;
				matchIndex++;
				searchIndex = matchIndex;
			} else return false;
			while (templateIndex < template.length && template[templateIndex] === "*") templateIndex++;
			return templateIndex === template.length;
		}
		/**
		* Disable debug output.
		*
		* @return {String} namespaces
		* @api public
		*/
		function disable() {
			const namespaces = [...createDebug.names, ...createDebug.skips.map((namespace) => "-" + namespace)].join(",");
			createDebug.enable("");
			return namespaces;
		}
		/**
		* Returns true if the given mode name is enabled, false otherwise.
		*
		* @param {String} name
		* @return {Boolean}
		* @api public
		*/
		function enabled(name) {
			for (const skip of createDebug.skips) if (matchesTemplate(name, skip)) return false;
			for (const ns of createDebug.names) if (matchesTemplate(name, ns)) return true;
			return false;
		}
		/**
		* Coerce `val`.
		*
		* @param {Mixed} val
		* @return {Mixed}
		* @api private
		*/
		function coerce(val) {
			if (val instanceof Error) return val.stack || val.message;
			return val;
		}
		/**
		* XXX DO NOT USE. This is a temporary stub function.
		* XXX It WILL be removed in the next major release.
		*/
		function destroy() {
			console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
		}
		createDebug.enable(createDebug.load());
		return createDebug;
	}
	module.exports = setup;
}));
//#endregion
//#region node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/browser.js
var require_browser = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* This is the web browser implementation of `debug()`.
	*/
	exports.formatArgs = formatArgs;
	exports.save = save;
	exports.load = load;
	exports.useColors = useColors;
	exports.storage = localstorage();
	exports.destroy = (() => {
		let warned = false;
		return () => {
			if (!warned) {
				warned = true;
				console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
			}
		};
	})();
	/**
	* Colors.
	*/
	exports.colors = [
		"#0000CC",
		"#0000FF",
		"#0033CC",
		"#0033FF",
		"#0066CC",
		"#0066FF",
		"#0099CC",
		"#0099FF",
		"#00CC00",
		"#00CC33",
		"#00CC66",
		"#00CC99",
		"#00CCCC",
		"#00CCFF",
		"#3300CC",
		"#3300FF",
		"#3333CC",
		"#3333FF",
		"#3366CC",
		"#3366FF",
		"#3399CC",
		"#3399FF",
		"#33CC00",
		"#33CC33",
		"#33CC66",
		"#33CC99",
		"#33CCCC",
		"#33CCFF",
		"#6600CC",
		"#6600FF",
		"#6633CC",
		"#6633FF",
		"#66CC00",
		"#66CC33",
		"#9900CC",
		"#9900FF",
		"#9933CC",
		"#9933FF",
		"#99CC00",
		"#99CC33",
		"#CC0000",
		"#CC0033",
		"#CC0066",
		"#CC0099",
		"#CC00CC",
		"#CC00FF",
		"#CC3300",
		"#CC3333",
		"#CC3366",
		"#CC3399",
		"#CC33CC",
		"#CC33FF",
		"#CC6600",
		"#CC6633",
		"#CC9900",
		"#CC9933",
		"#CCCC00",
		"#CCCC33",
		"#FF0000",
		"#FF0033",
		"#FF0066",
		"#FF0099",
		"#FF00CC",
		"#FF00FF",
		"#FF3300",
		"#FF3333",
		"#FF3366",
		"#FF3399",
		"#FF33CC",
		"#FF33FF",
		"#FF6600",
		"#FF6633",
		"#FF9900",
		"#FF9933",
		"#FFCC00",
		"#FFCC33"
	];
	/**
	* Currently only WebKit-based Web Inspectors, Firefox >= v31,
	* and the Firebug extension (any Firefox version) are known
	* to support "%c" CSS customizations.
	*
	* TODO: add a `localStorage` variable to explicitly enable/disable colors
	*/
	function useColors() {
		if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) return true;
		if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) return false;
		let m;
		return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
	}
	/**
	* Colorize log arguments if enabled.
	*
	* @api public
	*/
	function formatArgs(args) {
		args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
		if (!this.useColors) return;
		const c = "color: " + this.color;
		args.splice(1, 0, c, "color: inherit");
		let index = 0;
		let lastC = 0;
		args[0].replace(/%[a-zA-Z%]/g, (match) => {
			if (match === "%%") return;
			index++;
			if (match === "%c") lastC = index;
		});
		args.splice(lastC, 0, c);
	}
	/**
	* Invokes `console.debug()` when available.
	* No-op when `console.debug` is not a "function".
	* If `console.debug` is not available, falls back
	* to `console.log`.
	*
	* @api public
	*/
	exports.log = console.debug || console.log || (() => {});
	/**
	* Save `namespaces`.
	*
	* @param {String} namespaces
	* @api private
	*/
	function save(namespaces) {
		try {
			if (namespaces) exports.storage.setItem("debug", namespaces);
			else exports.storage.removeItem("debug");
		} catch (error) {}
	}
	/**
	* Load `namespaces`.
	*
	* @return {String} returns the previously persisted debug modes
	* @api private
	*/
	function load() {
		let r;
		try {
			r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
		} catch (error) {}
		if (!r && typeof process !== "undefined" && "env" in process) r = process.env.DEBUG;
		return r;
	}
	/**
	* Localstorage attempts to return the localstorage.
	*
	* This is necessary because safari throws
	* when a user disables cookies/localstorage
	* and you attempt to access it.
	*
	* @return {LocalStorage}
	* @api private
	*/
	function localstorage() {
		try {
			return localStorage;
		} catch (error) {}
	}
	module.exports = require_common()(exports);
	const { formatters } = module.exports;
	/**
	* Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
	*/
	formatters.j = function(v) {
		try {
			return JSON.stringify(v);
		} catch (error) {
			return "[UnexpectedJSONParseError]: " + error.message;
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/node.js
var require_node = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* Module dependencies.
	*/
	const tty = __require("tty");
	const util = __require("util");
	/**
	* This is the Node.js implementation of `debug()`.
	*/
	exports.init = init;
	exports.log = log;
	exports.formatArgs = formatArgs;
	exports.save = save;
	exports.load = load;
	exports.useColors = useColors;
	exports.destroy = util.deprecate(() => {}, "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
	/**
	* Colors.
	*/
	exports.colors = [
		6,
		2,
		3,
		4,
		5,
		1
	];
	try {
		const supportsColor = __require("supports-color");
		if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) exports.colors = [
			20,
			21,
			26,
			27,
			32,
			33,
			38,
			39,
			40,
			41,
			42,
			43,
			44,
			45,
			56,
			57,
			62,
			63,
			68,
			69,
			74,
			75,
			76,
			77,
			78,
			79,
			80,
			81,
			92,
			93,
			98,
			99,
			112,
			113,
			128,
			129,
			134,
			135,
			148,
			149,
			160,
			161,
			162,
			163,
			164,
			165,
			166,
			167,
			168,
			169,
			170,
			171,
			172,
			173,
			178,
			179,
			184,
			185,
			196,
			197,
			198,
			199,
			200,
			201,
			202,
			203,
			204,
			205,
			206,
			207,
			208,
			209,
			214,
			215,
			220,
			221
		];
	} catch (error) {}
	/**
	* Build up the default `inspectOpts` object from the environment variables.
	*
	*   $ DEBUG_COLORS=no DEBUG_DEPTH=10 DEBUG_SHOW_HIDDEN=enabled node script.js
	*/
	exports.inspectOpts = Object.keys(process.env).filter((key) => {
		return /^debug_/i.test(key);
	}).reduce((obj, key) => {
		const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
			return k.toUpperCase();
		});
		let val = process.env[key];
		if (/^(yes|on|true|enabled)$/i.test(val)) val = true;
		else if (/^(no|off|false|disabled)$/i.test(val)) val = false;
		else if (val === "null") val = null;
		else val = Number(val);
		obj[prop] = val;
		return obj;
	}, {});
	/**
	* Is stdout a TTY? Colored output is enabled when `true`.
	*/
	function useColors() {
		return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(process.stderr.fd);
	}
	/**
	* Adds ANSI color escape codes if enabled.
	*
	* @api public
	*/
	function formatArgs(args) {
		const { namespace: name, useColors } = this;
		if (useColors) {
			const c = this.color;
			const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
			const prefix = `  ${colorCode};1m${name} \u001B[0m`;
			args[0] = prefix + args[0].split("\n").join("\n" + prefix);
			args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
		} else args[0] = getDate() + name + " " + args[0];
	}
	function getDate() {
		if (exports.inspectOpts.hideDate) return "";
		return (/* @__PURE__ */ new Date()).toISOString() + " ";
	}
	/**
	* Invokes `util.formatWithOptions()` with the specified arguments and writes to stderr.
	*/
	function log(...args) {
		return process.stderr.write(util.formatWithOptions(exports.inspectOpts, ...args) + "\n");
	}
	/**
	* Save `namespaces`.
	*
	* @param {String} namespaces
	* @api private
	*/
	function save(namespaces) {
		if (namespaces) process.env.DEBUG = namespaces;
		else delete process.env.DEBUG;
	}
	/**
	* Load `namespaces`.
	*
	* @return {String} returns the previously persisted debug modes
	* @api private
	*/
	function load() {
		return process.env.DEBUG;
	}
	/**
	* Init logic for `debug` instances.
	*
	* Create a new `inspectOpts` object in case `useColors` is set
	* differently for a particular `debug` instance.
	*/
	function init(debug) {
		debug.inspectOpts = {};
		const keys = Object.keys(exports.inspectOpts);
		for (let i = 0; i < keys.length; i++) debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
	}
	module.exports = require_common()(exports);
	const { formatters } = module.exports;
	/**
	* Map %o to `util.inspect()`, all on a single line.
	*/
	formatters.o = function(v) {
		this.inspectOpts.colors = this.useColors;
		return util.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
	};
	/**
	* Map %O to `util.inspect()`, allowing multiple lines if needed.
	*/
	formatters.O = function(v) {
		this.inspectOpts.colors = this.useColors;
		return util.inspect(v, this.inspectOpts);
	};
}));
//#endregion
//#region node_modules/.pnpm/debug@4.4.3/node_modules/debug/src/index.js
var require_src = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/**
	* Detect Electron renderer / nwjs process, which is node, but we should
	* treat as a browser.
	*/
	if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) module.exports = require_browser();
	else module.exports = require_node();
}));
//#endregion
//#region node_modules/.pnpm/agent-base@7.1.4/node_modules/agent-base/dist/helpers.js
var require_helpers = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = exports && exports.__importStar || function(mod) {
		if (mod && mod.__esModule) return mod;
		var result = {};
		if (mod != null) {
			for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
		}
		__setModuleDefault(result, mod);
		return result;
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.req = exports.json = exports.toBuffer = void 0;
	const http$1 = __importStar(__require("http"));
	const https = __importStar(__require("https"));
	async function toBuffer(stream) {
		let length = 0;
		const chunks = [];
		for await (const chunk of stream) {
			length += chunk.length;
			chunks.push(chunk);
		}
		return Buffer.concat(chunks, length);
	}
	exports.toBuffer = toBuffer;
	async function json(stream) {
		const str = (await toBuffer(stream)).toString("utf8");
		try {
			return JSON.parse(str);
		} catch (_err) {
			const err = _err;
			err.message += ` (input: ${str})`;
			throw err;
		}
	}
	exports.json = json;
	function req(url, opts = {}) {
		const req = ((typeof url === "string" ? url : url.href).startsWith("https:") ? https : http$1).request(url, opts);
		const promise = new Promise((resolve, reject) => {
			req.once("response", resolve).once("error", reject).end();
		});
		req.then = promise.then.bind(promise);
		return req;
	}
	exports.req = req;
}));
//#endregion
//#region node_modules/.pnpm/agent-base@7.1.4/node_modules/agent-base/dist/index.js
var require_dist$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = exports && exports.__importStar || function(mod) {
		if (mod && mod.__esModule) return mod;
		var result = {};
		if (mod != null) {
			for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
		}
		__setModuleDefault(result, mod);
		return result;
	};
	var __exportStar = exports && exports.__exportStar || function(m, exports$1) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$1, p)) __createBinding(exports$1, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Agent = void 0;
	const net$2 = __importStar(__require("net"));
	const http = __importStar(__require("http"));
	const https_1 = __require("https");
	__exportStar(require_helpers(), exports);
	const INTERNAL = Symbol("AgentBaseInternalState");
	var Agent = class extends http.Agent {
		constructor(opts) {
			super(opts);
			this[INTERNAL] = {};
		}
		/**
		* Determine whether this is an `http` or `https` request.
		*/
		isSecureEndpoint(options) {
			if (options) {
				if (typeof options.secureEndpoint === "boolean") return options.secureEndpoint;
				if (typeof options.protocol === "string") return options.protocol === "https:";
			}
			const { stack } = /* @__PURE__ */ new Error();
			if (typeof stack !== "string") return false;
			return stack.split("\n").some((l) => l.indexOf("(https.js:") !== -1 || l.indexOf("node:https:") !== -1);
		}
		incrementSockets(name) {
			if (this.maxSockets === Infinity && this.maxTotalSockets === Infinity) return null;
			if (!this.sockets[name]) this.sockets[name] = [];
			const fakeSocket = new net$2.Socket({ writable: false });
			this.sockets[name].push(fakeSocket);
			this.totalSocketCount++;
			return fakeSocket;
		}
		decrementSockets(name, socket) {
			if (!this.sockets[name] || socket === null) return;
			const sockets = this.sockets[name];
			const index = sockets.indexOf(socket);
			if (index !== -1) {
				sockets.splice(index, 1);
				this.totalSocketCount--;
				if (sockets.length === 0) delete this.sockets[name];
			}
		}
		getName(options) {
			if (this.isSecureEndpoint(options)) return https_1.Agent.prototype.getName.call(this, options);
			return super.getName(options);
		}
		createSocket(req, options, cb) {
			const connectOpts = {
				...options,
				secureEndpoint: this.isSecureEndpoint(options)
			};
			const name = this.getName(connectOpts);
			const fakeSocket = this.incrementSockets(name);
			Promise.resolve().then(() => this.connect(req, connectOpts)).then((socket) => {
				this.decrementSockets(name, fakeSocket);
				if (socket instanceof http.Agent) try {
					return socket.addRequest(req, connectOpts);
				} catch (err) {
					return cb(err);
				}
				this[INTERNAL].currentSocket = socket;
				super.createSocket(req, options, cb);
			}, (err) => {
				this.decrementSockets(name, fakeSocket);
				cb(err);
			});
		}
		createConnection() {
			const socket = this[INTERNAL].currentSocket;
			this[INTERNAL].currentSocket = void 0;
			if (!socket) throw new Error("No socket was returned in the `connect()` function");
			return socket;
		}
		get defaultPort() {
			return this[INTERNAL].defaultPort ?? (this.protocol === "https:" ? 443 : 80);
		}
		set defaultPort(v) {
			if (this[INTERNAL]) this[INTERNAL].defaultPort = v;
		}
		get protocol() {
			return this[INTERNAL].protocol ?? (this.isSecureEndpoint() ? "https:" : "http:");
		}
		set protocol(v) {
			if (this[INTERNAL]) this[INTERNAL].protocol = v;
		}
	};
	exports.Agent = Agent;
}));
//#endregion
//#region node_modules/.pnpm/http-proxy-agent@7.0.2/node_modules/http-proxy-agent/dist/index.js
var require_dist$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = exports && exports.__importStar || function(mod) {
		if (mod && mod.__esModule) return mod;
		var result = {};
		if (mod != null) {
			for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
		}
		__setModuleDefault(result, mod);
		return result;
	};
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.HttpProxyAgent = void 0;
	const net$1 = __importStar(__require("net"));
	const tls$1 = __importStar(__require("tls"));
	const debug_1 = __importDefault(require_src());
	const events_1 = __require("events");
	const agent_base_1 = require_dist$2();
	const url_1$1 = __require("url");
	const debug = (0, debug_1.default)("http-proxy-agent");
	/**
	* The `HttpProxyAgent` implements an HTTP Agent subclass that connects
	* to the specified "HTTP proxy server" in order to proxy HTTP requests.
	*/
	var HttpProxyAgent = class extends agent_base_1.Agent {
		constructor(proxy, opts) {
			super(opts);
			this.proxy = typeof proxy === "string" ? new url_1$1.URL(proxy) : proxy;
			this.proxyHeaders = opts?.headers ?? {};
			debug("Creating new HttpProxyAgent instance: %o", this.proxy.href);
			const host = (this.proxy.hostname || this.proxy.host).replace(/^\[|\]$/g, "");
			const port = this.proxy.port ? parseInt(this.proxy.port, 10) : this.proxy.protocol === "https:" ? 443 : 80;
			this.connectOpts = {
				...opts ? omit(opts, "headers") : null,
				host,
				port
			};
		}
		addRequest(req, opts) {
			req._header = null;
			this.setRequestProps(req, opts);
			super.addRequest(req, opts);
		}
		setRequestProps(req, opts) {
			const { proxy } = this;
			const base = `${opts.secureEndpoint ? "https:" : "http:"}//${req.getHeader("host") || "localhost"}`;
			const url = new url_1$1.URL(req.path, base);
			if (opts.port !== 80) url.port = String(opts.port);
			req.path = String(url);
			const headers = typeof this.proxyHeaders === "function" ? this.proxyHeaders() : { ...this.proxyHeaders };
			if (proxy.username || proxy.password) {
				const auth = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
				headers["Proxy-Authorization"] = `Basic ${Buffer.from(auth).toString("base64")}`;
			}
			if (!headers["Proxy-Connection"]) headers["Proxy-Connection"] = this.keepAlive ? "Keep-Alive" : "close";
			for (const name of Object.keys(headers)) {
				const value = headers[name];
				if (value) req.setHeader(name, value);
			}
		}
		async connect(req, opts) {
			req._header = null;
			if (!req.path.includes("://")) this.setRequestProps(req, opts);
			let first;
			let endOfHeaders;
			debug("Regenerating stored HTTP header string for request");
			req._implicitHeader();
			if (req.outputData && req.outputData.length > 0) {
				debug("Patching connection write() output buffer with updated header");
				first = req.outputData[0].data;
				endOfHeaders = first.indexOf("\r\n\r\n") + 4;
				req.outputData[0].data = req._header + first.substring(endOfHeaders);
				debug("Output buffer: %o", req.outputData[0].data);
			}
			let socket;
			if (this.proxy.protocol === "https:") {
				debug("Creating `tls.Socket`: %o", this.connectOpts);
				socket = tls$1.connect(this.connectOpts);
			} else {
				debug("Creating `net.Socket`: %o", this.connectOpts);
				socket = net$1.connect(this.connectOpts);
			}
			await (0, events_1.once)(socket, "connect");
			return socket;
		}
	};
	HttpProxyAgent.protocols = ["http", "https"];
	exports.HttpProxyAgent = HttpProxyAgent;
	function omit(obj, ...keys) {
		const ret = {};
		let key;
		for (key in obj) if (!keys.includes(key)) ret[key] = obj[key];
		return ret;
	}
}));
//#endregion
//#region node_modules/.pnpm/https-proxy-agent@7.0.6/node_modules/https-proxy-agent/dist/parse-proxy-response.js
var require_parse_proxy_response = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.parseProxyResponse = void 0;
	const debug = (0, __importDefault(require_src()).default)("https-proxy-agent:parse-proxy-response");
	function parseProxyResponse(socket) {
		return new Promise((resolve, reject) => {
			let buffersLength = 0;
			const buffers = [];
			function read() {
				const b = socket.read();
				if (b) ondata(b);
				else socket.once("readable", read);
			}
			function cleanup() {
				socket.removeListener("end", onend);
				socket.removeListener("error", onerror);
				socket.removeListener("readable", read);
			}
			function onend() {
				cleanup();
				debug("onend");
				reject(/* @__PURE__ */ new Error("Proxy connection ended before receiving CONNECT response"));
			}
			function onerror(err) {
				cleanup();
				debug("onerror %o", err);
				reject(err);
			}
			function ondata(b) {
				buffers.push(b);
				buffersLength += b.length;
				const buffered = Buffer.concat(buffers, buffersLength);
				const endOfHeaders = buffered.indexOf("\r\n\r\n");
				if (endOfHeaders === -1) {
					debug("have not received end of HTTP headers yet...");
					read();
					return;
				}
				const headerParts = buffered.slice(0, endOfHeaders).toString("ascii").split("\r\n");
				const firstLine = headerParts.shift();
				if (!firstLine) {
					socket.destroy();
					return reject(/* @__PURE__ */ new Error("No header received from proxy CONNECT response"));
				}
				const firstLineParts = firstLine.split(" ");
				const statusCode = +firstLineParts[1];
				const statusText = firstLineParts.slice(2).join(" ");
				const headers = {};
				for (const header of headerParts) {
					if (!header) continue;
					const firstColon = header.indexOf(":");
					if (firstColon === -1) {
						socket.destroy();
						return reject(/* @__PURE__ */ new Error(`Invalid header from proxy CONNECT response: "${header}"`));
					}
					const key = header.slice(0, firstColon).toLowerCase();
					const value = header.slice(firstColon + 1).trimStart();
					const current = headers[key];
					if (typeof current === "string") headers[key] = [current, value];
					else if (Array.isArray(current)) current.push(value);
					else headers[key] = value;
				}
				debug("got proxy server response: %o %o", firstLine, headers);
				cleanup();
				resolve({
					connect: {
						statusCode,
						statusText,
						headers
					},
					buffered
				});
			}
			socket.on("error", onerror);
			socket.on("end", onend);
			read();
		});
	}
	exports.parseProxyResponse = parseProxyResponse;
}));
//#endregion
//#region node_modules/.pnpm/https-proxy-agent@7.0.6/node_modules/https-proxy-agent/dist/index.js
var require_dist = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = exports && exports.__importStar || function(mod) {
		if (mod && mod.__esModule) return mod;
		var result = {};
		if (mod != null) {
			for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
		}
		__setModuleDefault(result, mod);
		return result;
	};
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.HttpsProxyAgent = void 0;
	const net = __importStar(__require("net"));
	const tls = __importStar(__require("tls"));
	const assert_1 = __importDefault(__require("assert"));
	const debug_1 = __importDefault(require_src());
	const agent_base_1 = require_dist$2();
	const url_1 = __require("url");
	const parse_proxy_response_1 = require_parse_proxy_response();
	const debug = (0, debug_1.default)("https-proxy-agent");
	const setServernameFromNonIpHost = (options) => {
		if (options.servername === void 0 && options.host && !net.isIP(options.host)) return {
			...options,
			servername: options.host
		};
		return options;
	};
	/**
	* The `HttpsProxyAgent` implements an HTTP Agent subclass that connects to
	* the specified "HTTP(s) proxy server" in order to proxy HTTPS requests.
	*
	* Outgoing HTTP requests are first tunneled through the proxy server using the
	* `CONNECT` HTTP request method to establish a connection to the proxy server,
	* and then the proxy server connects to the destination target and issues the
	* HTTP request from the proxy server.
	*
	* `https:` requests have their socket connection upgraded to TLS once
	* the connection to the proxy server has been established.
	*/
	var HttpsProxyAgent = class extends agent_base_1.Agent {
		constructor(proxy, opts) {
			super(opts);
			this.options = { path: void 0 };
			this.proxy = typeof proxy === "string" ? new url_1.URL(proxy) : proxy;
			this.proxyHeaders = opts?.headers ?? {};
			debug("Creating new HttpsProxyAgent instance: %o", this.proxy.href);
			const host = (this.proxy.hostname || this.proxy.host).replace(/^\[|\]$/g, "");
			const port = this.proxy.port ? parseInt(this.proxy.port, 10) : this.proxy.protocol === "https:" ? 443 : 80;
			this.connectOpts = {
				ALPNProtocols: ["http/1.1"],
				...opts ? omit(opts, "headers") : null,
				host,
				port
			};
		}
		/**
		* Called when the node-core HTTP client library is creating a
		* new HTTP request.
		*/
		async connect(req, opts) {
			const { proxy } = this;
			if (!opts.host) throw new TypeError("No \"host\" provided");
			let socket;
			if (proxy.protocol === "https:") {
				debug("Creating `tls.Socket`: %o", this.connectOpts);
				socket = tls.connect(setServernameFromNonIpHost(this.connectOpts));
			} else {
				debug("Creating `net.Socket`: %o", this.connectOpts);
				socket = net.connect(this.connectOpts);
			}
			const headers = typeof this.proxyHeaders === "function" ? this.proxyHeaders() : { ...this.proxyHeaders };
			const host = net.isIPv6(opts.host) ? `[${opts.host}]` : opts.host;
			let payload = `CONNECT ${host}:${opts.port} HTTP/1.1\r\n`;
			if (proxy.username || proxy.password) {
				const auth = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
				headers["Proxy-Authorization"] = `Basic ${Buffer.from(auth).toString("base64")}`;
			}
			headers.Host = `${host}:${opts.port}`;
			if (!headers["Proxy-Connection"]) headers["Proxy-Connection"] = this.keepAlive ? "Keep-Alive" : "close";
			for (const name of Object.keys(headers)) payload += `${name}: ${headers[name]}\r\n`;
			const proxyResponsePromise = (0, parse_proxy_response_1.parseProxyResponse)(socket);
			socket.write(`${payload}\r\n`);
			const { connect, buffered } = await proxyResponsePromise;
			req.emit("proxyConnect", connect);
			this.emit("proxyConnect", connect, req);
			if (connect.statusCode === 200) {
				req.once("socket", resume);
				if (opts.secureEndpoint) {
					debug("Upgrading socket connection to TLS");
					return tls.connect({
						...omit(setServernameFromNonIpHost(opts), "host", "path", "port"),
						socket
					});
				}
				return socket;
			}
			socket.destroy();
			const fakeSocket = new net.Socket({ writable: false });
			fakeSocket.readable = true;
			req.once("socket", (s) => {
				debug("Replaying proxy buffer for failed request");
				(0, assert_1.default)(s.listenerCount("data") > 0);
				s.push(buffered);
				s.push(null);
			});
			return fakeSocket;
		}
	};
	HttpsProxyAgent.protocols = ["http", "https"];
	exports.HttpsProxyAgent = HttpsProxyAgent;
	function resume(socket) {
		socket.resume();
	}
	function omit(obj, ...keys) {
		const ret = {};
		let key;
		for (key in obj) if (!keys.includes(key)) ret[key] = obj[key];
		return ret;
	}
}));
//#endregion
//#region src/proxy.ts
/**
* HTTP/HTTPS proxy support for OpenAI Codex requests.
*
* Node.js 24's fetch is based on undici and does NOT read HTTP_PROXY /
* HTTPS_PROXY environment variables.  The correct way to proxy fetch calls
* is to install undici's ProxyAgent via setGlobalDispatcher.
* @module dsh-codex-connect/proxy
*/
var import_dist = require_dist$1();
var import_dist$1 = require_dist();
/** Reference counter so nested enable/disable pairs work correctly. */
let activeProxyCount = 0;
let currentDispatcher;
/**
* Enable the global undici proxy dispatcher for all subsequent fetch calls.
* Safe to call multiple times — a matching disableGlobalProxy() is required
* for each call.
*/
function enableGlobalProxy(config) {
	activeProxyCount++;
	if (activeProxyCount === 1) {
		currentDispatcher = getGlobalDispatcher();
		const proxyUrl = `http://${config.host}:${config.port}`;
		setGlobalDispatcher(new ProxyAgent(proxyUrl));
	}
}
/**
* Restore the original global dispatcher after a proxied section.
* Must be called in a finally block to guarantee cleanup.
*/
function disableGlobalProxy() {
	if (activeProxyCount <= 0) return;
	activeProxyCount--;
	if (activeProxyCount === 0 && currentDispatcher !== void 0) {
		setGlobalDispatcher(currentDispatcher);
		currentDispatcher = void 0;
	}
}
/**
* Create a proxy agent for node:http/https module requests.
* Used by public-http.ts for image fetching (not for fetch calls).
*/
function createProxyAgent(config, protocol = "https") {
	const proxyUrl = `http://${config.host}:${config.port}`;
	if (protocol === "https") return new import_dist$1.HttpsProxyAgent(proxyUrl);
	return new import_dist.HttpProxyAgent(proxyUrl);
}
/**
* Get proxy configuration from environment variables or config.
* @param config - optional proxy configuration
* @returns proxy configuration if available
*/
function resolveProxyConfig(config) {
	if (config?.host && config.port) return config;
	const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
	const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || httpProxy;
	if (proxyUrl) try {
		const url = new URL(proxyUrl);
		return {
			host: url.hostname,
			port: parseInt(url.port, 10) || (url.protocol === "https:" ? 443 : 80)
		};
	} catch {}
}
//#endregion
//#region src/adapter.ts
/** OpenAI Codex adapter assembled from public dsh-llm-pi-ai extension points. */
/** Provider idle ceiling used by the composite route. */
const OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS = 3e5;
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
function requestProvider(provider, fastMode, proxy) {
	const base = withOpenAICodexFastMode(provider, fastMode);
	const streamSimple = base.streamSimple;
	return {
		...base,
		streamSimple(model, context, options) {
			if (proxy) enableGlobalProxy(proxy);
			const iter = streamSimple.call(base, model, context, options);
			return (async function* () {
				try {
					yield* iter;
				} finally {
					if (proxy) disableGlobalProxy();
				}
			})();
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
function applyContextWindowOverrides(provider, overrides) {
	if (!overrides?.defaultContextWindow && !overrides?.modelContextWindows) return provider;
	const getModels = provider.getModels.bind(provider);
	return {
		...provider,
		getModels() {
			return getModels().map((model) => {
				const cw = overrides.modelContextWindows?.[model.id] ?? overrides.defaultContextWindow;
				if (cw === void 0 || cw === model.contextWindow) return model;
				return {
					...model,
					contextWindow: cw
				};
			});
		}
	};
}
/**
* Create the Codex subscription adapter without requiring a dsh fork. The
* public pi-ai adapter owns Harness message conversion, image attachment
* resolution, streaming, reasoning metadata, and compaction behavior; this
* plugin supplies its provider-native OAuth token for each request.
*/
function createOpenAICodexAdapter(credentials, resolveAttachments, fastMode, proxyConfig, contextWindowOverrides) {
	const provider = applyContextWindowOverrides(openaiCodexProvider(), contextWindowOverrides);
	const profiles = /* @__PURE__ */ new Map([[OPENAI_CODEX_PROVIDER, {
		provider: OPENAI_CODEX_PROVIDER,
		displayName: "OpenAI Codex",
		streamIdleTimeoutMs: OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS,
		retryPolicy: resolveRetryPolicy(void 0, "dsh-codex-connect retryPolicy"),
		configuredMaxTokens: /* @__PURE__ */ new Map(),
		piProvider: requestProvider(provider, fastMode, proxyConfig)
	}]]);
	const models = createModels({ credentials });
	models.setProvider(provider);
	return new PiAiAdapter({
		profiles: () => profiles,
		resolveApiKey: async () => (await models.getAuth(OPENAI_CODEX_PROVIDER))?.auth.apiKey,
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
* @param proxyConfig - optional proxy configuration for OpenAI requests.
*/
async function loginOpenAICodex(interaction, store = new OpenAICodexCredentialStore(), proxyConfig) {
	const effectiveProxy = proxyConfig || resolveProxyConfig();
	if (effectiveProxy) enableGlobalProxy(effectiveProxy);
	try {
		const models = createModels({ credentials: store });
		models.setProvider(openaiCodexProvider());
		await models.login(OPENAI_CODEX_PROVIDER, "oauth", interaction);
	} finally {
		if (effectiveProxy) disableGlobalProxy();
	}
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
* @param proxyConfig - optional proxy configuration for OpenAI requests.
* @returns current rate-limit buckets safe to expose to the local browser page.
*/
async function readOpenAICodexRateLimits(store, proxyConfig) {
	const models = createModels({ credentials: store });
	models.setProvider(openaiCodexProvider());
	const auth = await models.getAuth(OPENAI_CODEX_PROVIDER);
	const credential = await store.read(OPENAI_CODEX_PROVIDER);
	const access = auth?.auth.apiKey;
	const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
	if (access === void 0 || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) throw new Error("OpenAI Codex is signed out");
	const effectiveProxy = proxyConfig || resolveProxyConfig();
	if (effectiveProxy) enableGlobalProxy(effectiveProxy);
	try {
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
	} finally {
		if (effectiveProxy) disableGlobalProxy();
	}
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
function parseDocument(text, filename) {
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
		return parseDocument(text, this.filename);
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
/** Stable, non-sensitive error returned when a browser origin needs CLI trust. */
const REMOTE_WEB_ORIGIN_NOT_TRUSTED = "remote-web-origin-not-trusted";
/** Redact provider diagnostics before they cross to the browser. */
function safeMessage(error) {
	return (error instanceof Error ? error.message : String(error)).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[redacted token]").replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, "$1[redacted]").slice(0, 1e3);
}
/** Reject with the prompt's abort reason while browser callback owns completion. */
function waitForPromptAbort(prompt) {
	const signal = prompt.signal;
	if (signal === void 0) return new Promise(() => {});
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
	challengeTimeoutMs;
	getProxyConfig;
	constructor(store, options = {}) {
		this.store = store;
		this.challengeTimeoutMs = options.challengeTimeoutMs ?? 3e4;
		this.getProxyConfig = options.getProxyConfig;
		if (!Number.isFinite(this.challengeTimeoutMs) || this.challengeTimeoutMs <= 0) throw new TypeError("OpenAI Codex auth URL timeout must be a positive finite number");
	}
	/** Read current public state, consulting durable storage while idle. */
	async status() {
		if (this.operation !== void 0) return this.state;
		if (this.state.status === "error") return this.state;
		return this.readStoredStatus();
	}
	/** Start or join the current browser-login operation. */
	async signIn() {
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
		this.cancelSignIn(/* @__PURE__ */ new Error("OpenAI Codex sign-in cancelled"));
		await this.operation?.catch(() => void 0);
		await logoutOpenAICodex(this.store);
		this.challenge = void 0;
		this.state = { status: "signed-out" };
	}
	/** Stop the owned callback listener during plugin disposal. */
	async dispose() {
		this.cancelSignIn(/* @__PURE__ */ new Error("OpenAI Codex plugin disposed"));
		await this.operation?.catch(() => void 0);
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
		this.operation = loginOpenAICodex({
			signal: cancellation.signal,
			prompt: (prompt) => prompt.type === "select" ? Promise.resolve("browser") : waitForPromptAbort(prompt),
			notify: (event) => {
				this.onEvent(event);
			}
		}, this.store, this.getProxyConfig?.()).then(async () => {
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
			return {
				status: "signed-in",
				usage: await readOpenAICodexRateLimits(this.store, this.getProxyConfig?.())
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
function json(res, status, value) {
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
function registerOpenAICodexAuthRoutes(ctx, store, trustedOriginsOverride, fastModeOverride, getProxyConfig) {
	const auth = new OpenAICodexWebAuth(store, { getProxyConfig });
	const storedFilename = store.filename;
	const fastMode = fastModeOverride ?? new FastModeRegistry();
	const trustedOrigins = trustedOriginsOverride ?? (typeof storedFilename === "string" ? new OpenAICodexTrustedOriginsStore(join(dirname(storedFilename), ".openai-codex-trusted-origins.json")) : new OpenAICodexTrustedOriginsStore());
	ctx.effect(() => {
		const authorize = async (req, res) => {
			const decision = await trustedRequestDecision(req, trustedOrigins);
			if (decision.trusted) return true;
			json(res, 403, { error: decision.error });
			return false;
		};
		const routes = [
			ctx.webServer.register({
				kind: "exact",
				path: OPENAI_CODEX_AUTH_STATUS_PATH,
				handler: async (req, res) => {
					if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
					if (!await authorize(req, res)) return;
					json(res, 200, await auth.status());
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: OPENAI_CODEX_AUTH_LOGIN_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					if (!await authorize(req, res)) return;
					try {
						json(res, 200, await auth.signIn());
					} catch (error) {
						json(res, 500, { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: OPENAI_CODEX_AUTH_LOGOUT_PATH,
				handler: async (req, res) => {
					if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					if (!await authorize(req, res)) return;
					try {
						await auth.signOut();
						json(res, 200, { ok: true });
					} catch (error) {
						json(res, 500, { error: safeMessage(error) });
					}
				}
			}),
			ctx.webServer.register({
				kind: "exact",
				path: OPENAI_CODEX_FAST_MODE_PATH,
				handler: async (req, res) => {
					if (req.method !== "GET" && req.method !== "POST") return json(res, 405, { error: "method not allowed" });
					if (!await authorize(req, res)) return;
					if (req.method === "GET") {
						const sessionId = fastModeSessionIdFromQuery(req);
						if (sessionId === void 0) return json(res, 400, { error: "invalid input" });
						return json(res, 200, { enabled: fastMode.isEnabled(sessionId) });
					}
					const type = header(req, "content-type");
					if (type === void 0 || !/^application\/json(?:\s*;|$)/iu.test(type.trim())) return json(res, 415, { error: "unsupported content type" });
					try {
						const body = fastModeBody(await readFastModeBody(req));
						if (body === void 0) return json(res, 400, { error: "invalid input" });
						fastMode.set(body.sessionId, body.enabled);
						return json(res, 200, { enabled: fastMode.isEnabled(body.sessionId) });
					} catch (error) {
						return json(res, error instanceof RangeError ? 413 : 400, { error: error instanceof RangeError ? "request body too large" : "invalid input" });
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
//#region src/compatibility.ts
const COMPATIBILITY_SCHEMA_VERSION = 1;
const SUPPORTED_NODE_RANGE = "^22.19.0 || >=24.0.0";
const SUPPORTED_DSH_PLUGIN_API_VERSION = "0.1.0-rc.7";
const SUPPORTED_PI_AI_VERSION = "0.82.1";
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
		version: SUPPORTED_PI_AI_VERSION
	}
};
const PACKAGE_JSON_SEARCH_DEPTH = 8;
function compareVersion(left, right) {
	return left === right ? "compatible" : "incompatible";
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
function packageEntry(supported, installed) {
	return {
		supported,
		installed: installed ?? null,
		status: installed === void 0 || installed === null || installed === "" ? "unknown" : compareVersion(installed, supported)
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
		[PI_AI_PACKAGE]: packageEntry(SUPPORTED_PI_AI_VERSION, suppliedPackages[PI_AI_PACKAGE])
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
async function readPackageVersionFromEntry(name) {
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
	const readVersion = options.readPackageVersion ?? readPackageVersionFromEntry;
	const packageVersions = options.packageVersions ?? options.packages ?? options.installed?.packages;
	const resolvedPackages = packageVersions === void 0 ? Object.fromEntries(await Promise.all(COMPATIBILITY_PACKAGES.map(async (name) => [name, await readVersion(name)]))) : packageVersions;
	return evaluateCompatibility({
		nodeVersion: options.nodeVersion ?? options.node ?? options.installed?.node ?? process.version,
		packageVersions: resolvedPackages
	});
}
//#endregion
//#region src/version.ts
const CODEX_CONNECT_VERSION = "0.1.0-alpha.4.10";
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
	if (compatibility.status === "incompatible") hints.push("Compatibility mismatch: install the declared DSH plugin API versions and pin @earendil-works/pi-ai to 0.82.1, then run doctor again; no files are changed automatically.");
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
			changesHarnessDefaultModel: false,
			changesHarnessSearchRoute: false
		},
		providerConflict,
		compatibility,
		hints
	};
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
async function requestPinned(url, address, maxBytes, signal, proxy) {
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
			agent: proxy ? createProxyAgent(proxy, url.protocol === "https:" ? "https" : "http") : false,
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
async function fetchPublicHttpResource(source, maxBytes, signal, runtime = NODE_PUBLIC_HTTP_RUNTIME, proxy) {
	let url = new URL(source);
	assertTargetUrl(url);
	for (let redirects = 0;; redirects += 1) {
		if (signal.aborted) throw abortError(signal);
		const addresses = await runtime.resolve(url.hostname, signal);
		if (addresses.length === 0 || addresses.some((candidate) => !isPublicNetworkAddress(candidate.address))) throw new Error(`remote image host ${JSON.stringify(url.hostname)} must resolve only to public network addresses`);
		const hop = await runtime.get(url, addresses[0], maxBytes, signal, proxy);
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
//#region src/search-event.ts
/** Dedicated log event written before an OpenAI Codex search dispatch. */
const OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT = "web/openai-codex-search-llm-request";
/**
* Register the plugin-owned event in the running Harness vocabulary. The
* public DSH build exports its known-event collection as read-only because
* core code must not mutate it accidentally; the runtime value is the Set
* deliberately consulted on every persistence read. Registration remains for
* the process lifetime so sessions written before an HMR cycle stay readable.
*/
function installOpenAICodexSearchEvent() {
	if (!(KNOWN_SESSION_EVENT_TYPES instanceof Set)) throw new Error("dsh-codex-connect: this Harness build does not expose an extensible session event vocabulary");
	KNOWN_SESSION_EVENT_TYPES.add(OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT);
}
/**
* Append one resolved request to the initiating agent's session. Searches
* outside an agent turn have no owning session and therefore produce no log.
* @param ctx - plugin context carrying the optional active-agent service.
* @param request - exact request after defaults, excluding credentials.
*/
function recordOpenAICodexSearchRequest(ctx, request) {
	ctx.get("agents")?.currentInitiator()?.session.append(OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT, request);
}
//#endregion
//#region src/settings-contract.ts
/** Node-free settings contract shared by the Host plugin and browser card. */
/** Stable Harness settings namespace owned by this plugin. */
const OPENAI_CODEX_SETTINGS_NAMESPACE = "llm-openai-codex";
/** Default model used by the standalone search endpoint. */
const DEFAULT_OPENAI_CODEX_SEARCH_MODEL = "gpt-5.6-sol";
/** Default search mode, matching the official local Codex client. */
const DEFAULT_OPENAI_CODEX_SEARCH_MODE = "cached";
/** Default provider search-context size. */
const DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE = "medium";
/** Default output budget for the standalone search response. */
const DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS = 1e4;
const DEFAULT_OPENAI_CODEX_SETTINGS = Object.freeze({
	enableSearch: false,
	enableImageTool: false,
	searchModel: DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
	searchMode: DEFAULT_OPENAI_CODEX_SEARCH_MODE,
	searchContextSize: DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
	searchMaxOutputTokens: DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
	proxyEnabled: false,
	proxyHost: "127.0.0.1",
	proxyPort: 7890,
	defaultContextWindow: 0,
	modelContextWindows: {}
});
/** Fill the schema defaults even when called without Cordis validation. */
function resolveOpenAICodexSettings(value) {
	return {
		...DEFAULT_OPENAI_CODEX_SETTINGS,
		...value
	};
}
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Narrow the redacted settings wire payload before it enters React state. */
function decodeOpenAICodexSettings(value) {
	if (!isRecord$1(value)) return void 0;
	const enableSearch = value["enableSearch"];
	const enableImageTool = value["enableImageTool"];
	const searchModel = value["searchModel"];
	const searchMode = value["searchMode"];
	const searchContextSize = value["searchContextSize"];
	const searchMaxOutputTokens = value["searchMaxOutputTokens"];
	const proxyEnabled = value["proxyEnabled"];
	const proxyHost = value["proxyHost"];
	const proxyPort = value["proxyPort"];
	const defaultContextWindow = value["defaultContextWindow"];
	const modelContextWindows = value["modelContextWindows"];
	if (typeof enableSearch !== "boolean" || typeof enableImageTool !== "boolean") return void 0;
	if (typeof searchModel !== "string" || searchModel.trim().length === 0) return void 0;
	if (searchMode !== "cached" && searchMode !== "indexed" && searchMode !== "live") return void 0;
	if (searchContextSize !== "low" && searchContextSize !== "medium" && searchContextSize !== "high") return void 0;
	if (typeof searchMaxOutputTokens !== "number" || !Number.isInteger(searchMaxOutputTokens) || searchMaxOutputTokens < 1) return void 0;
	if (proxyEnabled !== void 0 && typeof proxyEnabled !== "boolean") return void 0;
	if (proxyHost !== void 0 && (typeof proxyHost !== "string" || proxyHost.trim().length === 0)) return void 0;
	if (proxyPort !== void 0 && (typeof proxyPort !== "number" || !Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65535)) return void 0;
	if (defaultContextWindow !== void 0 && (typeof defaultContextWindow !== "number" || !Number.isInteger(defaultContextWindow) || defaultContextWindow < 0)) return void 0;
	let validModelContextWindows = {};
	if (modelContextWindows !== void 0 && isRecord$1(modelContextWindows)) for (const [key, val] of Object.entries(modelContextWindows)) {
		if (typeof val !== "number" || !Number.isInteger(val) || val < 1) return void 0;
		validModelContextWindows[key] = val;
	}
	return {
		enableSearch,
		enableImageTool,
		searchModel,
		searchMode,
		searchContextSize,
		searchMaxOutputTokens,
		proxyEnabled: typeof proxyEnabled === "boolean" ? proxyEnabled : DEFAULT_OPENAI_CODEX_SETTINGS.proxyEnabled,
		proxyHost: typeof proxyHost === "string" ? proxyHost : DEFAULT_OPENAI_CODEX_SETTINGS.proxyHost,
		proxyPort: typeof proxyPort === "number" ? proxyPort : DEFAULT_OPENAI_CODEX_SETTINGS.proxyPort,
		defaultContextWindow: typeof defaultContextWindow === "number" ? defaultContextWindow : DEFAULT_OPENAI_CODEX_SETTINGS.defaultContextWindow,
		modelContextWindows: validModelContextWindows
	};
}
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
		const effectiveProxy = this.options.proxyConfig || resolveProxyConfig();
		if (effectiveProxy) enableGlobalProxy(effectiveProxy);
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
		} finally {
			if (effectiveProxy) disableGlobalProxy();
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
//#region src/index.ts
/** Stable Cordis plugin name. */
const name = "llm-openai-codex";
/** The model registry required before the provider can register. */
const inject = ["llm"];
/** Branded Host settings namespace used by the configurable-provider directory. */
const OPENAI_CODEX_SETTINGS_NS = settingsNamespace(OPENAI_CODEX_SETTINGS_NAMESPACE);
const Config = z.object({
	enableSearch: z.boolean().default(false),
	enableImageTool: z.boolean().default(false),
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
	searchMaxOutputTokens: z.number().step(1).min(1).default(DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS),
	proxyEnabled: z.boolean().default(false),
	proxyHost: z.string().default("127.0.0.1"),
	proxyPort: z.number().step(1).min(1).max(65535).default(7890),
	defaultContextWindow: z.number().step(1).min(0).default(0),
	modelContextWindows: z.dict(z.string(), z.number().step(1).min(1)).default({})
});
/**
* Register the `openai-codex` LLM route with one provider-native OAuth store.
* Search and image tooling are added only when their config flags are true.
* Selecting this route as the Harness default remains a separate profile choice.
* @param ctx - plugin context carrying the LLM registry plus optional services.
* @param config - capability gates and standalone-search tuning.
*/
function apply(ctx, config) {
	let current = () => config;
	const credentials = new OpenAICodexCredentialStore();
	const fastMode = new FastModeRegistry();
	const getProxyConfig = () => {
		const cfg = current();
		if (cfg.proxyEnabled) return {
			host: cfg.proxyHost || "127.0.0.1",
			port: cfg.proxyPort || 7890
		};
		return resolveProxyConfig();
	};
	const getContextWindowOverrides = () => {
		const cfg = current();
		const d = cfg.defaultContextWindow ?? 0;
		const m = cfg.modelContextWindows;
		if ((!d || d <= 0) && (!m || Object.keys(m).length === 0)) return void 0;
		return {
			defaultContextWindow: d > 0 ? d : void 0,
			modelContextWindows: m && Object.keys(m).length > 0 ? m : void 0
		};
	};
	assertNoOpenAICodexProviderConflict(ctx.llm.listProviders().map((provider) => provider.id));
	ctx.llm.registerAdapter([OPENAI_CODEX_PROVIDER], createOpenAICodexAdapter(credentials, () => ctx.get("attachments"), fastMode, getProxyConfig(), getContextWindowOverrides()));
	ctx.llm.registerConfigurableProviders([{
		provider: OPENAI_CODEX_PROVIDER,
		displayName: "OpenAI Codex",
		settingsNs: OPENAI_CODEX_SETTINGS_NS,
		settingsPath: [],
		declared: false
	}]);
	ctx.inject(["webServer"], (webCtx) => registerOpenAICodexAuthRoutes(webCtx, credentials, void 0, fastMode, getProxyConfig));
	let stopped = false;
	let searchFiber;
	let searchRegistration;
	let searchTail = Promise.resolve();
	let imageFiber;
	let imageTail = Promise.resolve();
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
		installOpenAICodexSearchEvent();
		const fiber = ctx.inject(["web"], (webCtx) => webCtx.web.registerSearchProvider(new OpenAICodexSearchProvider({
			credentials,
			model: nextRegistration.model,
			mode: nextRegistration.mode,
			contextSize: nextRegistration.contextSize,
			maxOutputTokens: nextRegistration.maxOutputTokens,
			resolveRequestId: () => String(webCtx.get("agents")?.currentInitiator()?.session.id ?? randomUUID()),
			recordRequest: (request) => {
				recordOpenAICodexSearchRequest(webCtx, request);
			},
			proxyConfig: getProxyConfig()
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
	const scheduleCapabilities = () => {
		searchTail = searchTail.then(reconcileSearch, reconcileSearch).catch((error) => {
			ctx.logger.error("dsh-codex-connect: could not apply the updated search configuration");
			ctx.logger.error(error);
		});
		imageTail = imageTail.then(reconcileImageTool, reconcileImageTool).catch((error) => {
			ctx.logger.error("dsh-codex-connect: could not apply the updated image-tool configuration");
			ctx.logger.error(error);
		});
	};
	ctx.effect(() => async () => {
		stopped = true;
		await Promise.all([searchTail, imageTail]);
		const search = searchFiber;
		const image = imageFiber;
		searchFiber = void 0;
		imageFiber = void 0;
		await Promise.allSettled([search?.dispose() ?? Promise.resolve(), image?.dispose() ?? Promise.resolve()]);
	}, "dsh-codex-connect: optional capability lifecycle");
	installSettingsSection(ctx, OPENAI_CODEX_SETTINGS_NS, Config, config, {
		setSource(source) {
			current = source;
		},
		onChange: scheduleCapabilities
	});
	scheduleCapabilities();
}
//#endregion
export { OpenAICodexCredentialStore as $, DSH_PLUGIN_API_PACKAGES as A, OPENAI_CODEX_FAST_MODE_MAX_SESSIONS as B, assertNoOpenAICodexProviderConflict as C, COMPATIBILITY_CONTRACT as D, CODEX_CONNECT_VERSION as E, assessCompatibility as F, OPENAI_CODEX_USAGE_URL as G, isFastModeSessionId as H, detectCompatibility as I, loginOpenAICodex as J, parseOpenAICodexUsage as K, evaluateCompatibility as L, SUPPORTED_DSH_PLUGIN_API_VERSION as M, SUPPORTED_NODE_RANGE as N, COMPATIBILITY_PACKAGES as O, SUPPORTED_PI_AI_VERSION as P, OPENAI_CODEX_PROVIDER as Q, OPENAI_CODEX_FAST_MODE_PATH as R, VIEW_IMAGE_TOOL_NAME as S, openAICodexConflictMessage as T, OpenAICodexTrustedOriginsStore as U, OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH as V, normalizeTrustedOrigin as W, openAICodexAuthStatus as X, logoutOpenAICodex as Y, OPENAI_CODEX_AUTH_FILENAME as Z, decodeOpenAICodexSettings as _, name as a, installOpenAICodexSearchEvent as b, OPENAI_CODEX_SEARCH_URL as c, DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE as d, openAICodexAuthPath as et, DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS as f, OPENAI_CODEX_SETTINGS_NAMESPACE as g, DEFAULT_OPENAI_CODEX_SETTINGS as h, inject as i, PI_AI_PACKAGE as j, COMPATIBILITY_SCHEMA_VERSION as k, OpenAICodexSearchProvider as l, DEFAULT_OPENAI_CODEX_SEARCH_MODEL as m, OPENAI_CODEX_SETTINGS_NS as n, OPENAI_CODEX_BASE_URL as o, DEFAULT_OPENAI_CODEX_SEARCH_MODE as p, readOpenAICodexRateLimits as q, apply as r, OPENAI_CODEX_SEARCH_PROVIDER as s, Config as t, mapOpenAICodexSearchResponse as u, resolveOpenAICodexSettings as v, diagnoseOpenAICodex as w, recordOpenAICodexSearchRequest as x, OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT as y, FastModeRegistry as z };
