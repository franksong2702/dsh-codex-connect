/** Real published question/selector components over a test-only Playwright bridge.
 * The bridge is NOT the DSH Gateway and is never included in the plugin package.
 */
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as JSXRuntime from 'react/jsx-runtime'
import * as Cordis from '@deepseek-ai/cordis'
import * as Stores from '@deepseek-ai/dsh-client-store'
import * as Primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { OpenAICodexConfiguration } from '../src/client/OpenAICodexConfiguration.tsx'
import { en } from '../src/client/locales.ts'

const modules = new Map(Object.entries({ react: React, 'react/jsx-runtime': JSXRuntime,
  'react-dom': ReactDOM, 'react-dom/client': ReactDOMClient, '@deepseek-ai/cordis': Cordis,
  '@deepseek-ai/dsh-client-store': Stores, '@deepseek-ai/dsh-client-ui-primitives': Primitives }))
window.__ModuleLoader__ = { load(entry) {
  if (modules.has(entry.id)) throw new Error('Duplicate native component')
  modules.set(entry.id, entry.factory(id => {
    if (!modules.has(id)) throw new Error(`Unresolved native client dependency: ${id}`)
    return modules.get(id)
  }))
} }
for (const name of ['questions', 'selection']) await new Promise((resolve, reject) => {
  const script = document.createElement('script'); script.src = `/fixture/${name}.js`
  script.onload = resolve; script.onerror = reject; document.head.append(script)
})
let current = await window.__thinkCommand('state')
let root = ReactDOMClient.createRoot(document.getElementById('root'))
let pending, questionAbort, activeKey, questionComponent, questionStore, questionHandler, modelComponent, modelFace
const dictionaries = {}
const translate = namespace => (key, params = {}) => Object.entries(params).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)),
  dictionaries[namespace]?.[key] ?? ({ submit: 'Submit', submitting: 'Submitting', copy: 'Copy', copied: 'Copied' }[key]) ?? key)
const locale = { register(namespace, values) { dictionaries[namespace] = values.en; return () => {} }, bind: translate }
const questionContext = {
  effect: fn => fn(), locale,
  sessions: { scopeOf: () => 'think-browser' },
  uiSession: { registerPendingInteraction: () => value => { pending = value; draw(); return () => { if (pending === value) { pending = undefined; draw() } } } },
  slots: { inject: (_name, fn) => fn(), register(entry, component) { questionComponent = component; questionStore = entry.store.create('think-browser') } },
  remote: { $on(name, handler) { if (name !== 'user-questions/request') throw new Error('Unexpected native question event'); questionHandler = handler } },
}
modules.get('@deepseek-ai/dsh-client-ui-user-questions').apply(questionContext)
const projected = Stores.createSnapshotStore({ lastUsed: current.recorded, next: current.recorded })
const catalogValue = { default: current.recorded, routableProviders: ['openai-codex'], failures: [],
  groups: [{ id: 'openai-codex', name: 'Codex', models: [{ id: 'gpt-6-astra', name: 'GPT-6 Astra',
    reasoning: { efforts: ['low', 'medium', 'high'].map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) })) } }] }] }
const catalog = { store: Stores.createSnapshotStore({ status: 'ready', value: catalogValue, error: null }), load: async () => catalogValue }
const modelRuntime = modules.get('@deepseek-ai/dsh-client-ui-model-selection')
const directory = new modelRuntime.ModelDirectory({ selectModel() { throw new Error('Manual model RPC is outside this fixture') } },
  'think-browser', () => true, catalog, projected)
const modelContext = {
  effect: fn => fn(), locale, plugin: () => {},
  modelDirectories: { directoryFor: () => directory }, sessions: { subagentAddress: () => undefined },
  slots: { inject: (_name, fn) => fn(), register(entry, component) { modelComponent = component; modelFace = entry.inject('think-browser') } },
  inject(names, callback) { if (names.includes('slots')) callback(modelContext) },
}
modelRuntime.apply(modelContext); await directory.load()
const listeners = new Set()
let snapshot
const settings = { getSnapshot: () => snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  async mutate(ops, revision) {
    if (revision !== current.revision || ops.length !== 1 || ops[0].op !== 'set'
      || ops[0].path.join('.') !== 'enableReasoningUpdates' || typeof ops[0].value !== 'boolean') throw new Error('Unexpected fixture setting mutation')
    refresh(await window.__thinkCommand('settings', ops[0].value))
  }, set() { throw new Error('Use atomic settings mutation') }, unset() { throw new Error('Unsupported fixture mutation') } }
function useQuestionStore(select) {
  return select(React.useSyncExternalStore(fn => questionStore.subscribe(fn), () => questionStore.getSnapshot()))
}
function App() {
  return React.createElement('main', { style: { maxWidth: 860, margin: '0 auto', padding: 16 } },
    React.createElement('h1', null, 'Think synthetic acceptance'),
    React.createElement('p', null, 'Actual product and native controls; synthetic responses; test-only transport, not the DSH Gateway.'),
    React.createElement('div', { 'aria-label': 'Recorded request effort' }, React.createElement(modelComponent, { ...modelFace, locked: false, t: translate('model') })),
    React.createElement('p', { role: 'status', 'aria-label': 'Fixture phase' }, current.phase),
    React.createElement('button', { disabled: !current.enabled || !!current.question || current.phase === 'decision-returned', onClick: () => { void action('propose', 'high') } }, 'Propose high'),
    React.createElement('button', { disabled: !current.enabled || !!current.question || current.phase === 'decision-returned', onClick: () => { void action('propose', 'medium') } }, 'Propose medium'),
    React.createElement('button', { disabled: !!current.question, onClick: () => { void action('continue') } }, 'Continue fixture'),
    pending ? React.createElement(questionComponent, { matched: pending, t: translate('question'), useStore: useQuestionStore, actions: questionStore.actions }) : null,
    React.createElement(OpenAICodexConfiguration, { scope: settings, t: key => en[key], activeModule: 'capabilities' }))
}
function draw() { if (snapshot && modelComponent) root.render(React.createElement(App)) }
function refresh(value) {
  current = value
  snapshot = { status: 'ready', value: value.settings, base: value.settings, user: undefined, revision: value.revision, writable: true, mode: 'host' }
  projected.set({ lastUsed: value.recorded, next: value.recorded })
  for (const listener of listeners) listener()
  if (activeKey !== value.question?.key) {
    const previousAbort = questionAbort
    activeKey = value.question?.key
    previousAbort?.abort(new Error('Host question lifetime ended'))
    if (value.question) {
      const key = value.question.key
      questionAbort = new AbortController()
      void questionHandler.call({}, { questions: value.question.questions, signal: questionAbort.signal }, () => Promise.reject(new Error('No fixture fallback')))
        .then(answer => activeKey === key ? action('answer', { key, answer }) : undefined,
          () => activeKey === key ? action('cancel') : undefined)
    }
  }
  draw()
}
async function action(name, value) {
  try { refresh(await window.__thinkCommand(name, value)) }
  catch (error) { document.getElementById('errors').textContent = String(error); throw error }
}
refresh(current)
window.__thinkControls = { state: () => current, remount() { root.unmount(); root = ReactDOMClient.createRoot(document.getElementById('root')); draw() },
  dispose() { activeKey = undefined; questionAbort?.abort(); root.unmount(); directory.dispose() } }
