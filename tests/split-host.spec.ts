import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import * as implementation from '../scripts/split-experiment-entry.ts'
import { SPLIT_HOST_SCENARIOS, runSplitHostScenario } from '../scripts/split-host-fixture.mjs'
const require = createRequire(import.meta.url)
const importHost = (specifier: string) => import(pathToFileURL(require.resolve(specifier)).href)
it.each(SPLIT_HOST_SCENARIOS)('Split exact-host scenario: %s', async scenario => {
  const root = await mkdtemp(join(tmpdir(), 'split-host-source-'))
  try {
    const report = await runSplitHostScenario(scenario, { root, implementation, importHost })
    expect(report.scenario).toBe(scenario)
    expect(report.syntheticOnly).toBe(true)
  } finally { await rm(root, { recursive: true, force: true }) }
})
