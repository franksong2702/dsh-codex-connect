import { expect, it } from 'vitest'
import { createThinkControlsHost } from '../scripts/think-controls-host.ts'

it('bounds the browser fixture commands and rejects an answer for another native question', async () => {
  const originalFetch = globalThis.fetch
  const originalHome = process.env.DSH_HOME
  const fixture = await createThinkControlsHost()
  try {
    await expect(fixture.command('shell')).rejects.toThrow(/Unknown/)
    await expect(fixture.command('settings', { enableReasoningUpdates: true })).rejects.toThrow(/Only/)
    await fixture.command('settings', true)
    const waiting = await fixture.command('propose', 'high')
    expect(waiting.question).not.toBeNull()
    expect(waiting.recorded.reasoningEffort).toBe('low')
    await expect(fixture.command('answer', { key: -1, answer: {} })).rejects.toThrow(/Stale/)
    const approved = await fixture.command('answer', { key: waiting.question!.key,
      answer: { answers: [{ id: 'astra-reasoning-effort', selected: ['Change to high'] }] } })
    expect(approved.recorded.reasoningEffort).toBe('low')
    const applied = await fixture.command('continue')
    expect(applied.recorded.reasoningEffort).toBe('high')
    expect(applied.updates).toBe(1)
    expect(applied.unexpectedFetches).toBe(0)
    expect(applied.defaultWrites).toBe(0)
  } finally { await fixture.dispose() }
  expect(globalThis.fetch).toBe(originalFetch)
  expect(process.env.DSH_HOME).toBe(originalHome)
})
