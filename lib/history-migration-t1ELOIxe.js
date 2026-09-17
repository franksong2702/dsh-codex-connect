import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { LlmError, createUserMessage } from "@deepseek-ai/dsh-llm";
import { constants } from "node:fs";
import { link, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { withFileLock } from "@deepseek-ai/dsh-atomic-write";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { constants as constants$1, zstdCompressSync, zstdDecompressSync } from "node:zlib";
//#region src/reasoning-update.ts
/** Durable, user-confirmed Astra effort changes carried by DSH plugin messages. */
/** Reasoning levels accepted by Astra configuration updates. */
const ASTRA_REASONING_EFFORTS = [
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
/** Structured snapshot section owned by this plugin; text is not parsed from user content. */
const ASTRA_REASONING_SOURCE = "dsh-codex-connect/reasoning-update";
const SELECTION_SECTION = "dsh-codex-connect/selection-ordinal";
/** Reject unsupported or damaged reasoning state before sending model traffic. */
function reasoningUpdateError(message) {
	throw new LlmError(message, "OPENAI_CODEX_REASONING_UPDATE");
}
/** Validate a value read from tool input or durable state. */
function isAstraReasoningEffort(value) {
	return typeof value === "string" && ASTRA_REASONING_EFFORTS.some((effort) => effort === value);
}
/** Stable model-visible account of the user's confirmed selection. */
function reasoningUpdateText(update) {
	return `The user approved changing Astra reasoning effort from ${update.previousEffort} to ${update.effort} for this conversation. The change applies when this message enters the next request. The original request-level effort remains ${update.baseEffort}; other conversations and defaults are unchanged.`;
}
/**
* Construct after a DSH human answer or a logged explicit model selection.
* @param update - confirmed effort change.
* @param selectionOrdinal - one-based count of model/selection events, when acknowledging a manual choice.
* @returns a model-visible message with migration-safe structured provenance.
*/
function createReasoningUpdateMessage(update, selectionOrdinal) {
	const source = {
		kind: "plugin",
		plugin: "dsh-codex-connect",
		form: "snapshot",
		sections: [{
			name: ASTRA_REASONING_SOURCE,
			text: JSON.stringify(update)
		}, ...selectionOrdinal === void 0 ? [] : [{
			name: SELECTION_SECTION,
			text: String(selectionOrdinal)
		}]]
	};
	return createUserMessage({
		source,
		content: [{
			type: "text",
			text: reasoningUpdateText(update)
		}]
	});
}
/** Read structured plugin provenance, never a magic string from user or model text. */
function readReasoningUpdate(message) {
	const source = message.source;
	if (source.kind !== "plugin" || source.plugin !== "dsh-codex-connect") return void 0;
	let value;
	if ("reasoningUpdate" in source) value = source.reasoningUpdate;
	else if (source.form === "snapshot") {
		const sections = source.sections.filter((section) => section.name === ASTRA_REASONING_SOURCE);
		if (sections.length === 0) return void 0;
		if (sections.length !== 1 || source.sections.some((section) => !["dsh-codex-connect/reasoning-update", SELECTION_SECTION].includes(section.name))) reasoningUpdateError("Invalid Astra reasoning snapshot sections.");
		try {
			value = JSON.parse(sections[0].text);
		} catch {
			reasoningUpdateError("Invalid Astra reasoning snapshot JSON.");
		}
		readReasoningSelectionOrdinal(message);
	} else return;
	if (typeof value !== "object" || value === null || Array.isArray(value) || !("version" in value) || value.version !== 1 || !("sessionId" in value) || typeof value.sessionId !== "string" || value.sessionId.length === 0 || !("baseEffort" in value) || !isAstraReasoningEffort(value.baseEffort) || !("previousEffort" in value) || !isAstraReasoningEffort(value.previousEffort) || !("effort" in value) || !isAstraReasoningEffort(value.effort) || Object.keys(value).sort().join(",") !== "baseEffort,effort,previousEffort,sessionId,version") reasoningUpdateError("The saved Astra reasoning update is invalid or uses an unsupported version. Keep the session unchanged and start a new conversation.");
	const update = value;
	if (message.role !== "user" || source.form !== "notice" && source.form !== "snapshot" || message.content.length !== 1 || message.content[0]?.type !== "text" || message.content[0].text !== reasoningUpdateText(update)) reasoningUpdateError("The saved Astra reasoning notice does not match its confirmed update.");
	return update;
}
/**
* Read the one-based model-selection ordinal, which survives host event-sequence remapping.
* @param message - durable plugin snapshot.
* @returns acknowledged selection ordinal, if present.
*/
function readReasoningSelectionOrdinal(message) {
	const source = message.source;
	if (source.kind !== "plugin" || source.plugin !== "dsh-codex-connect" || source.form !== "snapshot") return void 0;
	const sections = source.sections.filter((section) => section.name === SELECTION_SECTION);
	if (sections.length === 0) return void 0;
	const value = Number(sections[0].text);
	if (sections.length !== 1 || !Number.isSafeInteger(value) || value < 1 || String(value) !== sections[0].text) reasoningUpdateError("Invalid Astra model-selection ordinal.");
	return value;
}
/**
* Resolve original-position updates from the exact request messages.
* Pure tool results do not occupy ordinary user-message positions in pi-ai.
* Mixed tool-result/content messages are rejected while updates are active.
*/
function planReasoningUpdates(options) {
	const first = options.messages.map(readReasoningUpdate).find((update) => update !== void 0);
	if (first === void 0) return void 0;
	if (options.provider !== "openai-codex" || options.model !== "gpt-6-astra" || options.purpose !== void 0) reasoningUpdateError("This conversation contains confirmed Astra reasoning updates. Model switching and auxiliary requests are not supported; use a new conversation.");
	if (options.sessionId === void 0 || !isAstraReasoningEffort(options.reasoningEffort)) reasoningUpdateError("Confirmed Astra reasoning updates require the original session and an explicit original reasoning level.");
	let userCount = 0;
	let effectiveEffort = first.baseEffort;
	let previousEffort = first.baseEffort;
	const updates = [];
	const ids = /* @__PURE__ */ new Set();
	for (const message of options.messages) {
		const update = readReasoningUpdate(message);
		if (update !== void 0) {
			if (update.sessionId !== options.sessionId || update.baseEffort !== first.baseEffort || update.previousEffort !== effectiveEffort || update.effort === effectiveEffort || ids.has(message.id)) reasoningUpdateError("The Astra reasoning history, original model selection, or session identity changed. Resume the original selection or start a new conversation.");
			ids.add(message.id);
			updates.push({
				userIndex: userCount,
				text: reasoningUpdateText(update),
				effort: update.effort
			});
			previousEffort = effectiveEffort;
			effectiveEffort = update.effort;
		}
		if (message.role === "assistant") continue;
		if (message.content.filter((block) => block.type === "tool-result").length > 0) {
			if (message.role !== "user" || message.content.length !== 1 || message.source.kind !== "tool") reasoningUpdateError("Mixed tool-result messages are not supported with Astra reasoning updates.");
			continue;
		}
		userCount++;
	}
	if (![
		first.baseEffort,
		previousEffort,
		effectiveEffort
	].includes(options.reasoningEffort)) reasoningUpdateError("The selected reasoning level does not match the confirmed Astra history.");
	const leading = options.messages[0];
	const leadingSystemText = options.system === void 0 && leading?.role === "system" ? leading.content.filter((block) => block.type === "text").map((block) => block.text).join("") : void 0;
	return {
		baseEffort: first.baseEffort,
		requestEffort: options.reasoningEffort,
		effectiveEffort,
		userCount,
		updates,
		...leadingSystemText === void 0 ? {} : { leadingSystemText }
	};
}
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Serialize the original wire effort and position-preserving updates from the effective DSH config. */
function applyReasoningUpdates(payload, plan) {
	if (!record(payload) || payload.model !== "gpt-6-astra" || !Array.isArray(payload.input) || !record(payload.reasoning) || payload.reasoning.effort !== plan.requestEffort) reasoningUpdateError("The Astra request does not preserve its original reasoning level.");
	if (payload.context_management !== void 0 || payload.truncation !== void 0 && payload.truncation !== "disabled" || payload.previous_response_id !== void 0 || payload.agents !== void 0 || payload.agent !== void 0 || payload.input.some((item) => record(item) && [
		"configuration_update",
		"compaction",
		"compaction_trigger"
	].includes(String(item.type)))) reasoningUpdateError("Astra reasoning updates require a complete, uncompacted, single-agent request history.");
	let userIndex = 0;
	let updateIndex = 0;
	const input = [];
	for (const item of payload.input) {
		if (record(item) && item.role === "user") {
			const update = plan.updates[updateIndex];
			if (update?.userIndex === userIndex) {
				if (!Array.isArray(item.content) || item.content.length !== 1 || !record(item.content[0]) || item.content[0].type !== "input_text" || item.content[0].text !== update.text) reasoningUpdateError("The Astra reasoning notice changed position during request conversion.");
				input.push({
					type: "configuration_update",
					reasoning: { effort: update.effort }
				});
				updateIndex++;
			}
			userIndex++;
		}
		input.push(item);
	}
	if (userIndex !== plan.userCount || updateIndex !== plan.updates.length) reasoningUpdateError("The Astra request conversion did not preserve its user-message positions.");
	return {
		...payload,
		input,
		reasoning: plan.requestEffort === plan.baseEffort ? payload.reasoning : {
			...payload.reasoning,
			effort: plan.baseEffort
		}
	};
}
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
/**
* Locate every complete frame in an append-only Zstandard artifact, rejecting trailing damage.
* @param buffer - compressed artifact bytes.
* @returns all frame ranges in physical order.
*/
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
export { ASTRA_REASONING_EFFORTS as a, isAstraReasoningEffort as c, readReasoningUpdate as d, reasoningUpdateError as f, scanZstdFrames as i, planReasoningUpdates as l, OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT as n, applyReasoningUpdates as o, migrateOpenAICodexSearchHistory as r, createReasoningUpdateMessage as s, OPENAI_CODEX_HISTORY_BACKUP_SUFFIX as t, readReasoningSelectionOrdinal as u };
