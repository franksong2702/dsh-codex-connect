//#region src/astra-history-repair.d.ts
/** Offline repair of pre-release Astra provenance; never replaces a source artifact. */
/**
 * Convert validated legacy Astra provenance to snapshot sections in complete v0 JSONL.
 * @param jsonl - uncompressed original artifact, including its header.
 * @returns repaired JSONL with unchanged message IDs, contents and event order, and changed occurrence count.
 */
declare function repairAstraHistory(jsonl: string): {
  jsonl: string;
  changed: number;
};
/**
 * Create a private, exclusive output artifact; the input is never opened for writing.
 * @param input - existing .jsonl or .jsonl.zstd source.
 * @param output - new artifact with the same supported filename extensions.
 * @returns number of repaired message occurrences.
 */
declare function repairAstraHistoryFile(input: string, output: string): Promise<number>;
//#endregion
export { repairAstraHistory, repairAstraHistoryFile };