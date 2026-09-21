import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import * as plugin from '../src/index.ts'
import { runThinkRememberPhase } from '../scripts/think-remember-lifecycle-fixture.mjs'
const require = createRequire(import.meta.url)
const importHost = (specifier: string) => import(pathToFileURL(require.resolve(specifier)).href)

it.each(['native', 'fallback'] as const)('preserves admitted Think state through real DSH compaction and JSONL restore (%s)', async mode => {
  const root = await mkdtemp(join(tmpdir(), 'think-remember-'))
  try {
    for (const phase of ['write', 'resume', 'verify'] as const) {
      const report = await runThinkRememberPhase(phase, { root, importHost, plugin, mode })
      expect(report.phase).toBe(phase)
      expect(report.syntheticOnly).toBe(true)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

it.each(['cancel-compaction', 'pending-before-compaction', 'manual-after-compaction', 'decline', 'automatic-pressure', 'system-head-refresh'] as const)(
  'preserves Think authority through real compaction boundary: %s', async scenario => {
    const root = await mkdtemp(join(tmpdir(), 'think-remember-fault-'))
    try {
      const report = await runThinkRememberPhase('write', { root, importHost, plugin, scenario })
      expect(report.scenario).toBe(scenario)
    } finally { await rm(root, { recursive: true, force: true }) }
  },
)

it('keeps reasoning state when a later native checkpoint is replaced by ordinary fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'think-remember-mixed-'))
  try {
    await runThinkRememberPhase('write', { root, importHost, plugin, mode: 'native' })
    await runThinkRememberPhase('resume', { root, importHost, plugin, mode: 'fallback' })
    await runThinkRememberPhase('verify', { root, importHost, plugin, mode: 'fallback' })
  } finally { await rm(root, { recursive: true, force: true }) }
})
