/** Instance-scoped HTTP CONNECT proxying for OpenAI Codex provider traffic. */

import { AsyncLocalStorage } from 'node:async_hooks'
import {
  Dispatcher,
  ProxyAgent,
  getGlobalDispatcher,
  request,
  setGlobalDispatcher,
} from 'undici'

/** Fixed first-party endpoint used only to prove that a draft proxy can connect. */
export const OPENAI_CODEX_PROXY_TEST_URL = 'https://chatgpt.com/backend-api/codex'
/** Bound the explicit user-triggered proxy probe. */
export const OPENAI_CODEX_PROXY_TEST_TIMEOUT_MS = 10_000
/** Per-target timeout for the lightweight session connectivity monitor. */
export const OPENAI_CODEX_CONNECTIVITY_TIMEOUT_MS = 2_500

export const OPENAI_CODEX_CONNECTIVITY_TARGETS = [
  { id: 'codex-api', hostname: 'chatgpt.com', url: 'https://chatgpt.com/backend-api/codex' },
  { id: 'oauth', hostname: 'auth.openai.com', url: 'https://auth.openai.com/' },
  { id: 'openai-api', hostname: 'api.openai.com', url: 'https://api.openai.com/v1/models' },
] as const

const dispatcherScope = new AsyncLocalStorage<Dispatcher>()
const attachedControllers = new Map<OpenAICodexProxyController, number>()
let installedDispatcher: ScopedProxyDispatcher | undefined

/**
 * The process-global hook contains no proxy configuration. It only forwards
 * one async scope to the dispatcher owned by the plugin instance that opened
 * that scope; unrelated fetches always use the captured fallback.
 */
class ScopedProxyDispatcher extends Dispatcher {
  constructor(readonly fallback: Dispatcher) {
    super()
  }

  override dispatch(
    options: Dispatcher.DispatchOptions,
    handler: Dispatcher.DispatchHandler,
  ): boolean {
    return (dispatcherScope.getStore() ?? this.fallback).dispatch(options, handler)
  }
}

function attach(controller: OpenAICodexProxyController): void {
  attachedControllers.set(controller, (attachedControllers.get(controller) ?? 0) + 1)
  const current = getGlobalDispatcher()
  if (current === installedDispatcher) return
  installedDispatcher = new ScopedProxyDispatcher(current)
  setGlobalDispatcher(installedDispatcher)
}

function detach(controller: OpenAICodexProxyController): void {
  const count = attachedControllers.get(controller)
  if (count === undefined) return
  if (count > 1) attachedControllers.set(controller, count - 1)
  else attachedControllers.delete(controller)
  if (attachedControllers.size !== 0) return
  const current = getGlobalDispatcher()
  if (installedDispatcher !== undefined && current === installedDispatcher) {
    setGlobalDispatcher(installedDispatcher.fallback)
  }
  installedDispatcher = undefined
}

interface ProxyAgentState {
  readonly agent: ProxyAgent
  uses: number
  retired: boolean
  closing: boolean
  readonly closed: Promise<void>
  readonly resolveClosed: () => void
}

