/** Load npm Undici without replacing the dispatcher owned by Node's fetch. */

import { createRequire } from 'node:module'

type UndiciModule = typeof import('undici')

const LEGACY_GLOBAL_DISPATCHER = Symbol.for('undici.globalDispatcher.1')
const CURRENT_GLOBAL_DISPATCHER = Symbol.for('undici.globalDispatcher.2')

function isDispatcher(value: unknown): value is { dispatch: (...args: unknown[]) => unknown } {
  return typeof value === 'object'
    && value !== null
    && 'dispatch' in value
    && typeof value.dispatch === 'function'
}

const inheritedDispatcher = Reflect.get(globalThis, LEGACY_GLOBAL_DISPATCHER)
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)
const isNodeEnvironmentProxy = nodeMajor >= 24
  && isDispatcher(inheritedDispatcher)
  && inheritedDispatcher.constructor.name === 'EnvHttpProxyAgent'
if (Reflect.get(globalThis, CURRENT_GLOBAL_DISPATCHER) === undefined && isNodeEnvironmentProxy) {
  Reflect.defineProperty(globalThis, CURRENT_GLOBAL_DISPATCHER, {
    value: inheritedDispatcher,
    writable: true,
    enumerable: false,
    configurable: false,
  })
}

const require = createRequire(import.meta.url)
const undici = require('undici') as UndiciModule

/** Undici dispatcher base loaded after preserving Node's dispatcher. */
export const Dispatcher = undici.Dispatcher
/** Direct Undici agent loaded after preserving Node's dispatcher. */
export const Agent = undici.Agent
/** HTTP(S) proxy agent loaded after preserving Node's dispatcher. */
export const ProxyAgent = undici.ProxyAgent
/** Undici fetch loaded after preserving Node's dispatcher. */
export const fetch = undici.fetch
/** Read npm Undici's active dispatcher. */
export const getGlobalDispatcher = undici.getGlobalDispatcher
/** Replace npm Undici's dispatcher while mirroring its legacy bridge. */
export const setGlobalDispatcher = undici.setGlobalDispatcher
