import { n as __require, t as __commonJSMin } from "./rolldown-runtime-KwVTW_0O.js";
//#region node_modules/.pnpm/partial-json@0.1.7/node_modules/partial-json/dist/options.js
var require_options = /* @__PURE__ */ __commonJSMin(((exports) => {
	/**
	* Sometimes you don't allow every type to be partially parsed.
	* For example, you may not want a partial number because it may increase its size gradually before it's complete.
	* In this case, you can use the `Allow` object to control what types you allow to be partially parsed.
	* @module
	*/
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Allow = exports.ALL = exports.COLLECTION = exports.ATOM = exports.SPECIAL = exports.INF = exports._INFINITY = exports.INFINITY = exports.NAN = exports.BOOL = exports.NULL = exports.OBJ = exports.ARR = exports.NUM = exports.STR = void 0;
	/**
	* allow partial strings like `"hello \u12` to be parsed as `"hello "`
	*/
	exports.STR = 1;
	/**
	* allow partial numbers like `123.` to be parsed as `123`
	*/
	exports.NUM = 2;
	/**
	* allow partial arrays like `[1, 2,` to be parsed as `[1, 2]`
	*/
	exports.ARR = 4;
	/**
	* allow partial objects like `{"a": 1, "b":` to be parsed as `{"a": 1}`
	*/
	exports.OBJ = 8;
	/**
	* allow `nu` to be parsed as `null`
	*/
	exports.NULL = 16;
	/**
	* allow `tr` to be parsed as `true`, and `fa` to be parsed as `false`
	*/
	exports.BOOL = 32;
	/**
	* allow `Na` to be parsed as `NaN`
	*/
	exports.NAN = 64;
	/**
	* allow `Inf` to be parsed as `Infinity`
	*/
	exports.INFINITY = 128;
	/**
	* allow `-Inf` to be parsed as `-Infinity`
	*/
	exports._INFINITY = 256;
	exports.INF = exports.INFINITY | exports._INFINITY;
	exports.SPECIAL = exports.NULL | exports.BOOL | exports.INF | exports.NAN;
	exports.ATOM = exports.STR | exports.NUM | exports.SPECIAL;
	exports.COLLECTION = exports.ARR | exports.OBJ;
	exports.ALL = exports.ATOM | exports.COLLECTION;
	/**
	* Control what types you allow to be partially parsed.
	* The default is to allow all types to be partially parsed, which in most casees is the best option.
	* @example
	* If you don't want to allow partial objects, you can use the following code:
	* ```ts
	* import { Allow, parse } from "partial-json";
	* parse(`[{"a": 1, "b": 2}, {"a": 3,`, Allow.ARR); // [ { a: 1, b: 2 } ]
	* ```
	* Or you can use `~` to disallow a type:
	* ```ts
	* parse(`[{"a": 1, "b": 2}, {"a": 3,`, ~Allow.OBJ); // [ { a: 1, b: 2 } ]
	* ```
	* @example
	* If you don't want to allow partial strings, you can use the following code:
	* ```ts
	* import { Allow, parse } from "partial-json";
	* parse(`["complete string", "incompl`, ~Allow.STR); // [ 'complete string' ]
	* ```
	*/
	exports.Allow = {
		STR: exports.STR,
		NUM: exports.NUM,
		ARR: exports.ARR,
		OBJ: exports.OBJ,
		NULL: exports.NULL,
		BOOL: exports.BOOL,
		NAN: exports.NAN,
		INFINITY: exports.INFINITY,
		_INFINITY: exports._INFINITY,
		INF: exports.INF,
		SPECIAL: exports.SPECIAL,
		ATOM: exports.ATOM,
		COLLECTION: exports.COLLECTION,
		ALL: exports.ALL
	};
	exports.default = exports.Allow;
}));
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/json-parse.js
var import_dist = (/* @__PURE__ */ __commonJSMin(((exports) => {
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
	var __exportStar = exports && exports.__exportStar || function(m, exports$1) {
		for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports$1, p)) __createBinding(exports$1, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Allow = exports.MalformedJSON = exports.PartialJSON = exports.parseJSON = exports.parse = void 0;
	const options_1 = require_options();
	Object.defineProperty(exports, "Allow", {
		enumerable: true,
		get: function() {
			return options_1.Allow;
		}
	});
	__exportStar(require_options(), exports);
	var PartialJSON = class extends Error {};
	exports.PartialJSON = PartialJSON;
	var MalformedJSON = class extends Error {};
	exports.MalformedJSON = MalformedJSON;
	/**
	* Parse incomplete JSON
	* @param {string} jsonString Partial JSON to be parsed
	* @param {number} allowPartial Specify what types are allowed to be partial, see {@link Allow} for details
	* @returns The parsed JSON
	* @throws {PartialJSON} If the JSON is incomplete (related to the `allow` parameter)
	* @throws {MalformedJSON} If the JSON is malformed
	*/
	function parseJSON(jsonString, allowPartial = options_1.Allow.ALL) {
		if (typeof jsonString !== "string") throw new TypeError(`expecting str, got ${typeof jsonString}`);
		if (!jsonString.trim()) throw new Error(`${jsonString} is empty`);
		return _parseJSON(jsonString.trim(), allowPartial);
	}
	exports.parseJSON = parseJSON;
	const _parseJSON = (jsonString, allow) => {
		const length = jsonString.length;
		let index = 0;
		const markPartialJSON = (msg) => {
			throw new PartialJSON(`${msg} at position ${index}`);
		};
		const throwMalformedError = (msg) => {
			throw new MalformedJSON(`${msg} at position ${index}`);
		};
		const parseAny = () => {
			skipBlank();
			if (index >= length) markPartialJSON("Unexpected end of input");
			if (jsonString[index] === "\"") return parseStr();
			if (jsonString[index] === "{") return parseObj();
			if (jsonString[index] === "[") return parseArr();
			if (jsonString.substring(index, index + 4) === "null" || options_1.Allow.NULL & allow && length - index < 4 && "null".startsWith(jsonString.substring(index))) {
				index += 4;
				return null;
			}
			if (jsonString.substring(index, index + 4) === "true" || options_1.Allow.BOOL & allow && length - index < 4 && "true".startsWith(jsonString.substring(index))) {
				index += 4;
				return true;
			}
			if (jsonString.substring(index, index + 5) === "false" || options_1.Allow.BOOL & allow && length - index < 5 && "false".startsWith(jsonString.substring(index))) {
				index += 5;
				return false;
			}
			if (jsonString.substring(index, index + 8) === "Infinity" || options_1.Allow.INFINITY & allow && length - index < 8 && "Infinity".startsWith(jsonString.substring(index))) {
				index += 8;
				return Infinity;
			}
			if (jsonString.substring(index, index + 9) === "-Infinity" || options_1.Allow._INFINITY & allow && 1 < length - index && length - index < 9 && "-Infinity".startsWith(jsonString.substring(index))) {
				index += 9;
				return -Infinity;
			}
			if (jsonString.substring(index, index + 3) === "NaN" || options_1.Allow.NAN & allow && length - index < 3 && "NaN".startsWith(jsonString.substring(index))) {
				index += 3;
				return NaN;
			}
			return parseNum();
		};
		const parseStr = () => {
			const start = index;
			let escape = false;
			index++;
			while (index < length && (jsonString[index] !== "\"" || escape && jsonString[index - 1] === "\\")) {
				escape = jsonString[index] === "\\" ? !escape : false;
				index++;
			}
			if (jsonString.charAt(index) == "\"") try {
				return JSON.parse(jsonString.substring(start, ++index - Number(escape)));
			} catch (e) {
				throwMalformedError(String(e));
			}
			else if (options_1.Allow.STR & allow) try {
				return JSON.parse(jsonString.substring(start, index - Number(escape)) + "\"");
			} catch (e) {
				return JSON.parse(jsonString.substring(start, jsonString.lastIndexOf("\\")) + "\"");
			}
			markPartialJSON("Unterminated string literal");
		};
		const parseObj = () => {
			index++;
			skipBlank();
			const obj = {};
			try {
				while (jsonString[index] !== "}") {
					skipBlank();
					if (index >= length && options_1.Allow.OBJ & allow) return obj;
					const key = parseStr();
					skipBlank();
					index++;
					try {
						obj[key] = parseAny();
					} catch (e) {
						if (options_1.Allow.OBJ & allow) return obj;
						else throw e;
					}
					skipBlank();
					if (jsonString[index] === ",") index++;
				}
			} catch (e) {
				if (options_1.Allow.OBJ & allow) return obj;
				else markPartialJSON("Expected '}' at end of object");
			}
			index++;
			return obj;
		};
		const parseArr = () => {
			index++;
			const arr = [];
			try {
				while (jsonString[index] !== "]") {
					arr.push(parseAny());
					skipBlank();
					if (jsonString[index] === ",") index++;
				}
			} catch (e) {
				if (options_1.Allow.ARR & allow) return arr;
				markPartialJSON("Expected ']' at end of array");
			}
			index++;
			return arr;
		};
		const parseNum = () => {
			if (index === 0) {
				if (jsonString === "-") throwMalformedError("Not sure what '-' is");
				try {
					return JSON.parse(jsonString);
				} catch (e) {
					if (options_1.Allow.NUM & allow) try {
						return JSON.parse(jsonString.substring(0, jsonString.lastIndexOf("e")));
					} catch (e) {}
					throwMalformedError(String(e));
				}
			}
			const start = index;
			if (jsonString[index] === "-") index++;
			while (jsonString[index] && ",]}".indexOf(jsonString[index]) === -1) index++;
			if (index == length && !(options_1.Allow.NUM & allow)) markPartialJSON("Unterminated number literal");
			try {
				return JSON.parse(jsonString.substring(start, index));
			} catch (e) {
				if (jsonString.substring(start, index) === "-") markPartialJSON("Not sure what '-' is");
				try {
					return JSON.parse(jsonString.substring(start, jsonString.lastIndexOf("e")));
				} catch (e) {
					throwMalformedError(String(e));
				}
			}
		};
		const skipBlank = () => {
			while (index < length && " \n\r	".includes(jsonString[index])) index++;
		};
		return parseAny();
	};
	exports.parse = parseJSON;
})))();
const VALID_JSON_ESCAPES = /* @__PURE__ */ new Set([
	"\"",
	"\\",
	"/",
	"b",
	"f",
	"n",
	"r",
	"t",
	"u"
]);
function isControlCharacter(char) {
	const codePoint = char.codePointAt(0);
	return codePoint !== void 0 && codePoint >= 0 && codePoint <= 31;
}
function escapeControlCharacter(char) {
	switch (char) {
		case "\b": return "\\b";
		case "\f": return "\\f";
		case "\n": return "\\n";
		case "\r": return "\\r";
		case "	": return "\\t";
		default: return `\\u${char.codePointAt(0)?.toString(16).padStart(4, "0") ?? "0000"}`;
	}
}
/**
* Repairs malformed JSON string literals by:
* - escaping raw control characters inside strings
* - doubling backslashes before invalid escape characters
*/
function repairJson(json) {
	let repaired = "";
	let inString = false;
	for (let index = 0; index < json.length; index++) {
		const char = json[index];
		if (!inString) {
			repaired += char;
			if (char === "\"") inString = true;
			continue;
		}
		if (char === "\"") {
			repaired += char;
			inString = false;
			continue;
		}
		if (char === "\\") {
			const nextChar = json[index + 1];
			if (nextChar === void 0) {
				repaired += "\\\\";
				continue;
			}
			if (nextChar === "u") {
				const unicodeDigits = json.slice(index + 2, index + 6);
				if (/^[0-9a-fA-F]{4}$/.test(unicodeDigits)) {
					repaired += `\\u${unicodeDigits}`;
					index += 5;
					continue;
				}
			}
			if (VALID_JSON_ESCAPES.has(nextChar)) {
				repaired += `\\${nextChar}`;
				index += 1;
				continue;
			}
			repaired += "\\\\";
			continue;
		}
		repaired += isControlCharacter(char) ? escapeControlCharacter(char) : char;
	}
	return repaired;
}
function parseJsonWithRepair(json) {
	try {
		return JSON.parse(json);
	} catch (error) {
		const repairedJson = repairJson(json);
		if (repairedJson !== json) return JSON.parse(repairedJson);
		throw error;
	}
}
/**
* Attempts to parse potentially incomplete JSON during streaming.
* Always returns a valid object, even if the JSON is incomplete.
*
* @param partialJson The partial JSON string from streaming
* @returns Parsed object or empty object if parsing fails
*/
function parseStreamingJson(partialJson) {
	if (!partialJson || partialJson.trim() === "") return {};
	try {
		return parseJsonWithRepair(partialJson);
	} catch {
		try {
			return (0, import_dist.parse)(partialJson) ?? {};
		} catch {
			try {
				return (0, import_dist.parse)(repairJson(partialJson)) ?? {};
			} catch {
				return {};
			}
		}
	}
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/provider-env.js
let procEnvCache = null;
/**
* Fallback for https://github.com/oven-sh/bun/issues/27802.
* Bun compiled binaries can expose an empty process.env inside Linux sandboxes
* even though /proc/self/environ contains the environment.
*
* This intentionally duplicates restoreSandboxEnv() in
* packages/coding-agent/src/bun/restore-sandbox-env.ts. The ai package can be
* used directly, without going through that entrypoint, so provider env lookup
* must not depend on process.env having been patched.
*/
function getBunSandboxEnvValue(name) {
	if (typeof process === "undefined" || !process.versions?.bun || Object.keys(process.env).length > 0) return;
	if (procEnvCache === null) {
		procEnvCache = /* @__PURE__ */ new Map();
		try {
			const { readFileSync } = __require("node:fs");
			const data = readFileSync("/proc/self/environ", "utf-8");
			for (const entry of data.split("\0")) {
				const idx = entry.indexOf("=");
				if (idx > 0) procEnvCache.set(entry.slice(0, idx), entry.slice(idx + 1));
			}
		} catch {}
	}
	return procEnvCache.get(name);
}
/**
* Resolve a provider env value from scoped overrides, normal process.env, then
* the duplicated Bun sandbox fallback for direct pi-ai consumers.
*/
function getProviderEnvValue(name, env) {
	return env?.[name] || (typeof process !== "undefined" ? process.env[name] : void 0) || getBunSandboxEnvValue(name) || void 0;
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/sanitize-unicode.js
/**
* Removes unpaired Unicode surrogate characters from a string.
*
* Unpaired surrogates (high surrogates 0xD800-0xDBFF without matching low surrogates 0xDC00-0xDFFF,
* or vice versa) cause JSON serialization errors in many API providers.
*
* Valid emoji and other characters outside the Basic Multilingual Plane use properly paired
* surrogates and will NOT be affected by this function.
*
* @param text - The text to sanitize
* @returns The sanitized text with unpaired surrogates removed
*
* @example
* // Valid emoji (properly paired surrogates) are preserved
* sanitizeSurrogates("Hello 🙈 World") // => "Hello 🙈 World"
*
* // Unpaired high surrogate is removed
* const unpaired = String.fromCharCode(0xD83D); // high surrogate without low
* sanitizeSurrogates(`Text ${unpaired} here`) // => "Text  here"
*/
function sanitizeSurrogates(text) {
	return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/api/constrained-sampling.js
var UnsupportedStrictJsonSchemaError = class extends Error {};
const UNSUPPORTED_STRICT_SCHEMA_KEYS = [
	"$ref",
	"$defs",
	"definitions",
	"allOf",
	"oneOf",
	"patternProperties",
	"dependentSchemas",
	"dependencies",
	"unevaluatedProperties",
	"propertyNames",
	"contains",
	"prefixItems",
	"not",
	"if",
	"then",
	"else"
];
function isJsonSchemaObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isStructuredSchema(schema) {
	if (!isJsonSchemaObject(schema)) return false;
	const types = typeof schema.type === "string" ? [schema.type] : Array.isArray(schema.type) ? schema.type : [];
	return types.includes("object") || types.includes("array") || schema.properties !== void 0 || schema.items !== void 0;
}
function schemaAllowsNull(schema) {
	if (!isJsonSchemaObject(schema)) return false;
	if (schema.type === "null" || Array.isArray(schema.type) && schema.type.includes("null")) return true;
	if (schema.const === null || Array.isArray(schema.enum) && schema.enum.includes(null)) return true;
	return Array.isArray(schema.anyOf) && schema.anyOf.some((variant) => schemaAllowsNull(variant));
}
function makeJsonSchemaNodeStrict(schema) {
	if (!isJsonSchemaObject(schema)) throw new UnsupportedStrictJsonSchemaError("boolean schemas are unsupported");
	for (const key of UNSUPPORTED_STRICT_SCHEMA_KEYS) if (schema[key] !== void 0) throw new UnsupportedStrictJsonSchemaError(`${key} schemas are unsupported`);
	if (schema.anyOf !== void 0) {
		if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) throw new UnsupportedStrictJsonSchemaError("anyOf must contain at least one schema");
		for (const variant of schema.anyOf) {
			if (isStructuredSchema(variant)) throw new UnsupportedStrictJsonSchemaError("object and array unions are unsupported");
			makeJsonSchemaNodeStrict(variant);
		}
	}
	if (schema.items !== void 0) {
		if (Array.isArray(schema.items)) throw new UnsupportedStrictJsonSchemaError("tuple schemas are unsupported");
		makeJsonSchemaNodeStrict(schema.items);
	}
	const isObjectSchema = schema.type === "object";
	if (schema.properties !== void 0 && !isObjectSchema) throw new UnsupportedStrictJsonSchemaError("properties require type object");
	if (!isObjectSchema) return;
	if (schema.additionalProperties !== void 0 && schema.additionalProperties !== false) throw new UnsupportedStrictJsonSchemaError("schema-valued or true additionalProperties is unsupported");
	if (schema.properties !== void 0 && !isJsonSchemaObject(schema.properties)) throw new UnsupportedStrictJsonSchemaError("object properties must be a schema map");
	if (schema.required !== void 0 && (!Array.isArray(schema.required) || schema.required.some((key) => typeof key !== "string"))) throw new UnsupportedStrictJsonSchemaError("object required must be a string array");
	const properties = schema.properties ?? {};
	const propertyNames = Object.keys(properties);
	const required = new Set(Array.isArray(schema.required) ? schema.required : []);
	if ([...required].some((key) => !propertyNames.includes(key))) throw new UnsupportedStrictJsonSchemaError("required contains an unknown property");
	for (const [key, property] of Object.entries(properties)) {
		makeJsonSchemaNodeStrict(property);
		if (!required.has(key) && !schemaAllowsNull(property)) properties[key] = { anyOf: [property, { type: "null" }] };
	}
	schema.required = propertyNames;
	schema.additionalProperties = false;
}
/** Convert a tool schema to the strict subset expected by provider constrained sampling. */
function makeStrictJsonSchema(schema) {
	const cloned = structuredClone(schema);
	if (!isJsonSchemaObject(cloned)) throw new UnsupportedStrictJsonSchemaError("root schema must have type object");
	makeJsonSchemaNodeStrict(cloned);
	if (cloned.type !== "object") throw new UnsupportedStrictJsonSchemaError("root schema must have type object");
	return cloned;
}
function getJsonSchemaToolParameters(tool, strict) {
	return strict === true ? makeStrictJsonSchema(tool.parameters) : tool.parameters;
}
function getGrammarToolInput(toolName, arguments_, inputProperty) {
	const input = arguments_[inputProperty];
	if (typeof input !== "string") throw new Error(`Grammar tool call "${toolName}" requires argument "${inputProperty}" to be a string.`);
	return input;
}
function appendGrammarToolInputJsonDelta(buffer, inputProperty, nextInput, close) {
	if (buffer.closed) {
		if (close && nextInput === buffer.input) return void 0;
		throw new Error(`grammar tool input for property "${inputProperty}" changed after it was closed`);
	}
	if (!nextInput.startsWith(buffer.input)) throw new Error(`grammar tool input for property "${inputProperty}" changed non-monotonically`);
	const inputDelta = nextInput.slice(buffer.input.length);
	if (!close && inputDelta.length === 0) return void 0;
	let delta = "";
	if (!buffer.started) {
		delta += `{${JSON.stringify(inputProperty)}:"`;
		buffer.started = true;
	}
	delta += JSON.stringify(inputDelta).slice(1, -1);
	buffer.input = nextInput;
	if (close) {
		delta += "\"}";
		buffer.closed = true;
	}
	return delta;
}
function inferGrammarInputProperty(tool) {
	const schema = tool.parameters;
	if (schema.type !== "object") throw new Error("grammar constrained sampling requires an object parameter schema");
	if (!Array.isArray(schema.required) || schema.required.length !== 1 || typeof schema.required[0] !== "string") throw new Error("grammar constrained sampling requires exactly one required string property");
	const inputProperty = schema.required[0];
	if (!schema.properties?.[inputProperty]) throw new Error(`grammar constrained sampling requires a properties entry for ${inputProperty}`);
	if (schema.properties[inputProperty]?.type !== "string") throw new Error(`grammar constrained sampling property ${inputProperty} must have type string`);
	return inputProperty;
}
function resolveJsonSchemaStrictSampling(tool, supportsStrictMode) {
	const config = tool.constrainedSampling;
	if (!config || config.type !== "json_schema") return void 0;
	if (supportsStrictMode) try {
		makeStrictJsonSchema(tool.parameters);
		return true;
	} catch (error) {
		if (!(error instanceof UnsupportedStrictJsonSchemaError)) throw error;
		if (config.strict !== "require") return void 0;
		throw new Error(`Tool "${tool.name}" requires JSON-schema constrained sampling, but ${error.message}.`);
	}
	if (config.strict === "require") throw new Error(`Tool "${tool.name}" requires JSON-schema constrained sampling, but strict tools are unsupported.`);
}
function resolveGrammarConstrainedSampling(tool, supportsOpenAIGrammarTools) {
	const config = tool.constrainedSampling;
	if (!config || config.type !== "grammar") return;
	if (!supportsOpenAIGrammarTools) return;
	const larkDefinition = config.variants.openai_lark;
	const regexDefinition = config.variants.openai_regex;
	const hasLarkDefinition = typeof larkDefinition === "string" && larkDefinition.trim().length > 0;
	const hasRegexDefinition = typeof regexDefinition === "string" && regexDefinition.trim().length > 0;
	if (!hasLarkDefinition && !hasRegexDefinition) throw new Error(`Tool "${tool.name}" cannot use grammar constrained sampling: no supported grammar variant was provided.`);
	try {
		return {
			format: hasLarkDefinition ? "lark" : "regex",
			definition: hasLarkDefinition ? larkDefinition : regexDefinition,
			inputProperty: inferGrammarInputProperty(tool)
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Tool "${tool.name}" cannot use grammar constrained sampling: ${message}.`);
	}
}
function createGrammarToolInputProperties(tools, supportsOpenAIGrammarTools) {
	const properties = /* @__PURE__ */ new Map();
	for (const tool of tools ?? []) {
		const grammar = resolveGrammarConstrainedSampling(tool, supportsOpenAIGrammarTools);
		if (grammar) properties.set(tool.name, grammar.inputProperty);
	}
	return properties;
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/api/transform-messages.js
const NON_VISION_USER_IMAGE_PLACEHOLDER = "(image omitted: model does not support images)";
const NON_VISION_TOOL_IMAGE_PLACEHOLDER = "(tool image omitted: model does not support images)";
function replaceImagesWithPlaceholder(content, placeholder) {
	const result = [];
	let previousWasPlaceholder = false;
	for (const block of content) {
		if (block.type === "image") {
			if (!previousWasPlaceholder) result.push({
				type: "text",
				text: placeholder
			});
			previousWasPlaceholder = true;
			continue;
		}
		result.push(block);
		previousWasPlaceholder = block.text === placeholder;
	}
	return result;
}
function downgradeUnsupportedImages(messages, model) {
	if (model.input.includes("image")) return messages;
	return messages.map((msg) => {
		if (msg.role === "user" && Array.isArray(msg.content)) return {
			...msg,
			content: replaceImagesWithPlaceholder(msg.content, NON_VISION_USER_IMAGE_PLACEHOLDER)
		};
		if (msg.role === "toolResult") return {
			...msg,
			content: replaceImagesWithPlaceholder(msg.content, NON_VISION_TOOL_IMAGE_PLACEHOLDER)
		};
		return msg;
	});
}
/**
* Normalize tool call ID for cross-provider compatibility.
* OpenAI Responses API generates IDs that are 450+ chars with special characters like `|`.
* Anthropic APIs require IDs matching ^[a-zA-Z0-9_-]+$ (max 64 chars).
*/
function transformMessages(messages, model, normalizeToolCallId) {
	const toolCallIdMap = /* @__PURE__ */ new Map();
	const transformed = downgradeUnsupportedImages(messages.map((msg) => msg.content == null ? {
		...msg,
		content: []
	} : msg), model).map((msg) => {
		if (msg.role === "user") return msg;
		if (msg.role === "toolResult") {
			const normalizedId = toolCallIdMap.get(msg.toolCallId);
			if (normalizedId && normalizedId !== msg.toolCallId) return {
				...msg,
				toolCallId: normalizedId
			};
			return msg;
		}
		if (msg.role === "assistant") {
			const assistantMsg = msg;
			const isSameModel = assistantMsg.provider === model.provider && assistantMsg.api === model.api && assistantMsg.model === model.id;
			const transformedContent = assistantMsg.content.flatMap((block) => {
				if (block.type === "thinking") {
					if (block.redacted) return isSameModel ? block : [];
					if (isSameModel && block.thinkingSignature) return block;
					if (!block.thinking || block.thinking.trim() === "") return [];
					if (isSameModel) return block;
					return {
						type: "text",
						text: block.thinking
					};
				}
				if (block.type === "text") {
					if (isSameModel) return block;
					return {
						type: "text",
						text: block.text
					};
				}
				if (block.type === "toolCall") {
					const toolCall = block;
					let normalizedToolCall = toolCall;
					if (!isSameModel && toolCall.thoughtSignature) {
						normalizedToolCall = { ...toolCall };
						delete normalizedToolCall.thoughtSignature;
					}
					if (!isSameModel && normalizeToolCallId) {
						const normalizedId = normalizeToolCallId(toolCall.id, model, assistantMsg);
						if (normalizedId !== toolCall.id) {
							toolCallIdMap.set(toolCall.id, normalizedId);
							normalizedToolCall = {
								...normalizedToolCall,
								id: normalizedId
							};
						}
					}
					return normalizedToolCall;
				}
				return block;
			});
			return {
				...assistantMsg,
				content: transformedContent
			};
		}
		return msg;
	});
	const result = [];
	let pendingToolCalls = [];
	let existingToolResultIds = /* @__PURE__ */ new Set();
	const insertSyntheticToolResults = () => {
		if (pendingToolCalls.length > 0) {
			for (const tc of pendingToolCalls) if (!existingToolResultIds.has(tc.id)) result.push({
				role: "toolResult",
				toolCallId: tc.id,
				toolName: tc.name,
				content: [{
					type: "text",
					text: "No result provided"
				}],
				isError: true,
				timestamp: Date.now()
			});
			pendingToolCalls = [];
			existingToolResultIds = /* @__PURE__ */ new Set();
		}
	};
	for (let i = 0; i < transformed.length; i++) {
		const msg = transformed[i];
		if (msg.role === "assistant") {
			insertSyntheticToolResults();
			const assistantMsg = msg;
			if (assistantMsg.stopReason === "error" || assistantMsg.stopReason === "aborted") continue;
			const toolCalls = assistantMsg.content.filter((b) => b.type === "toolCall");
			if (toolCalls.length > 0) {
				pendingToolCalls = toolCalls;
				existingToolResultIds = /* @__PURE__ */ new Set();
			}
			result.push(msg);
		} else if (msg.role === "toolResult") {
			existingToolResultIds.add(msg.toolCallId);
			result.push(msg);
		} else if (msg.role === "user") {
			insertSyntheticToolResults();
			result.push(msg);
		} else result.push(msg);
	}
	insertSyntheticToolResults();
	return result;
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/headers.js
function headersToRecord(headers) {
	const result = {};
	for (const [key, value] of headers.entries()) result[key] = value;
	return result;
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/pi-user-agent.js
function loadNodeOs() {
	if (typeof process === "undefined" || !(process.versions?.node || process.versions?.bun)) return null;
	return process.getBuiltinModule?.("node:os") ?? null;
}
const nodeOs = loadNodeOs();
function getPiUserAgent() {
	return nodeOs ? `pi (${nodeOs.platform()} ${nodeOs.release()}; ${nodeOs.arch()})` : "pi (browser)";
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/estimate.js
const CHARS_PER_TOKEN = 4;
const ESTIMATED_IMAGE_CHARS = 4800;
function calculateContextTokens(usage) {
	return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}
function safeJsonStringify(value) {
	try {
		return JSON.stringify(value) ?? "undefined";
	} catch {
		return "[unserializable]";
	}
}
function estimateTextAndImageContentChars(content) {
	if (typeof content === "string") return content.length;
	let chars = 0;
	for (const block of content) chars += block.type === "text" ? block.text.length : ESTIMATED_IMAGE_CHARS;
	return chars;
}
function estimateTextTokens(text) {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}
function estimateTextAndImageContentTokens(content) {
	return Math.ceil(estimateTextAndImageContentChars(content) / CHARS_PER_TOKEN);
}
function estimateMessageTokens(message) {
	let chars = 0;
	if (message.role === "user") return estimateTextAndImageContentTokens(message.content);
	if (message.role === "toolResult") return estimateTextAndImageContentTokens(message.content);
	for (const block of message.content) if (block.type === "text") chars += block.text.length;
	else if (block.type === "thinking") chars += block.thinking.length;
	else chars += block.name.length + safeJsonStringify(block.arguments).length;
	return Math.ceil(chars / CHARS_PER_TOKEN);
}
function getLastAssistantUsageInfo(messages) {
	let latestPrefixTimestamp = Number.NEGATIVE_INFINITY;
	let usageInfo;
	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];
		if (message.role === "assistant") {
			const assistant = message;
			if (assistant.timestamp >= latestPrefixTimestamp && assistant.stopReason !== "aborted" && assistant.stopReason !== "error" && calculateContextTokens(assistant.usage) > 0) usageInfo = {
				usage: assistant.usage,
				index: i
			};
		}
		latestPrefixTimestamp = Math.max(latestPrefixTimestamp, message.timestamp);
	}
	return usageInfo;
}
function estimateMessages(messages) {
	const usageInfo = getLastAssistantUsageInfo(messages);
	if (usageInfo) {
		const usageTokens = calculateContextTokens(usageInfo.usage);
		let trailingTokens = 0;
		for (let i = usageInfo.index + 1; i < messages.length; i++) trailingTokens += estimateMessageTokens(messages[i]);
		return {
			tokens: usageTokens + trailingTokens,
			usageTokens,
			trailingTokens,
			lastUsageIndex: usageInfo.index
		};
	}
	let tokens = 0;
	for (const message of messages) tokens += estimateMessageTokens(message);
	return {
		tokens,
		usageTokens: 0,
		trailingTokens: tokens,
		lastUsageIndex: null
	};
}
function estimateToolsTokens(tools) {
	if (!tools || tools.length === 0) return 0;
	return estimateTextTokens(safeJsonStringify(tools));
}
function isMessageArray(value) {
	return Array.isArray(value);
}
function estimateContextTokens(context) {
	if (isMessageArray(context)) return estimateMessages(context);
	const estimate = estimateMessages(context.messages);
	if (estimate.lastUsageIndex !== null) {
		const addedNames = new Set(context.messages.slice(estimate.lastUsageIndex + 1).filter((message) => message.role === "toolResult").flatMap((message) => message.addedToolNames ?? []));
		const addedToolTokens = estimateToolsTokens(context.tools?.filter((tool) => addedNames.has(tool.name)));
		return {
			tokens: estimate.tokens + addedToolTokens,
			usageTokens: estimate.usageTokens,
			trailingTokens: estimate.trailingTokens + addedToolTokens,
			lastUsageIndex: estimate.lastUsageIndex
		};
	}
	const prefixTokens = (context.systemPrompt ? estimateTextTokens(context.systemPrompt) : 0) + estimateToolsTokens(context.tools);
	return {
		tokens: estimate.tokens + prefixTokens,
		usageTokens: estimate.usageTokens,
		trailingTokens: estimate.trailingTokens + prefixTokens,
		lastUsageIndex: estimate.lastUsageIndex
	};
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/api/simple-options.js
const CONTEXT_SAFETY_TOKENS = 4096;
const MIN_MAX_TOKENS = 1;
function clampMaxTokensToContext(model, context, maxTokens) {
	if (model.contextWindow <= 0) return Math.max(MIN_MAX_TOKENS, maxTokens);
	const available = model.contextWindow - estimateContextTokens(context).tokens - CONTEXT_SAFETY_TOKENS;
	return Math.min(maxTokens, Math.max(MIN_MAX_TOKENS, available));
}
function buildBaseOptions(model, context, options, apiKey) {
	const samplingParams = model.samplingParams || options?.samplingParams ? {
		...model.samplingParams,
		...options?.samplingParams
	} : void 0;
	return {
		temperature: options?.temperature,
		samplingParams,
		maxTokens: clampMaxTokensToContext(model, context, options?.maxTokens ?? model.maxTokens),
		signal: options?.signal,
		telemetryContext: options?.telemetryContext,
		apiKey: apiKey || options?.apiKey,
		fetch: options?.fetch,
		transport: options?.transport,
		cacheRetention: options?.cacheRetention,
		sessionId: options?.sessionId,
		headers: options?.headers,
		onPayload: options?.onPayload,
		onResponse: options?.onResponse,
		timeoutMs: options?.timeoutMs,
		websocketConnectTimeoutMs: options?.websocketConnectTimeoutMs,
		maxRetries: options?.maxRetries,
		maxRetryDelayMs: options?.maxRetryDelayMs,
		metadata: options?.metadata,
		env: options?.env
	};
}
/** Tokens always left for the answer when a thinking budget shares the response ceiling. */
const MIN_ANSWER_TOKENS = 1024;
const DEFAULT_THINKING_BUDGETS = {
	minimal: 1024,
	low: 2048,
	medium: 8192,
	high: 16384
};
function clampReasoning(effort) {
	return effort === "xhigh" || effort === "max" ? "high" : effort;
}
function thinkingBudgetForLevel(reasoningLevel, customBudgets) {
	return {
		...DEFAULT_THINKING_BUDGETS,
		...customBudgets
	}[clampReasoning(reasoningLevel)];
}
/** Cap a thinking budget so at least MIN_ANSWER_TOKENS remain under a shared response ceiling. */
function clampThinkingBudgetToAnswerRoom(thinkingBudget, ceiling) {
	return Math.min(thinkingBudget, Math.max(0, ceiling - MIN_ANSWER_TOKENS));
}
function adjustMaxTokensForThinking(baseMaxTokens, modelMaxTokens, reasoningLevel, customBudgets) {
	let thinkingBudget = thinkingBudgetForLevel(reasoningLevel, customBudgets);
	const maxTokens = baseMaxTokens === void 0 ? modelMaxTokens : Math.min(baseMaxTokens + thinkingBudget, modelMaxTokens);
	if (maxTokens <= thinkingBudget) thinkingBudget = clampThinkingBudgetToAnswerRoom(thinkingBudget, maxTokens);
	return {
		maxTokens,
		thinkingBudget
	};
}
//#endregion
export { parseJsonWithRepair as _, thinkingBudgetForLevel as a, transformMessages as c, getGrammarToolInput as d, getJsonSchemaToolParameters as f, getProviderEnvValue as g, sanitizeSurrogates as h, clampThinkingBudgetToAnswerRoom as i, appendGrammarToolInputJsonDelta as l, resolveJsonSchemaStrictSampling as m, buildBaseOptions as n, getPiUserAgent as o, resolveGrammarConstrainedSampling as p, clampMaxTokensToContext as r, headersToRecord as s, adjustMaxTokensForThinking as t, createGrammarToolInputProperties as u, parseStreamingJson as v };
