//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/utils/deferred-tools.js
const identityToolName = (name) => name;
/** Split current tools into prefix and transcript-loaded definitions. */
function splitDeferredTools(context, enabled, normalizeName = identityToolName) {
	const uniqueTools = /* @__PURE__ */ new Map();
	for (const tool of context.tools ?? []) uniqueTools.set(normalizeName(tool.name), tool);
	if (!enabled) return {
		immediate: [...uniqueTools.values()],
		deferred: /* @__PURE__ */ new Map()
	};
	const deferredNames = /* @__PURE__ */ new Set();
	const usedNames = /* @__PURE__ */ new Set();
	for (const message of context.messages) if (message.role === "assistant") {
		for (const block of message.content) if (block.type === "toolCall") usedNames.add(normalizeName(block.name));
	} else if (message.role === "toolResult") for (const name of message.addedToolNames ?? []) {
		const normalizedName = normalizeName(name);
		if (!usedNames.has(normalizedName)) deferredNames.add(normalizedName);
	}
	const immediate = [];
	const deferred = /* @__PURE__ */ new Map();
	for (const [name, tool] of uniqueTools) if (deferredNames.has(name)) deferred.set(name, tool);
	else immediate.push(tool);
	return {
		immediate,
		deferred
	};
}
//#endregion
export { splitDeferredTools as t };
