import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import * as CodexConnect from '../src/index.ts'
import { AUTOMATIC_SCENARIOS, runNativeAutomaticScenario } from '../scripts/native-compaction-automatic-fixture.mjs'

const require = createRequire(import.meta.url)
const importHost = (specifier: string) => import(pathToFileURL(require.resolve(specifier)).href)
it.each(AUTOMATIC_SCENARIOS)('native compaction automatic lifecycle: %s', async scenario => {
  const root = await mkdtemp(join(tmpdir(), 'codex-native-automatic-'))
  try {
    const report = await runNativeAutomaticScenario(scenario, { root, importHost, plugin: CodexConnect })
    expect(report.scenario).toBe(scenario)
    expect(report.syntheticOnly).toBe(true)
  } finally { await rm(root, { recursive: true, force: true }) }
})
