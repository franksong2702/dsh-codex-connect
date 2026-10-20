/** Snapshot explicit startup speed preferences while preserving legacy Fast defaults. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import { FastModeRegistry, isFastModeSessionId } from './fast-mode.ts'
import { ConversationSpeedRegistry } from './conversation-speed.ts'
import type { OpenAICodexSettingsConfig } from './settings-contract.ts'

type FastModeDefaults = Pick<OpenAICodexSettingsConfig, 'enableNewSessionFastMode' | 'enableNewSubagentFastMode'>
  & Partial<Pick<OpenAICodexSettingsConfig, 'newSessionSpeedMode' | 'newSubagentSpeedMode'>>

/**
 * Snapshot the current profile choice for each newly started session. A
 * resumed session or a later profile edit must not change that session's
 * explicit Composer choice. Subagent sessions have an independent default.
 */
export function registerOpenAICodexFastModeDefaults(
  ctx: Context,
  fastMode: FastModeRegistry,
  settings: () => FastModeDefaults,
  resolveAccountKey?: () => Promise<string | undefined>,
): void {
  const started = new WeakSet<Session>()
  if (fastMode instanceof ConversationSpeedRegistry) {
    ctx.on('agent/request', async ({ agent, signal }, next) => {
      const route = await next()
      signal.throwIfAborted()
      fastMode.applyStartupDefault(agent.session.id, route)
      return route
    }, { global: true })
  }
  ctx.on('agent/created', async ({ agent, source, signal }): Promise<undefined> => {
    if (source !== 'startup' || started.has(agent.session)) return undefined
    const session = agent.session
    started.add(session)
    if (!isFastModeSessionId(session.id)) return undefined
    const defaults = settings()
    const child = session.header.origin === 'subagent'
    const mode = (child ? defaults.newSubagentSpeedMode : defaults.newSessionSpeedMode)
      ?? ((child ? defaults.enableNewSubagentFastMode : defaults.enableNewSessionFastMode) ? 'fast' : undefined)
    if (mode === 'ultrafast') {
      if (!(fastMode instanceof ConversationSpeedRegistry) || resolveAccountKey === undefined) throw new Error('ULTRAFAST_DEFAULT_UNAVAILABLE')
      await fastMode.seedUltrafastDefault(session.id, resolveAccountKey, signal)
    } else if (mode !== undefined) fastMode.set(session.id, mode === 'fast')
    return undefined
  }, { global: true })
}
