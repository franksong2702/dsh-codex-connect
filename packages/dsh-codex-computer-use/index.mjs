/** Explicitly loaded experimental companion; importing Codex Connect does not enable this plugin. */
import Schema from '@deepseek-ai/schemastery'
import { createRequire } from 'node:module'
import { computerUseTool, PRESET } from './worker.mjs'

export const name = 'codex-computer-use'
export const inject = ['agents', 'tools', 'systemPrompt', 'agentPresets', 'computerUse']
export const Config = Schema.object({
  enabled: Schema.boolean().default(false),
  application: Schema.string().default(''),
  windowId: Schema.number().step(1).min(0).default(0),
  maxDurationMs: Schema.number().min(1000).max(180000).default(90000),
  maxSteps: Schema.number().step(1).min(1).max(60).default(30),
  maxOperations: Schema.number().step(1).min(1).max(120).default(60),
})

export async function apply(ctx, config) {
  if (!config.enabled) return
  if (process.platform !== 'darwin') throw new Error('Computer Use currently requires macOS')
  const require = createRequire(import.meta.url)
  const version = require('@deepseek-ai/dsh-agent/package.json').version
  if (!['0.2.2-alpha.2', '0.2.2-alpha.2.codex-cua-local.1', '0.2.2-alpha.2.codex-cua-local.2', '0.2.2-alpha.2.codex-cua-local.3', '0.2.2-alpha.2.codex-cua-local.4'].includes(version)) throw new Error('Computer Use requires an exact tested Host candidate')
  for (const name of ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-preset-registry', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-cua', '@deepseek-ai/dsh-cua-bundle', '@deepseek-ai/dsh-tool-executor-native', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-subagent']) {
    if (require(`${name}/package.json`).version !== version) throw new Error('Computer Use requires one coherent exact Host package set')
  }
  const nativeRequire = createRequire(require.resolve('@deepseek-ai/dsh-cua-bundle/package.json'))
  if (nativeRequire('@deepseek-ai/dsh-experimental-cua-macos/package.json').version !== version) throw new Error('Computer Use requires one coherent exact native backend')
  const releasePreset = await ctx.agentPresets.register({ id: PRESET, name: 'Bounded Terra Computer Use', plugins: [] })
  ctx.effect(() => releasePreset, 'codex-computer-use.preset')
  // Loader effects may register the sole official provider after this entry.
  // The worker checks its live identity before acquiring a lease or child and
  // throughout execution; this companion never creates a provider or grant.
  ctx.tools.register(computerUseTool(ctx, config))
}
