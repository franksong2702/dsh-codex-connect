/** Real plugin entry and single official provider; no native channel or model runs. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Llm from '@deepseek-ai/dsh-llm'
import Sessions from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import Presets from '@deepseek-ai/dsh-agent-preset-registry'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import ComputerUse from '@deepseek-ai/dsh-computer-use'
import { CuaConfig, installCua } from '@deepseek-ai/dsh-cua'
import * as Companion from '../index.mjs'
import { PRESET, TOOL } from '../worker.mjs'

for (const order of ['provider-first', 'companion-first']) test(`actual companion entry mounts ${order} with one official provider and no native start`, { skip: process.platform !== 'darwin' }, async () => {
  const ctx = new Context()
  let nativeStarts = 0
  try {
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    for (const service of [Llm, Sessions, Projection, AgentRegistry, Prompt, Tools, ComputerUse]) await ctx.plugin(service)
    await ctx.plugin(Presets, { default: PRESET })
    const companion = () => ctx.plugin(Companion, { enabled: true, application: 'Synthetic Browser', windowId: 7, maxDurationMs: 1000, maxSteps: 3, maxOperations: 3 })
    if (order === 'companion-first') {
      assert.equal(ctx.computerUse.providerName, undefined)
      await companion()
      assert.ok(ctx.tools.get(TOOL), 'entry must tolerate provider effects registering later')
      assert.equal(ctx.computerUse.providerName, undefined, 'companion must not reserve a provider slot')
    }
    await ctx.plugin({ inject: ['computerUse', 'agents', 'tools', 'systemPrompt'], apply(providerCtx) {
      installCua(providerCtx, CuaConfig({ agentPreset: PRESET, strictWindowScope: true }), {
        helperPath: '/synthetic/never-executable', guidance: 'Synthetic installation check', description: 'Official provider fixture',
        createChannel() { nativeStarts++; throw new Error('installation must not start native transport') },
      })
    } })
    assert.equal(ctx.computerUse.providerName, 'dsh-cua')
    if (order === 'provider-first') await companion()
    assert.ok(ctx.tools.get(TOOL), 'packed entry must register the generic tool')
    assert.equal(ctx.computerUse.providerName, 'dsh-cua')
    assert.equal(nativeStarts, 0)
  } finally { await ctx.fiber.dispose() }
})
