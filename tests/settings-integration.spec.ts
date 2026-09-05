import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as PiAiRuntime from '@deepseek-ai/dsh-llm-pi-ai'
import SettingsProvider from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as OpenAICodex from '../src/index.ts'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  private storedDocument: Record<string, unknown> = {}

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.storedDocument))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.storedDocument[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

let context: Context | undefined
let root: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  vi.unstubAllEnvs()
})

describe('OpenAI Codex Host settings integration', () => {
  it('exposes OpenAI Codex, applies optional capabilities, and owns the search route while enabled', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-connect-settings-'))
    vi.stubEnv('DSH_HOME', root)
    const workspace = join(root, 'workspace')
    const ctx = new Context()
    context = ctx
    await ctx.plugin(LlmRuntime)
    const piAi = await ctx.plugin(PiAiRuntime, {})
    await ctx.plugin(WebRuntime, { searchProvider: 'deepseek-official' })
    ctx.web.registerSearchProvider({
      id: 'deepseek-official',
      available: () => true,
      search: () => Promise.resolve({ content: 'DeepSeek search', sources: [], truncated: false }),
    })
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'native' })
    await ctx.plugin(LocalFileSystem, { cwd: workspace })
    await ctx.plugin(LocalAttachmentStore, { dshHome: root })
    await ctx.plugin(MemorySettings)
    const plugin = await ctx.plugin(OpenAICodex, { oauthTimeoutMs: 120_000 })

    expect(ctx.llm.listConfigurableProviders()).toContainEqual({
      provider: 'openai-codex',
      displayName: 'openai-codex',
      settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'openai-codex'],
      declared: false,
    })
    const descriptor = ctx.settings.describe().find(entry => entry.ns === OpenAICodex.OPENAI_CODEX_SETTINGS_NS)
    expect(descriptor?.value).toEqual({ ...OpenAICodex.DEFAULT_OPENAI_CODEX_SETTINGS, oauthTimeoutMs: 120_000 })
    const fullCatalog = await ctx.llm.listModels(OpenAICodex.OPENAI_CODEX_PROVIDER)
    expect(fullCatalog.length).toBeGreaterThan(2)
    expect(ctx.tools.get(OpenAICodex.VIEW_IMAGE_TOOL_NAME)).toBeUndefined()
    expect(ctx.tools.get(OpenAICodex.IMAGE_GENERATE_TOOL_NAME)).toBeUndefined()
    const approvalAgent = { id: 'settings-approval-fixture' } as unknown as Agent
    await expect(ctx.waterfall('approval/request', {
      agent: approvalAgent,
      toolName: 'fixture',
    }, async () => 'allowed-once')).resolves.toBe('allowed-once')
    await expect(ctx.web.search({ query: 'disabled' })).resolves.toMatchObject({ content: 'DeepSeek search' })

    await ctx.settings.update(OpenAICodex.OPENAI_CODEX_SETTINGS_NS, {
      models: [fullCatalog[1]!.id, fullCatalog[0]!.id, fullCatalog[1]!.id],
      enableSearch: true,
      enableImageTool: true,
      enableImageGeneration: true,
      searchModel: 'gpt-search-settings-test',
      searchMode: 'live',
      searchContextSize: 'high',
      searchMaxOutputTokens: 2048,
    })
    await vi.waitFor(() => {
      expect(ctx.tools.get(OpenAICodex.VIEW_IMAGE_TOOL_NAME)).toBeDefined()
      expect(ctx.tools.get(OpenAICodex.IMAGE_GENERATE_TOOL_NAME)).toBeDefined()
    })
    await vi.waitFor(async () => {
      await expect(ctx.web.search({ query: 'enabled' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
    })
    await expect(ctx.llm.listModels(OpenAICodex.OPENAI_CODEX_PROVIDER)).resolves.toEqual([
      fullCatalog[0],
      fullCatalog[1],
    ])
    await expect(ctx.llm.resolveModelInfo(OpenAICodex.OPENAI_CODEX_PROVIDER, fullCatalog[2]!.id)).resolves.toMatchObject({
      id: fullCatalog[2]!.id,
    })

    await ctx.settings.update(OpenAICodex.OPENAI_CODEX_SETTINGS_NS, {
      enableSearch: false,
      enableImageTool: false,
      enableImageGeneration: false,
    })
    await vi.waitFor(() => {
      expect(ctx.tools.get(OpenAICodex.VIEW_IMAGE_TOOL_NAME)).toBeUndefined()
      expect(ctx.tools.get(OpenAICodex.IMAGE_GENERATE_TOOL_NAME)).toBeUndefined()
    })
    await expect(ctx.web.search({ query: 'disabled again' })).resolves.toMatchObject({ content: 'DeepSeek search' })
    expect(ctx.settings.describe().find(entry => entry.ns === OpenAICodex.OPENAI_CODEX_SETTINGS_NS)?.value)
      .toMatchObject({ oauthTimeoutMs: 120_000 })

    await plugin.dispose()
    expect(ctx.llm.listConfigurableProviders()).toContainEqual({
      provider: 'openai-codex',
      displayName: 'openai-codex',
      settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'openai-codex'],
      declared: false,
    })
    await piAi.dispose()
    expect(ctx.llm.listConfigurableProviders()).toEqual([])
  })
})
