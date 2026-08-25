/** Request-scoped HTTP CONNECT proxying for OpenAI Codex provider traffic. */

import { AsyncLocalStorage } from 'node:async_hooks'
import { Dispatcher, ProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici'

const dispatcherScope = new AsyncLocalStorage<Dispatcher>()
const proxyAgents = new Map<string, ProxyAgent>()
let installedDispatcher: ScopedProxyDispatcher | undefined

/**
 * Keep the process-wide dispatcher neutral while selecting a ProxyAgent only
 * for async work created inside one Codex request.
 */
class ScopedProxyDispatcher extends Dispatcher {
  constructor(private readonly fallback: Dispatcher) {
    super()
  }

  override dispatch(
    options: Dispatcher.DispatchOptions,
    handler: Dispatcher.DispatchHandler,
  ): boolean {
    return (dispatcherScope.getStore() ?? this.fallback).dispatch(options, handler)
  }
}

function ensureScopedDispatcher(): void {
  const current = getGlobalDispatcher()
  if (current === installedDispatcher) return
  installedDispatcher = new ScopedProxyDispatcher(current)
  setGlobalDispatcher(installedDispatcher)
}

function agentFor(proxyUrl: string): ProxyAgent {
  let agent = proxyAgents.get(proxyUrl)
  if (agent !== undefined) return agent
  agent = new ProxyAgent(proxyUrl)
  proxyAgents.set(proxyUrl, agent)
  return agent
}

/**
 * Run one synchronous or asynchronous operation in a proxy dispatcher scope.
 * Async resources created by the operation retain the selected dispatcher.
 */
export function withOpenAICodexProxy<T>(
  proxyUrl: string | undefined,
  operation: () => T,
): T {
  if (proxyUrl === undefined) return operation()
  ensureScopedDispatcher()
  return dispatcherScope.run(agentFor(proxyUrl), operation)
}

/** Close pooled proxy connections owned by this plugin instance. */
export async function closeOpenAICodexProxyAgents(): Promise<void> {
  const agents = [...proxyAgents.values()]
  proxyAgents.clear()
  await Promise.allSettled(agents.map(agent => agent.close()))
}
