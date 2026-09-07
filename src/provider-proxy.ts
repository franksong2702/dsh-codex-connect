/** Explicit Codex-only HTTP(S) proxying, probing, and lifecycle ownership. */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { Dispatcher, ProxyAgent } from 'undici'
import {
  Dispatcher as UndiciDispatcher,
  ProxyAgent as UndiciProxyAgent,
  getGlobalDispatcher,
  setGlobalDispatcher,
} from './undici-runtime.ts'
import {
  isValidOpenAICodexProxyUrl,
  normalizeOpenAICodexProxyUrl,
} from './settings-contract.ts'

/** Canonical first-party endpoint used for a no-auth, no-model reachability probe. */
export const OPENAI_CODEX_PROXY_PROBE_URL = 'https://chatgpt.com/backend-api/codex'
/** Upper bound for one candidate probe, including CONNECT and response headers. */
export const OPENAI_CODEX_PROXY_PROBE_TIMEOUT_MS = 3_000
/** Maximum number of candidates considered by automatic detection. */
export const OPENAI_CODEX_PROXY_CANDIDATE_LIMIT = 8

/** Bounded local candidates documented by the settings UI. */
export const OPENAI_CODEX_LOCAL_PROXY_CANDIDATES = [
  'http://127.0.0.1:7890',
  'http://127.0.0.1:7897',
  'http://127.0.0.1:10809',
] as const

/** Stable probe classifications safe to display in the browser. */
export type OpenAICodexProxyProbeClassification =
  | 'reachable'
  | 'upstream-authentication-required'
  | 'proxy-authentication-required'
  | 'dns-failure'
  | 'connection-refused'
  | 'timeout'
  | 'tls-failure'
  | 'connect-failure'
  | 'invalid'

/** Result of testing one proxy origin. */
export interface OpenAICodexProxyProbeResult {
  /** Canonical proxy origin tested. */
  proxyUrl: string
  /** Whether the proxy returned any HTTP response from the probe origin. */
  reachable: boolean
  /** Bounded category for a UI troubleshooting message. */
  classification: OpenAICodexProxyProbeClassification
  /** Upstream or proxy status, when an HTTP response was received. */
  status?: number
}

const proxyScope = new AsyncLocalStorage<ProxyAgent>()
const activeOwners = new Set<OpenAICodexProxyManager>()

class ScopedProxyDispatcher extends UndiciDispatcher {
  constructor(private readonly fallback: Dispatcher) {
    super()
  }

  override dispatch(
    options: Dispatcher.DispatchOptions,
    handler: Dispatcher.DispatchHandler,
  ): boolean {
    return (proxyScope.getStore() ?? this.fallback).dispatch(options, handler)
  }
}

let installedDispatcher: ScopedProxyDispatcher | undefined
let previousDispatcher: Dispatcher | undefined
const legacySymbol = Symbol.for('undici.globalDispatcher.1')
interface LegacyDispatcher {
  dispatch: (...args: unknown[]) => unknown
}
let installedLegacy: LegacyDispatcher | undefined
let previousLegacy: LegacyDispatcher | undefined

function installLegacy(fallback: LegacyDispatcher, bridge: LegacyDispatcher): void {
  previousLegacy = fallback
  installedLegacy = {
    dispatch: (...args: unknown[]) => {
      const target = proxyScope.getStore() === undefined ? fallback : bridge
      return target.dispatch(...args)
    },
  }
  Reflect.set(globalThis, legacySymbol, installedLegacy)
}

function ensureInstalled(owner: OpenAICodexProxyManager): void {
  const current = getGlobalDispatcher()
  const legacy = Reflect.get(globalThis, legacySymbol) as LegacyDispatcher
  if (installedDispatcher === undefined) {
    previousDispatcher = current
    installedDispatcher = new ScopedProxyDispatcher(current)
    setGlobalDispatcher(installedDispatcher)
    installLegacy(legacy, Reflect.get(globalThis, legacySymbol) as LegacyDispatcher)
  } else if (current !== installedDispatcher) {
    // A third-party wrapper can retain the old dispatcher; never mutate its fallback.
    installedDispatcher = new ScopedProxyDispatcher(current)
    previousDispatcher = current
    setGlobalDispatcher(installedDispatcher)
    installLegacy(legacy === installedLegacy ? previousLegacy! : legacy,
      Reflect.get(globalThis, legacySymbol) as LegacyDispatcher)
  } else if (legacy !== installedLegacy) {
    setGlobalDispatcher(installedDispatcher)
    installLegacy(legacy, Reflect.get(globalThis, legacySymbol) as LegacyDispatcher)
  }
  activeOwners.add(owner)
}

