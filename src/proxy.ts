/**
 * HTTP/HTTPS proxy support for OpenAI Codex requests.
 *
 * Node.js 24's fetch is based on undici and does NOT read HTTP_PROXY /
 * HTTPS_PROXY environment variables.  The correct way to proxy fetch calls
 * is to install undici's ProxyAgent via setGlobalDispatcher.
 * @module dsh-codex-connect/proxy
 */

import { ProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type { Agent } from 'http'

export interface ProxyConfig {
  host: string
  port: number
}

/** Reference counter so nested enable/disable pairs work correctly. */
let activeProxyCount = 0
let currentDispatcher: ReturnType<typeof getGlobalDispatcher> | undefined

/**
 * Enable the global undici proxy dispatcher for all subsequent fetch calls.
 * Safe to call multiple times — a matching disableGlobalProxy() is required
 * for each call.
 */
export function enableGlobalProxy(config: ProxyConfig): void {
  activeProxyCount++
  if (activeProxyCount === 1) {
    currentDispatcher = getGlobalDispatcher()
    const proxyUrl = `http://${config.host}:${config.port}`
    setGlobalDispatcher(new ProxyAgent(proxyUrl))
  }
}

/**
 * Restore the original global dispatcher after a proxied section.
 * Must be called in a finally block to guarantee cleanup.
 */
export function disableGlobalProxy(): void {
  if (activeProxyCount <= 0) return
  activeProxyCount--
  if (activeProxyCount === 0 && currentDispatcher !== undefined) {
    setGlobalDispatcher(currentDispatcher)
    currentDispatcher = undefined
  }
}

/**
 * Create a proxy agent for node:http/https module requests.
 * Used by public-http.ts for image fetching (not for fetch calls).
 */
export function createProxyAgent(config: ProxyConfig, protocol: 'http' | 'https' = 'https'): Agent {
  const proxyUrl = `http://${config.host}:${config.port}`
  if (protocol === 'https') return new HttpsProxyAgent(proxyUrl)
  return new HttpProxyAgent(proxyUrl)
}

/**
 * Get proxy configuration from environment variables or config.
 * @param config - optional proxy configuration
 * @returns proxy configuration if available
 */
export function resolveProxyConfig(config?: ProxyConfig): ProxyConfig | undefined {
  if (config?.host && config.port) {
    return config
  }

  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy

  const proxyUrl = httpsProxy || httpProxy
  if (proxyUrl) {
    try {
      const url = new URL(proxyUrl)
      return {
        host: url.hostname,
        port: parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80),
      }
    } catch {
      // Invalid proxy URL, ignore
    }
  }

  return undefined
}
