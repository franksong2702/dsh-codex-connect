#!/usr/bin/env node
import { d as readReasoningUpdate, i as scanZstdFrames, s as createReasoningUpdateMessage } from "./history-migration-t1ELOIxe.js";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";
//#region src/astra-history-repair.ts
/** Offline repair of pre-release Astra provenance; never replaces a source artifact. */
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Convert validated legacy Astra provenance to snapshot sections in complete v0 JSONL.
* @param jsonl - uncompressed original artifact, including its header.
* @returns repaired JSONL with unchanged message IDs, contents and event order, and changed occurrence count.
*/
function repairAstraHistory(jsonl) {
	const lines = jsonl.split("\n");
	const header = JSON.parse(lines[0] ?? "");
	if (!record(header) || header.type !== "session" || header.version !== 0 || typeof header.id !== "string") throw new Error("Expected a complete format v0 Session artifact");
	let changed = 0;
	const selections = /* @__PURE__ */ new Map();
	const migrateMessage = (value) => {
		if (!record(value) || !record(value.source) || value.source.kind !== "plugin" || value.source.plugin !== "dsh-codex-connect" || !("reasoningUpdate" in value.source)) return;
		if (Object.keys(value).sort().join(",") !== "content,id,role,source" || typeof value.id !== "string" || value.id.length === 0 || !Array.isArray(value.content) || Object.keys(value.source).filter((key) => key !== "reasoningSelectionSeq").sort().join(",") !== "form,kind,plugin,reasoningUpdate,summary") throw new Error("Unexpected legacy Astra message members; original artifact must remain unchanged");
		if ("reasoningSelectionSeq" in value.source && (!Number.isSafeInteger(value.source.reasoningSelectionSeq) || value.source.reasoningSelectionSeq < 0)) throw new Error("Invalid Astra selection reference");
		const update = readReasoningUpdate(value);
		if (update === void 0 || update.sessionId !== header.id || value.source.summary !== `Approved Astra reasoning: ${update.previousEffort} → ${update.effort}`) throw new Error("Legacy Astra approval does not match this Session");
		const selectionOrdinal = "reasoningSelectionSeq" in value.source ? selections.get(value.source.reasoningSelectionSeq) : void 0;
		if ("reasoningSelectionSeq" in value.source && selectionOrdinal === void 0) throw new Error("Missing earlier Astra selection");
		value.source = createReasoningUpdateMessage(update, selectionOrdinal).source;
		changed++;
	};
	for (let index = 1; index < lines.length; index++) {
		if (index === lines.length - 1 && lines[index] === "") continue;
		const row = JSON.parse(lines[index]);
		const before = changed;
		if (record(row) && record(row.data)) {
			if (row.type === "model/selection" && typeof row.seq === "number") selections.set(row.seq, selections.size + 1);
			if (row.type === "user/message") migrateMessage(row.data);
			if (row.type === "agent/inbox/spliced" && Array.isArray(row.data.inserted)) row.data.inserted.forEach(migrateMessage);
		}
		const hasLegacy = (value) => {
			if (Array.isArray(value)) return value.some(hasLegacy);
			if (!record(value)) return false;
			return value.kind === "plugin" && value.plugin === "dsh-codex-connect" && "reasoningUpdate" in value || Object.values(value).some(hasLegacy);
		};
		if (hasLegacy(row)) throw new Error("Legacy Astra provenance in an unsupported location");
		if (changed !== before) lines[index] = JSON.stringify(row);
	}
	return {
		jsonl: lines.join("\n"),
		changed
	};
}
/**
* Create a private, exclusive output artifact; the input is never opened for writing.
* @param input - existing .jsonl or .jsonl.zstd source.
* @param output - new artifact with the same supported filename extensions.
* @returns number of repaired message occurrences.
*/
async function repairAstraHistoryFile(input, output) {
	if (resolve(input) === resolve(output)) throw new Error("Input and output must differ");
	for (const path of [input, output]) if (!path.endsWith(".jsonl") && !path.endsWith(".jsonl.zstd")) throw new Error("Expected .jsonl or .jsonl.zstd");
	const bytes = await readFile(input);
	const decoded = input.endsWith(".zstd") ? Buffer.concat(scanZstdFrames(bytes).map(({ start, end }) => zstdDecompressSync(bytes.subarray(start, end)))) : bytes;
	const repaired = repairAstraHistory(new TextDecoder("utf-8", { fatal: true }).decode(decoded));
	if (repaired.changed === 0) throw new Error("No legacy Astra provenance found; no output written");
	const outputBytes = Buffer.from(repaired.jsonl);
	await writeFile(output, output.endsWith(".zstd") ? zstdCompressSync(outputBytes) : outputBytes, {
		flag: "wx",
		mode: 384
	});
	return repaired.changed;
}
if (process.argv[1] !== void 0 && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const args = process.argv.slice(2);
	if (args.length !== 2) {
		process.stderr.write("Usage: node lib/astra-history-repair.js INPUT.jsonl[.zstd] NEW-OUTPUT.jsonl[.zstd]\n");
		process.exitCode = 2;
	} else try {
		const changed = await repairAstraHistoryFile(args[0], args[1]);
		process.stdout.write(`${JSON.stringify({
			changed,
			sourceUnchanged: true
		})}\n`);
	} catch {
		process.stderr.write("Astra history repair refused or failed. No source artifact was modified.\n");
		process.exitCode = 1;
	}
}
//#endregion
export { repairAstraHistory, repairAstraHistoryFile };
