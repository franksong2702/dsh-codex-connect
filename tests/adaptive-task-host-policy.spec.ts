import { beforeEach, expect, it, vi } from 'vitest'
const { read } = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('node:fs', async original => ({ ...await original<typeof import('node:fs')>(), readFileSync: read }))
import { assertTaskHostAutomation, taskHostRecoveryOnly, taskHostUsesSubagentOwnership } from '../src/adaptive-task-host-policy.ts'
let versions: Record<string, string | undefined>
beforeEach(() => {
  versions = { 'dsh-agent': '0.1.7-rc.1', 'dsh-agent-loop': '0.1.7-rc.1', 'dsh-tools': '0.1.7-rc.1' }
  read.mockReset().mockImplementation((filename: string) => {
    const name = filename.split('/').at(-2)!
    if (versions[name] === undefined) throw new Error('metadata missing')
    return JSON.stringify({ name: '@deepseek-ai/' + name, version: versions[name] })
  })
})
it.each(['0.1.7-rc.1', '0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2',
  '0.2.1-alpha.1', '0.2.1-alpha.2', '0.2.1-alpha.3', '0.2.1-alpha.4', '0.2.1-alpha.5',
  '0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.3', '0.2.1-rc.4', '0.2.1-rc.5'])('retains the prior %s Host policy', version => {
  for (const name of Object.keys(versions)) versions[name] = version
  expect(taskHostRecoveryOnly()).toBe(false)
  expect(() => assertTaskHostAutomation()).not.toThrow()
})
it('allows no automatic admission on exact alpha.3', () => {
  for (const name of Object.keys(versions)) versions[name] = '0.2.2-alpha.3'
  expect(taskHostRecoveryOnly()).toBe(true)
  expect(() => assertTaskHostAutomation()).toThrow('TASK_HOST_RECOVERY_ONLY')
})
it.each(['dsh-agent', 'dsh-agent-loop', 'dsh-tools'])('rejects a partial or missing alpha.3 %s binding', name => {
  for (const key of Object.keys(versions)) versions[key] = '0.2.2-alpha.3'
  versions[name] = '0.2.1-rc.5'
  expect(() => taskHostRecoveryOnly()).toThrow('TASK_HOST_VERSION_MISMATCH')
  versions[name] = undefined
  expect(() => taskHostRecoveryOnly()).toThrow('TASK_HOST_VERSION_MISMATCH')
})
it('does not accept a manifest with the wrong package identity', () => {
  for (const key of Object.keys(versions)) versions[key] = '0.2.2-alpha.3'
  read.mockReturnValueOnce(JSON.stringify({ name: 'foreign', version: '0.2.2-alpha.3' }))
  expect(() => assertTaskHostAutomation()).toThrow('TASK_HOST_VERSION_MISMATCH')
})

it('closes automation on exact rc.1 and rejects mixing either recovery Host', () => {
  for (const name of Object.keys(versions)) versions[name] = '0.2.2-rc.1'
  expect(taskHostRecoveryOnly()).toBe(true)
  expect(() => assertTaskHostAutomation()).toThrow('TASK_HOST_RECOVERY_ONLY')
  for (const replacement of ['0.2.2-alpha.3', '0.2.2-rc.2', undefined]) {
    versions['dsh-tools'] = replacement
    expect(() => taskHostRecoveryOnly()).toThrow('TASK_HOST_VERSION_MISMATCH')
  }
})

it('keeps exact rc2 recovery-only and rejects every partial binding', () => {
  for (const name of Object.keys(versions)) versions[name] = '0.2.2-rc.2'
  expect(taskHostRecoveryOnly()).toBe(true)
  expect(() => assertTaskHostAutomation()).toThrow('TASK_HOST_RECOVERY_ONLY')
  for (const name of Object.keys(versions)) {
    versions[name] = '0.2.2-rc.1'
    expect(() => taskHostRecoveryOnly()).toThrow('TASK_HOST_VERSION_MISMATCH')
    versions[name] = '0.2.2-rc.2'
  }
})

it('requires exact subagent metadata for replacement ownership, never just the core version', () => {
  for (const name of Object.keys(versions)) versions[name] = '0.2.2-rc.2'
  versions['dsh-subagent'] = '0.2.2-rc.2'
  expect(taskHostUsesSubagentOwnership()).toBe(true)
  for (const version of [undefined, '0.2.2-rc.1', '0.2.2-rc.3']) {
    versions['dsh-subagent'] = version
    expect(() => taskHostUsesSubagentOwnership()).toThrow('TASK_HOST_VERSION_MISMATCH')
  }
})
it('rejects a foreign subagent manifest and keeps legacy Host ownership unchanged', () => {
  for (const name of Object.keys(versions)) versions[name] = '0.2.2-rc.2'
  versions['dsh-subagent'] = '0.2.2-rc.2'
  read.mockImplementation((filename: string) => {
    const name = filename.split('/').at(-2)!
    return JSON.stringify({ name: name === 'dsh-subagent' ? 'foreign' : '@deepseek-ai/' + name, version: versions[name] })
  })
  expect(() => taskHostUsesSubagentOwnership()).toThrow('TASK_HOST_VERSION_MISMATCH')
  for (const name of Object.keys(versions)) versions[name] = '0.2.2-rc.1'
  expect(taskHostUsesSubagentOwnership()).toBe(false)
})