function removeOwner(owner: OpenAICodexProxyManager): void {
  activeOwners.delete(owner)
  if (activeOwners.size !== 0 || installedDispatcher === undefined) return
  const installed = installedDispatcher
  const previous = previousDispatcher
  const legacy = Reflect.get(globalThis, legacySymbol) as LegacyDispatcher
  const restoreLegacy = legacy === installedLegacy ? previousLegacy : legacy
  installedDispatcher = undefined
  previousDispatcher = undefined
  if (getGlobalDispatcher() === installed && previous !== undefined) setGlobalDispatcher(previous)
  if (restoreLegacy !== undefined) Reflect.set(globalThis, legacySymbol, restoreLegacy)
  installedLegacy = undefined
  previousLegacy = undefined
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'
}

function errorDetails(error: unknown, seen = new Set<object>()): Array<{ code?: string; name?: string }> {
  if (typeof error !== 'object' || error === null || seen.has(error)) return []
  seen.add(error)
  const record = error as Record<string, unknown>
  const name = typeof record['name'] === 'string' ? record['name'] : undefined
  const code = typeof record['code'] === 'string' ? record['code'] : undefined
  return [{
    ...name === undefined ? {} : { name },
    ...code === undefined ? {} : { code },
  }, ...errorDetails(record['cause'], seen)]
}

function classifyProbeError(error: unknown): OpenAICodexProxyProbeClassification {
  const details = errorDetails(error)
  const first = details[0]
  if (first?.name === 'AbortError' || first?.code === 'ABORT_ERR' || first?.code === 'UND_ERR_ABORTED') {
    return 'connect-failure'
  }
  if (details.some(detail => detail.name === 'TimeoutError')) return 'timeout'
  const code = details.find(detail => detail.code !== undefined)?.code
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns-failure'
  if (code === 'ECONNREFUSED') return 'connection-refused'
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'timeout'
  if (code === 'ERR_TLS_CERT_ALTNAME_INVALID'
    || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    || code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
    || code === 'ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED') return 'tls-failure'
  return 'connect-failure'
}

function classifyResponse(status: number): OpenAICodexProxyProbeClassification {
  if (status === 407) return 'proxy-authentication-required'
  if (status === 401 || status === 403) return 'upstream-authentication-required'
  return 'reachable'
}

function candidateEnvironmentValues(): string[] {
  const values = [
    process.env['HTTPS_PROXY'],
    process.env['https_proxy'],
    process.env['HTTP_PROXY'],
    process.env['http_proxy'],
    process.env['ALL_PROXY'],
    process.env['all_proxy'],
  ]
  return values.filter((value): value is string => value !== undefined)
}

/** Return a small, deterministic candidate set; this never scans LAN hosts or ports. */
export function listOpenAICodexProxyCandidates(): readonly string[] {
  const candidates: string[] = []
  for (const value of [...candidateEnvironmentValues(), ...OPENAI_CODEX_LOCAL_PROXY_CANDIDATES]) {
    const normalized = normalizeOpenAICodexProxyUrl(value)
    if (normalized !== undefined && !candidates.includes(normalized)) candidates.push(normalized)
    if (candidates.length >= OPENAI_CODEX_PROXY_CANDIDATE_LIMIT) break
  }
  return candidates
}

/** One plugin instance owns its proxy agents and contributes one global wrapper owner. */
export class OpenAICodexProxyManager {
  private readonly agents = new Map<string, ProxyAgent>()
  private readonly connections = new Map<ProxyAgent, AbortController>()
  private activeOperations = 0
  private idleWaiters: Array<() => void> = []
  private disposed = false
  private disposePromise: Promise<void> | undefined
  private closing: Promise<void> | undefined

  private async waitForIdle(): Promise<void> {
    if (this.activeOperations === 0) return
    await new Promise<void>(resolve => {
      const finish = () => {
        clearTimeout(timer)
        this.idleWaiters = this.idleWaiters.filter(waiter => waiter !== finish)
        resolve()
      }
      const timer = setTimeout(finish, 1_000)
      this.idleWaiters.push(finish)
    })
  }

