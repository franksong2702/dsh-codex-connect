// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import * as cordis from '@deepseek-ai/cordis'
import * as stores from '@deepseek-ai/dsh-client-store'
import type { ModelDirectory, ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(cleanup)

it('renders the effective recorded level in the installed DSH Composer and after remount', async () => {
  // Load the public built client entry through its normal ModuleLoader factory; no copied selector code.
  let runtime: typeof import('@deepseek-ai/dsh-client-ui-model-selection/client') | undefined
  const modules: Record<string, unknown> = {
    '@deepseek-ai/cordis': cordis,
    '@deepseek-ai/dsh-client-store': stores,
    '@deepseek-ai/dsh-client-ui-primitives': Object.fromEntries(['IconCheckOutline16', 'IconChevronDownOutline14', 'IconChevronRightOutline14', 'IconWarningOutline16', 'Toast'].map(name => [name, () => null])),
    react: React,
    'react/jsx-runtime': jsx,
  }
  runInNewContext(readFileSync(new URL(import.meta.resolve('@deepseek-ai/dsh-client-ui-model-selection/client')), 'utf8'), {
    window: { __ModuleLoader__: { load(entry: { factory: (require: (id: string) => unknown) => typeof runtime }) {
      runtime = entry.factory(id => {
        if (!(id in modules)) throw new Error(`Unexpected client dependency: ${id}`)
        return modules[id]
      })
    } } },
  })
  const low = { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: 'low' }
  const projection = stores.createSnapshotStore({ lastUsed: low, next: low })
  const catalogValue = {
    default: low, routableProviders: ['openai-codex'], failures: [],
    groups: [{ id: 'openai-codex', name: 'Codex', models: [{ id: 'gpt-6-astra', name: 'GPT-6 Astra', reasoning: { efforts: [
      { id: 'low', name: 'Low' }, { id: 'high', name: 'High' }, { id: 'medium', name: 'Medium' },
    ] } }] }],
  } as ModelCatalog
  const catalog = { store: stores.createSnapshotStore({ status: 'ready', value: catalogValue, error: null }), load: async () => catalogValue }
  const selectModel = vi.fn()
  const directory = new runtime!.ModelDirectory({ selectModel }, 'fixture' as never, () => true,
    catalog as unknown as ConstructorParameters<typeof ModelDirectory>[3], projection)
  let Component: React.ComponentType<ModelSelectInjected & { locked: boolean; t: (key: string, params?: Record<string, unknown>) => string }> | undefined
  let face: ModelSelectInjected | undefined
  const dictionaries: Record<string, string> = {}
  const t = (key: string, params: Record<string, unknown> = {}) => Object.entries(params).reduce((value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)), dictionaries[key] ?? key)
  const context = {
    effect: (effect: () => unknown) => effect(),
    locale: { register: (_name: string, values: { en: Record<string, string> }) => Object.assign(dictionaries, values.en), bind: () => t },
    plugin: () => undefined,
    modelDirectories: { directoryFor: () => directory },
    sessions: { subagentAddress: () => undefined },
    slots: {
      inject: (_key: string, callback: () => unknown) => callback(),
      register: (entry: { inject: (id: string) => ModelSelectInjected }, component: typeof Component) => {
        Component = component
        face = entry.inject('fixture')
      },
    },
    inject: (names: string[], callback: (ctx: unknown) => void) => { if (names.includes('slots')) callback(context) },
  }
  runtime!.apply(context as unknown as cordis.Context)
  await directory.load()
  expect(Component).toBeDefined()
  const draw = () => React.createElement(Component!, { ...face!, locked: false, t })
  const view = render(draw())
  expect(screen.getByRole('button', { name: /GPT-6 Astra.*Low/ })).toBeDefined()
  for (const [reasoningEffort, label] of [['high', 'High'], ['medium', 'Medium']] as const) {
    act(() => {
      const selected = { ...low, reasoningEffort }
      projection.set({ lastUsed: selected, next: selected })
    })
    expect(screen.getByRole('button', { name: new RegExp(`GPT-6 Astra.*${label}`) })).toBeDefined()
    expect(screen.queryByRole('button', { name: /GPT-6 Astra.*Low/ })).toBeNull()
  }
  view.unmount()
  render(draw())
  expect(screen.getByRole('button', { name: /GPT-6 Astra.*Medium/ })).toBeDefined()
  expect(selectModel).not.toHaveBeenCalled()
  directory.dispose()
})
