import { createRequire } from "node:module";
//#region src/undici-runtime.ts
/** Load npm Undici without replacing the dispatcher owned by Node's fetch. */
const LEGACY_GLOBAL_DISPATCHER = Symbol.for("undici.globalDispatcher.1");
const inheritedDispatcher = Reflect.get(globalThis, LEGACY_GLOBAL_DISPATCHER);
globalThis.WebSocket;
const undici = createRequire(import.meta.url)("undici");
if (inheritedDispatcher !== void 0) Reflect.set(globalThis, LEGACY_GLOBAL_DISPATCHER, inheritedDispatcher);
/** Undici dispatcher base loaded after preserving Node's dispatcher. */
const Dispatcher = undici.Dispatcher;
undici.Agent;
/** HTTP(S) proxy agent loaded after preserving Node's dispatcher. */
const ProxyAgent = undici.ProxyAgent;
/** Undici fetch loaded after preserving Node's dispatcher. */
const fetch = undici.fetch;
/** Read npm Undici's active dispatcher. */
const getGlobalDispatcher = undici.getGlobalDispatcher;
/** Replace npm Undici's dispatcher while mirroring its legacy bridge. */
const setGlobalDispatcher = undici.setGlobalDispatcher;
//#endregion
export { setGlobalDispatcher as a, getGlobalDispatcher as i, ProxyAgent as n, fetch as r, Dispatcher as t };