  private async closeAgents(): Promise<void> {
    // Late callbacks must still dispatch through their destroyed pool, never directly.
    if (this.activeOperations === 0) removeOwner(this)
    const agents = [...this.agents.values()]
    this.agents.clear()
    for (const agent of agents) {
      this.connections.get(agent)?.abort()
      this.connections.delete(agent)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.allSettled(agents.map(agent => agent.destroy())),
        new Promise<void>(resolve => { timer = setTimeout(resolve, 1_000) }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  private async shutdown(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    const closing = (async () => {
      await this.waitForIdle()
      await this.closeAgents()
    })()
    this.closing = closing
    try { await closing } finally {
      if (this.closing === closing) this.closing = undefined
    }
  }

  private agentFor(proxyUrl: string): ProxyAgent {
    let agent = this.agents.get(proxyUrl)
    if (agent !== undefined) return agent
    const connection = new AbortController()
    // Node accepts a socket abort signal; its TLS options omit that inherited field.
    const connectionOptions = { signal: connection.signal, rejectUnauthorized: true }
    agent = new UndiciProxyAgent({
      uri: proxyUrl,
      proxyTunnel: true,
      requestTls: connectionOptions,
      proxyTls: connectionOptions,
    })
    this.connections.set(agent, connection)
    this.agents.set(proxyUrl, agent)
    return agent
  }

  private acquire(proxyUrl: string): { agent: ProxyAgent; release: () => void } {
    if (this.disposed) throw new Error('OpenAI Codex proxy manager has been disposed')
    if (this.closing !== undefined) throw new Error('OpenAI Codex proxy manager is shutting down')
    ensureInstalled(this)
    this.activeOperations += 1
    let released = false
    return {
      agent: this.agentFor(proxyUrl),
      release: () => {
        if (released) return
        released = true
        this.activeOperations -= 1
        if (this.activeOperations === 0) {
          if (this.agents.size === 0) removeOwner(this)
          for (const resolve of this.idleWaiters.splice(0)) resolve()
        }
      },
    }
  }

  /** Run a synchronous or asynchronous Codex operation in the selected proxy scope. */
  run<T>(proxyUrl: string | undefined, operation: () => T): T {
    if (proxyUrl === undefined) return operation()
    const normalized = normalizeOpenAICodexProxyUrl(proxyUrl)
    if (!isValidOpenAICodexProxyUrl(normalized)) {
      throw new TypeError('OpenAI Codex proxy URL is invalid')
    }
    const lease = this.acquire(normalized)
    try {
      const value = proxyScope.run(lease.agent, operation)
      if (isPromiseLike(value)) {
        return Promise.resolve(value).finally(lease.release) as T
      }
      lease.release()
      return value
    } catch (error: unknown) {
      lease.release()
      throw error
    }
  }

  /** Run a streaming operation and keep the proxy lease until its final event. */
  runStream<T extends { result(): Promise<unknown> }>(proxyUrl: string | undefined, operation: () => T): T {
    if (proxyUrl === undefined) return operation()
    const normalized = normalizeOpenAICodexProxyUrl(proxyUrl)
    if (!isValidOpenAICodexProxyUrl(normalized)) {
      throw new TypeError('OpenAI Codex proxy URL is invalid')
    }
    const lease = this.acquire(normalized)
    try {
      const stream = proxyScope.run(lease.agent, operation)
      void Promise.resolve(stream.result()).then(lease.release, lease.release)
      return stream
    } catch (error: unknown) {
      lease.release()
      throw error
    }
  }

  /** Probe one proxy without credentials, model calls, quota calls, or settings writes. */
  async probe(proxyUrl: string): Promise<OpenAICodexProxyProbeResult> {
    const normalized = normalizeOpenAICodexProxyUrl(proxyUrl)
    if (normalized === undefined) {
      return { proxyUrl, reachable: false, classification: 'invalid' }
    }
    try {
      const response = await this.run(normalized, () => fetch(OPENAI_CODEX_PROXY_PROBE_URL, {
        method: 'GET',
        redirect: 'manual',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(OPENAI_CODEX_PROXY_PROBE_TIMEOUT_MS),
      }))
      await response.body?.cancel()
      return {
        proxyUrl: normalized,
        reachable: true,
        classification: classifyResponse(response.status),
        status: response.status,
      }
    } catch (error: unknown) {
      return {
        proxyUrl: normalized,
        reachable: false,
        classification: classifyProbeError(error),
      }
    }
  }

  /** Allow one second to drain, then destroy owned pools with a one-second completion bound. */
  async dispose(): Promise<void> {
    if (this.disposePromise !== undefined) return this.disposePromise
    this.disposed = true
    this.disposePromise = this.shutdown()
    return this.disposePromise
  }

  /** Bound shutdown as on disposal; reject new proxy leases until reconfiguration finishes. */
  async deactivate(): Promise<void> {
    if (this.disposed) return
    await this.shutdown()
  }
}

/** Probe the bounded automatic candidate set in parallel. */
export async function detectOpenAICodexProxies(
  manager: OpenAICodexProxyManager,
): Promise<readonly OpenAICodexProxyProbeResult[]> {
  return Promise.all(listOpenAICodexProxyCandidates().map(candidate => manager.probe(candidate)))
}
