/** Runtime search-route adapter for the supported DeepSeek Harness release. */

import type WebRuntime from '@deepseek-ai/dsh-web'
import type { Context } from '@deepseek-ai/cordis'

const SEARCH_PROVIDER_FIELD = 'searchProviderId'

function readSearchProvider(web: WebRuntime): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(web, SEARCH_PROVIDER_FIELD)) {
    throw new Error('The installed DeepSeek Harness does not expose the supported search route field')
  }
  const value = Reflect.get(web, SEARCH_PROVIDER_FIELD) as unknown
  if (value !== undefined && typeof value !== 'string') {
    throw new Error('The installed DeepSeek Harness returned an invalid search route')
  }
  return value
}

function writeSearchProvider(web: WebRuntime, provider: string | undefined): void {
  if (!Reflect.set(web, SEARCH_PROVIDER_FIELD, provider) || readSearchProvider(web) !== provider) {
    throw new Error('The installed DeepSeek Harness refused the search route change')
  }
}

/** rc.2 reads a Host-owned readonly Volatile reference on each search. */
function selectVolatileRoute(web: WebRuntime, provider: string): () => void {
  const slot = Object.getOwnPropertyDescriptor(web, 'config')
  const config: unknown = Reflect.get(web, 'config')
  if (slot?.writable !== true || !('value' in slot) || typeof config !== 'object' || config === null) {
    throw new Error('The installed DeepSeek Harness does not expose the supported search route field')
  }
  const field = Object.getOwnPropertyDescriptor(config, 'searchProvider')
  const reference: unknown = Reflect.get(config, 'searchProvider')
  if (field === undefined || !('value' in field) || !(field.configurable || field.writable)
    || typeof reference !== 'object' || reference === null || !('get' in reference) || typeof reference.get !== 'function') {
    throw new Error('The installed DeepSeek Harness does not expose the supported volatile search route')
  }
  const get = reference.get as () => unknown
  const read = (): string | undefined => {
    const value = get.call(reference)
    if (value !== undefined && typeof value !== 'string') throw new Error('The installed DeepSeek Harness returned an invalid search route')
    return value
  }
  read()
  // A traced service's ctx getter belongs to the caller. Its own data slot
  // retains the actual owner, to which Loader scopes volatile-update events.
  const owner = Object.getOwnPropertyDescriptor(web, 'ctx')?.value as Context | undefined
  // Newer Cordis retains raw input in fiber.config and exposes the running
  // Volatile references through effectiveConfig. Never accept raw input as a
  // substitute when that public running-config surface exists.
  const ownerConfig: unknown = owner === undefined ? undefined
    : 'effectiveConfig' in owner.fiber ? Reflect.get(owner.fiber, 'effectiveConfig') : owner.fiber.config
  if (owner === undefined || typeof owner.on !== 'function' || ownerConfig !== config) {
    throw new Error('The installed DeepSeek Harness does not expose the supported search route owner')
  }
  let selectedByPlugin = true
  const stop = owner.on('loader/volatile-update', (paths) => {
    if (paths.some(path => path.length === 0 || path[0] === 'searchProvider')) selectedByPlugin = false
  })
  // Do not write the Host's Volatile reference or persistent settings. Its owner
  // synchronously notifies each committed change, including A -> B -> A between
  // searches. Once that happens, this activation never takes selection back.
  const selected = Object.freeze({ get: () => selectedByPlugin ? provider : read() })
  const facade = new Proxy(config, { get(target, key, receiver) {
    const current: unknown = Reflect.get(target, key, receiver)
    return key === 'searchProvider' && current === reference ? selected : current
  } })
  if (!Reflect.set(web, 'config', facade) || Reflect.get(web, 'config') !== facade) {
    stop()
    throw new Error('The installed DeepSeek Harness refused the search route change')
  }
  let active = true
  return () => {
    if (!active) return
    active = false
    stop()
    if (Reflect.get(web, 'config') === facade && !Reflect.set(web, 'config', config)) {
      throw new Error('The installed DeepSeek Harness refused search route restoration')
    }
  }
}

/**
 * Select one provider in the supported DSH runtime and return an idempotent restore operation.
 * The restore preserves a newer third-party route change instead of overwriting it.
 * @param web - active DSH web runtime.
 * @param provider - registered provider id selected while the capability is enabled.
 * @returns disposer that restores the route observed before selection.
 */
export function selectOpenAICodexSearchRoute(web: WebRuntime, provider: string): () => void {
  if (!Object.prototype.hasOwnProperty.call(web, SEARCH_PROVIDER_FIELD)) return selectVolatileRoute(web, provider)
  const previous = readSearchProvider(web)
  writeSearchProvider(web, provider)
  let active = true
  return () => {
    if (!active) return
    active = false
    if (readSearchProvider(web) === provider) writeSearchProvider(web, previous)
  }
}
