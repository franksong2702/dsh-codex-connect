import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

function probe(script: string, args: string[]) {
  return spawnSync(process.execPath, ['--experimental-transform-types', '--disable-warning=ExperimentalWarning', fileURLToPath(new URL(`../scripts/${script}`, import.meta.url)), ...args], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, OTEL_SDK_DISABLED: 'true', DSH_TELEMETRY_MODE: 'DISABLED' },
  })
}
it('rehearses the three-dispatch bridge and rejects fallback without live network', () => {
  const result = probe('native-compaction-luna-smoke.mjs', ['--offline'])
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  const reports = result.stdout.trim().split('\n').map(line => JSON.parse(line))
  expect(reports).toHaveLength(3)
  expect(reports.map(report => report.dispatch_count)).toEqual([3, 2, 2])
  for (const report of reports) {
    expect(report.real_provider_dispatches).toBe(0)
    expect(report.fallback_dispatched).toBe(false)
  }
}, 35_000)
it('rehearses real DSH JSONL write and fresh-process restore with synthetic responses', () => {
  const result = probe('native-compaction-durable-smoke.mjs', ['--offline'])
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  const report = JSON.parse(result.stdout.trim())
  expect(report).toMatchObject({ stop_reason: 'COMPLETED', real_provider_dispatches: 0, dispatch_count: 3, fresh_processes_completed: 2, temporary_storage_removed: true, fallback_attempted: false })
  expect(new Set(report.phases.map((phase: { pid: number }) => phase.pid)).size).toBe(2)
  expect(report.phases[0]).toMatchObject({ native_checkpoint_committed: true, jsonl_checkpoint_verified: true })
  expect(report.phases[1]).toMatchObject({ fresh_process_restored: true, native_creation_disabled: true, label_recalled: true })
}, 35_000)
it('stops failed native persistence acceptance before fallback or a resume dispatch', () => {
  const result = probe('native-compaction-durable-smoke.mjs', ['--offline', '--reject-native'])
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(1)
  const report = JSON.parse(result.stdout.trim())
  expect(report).toMatchObject({ real_provider_dispatches: 0, dispatch_count: 2, fresh_processes_completed: 0, temporary_storage_removed: true, fallback_attempted: true, fallback_dispatched: false, blocked_dispatch_attempts: 1 })
  expect(report.stop_reason).not.toBe('COMPLETED')
}, 35_000)
it('requires explicit Codex-login selection before live durable acceptance', () => {
  const result = probe('native-compaction-durable-smoke.mjs', ['--live'])
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(JSON.parse(result.stderr.trim())).toEqual({ stop_reason: 'INVALID_MODE' })
})
