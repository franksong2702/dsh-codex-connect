import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, resolveConfig } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader, { type Entry, type EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import SettingsForms from '@deepseek-ai/dsh-settings'

type ConfigEditorFixture = {
  readonly context: Context
  failNext: boolean
  entries(): Entry[]
  configuration(): { entry: Entry; inherited: Record<string, unknown>; override: Record<string, unknown> }[]
  edit(entry: Entry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>): Promise<void>
}

class MemoryConfigEditor implements ConfigEditorFixture {
  failNext = false

  constructor(readonly context: Context) {}

  entries(): Entry[] {
    return [...this.context.loader.entries()].filter(entry => entry.parent.tree.ctx.fiber.entry?.id === 'include')
  }

  configuration(): { entry: Entry; inherited: Record<string, unknown>; override: Record<string, unknown> }[] {
    return this.entries().map(entry => ({
      entry,
      inherited: {},
      override: structuredClone(entry.options.config ?? {}),
    }))
  }

  async edit(entry: Entry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
    if (this.failNext) {
      this.failNext = false
      throw new Error('fixture persistence failure')
    }
    const next = change(structuredClone(entry.options.config ?? {}), {})
    const fiber = entry.fiber
    if (fiber?.runtime == null) throw new Error('fixture plugin fiber is unavailable')
    const resolved = fiber.ctx.waterfall(fiber, 'internal/config', next, () => next)
    resolveConfig(fiber.runtime, resolved as Record<string, unknown>)
    await entry.update({ config: next })
  }
}

/** Mount a plugin through the real Loader so DSH volatile settings use their supported lifecycle. */
export async function loadSettingsPlugin(
  context: Context,
  root: string,
  pluginName: string,
  plugin: unknown,
  config: object,
): Promise<{ entry: Entry; editor: ConfigEditorFixture }> {
  await context.plugin(Loader)
  context.baseUrl = pathToFileURL(root).href + '/'
  context.loader.builtins.include = Include
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier !== pluginName) throw new Error(`unexpected Loader import: ${specifier}`)
      return plugin
    },
  } as unknown as NonNullable<typeof context.loader.internal>

  const profile = {
    name: 'settings-fixture',
    dir: root,
    patchPath: join(root, 'profile.yml'),
    installAnchor: root,
    cwd: root,
    home: root,
    startedBundles: [],
    overlays: [],
    telemetryDisabledEnv: undefined,
  }
  const editor = new MemoryConfigEditor(context)
  const provide = context.provide as unknown as (name: string, value: unknown) => void
  provide('profileContext', profile)
  provide('configEditor', editor)
  await context.plugin(SettingsForms)

  const configPath = join(root, 'cordis.json')
  await writeFile(configPath, JSON.stringify([{ id: 'llm-openai-codex', name: pluginName, config }]))
  await context.loader.root.create({
    id: 'include',
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  } as unknown as Omit<EntryOptions, 'id'>)
  await context.loader.await()
  const entry = editor.entries().find(candidate => candidate.options.name === pluginName)
  if (entry === undefined) throw new Error(`settings fixture could not load ${pluginName}`)
  if (entry.fiber !== undefined) await entry.fiber.await()
  return { entry, editor }
}
