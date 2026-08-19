import z from "@deepseek-ai/schemastery";
import { TOOL_ABORTED, defineTool } from "@deepseek-ai/dsh-tools";
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
//#region src/tool.ts
const IMAGE_GENERATE_TOOL_NAME = "codex_connect_image_generate";
const TRANSPORT_SERVICE$1 = "openaiCodexTransport";
const PROMPT_MAX_LENGTH = 32e3;
const MAX_IMAGES_PER_RESPONSE = 4;
const QUOTA_WARNING = "The upstream generation may continue and may still consume quota.";
var SafeToolError = class extends Error {};
function failure(message) {
	throw new SafeToolError(message);
}
function fixedTransportMessage(error) {
	switch (typeof error === "object" && error !== null && "code" in error ? error.code : void 0) {
		case "OPENAI_CODEX_SIGNED_OUT": return "Sign in to OpenAI Codex before generating images.";
		case "OPENAI_CODEX_REAUTH_REQUIRED": return "Renew OpenAI Codex authorization before generating images.";
		case "OPENAI_CODEX_RATE_LIMITED": return "Image generation is rate limited. Try again later.";
		case "OPENAI_CODEX_TIMEOUT": return `Image generation timed out. ${QUOTA_WARNING}`;
		case "OPENAI_CODEX_CANCELED": return `Image generation was canceled. ${QUOTA_WARNING}`;
		case "OPENAI_CODEX_NETWORK_ERROR": return `The image generation request lost its network connection. ${QUOTA_WARNING}`;
		case "OPENAI_CODEX_UPSTREAM_REJECTED": return "The image generation service rejected this request.";
		case "OPENAI_CODEX_UPSTREAM_UNAVAILABLE": return "The image generation service is temporarily unavailable.";
		case "OPENAI_CODEX_RESPONSE_TOO_LARGE": return "The image generation response exceeded the safe size limit.";
		case "OPENAI_CODEX_MALFORMED_RESPONSE": return "The image generation service returned an unreadable response.";
		default: return "Image generation failed without exposing private response details.";
	}
}
function extension(mediaType) {
	return mediaType === "image/jpeg" ? "jpg" : mediaType.slice(6);
}
function outputContent(value) {
	const lines = value.images.map((image, index) => `${String(index + 1)}. ${image.mediaType}, ${String(image.width)}x${String(image.height)} px, ${String(image.bytes)} bytes, attachment ${image.attachmentId}`);
	return [{
		type: "text",
		text: `Generated ${String(value.images.length)} image${value.images.length === 1 ? "" : "s"}:\n${lines.join("\n")}`
	}];
}
function validateRef(ref, parsed, input, name) {
	if (typeof ref.attachmentId !== "string" || ref.attachmentId.length === 0 || ref.mediaType !== parsed.mediaType || ref.bytes !== input.data.byteLength || ref.width !== parsed.width || ref.height !== parsed.height || ref.name !== name) failure("The attachment store returned inconsistent image metadata.");
}
function executionKey(exec) {
	return `${String(exec.agent?.id ?? "<no-agent>")}\u0000${String(exec.rootCallId)}\u0000${String(exec.callId)}`;
}
async function generate(ctx, transport, prompt, exec) {
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
		if (estimate === void 0) failure("The image generation service returned invalid image data.");
		if (estimate > limits.maxImageBytes) failure("A generated image exceeds this deployment's byte limit.");
		estimatedTotal += estimate;
		if (!Number.isSafeInteger(estimatedTotal) || estimatedTotal > limits.maxMessageImageBytes) failure("The generated image batch exceeds this deployment's byte limit.");
		estimates.push(estimate);
	}
	const inputs = [];
	const parsedImages = [];
	for (const [index, image] of response.images.entries()) {
		const data = decodeStrictBase64(image.b64Json);
		if (data === void 0 || data.byteLength !== estimates[index]) failure("The image generation service returned invalid image data.");
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
	let refs;
	try {
		refs = await ctx.attachments.saveImages(inputs);
	} catch {
		failure("The generated images could not be saved; no attachment references were returned.");
	}
	if (refs.length !== inputs.length) failure("The attachment store returned an incomplete image batch.");
	return { images: refs.map((ref, index) => {
		const parsed = parsedImages[index];
		const input = inputs[index];
		const name = input?.name;
		if (parsed === void 0 || input === void 0 || name === void 0) failure("The attachment store returned an incomplete image batch.");
		validateRef(ref, parsed, input, name);
		return {
			attachmentId: ref.attachmentId,
			mediaType: parsed.mediaType,
			width: parsed.width,
			height: parsed.height,
			bytes: input.data.byteLength,
			name
		};
	}) };
}
function appendAbortWarning(result) {
	if (!result.isError || result.error.info?.code !== TOOL_ABORTED) return void 0;
	if (result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").includes(QUOTA_WARNING)) return void 0;
	return [...result.content, {
		type: "text",
		text: QUOTA_WARNING
	}];
}
/** Build one fiber-owned image tool, including in-flight call deduplication. */
function imageGenerateTool(ctx) {
	const inFlight = /* @__PURE__ */ new Map();
	return defineTool({
		name: IMAGE_GENERATE_TOOL_NAME,
		description: "Generate an image from a text prompt and save it as a durable DSH attachment. Supports one prompt only; output size and style are service defaults.",
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
				} }
			},
			render: (_args, value) => outputContent(value)
		},
		finalizeContent: (_exec, result) => appendAbortWarning(result),
		async execute(args, exec) {
			if (Object.keys(args).length !== 1 || !Object.hasOwn(args, "prompt")) failure("Image generation accepts only the prompt field.");
			if (args.prompt.trim().length === 0 || args.prompt.length > PROMPT_MAX_LENGTH) failure("Image prompt must contain 1 to 32000 characters.");
			const transport = ctx.reflect.get(TRANSPORT_SERVICE$1);
			if (transport?.apiVersion !== 1) failure("The Codex Connect image transport is unavailable.");
			const key = executionKey(exec);
			const current = inFlight.get(key);
			if (current !== void 0) return current;
			const pending = generate(ctx, transport, args.prompt, exec).catch((error) => {
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
//#region src/index.ts
/** Stable Host plugin id. */
const name = "llm-openai-codex-images";
const TRANSPORT_SERVICE = "openaiCodexTransport";
const SUPPORTED_TRANSPORT_API_VERSION = 1;
const Config = z.object({ enabled: z.boolean().default(true) });
/** Register the image tool only for one enabled, compatible service lifecycle. */
function apply(ctx, config) {
	if (config.enabled !== true) return;
	if (ctx.reflect.get(TRANSPORT_SERVICE) === void 0) ctx.logger.warn("dsh-codex-connect-images: waiting for the Codex Connect core transport; install it with \"dsh plugin --profile web add dsh-codex-connect@alpha\"");
	ctx.inject([TRANSPORT_SERVICE], (transportCtx) => {
		if (transportCtx.reflect.get(TRANSPORT_SERVICE)?.apiVersion !== SUPPORTED_TRANSPORT_API_VERSION) {
			transportCtx.logger.error("dsh-codex-connect-images: the installed Codex Connect core exposes an unsupported transport API version; update both packages to matching alpha releases");
			return;
		}
		transportCtx.inject(["tools", "attachments"], (toolCtx) => toolCtx.tools.register(imageGenerateTool(toolCtx)));
	});
}
//#endregion
export { Config, IMAGE_GENERATE_TOOL_NAME, apply, name };
