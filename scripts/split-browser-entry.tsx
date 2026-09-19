/** Private browser acceptance bundle. Not an application/plugin export. */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Context } from '@deepseek-ai/cordis'
import type * as Connection from '@deepseek-ai/dsh-client-connection/client'
import { SplitApprovalRemoteStore } from '../src/client/split-approval-remote.ts'
import { SplitApprovalRemoteCard } from '../src/client/SplitApprovalRemoteCard.tsx'
import type { SplitApprovalTarget } from '../src/split-transport-contract.ts'
declare global {
  interface Window { __splitTarget: SplitApprovalTarget; __splitBrowser: { reconnect(): void } }
}
let connectionPlugin: typeof Connection | undefined
// Published client bundles use the host module-loader contract, not ESM exports.
Object.assign(window, { __ModuleLoader__: { load(entry: { id: string; factory(require: (id: string) => never): typeof Connection }) {
  if (entry.id !== '@deepseek-ai/dsh-client-connection' || connectionPlugin) throw new Error('Unexpected fixture module')
  connectionPlugin = entry.factory(() => { throw new Error('Unexpected fixture dependency') })
} } })
await new Promise<void>((resolve, reject) => {
  const script = document.createElement('script'); script.src = '/fixture/connection.js'
  script.onload = () => resolve(); script.onerror = () => reject(new Error('Connection bundle unavailable'))
  document.head.append(script)
})
if (!connectionPlugin) throw new Error('Connection plugin not loaded')
const ctx = new Context()
await ctx.plugin(connectionPlugin)
const connection: Connection.ConnectionHandle | undefined = ctx.get('connection')
if (!connection) throw new Error('Client connection not provided')
// Actual Connection controller; the fixture supplies generation readiness instead of a full Gateway.
connection.registerGenerationSource(async (signal, ready) => {
  ready({ home: '' })
  await new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', () => resolve(), { once: true }) })
})
const loop = connection.start({})
const store = new SplitApprovalRemoteStore(connection.generation, window.__splitTarget)
const root = createRoot(document.getElementById('root')!)
root.render(createElement(SplitApprovalRemoteCard, { store, locale: 'en' }))
window.__splitBrowser = { reconnect: () => connection.reconnect() }
window.addEventListener('pagehide', () => { store.dispose(); loop.stop(); root.unmount(); void ctx.fiber.dispose() }, { once: true })
