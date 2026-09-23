import { expect, it } from 'vitest'
import { assertDurableRuntimeVersions, DURABLE_RUNTIME_VERSIONS } from '../scripts/native-compaction-runtime.mjs'

it('accepts only the exact durable-probe direct runtime set', () => {
  expect(() => assertDurableRuntimeVersions({ ...DURABLE_RUNTIME_VERSIONS })).not.toThrow()
})

it.each([
  null,
  [],
  {},
  { ...DURABLE_RUNTIME_VERSIONS, '@deepseek-ai/dsh-agent-loop': '0.1.5-rc.1' },
  { ...DURABLE_RUNTIME_VERSIONS, '@deepseek-ai/dsh-llm': undefined },
  { ...DURABLE_RUNTIME_VERSIONS, '@earendil-works/pi-ai': '0.85.2' },
  { ...DURABLE_RUNTIME_VERSIONS, unexpected: '0.1.2-rc.1' },
])('rejects missing, mixed, or unverified direct runtime metadata %#', versions => {
  expect(() => assertDurableRuntimeVersions(versions)).toThrow('DURABLE_RUNTIME_MISMATCH')
})
