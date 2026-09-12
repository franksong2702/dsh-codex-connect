import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import * as implementation from '../scripts/split-experiment-entry.ts'
import { runSplitHostScenario } from '../scripts/split-host-fixture.mjs'
import { SPLIT_CONVERSATION_SCENARIOS } from '../scripts/split-conversation-fixture.mjs'
const require = createRequire(import.meta.url)
const importHost = (specifier: string) => import(pathToFileURL(require.resolve(specifier)).href)
it.each(SPLIT_CONVERSATION_SCENARIOS)('Split experimental conversation: %s', async scenario => {
  const root = await mkdtemp(join(tmpdir(), 'split-conversation-'))
  try {
    const report = await runSplitHostScenario(scenario, { root, implementation, importHost })
    expect(report.actualGateway).toBe(true)
    expect(report.actualSessionController).toBe(true)
    expect(report.realProviderDispatches).toBe(0)
  } finally { await rm(root, { recursive: true, force: true }) }
})
