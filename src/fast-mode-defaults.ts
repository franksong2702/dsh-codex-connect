/** Seed profile Fast Mode defaults only when a new DSH session starts. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import { FastModeRegistry, isFastModeSessionId } from './fast-mode.ts'
import type { OpenAICodexSettingsConfig } from './settings-contract.ts'

type FastModeDefaults = Pick<OpenAICodexSettingsConfig, 'enableNewSessionFastMode' | 'enableNewSubagentFastMode'>

/**
 * Snapshot the current profile choice for each newly started session. A
 * resumed session or a later profile edit must not change that session's
 * explicit Composer choice. Subagent sessions have an independent default.
 */
export function registerOpenAICodexFastModeDefaults(
  ctx: Context,
  fastMode: FastModeRegistry,
  settings: () => FastModeDefaults,
): void {
  const started = new WeakSet<Session>()
  ctx.on('agent/created', ({ agent, source }): undefined => {
    if (source !== 'startup' || started.has(agent.session)) return undefined
    const session = agent.session
    started.add(session)
    if (!isFastModeSessionId(session.id)) return undefined
    const defaults = settings()
    const enabled = session.header.origin === 'subagent'
      ? defaults.enableNewSubagentFastMode
      : defaults.enableNewSessionFastMode
    if (enabled) fastMode.set(session.id, true)
    return undefined
  }, { global: true })
}
