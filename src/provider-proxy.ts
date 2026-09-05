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
  constructor(private fallback: Dispatcher) {
    super()
  }

  setFallback(fallback: Dispatcher): void {
    this.fallback = fallback
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

function ensureInstalled(owner: OpenAICodexProxyManager): void {
  if (activeOwners.has(owner)) return
  const current = getGlobalDispatcher()
  if (installedDispatcher === undefined) {
    previousDispatcher = current
    installedDispatcher = new ScopedProxyDispatcher(current)
    setGlobalDispatcher(installedDispatcher)
  } else if (current !== installedDispatcher) {
    // Preserve a dispatcher installed by another library while this wrapper is live.
    installedDispatcher.setFallback(current)
    setGlobalDispatcher(installedDispatcher)
  }
  activeOwners.add(owner)
}

function removeOwner(owner: OpenAICodexProxyManager): void {
  activeOwners.delete(owner)
  if (activeOwners.size !== 0 || installedDispatcher === undefined) return
  const installed = installedDispatcher
  const previous = previousDispatcher
  installedDispatcher = undefined
  previousDispatcher = undefined
  if (getGlobalDispatcher() === installed && previous !== undefined) setGlobalDispatcher(previous)
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const record = error as Record<string, unknown>
  return typeof record['code'] === 'string'
    ? record['code']
    : errorCode(record['cause'])
}

function classifyProbeError(error: unknown): OpenAICodexProxyProbeClassification {
  const code = errorCode(error)
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns-failure'
  if (code === 'ECONNREFUSED') return 'connection-refused'
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ABORT_ERR') return 'timeout'
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
  private activeOperations = 0
  private idleWaiters: Array<() => void> = []
  private disposed = false
  private disposePromise: Promise<void> | undefined

  private async waitForIdle(): Promise<void> {
    if (this.activeOperations === 0) return
    await new Promise<void>(resolve => { this.idleWaiters.push(resolve) })
  }

  private async closeAgents(): Promise<void> {
    removeOwner(this)
    const agents = [...this.agents.values()]
    this.agents.clear()
    await Promise.allSettled(agents.map(agent => agent.close()))
  }

  private agentFor(proxyUrl: string): ProxyAgent {
    let agent = this.agents.get(proxyUrl)
    if (agent !== undefined) return agent
    agent = new UndiciProxyAgent({ uri: proxyUrl, proxyTunnel: true })
    this.agents.set(proxyUrl, agent)
    return agent
  }

  private acquire(proxyUrl: string): { agent: ProxyAgent; release: () => void } {
    if (this.disposed) throw new Error('OpenAI Codex proxy manager has been disposed')
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
      void Promise.resolve(stream.result()).finally(lease.release)
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

  /** Close owned pools only after all scoped operations have become quiescent. */
  async dispose(): Promise<void> {
    if (this.disposePromise !== undefined) return this.disposePromise
    this.disposed = true
    this.disposePromise = (async () => {
      await this.waitForIdle()
      await this.closeAgents()
    })()
    return this.disposePromise
  }

  /** Release the process wrapper and pools after the user disables the proxy. */
  async deactivate(): Promise<void> {
    if (this.disposed) return
    await this.waitForIdle()
    await this.closeAgents()
  }
}

/** Probe the bounded automatic candidate set in parallel. */
export async function detectOpenAICodexProxies(
  manager: OpenAICodexProxyManager,
): Promise<readonly OpenAICodexProxyProbeResult[]> {
  return Promise.all(listOpenAICodexProxyCandidates().map(candidate => manager.probe(candidate)))
}
