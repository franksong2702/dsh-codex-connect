/** Private browser acceptance bundle for the real DSH conversation composition. */
import { Context } from '@deepseek-ai/cordis'
import * as Cordis from '@deepseek-ai/cordis'
import * as ClientStore from '@deepseek-ai/dsh-client-store'
import * as Slots from '@deepseek-ai/dsh-client-ui-slots'
import * as Primitives from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as JSXRuntime from 'react/jsx-runtime'
import { apply as applySplitConversation } from '../src/client/split-conversation.tsx'

declare global {
  interface Window {
    __splitBundleNames?: readonly string[]
    __splitPluginIds?: readonly string[]
    __splitConversationBrowser?: { dispose(): void; reconnect(): void }
    __ModuleLoader__?: { load(entry: { id: string; factory(require: (id: string) => unknown): unknown }): void }
  }
}

type Plugin = { apply(ctx: Context): void | Promise<void>; inject?: readonly string[] }
const entries = new Map<string, { factory(require: (id: string) => unknown): unknown }>()
const modules = new Map<string, unknown>()
const loading = new Set<string>()

function requireModule(id: string): unknown {
  if (id.endsWith('/client') && entries.has(id.slice(0, -7))) return requireModule(id.slice(0, -7))
  const cached = modules.get(id)
  if (cached !== undefined) return cached
  const entry = entries.get(id)
  if (entry === undefined) throw new Error(`Missing DSH client bundle '${id}'`)
  if (loading.has(id)) throw new Error(`Cyclic DSH client bundle '${id}'`)
  loading.add(id)
  const value = entry.factory(requireModule)
  loading.delete(id)
  modules.set(id, value)
  return value
}

const loader = {
  load(entry: { id: string; factory(require: (id: string) => unknown): unknown }): void {
    if (entries.has(entry.id)) throw new Error(`Duplicate DSH client bundle '${entry.id}'`)
    entries.set(entry.id, entry)
  },
}
// Published DSH UI bundles externalize React. Seed one shared instance before
// instantiating any loader entry so all slots and the private card use one hook
// dispatcher.
modules.set('react', React)
modules.set('@deepseek-ai/cordis', Cordis)
modules.set('@deepseek-ai/dsh-client-store', ClientStore)
modules.set('@deepseek-ai/dsh-client-ui-slots', Slots)
modules.set('@deepseek-ai/dsh-client-ui-primitives', Primitives)
modules.set('react-dom', ReactDOM)
modules.set('react-dom/client', ReactDOMClient)
modules.set('react/jsx-runtime', JSXRuntime)
window.__ModuleLoader__ = loader

async function loadBundle(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `/fixture/${name}`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`DSH client bundle unavailable: ${name}`))
    document.head.append(script)
  })
}

const names = window.__splitBundleNames
if (!names || names.length === 0) throw new Error('Missing real DSH client bundle manifest')
for (const name of names) await loadBundle(name)

const ids = [
  '@deepseek-ai/dsh-typert-registry',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-api-gateway',
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-session',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-settings-models',
  '@deepseek-ai/dsh-client-ui-settings-plugins',
  '@deepseek-ai/dsh-client-ui-model-selection',
  '@deepseek-ai/dsh-client-ui-workspace',
]
const plugins = (window.__splitPluginIds ?? ids).map(id => requireModule(id) as Plugin)
const ctx = new Context()
for (const plugin of plugins) await ctx.plugin(plugin)
await ctx.plugin({ name: 'split-conversation-client', inject: ['connection', 'slots', 'sessions'], apply: applySplitConversation })
const renderer = ctx.get('uiRenderer') as { mount(container: HTMLElement): () => void } | undefined
if (!renderer) throw new Error('Real DSH UI renderer unavailable')
const unmount = renderer.mount(document.getElementById('root')!)
window.__splitConversationBrowser = { dispose: () => { unmount(); void ctx.fiber.dispose() }, reconnect: () => (ctx.get('connection') as ConnectionHandle).reconnect() }
window.addEventListener('pagehide', () => { window.__splitConversationBrowser?.dispose() }, { once: true })