function proxyAgentState(proxyUrl: string): ProxyAgentState {
  let resolveClosed = (): void => undefined
  const closed = new Promise<void>(resolve => { resolveClosed = resolve })
  return {
    agent: new ProxyAgent(proxyUrl),
    uses: 0,
    retired: false,
    closing: false,
    closed,
    resolveClosed,
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
    ? typeof (value as { then?: unknown }).then === 'function'
    : false
}

/** Public read-only seam passed to every Codex network consumer. */
export interface OpenAICodexProxyRunner {
  /** Currently activated proxy URL, or undefined for direct transport. */
  readonly activeUrl: string | undefined
  /** Run one operation through this instance's current dispatcher. */
  run<T>(operation: () => T): T
}

/**
 * One proxy lifecycle per mounted Codex Connect plugin instance.
 * Reconfiguration swaps the agent synchronously for future requests. The
 * global bridge exists only while a proxied Codex operation is in flight, so
 * selecting another adapter leaves no persistent dispatcher registration.
 */
export class OpenAICodexProxyController implements OpenAICodexProxyRunner {
  private state: ProxyAgentState | undefined
  private readonly states = new Set<ProxyAgentState>()
  private url: string | undefined
  private closeTail = Promise.resolve()
  private disposed = false

  get activeUrl(): string | undefined {
    return this.url
  }

  /** Activate one tested URL or switch this instance back to direct transport. */
  configure(proxyUrl: string | undefined): void {
    if (this.disposed || proxyUrl === this.url) return
    const previous = this.state
    this.url = proxyUrl
    this.state = proxyUrl === undefined ? undefined : proxyAgentState(proxyUrl)
    if (this.state !== undefined) this.states.add(this.state)
    if (previous !== undefined) this.retire(previous)
  }

  run<T>(operation: () => T): T {
    const current = this.state
    if (current === undefined || this.disposed) return operation()
    current.uses += 1
    attach(this)
    const release = (): void => {
      detach(this)
      current.uses -= 1
      this.closeIfRetired(current)
    }
    let result: T
    try {
      result = dispatcherScope.run(current.agent, operation)
    } catch (error: unknown) {
      release()
      throw error
    }
    if (isPromiseLike(result)) {
      return Promise.resolve(result).finally(release) as T
    }
    release()
    return result
  }

  private retire(state: ProxyAgentState): void {
    state.retired = true
    this.closeIfRetired(state)
  }

  private closeIfRetired(state: ProxyAgentState): void {
    if (!state.retired || state.uses !== 0 || state.closing) return
    state.closing = true
    this.closeTail = this.closeTail
      .then(() => state.agent.close())
      .then(() => undefined, () => undefined)
      .finally(() => {
        this.states.delete(state)
        state.resolveClosed()
      })
  }

  /** Disable this instance, close its pools, and release the global bridge. */
  async dispose(): Promise<void> {
    if (this.disposed) return
    const states = [...this.states]
    this.url = undefined
    this.state = undefined
    this.disposed = true
    for (const state of states) this.retire(state)
    await Promise.all(states.map(state => state.closed))
    await this.closeTail
  }
}

/** Run directly when no plugin-instance proxy runner was injected. */
export function withOpenAICodexProxy<T>(
  proxy: OpenAICodexProxyRunner | undefined,
  operation: () => T,
): T {
  return proxy === undefined ? operation() : proxy.run(operation)
}

export interface OpenAICodexProxyTestResult {
  ok: boolean
  statusCode?: number
  error?: string
}

export interface OpenAICodexConnectivityTargetResult {
  id: string
  hostname: string
  reachable: boolean
  latencyMs: number
  statusCode?: number
  error?: string
}

export interface OpenAICodexConnectivityReport {
  checkedAt: number
  mode: 'direct' | 'proxy'
  targets: OpenAICodexConnectivityTargetResult[]
}

function safeConnectivityError(error: unknown): string {
  const record = typeof error === 'object' && error !== null ? error as { code?: unknown } : undefined
  const code = typeof record?.code === 'string' ? `${record.code}: ` : ''
  return `${code}${error instanceof Error ? error.message : String(error)}`
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/giu, '[redacted proxy]')
    .slice(0, 300)
}

/** Check the small set of first-party domains used by Codex Connect. */
export async function checkOpenAICodexConnectivity(
  proxy?: OpenAICodexProxyRunner,
  timeoutMs = OPENAI_CODEX_CONNECTIVITY_TIMEOUT_MS,
): Promise<OpenAICodexConnectivityReport> {
  const targets = await Promise.all(OPENAI_CODEX_CONNECTIVITY_TARGETS.map(async target => {
    const startedAt = performance.now()
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort(new Error(`connection timed out after ${String(timeoutMs)}ms`))
    }, timeoutMs)
    timer.unref()
    try {
      const response = await withOpenAICodexProxy(proxy, () => request(target.url, {
        method: 'HEAD',
        signal: controller.signal,
      }))
      await response.body.dump()
      return {
        id: target.id,
        hostname: target.hostname,
        reachable: true,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        statusCode: response.statusCode,
      }
    } catch (error: unknown) {
      return {
        id: target.id,
        hostname: target.hostname,
        reachable: false,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        error: safeConnectivityError(error),
      }
    } finally {
      clearTimeout(timer)
    }
  }))
  return {
    checkedAt: Date.now(),
    mode: proxy?.activeUrl === undefined ? 'direct' : 'proxy',
    targets,
  }
}

/**
 * Probe a draft address through a temporary agent. This never touches an
 * instance controller, the settings document, or the global dispatcher.
 */
export async function testOpenAICodexProxy(
  proxyUrl: string,
  timeoutMs = OPENAI_CODEX_PROXY_TEST_TIMEOUT_MS,
): Promise<OpenAICodexProxyTestResult> {
  const agent = new ProxyAgent(proxyUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error('proxy test timed out'))
  }, timeoutMs)
  timer.unref()
  try {
    const response = await request(OPENAI_CODEX_PROXY_TEST_URL, {
      method: 'HEAD',
      dispatcher: agent,
      signal: controller.signal,
    })
    // Undici treats destroy() before end-of-stream as an aborted request and
    // emits UND_ERR_ABORTED asynchronously. dump() installs the required
    // stream handlers and consumes the (normally empty) HEAD response safely.
    await response.body.dump()
    return { ok: true, statusCode: response.statusCode }
  } catch (error: unknown) {
    const message = (error instanceof Error ? error.message : String(error))
      .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/giu, '[redacted proxy]')
      .slice(0, 300)
    return { ok: false, error: message }
  } finally {
    clearTimeout(timer)
    await agent.close().catch(() => undefined)
  }
}
