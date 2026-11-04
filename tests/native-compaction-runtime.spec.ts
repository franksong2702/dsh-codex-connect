import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { assertDurableRuntimeVersions, DURABLE_RUNTIME_VERSIONS, readVerifiedDurableRuntime } from '../scripts/native-compaction-runtime.mjs'

it.each(['4.0.4', '4.0.5'])('accepts the verified Cordis %s direct set with the unchanged DSH baseline', cordis => {
  expect(() => assertDurableRuntimeVersions({ ...DURABLE_RUNTIME_VERSIONS, '@deepseek-ai/cordis': cordis })).not.toThrow()
})

it('checks the actual installed import graph before any durable dispatch', async () => {
  const versions = await readVerifiedDurableRuntime()
  expect(versions).toEqual(DURABLE_RUNTIME_VERSIONS)
  const directRequire = createRequire(import.meta.url)
  const cordis = directRequire.resolve('@deepseek-ai/cordis')
  for (const name of Object.keys(versions).filter(name => name.startsWith('@deepseek-ai/dsh-'))) {
    const dependencyRequire = createRequire(directRequire.resolve(name))
    expect(dependencyRequire.resolve('@deepseek-ai/cordis'), name).toBe(cordis)
  }
})

it.each([
  null,
  [],
  {},
  { ...DURABLE_RUNTIME_VERSIONS, '@deepseek-ai/cordis': '4.0.3' },
  { ...DURABLE_RUNTIME_VERSIONS, '@deepseek-ai/cordis': '4.0.6' },
  { ...DURABLE_RUNTIME_VERSIONS, '@deepseek-ai/cordis': '^4.0.5' },
  { ...DURABLE_RUNTIME_VERSIONS, '@deepseek-ai/cordis': '4.0.5', '@deepseek-ai/dsh-session': '0.2.1-rc.5' },
  { ...DURABLE_RUNTIME_VERSIONS, '@deepseek-ai/dsh-agent-loop': '0.1.5-rc.1' },
  { ...DURABLE_RUNTIME_VERSIONS, '@deepseek-ai/dsh-llm': undefined },
  { ...DURABLE_RUNTIME_VERSIONS, '@earendil-works/pi-ai': '0.85.2' },
  { ...DURABLE_RUNTIME_VERSIONS, unexpected: '0.1.2-rc.1' },
])('rejects missing, mixed, or unverified direct runtime metadata %#', versions => {
  expect(() => assertDurableRuntimeVersions(versions)).toThrow('DURABLE_RUNTIME_MISMATCH')
})
