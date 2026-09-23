import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CompactionId, compactCheckpointSource } from '@deepseek-ai/dsh-compaction'
import { expect, it } from 'vitest'
// @ts-expect-error Plain Node probe helper is not part of the shipped TypeScript API.
import { parseDurableArgs, stagesForCase, claimControlledRun, controlledBaselinePrompt, extractAssistantTarget, assertControlledPayload, controlledFixtureItem, newAssistantText, jsonlContainsCheckpoint } from '../scripts/native-compaction-controlled-cases.mjs'

const target = 'A1B2C3D4E5F6'
const user = { role: 'user', content: [{ type: 'input_text', text: `Remember the checkpoint label ${target}.` }] }
const assistant = { role: 'assistant', content: [{ type: 'output_text', text: `CHECKPOINT_LABEL: ${target}\nNeutral material.` }] }
const compact = { type: 'compaction', encrypted_content: 'fixture' }
const script = fileURLToPath(new URL('../scripts/native-compaction-durable-smoke.mjs', import.meta.url))
function probe(args: string[]) {
  return spawnSync(process.execPath, ['--experimental-transform-types', '--disable-warning=ExperimentalWarning', script, ...args], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, OTEL_SDK_DISABLED: 'true', DSH_TELEMETRY_MODE: 'DISABLED' },
  })
}

it('keeps historical three-dispatch default separate from explicitly named controls', () => {
  expect(parseDurableArgs([]).caseName).toBe('oversized-user')
  expect(stagesForCase('oversized-user')).toEqual(['baseline', 'native', 'resume'])
  expect(stagesForCase('assistant-origin')).toEqual(['baseline', 'anchor', 'native', 'resume'])
  expect(controlledBaselinePrompt('assistant-origin')).not.toContain(target)
  expect(controlledBaselinePrompt('retained-user', target)).toContain(target)
})
it.each([
  ['--offline', '--offline'], ['--case=unknown'], ['--case=retained-user', '--case=assistant-origin'],
  ['--live', '--codex-login', '--case=assistant-origin', '--run-id=test', '--offline-fault=wrong'],
  ['--offline', '--case=assistant-origin', '--offline-recall=wrong'],
  ['--offline', '--case=assistant-origin', '--offline-fault=retained-user-lost'],
  ['--offline', '--case=retained-user', '--offline-fault=plaintext-leak'],
  ['--offline', '--case=retained-user', '--offline-fault=unknown'],
  ['--offline', '--run-id=offline-run'], ['--live', '--codex-login', '--case=assistant-origin', '--run-id=../invalid'],
])('rejects invalid controlled arguments before credentials: %j', (...args) => {
  expect(() => parseDurableArgs(args)).toThrow('INVALID_MODE')
})
it('requires a run claim for a future live control, before reading credentials', () => {
  const result = probe(['--live', '--codex-login', '--case=assistant-origin'])
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(JSON.parse(result.stderr.trim())).toEqual({ stop_reason: 'CONTROLLED_RUN_ID_REQUIRED' })
})
it('never substitutes malformed or ambiguous baseline labels', () => {
  expect(extractAssistantTarget(`CHECKPOINT_LABEL: ${target}\nNeutral material`)).toBe(target)
  for (const text of [target, `CHECKPOINT_LABEL: ${target.toLowerCase()}\nText`, `CHECKPOINT_LABEL: ${target}\nAgain ${target}`]) {
    expect(() => extractAssistantTarget(text)).toThrow('BASELINE_LABEL_INVALID')
  }
})
it('requires the target in the actually selected prefix, without metadata or user leakage', () => {
  expect(() => assertControlledPayload('assistant-origin', 'native', { input: [assistant] }, target, [], undefined, undefined)).not.toThrow()
  expect(() => assertControlledPayload('assistant-origin', 'native', { input: [] }, target, [], undefined, undefined)).toThrow('COMPACTED_PREFIX_TARGET_MISSING')
  expect(() => assertControlledPayload('assistant-origin', 'native', { input: [assistant, user] }, target, [user], undefined, undefined)).toThrow('COMPACTED_PREFIX_TARGET_LEAK')
  expect(() => assertControlledPayload('assistant-origin', 'native', { input: [assistant], instructions: target }, target, [], undefined, undefined)).toThrow('COMPACTED_PREFIX_TARGET_LEAK')
  expect(() => assertControlledPayload('retained-user', 'native', { input: [user] }, target, [], undefined, undefined)).toThrow('RETAINED_TARGET_CONTRACT_FAILED')
})
it('does not accept altered replay, dropped retained input, or plaintext shortcuts', () => {
  expect(() => assertControlledPayload('retained-user', 'resume', { input: [user, compact] }, target, undefined, true, true)).not.toThrow()
  expect(() => assertControlledPayload('assistant-origin', 'resume', { input: [compact] }, target, undefined, false, true)).toThrow('REPLAY_CHECKPOINT_MISMATCH')
  expect(() => assertControlledPayload('retained-user', 'resume', { input: [compact] }, target, undefined, true, false)).toThrow('REPLAY_RETAINED_INPUT_MISMATCH')
  expect(() => assertControlledPayload('assistant-origin', 'resume', { input: [compact, assistant] }, target, undefined, true, true)).toThrow('REPLAY_TARGET_LEAK')
  expect(() => assertControlledPayload('retained-user', 'resume', { input: [user, compact, user] }, target, undefined, true, true)).toThrow('REPLAY_TARGET_LEAK')
})
it('synthetic A derives the answer from restored user input, not the expected-value record', () => {
  const reply = controlledFixtureItem('resume', { input: [user, compact] }, 'retained-user')
  expect(reply.content[0].text).toBe(target)
  expect(() => controlledFixtureItem('resume', { input: [compact] }, 'retained-user')).toThrow('FIXTURE_RETAINED_TARGET_MISSING')
})
it('synthetic B derives its envelope from native assistant input and its answer from that envelope', () => {
  const envelope = controlledFixtureItem('native', { input: [assistant] }, 'assistant-origin')
  expect(controlledFixtureItem('resume', { input: [envelope] }, 'assistant-origin').content[0].text).toBe(target)
  expect(() => controlledFixtureItem('native', { input: [user] }, 'assistant-origin')).toThrow('FIXTURE_ASSISTANT_TARGET_MISSING')
  expect(() => controlledFixtureItem('resume', { input: [] }, 'assistant-origin')).toThrow('FIXTURE_CHECKPOINT_INVALID')
  expect(() => controlledFixtureItem('resume', { input: [compact] }, 'assistant-origin')).toThrow('FIXTURE_CHECKPOINT_INVALID')
})
it('checks the physical JSONL checkpoint rather than merely finding a marker', () => {
  const expected = { source: compactCheckpointSource(CompactionId('fixture-compaction')), content: [{ type: 'text', text: 'checkpoint' }] }
  expect(jsonlContainsCheckpoint(`${JSON.stringify({ header: true })}\n${JSON.stringify({ data: { message: expected } })}\n`, expected)).toBe(true)
  expect(jsonlContainsCheckpoint(JSON.stringify({ marker: 'checkpoint' }), expected)).toBe(false)
  expect(jsonlContainsCheckpoint(JSON.stringify({ data: { ...expected, extra: true } }), expected)).toBe(false)
})
it('requires a new assistant event even when the historical answer is correct', () => {
  const event = { type: 'assistant/message', seq: 7, data: { message: { content: [{ type: 'text', text: target }] } } }
  expect(() => newAssistantText([event], 7)).toThrow('AGENT_TURN_FAILED')
  expect(() => newAssistantText([event, { type: 'user/message', seq: 8 }], 7)).toThrow('AGENT_TURN_FAILED')
  expect(newAssistantText([event, { ...event, seq: 9 }], 8)).toBe(target)
})
it('claims a future run once, persists across cleanup, and does not allow cross-case reuse', async () => {
  const root = await mkdtemp(join(tmpdir(), 'controlled-run-claim-'))
  try {
    await claimControlledRun(root, 'same-attempt', 'assistant-origin')
    expect(JSON.parse(await readFile(join(root, 'same-attempt.json'), 'utf8'))).toMatchObject({ maximum_dispatches: 4, state: 'claimed-no-retry' })
    await expect(claimControlledRun(root, 'same-attempt', 'retained-user')).rejects.toThrow('RUN_ALREADY_CLAIMED_NO_RETRY')
    const link = `${root}-link`
    try {
      await symlink(root, link)
      await expect(claimControlledRun(link, 'other-attempt', 'assistant-origin')).rejects.toThrow('RUN_LEDGER_UNSAFE')
    } finally { await rm(link, { force: true }) }
  } finally { await rm(root, { recursive: true, force: true }) }
})

it.each(['retained-user', 'assistant-origin'])('runs %s through real DSH persistence and two processes with request-derived synthetic answers', caseName => {
  const result = probe(['--offline', `--case=${caseName}`])
  expect(result.error).toBeUndefined()
  expect(result.status, result.stdout).toBe(0)
  const report = JSON.parse(result.stdout.trim())
  expect(report).toMatchObject({ case: caseName, stop_reason: 'COMPLETED', dispatch_count: 4, real_provider_dispatches: 0, maximum_dispatches: 4, prompt_padding_bytes: 0, fresh_processes_completed: 2, temporary_storage_removed: true, anchor_completed: true, checkpoint_observation: { retained_input_identical: true, physical_checkpoint_identical: true }, recall_diagnostic: { exact_match: true } })
  expect(new Set(report.phases.map((phase: { pid: number }) => phase.pid)).size).toBe(2)
  expect(report.metrics.map((metric: { stage: string }) => metric.stage)).toEqual(['baseline', 'anchor', 'native', 'resume'])
  expect(report.metrics[2].payload).toMatchObject({ assistant_contains_target: caseName === 'assistant-origin', user_contains_target: caseName === 'retained-user' })
  expect(report.metrics[2].retained_projection.outside_compaction_contains_target).toBe(caseName === 'retained-user')
  expect(report.metrics[3].payload.outside_compaction_contains_target).toBe(caseName === 'retained-user')
  expect(report.metrics[3].replayed_compaction_matches_persisted).toBe(true)
  expect(`${result.stdout}${result.stderr}`).not.toMatch(/CHECKPOINT_LABEL:|SYNTHETIC-REMEMBER-V1:|Library task|Remember the checkpoint label/u)
}, 35_000)

it.each([
  ['assistant-origin', 'missing-native-target', 'COMPACTED_PREFIX_TARGET_MISSING', 2],
  ['assistant-origin', 'plaintext-leak', 'REPLAY_TARGET_LEAK', 3],
  ['retained-user', 'retained-user-lost', 'REPLAY_RETAINED_INPUT_MISMATCH', 3],
  ['assistant-origin', 'checkpoint-altered', 'REPLAY_CHECKPOINT_MISMATCH', 3],
  ['assistant-origin', 'checkpoint-missing', 'REPLAY_CHECKPOINT_MISMATCH', 3],
])('blocks %s/%s before synthetic transport without retry', (caseName, fault, guard, count) => {
  const result = probe(['--offline', `--case=${caseName}`, `--offline-fault=${fault}`])
  expect(result.status, result.stdout).toBe(1)
  const report = JSON.parse(result.stdout.trim())
  expect(report).toMatchObject({ guard_failure: guard, dispatch_count: count, real_provider_dispatches: 0, temporary_storage_removed: true, fallback_dispatched: false })
  expect(report.blocked_dispatch_attempts).toBeGreaterThan(0)
}, 35_000)

it.each(['case-only', 'wrapped', 'wrong', 'empty'])('retains strict failure and diagnostics for controlled %s answers', fault => {
  const result = probe(['--offline', '--case=assistant-origin', `--offline-fault=${fault}`])
  expect(result.status, result.stdout).toBe(1)
  const report = JSON.parse(result.stdout.trim())
  expect(report).toMatchObject({ stop_reason: 'RECALL_MISMATCH_NO_RETRY', dispatch_count: 4, real_provider_dispatches: 0, temporary_storage_removed: true, fresh_processes_completed: 1, restore_observation: { checkpoint_identical: true }, recall_diagnostic: { exact_match: false } })
  expect(report.provider_reply_diagnostic.matches_agent_after_trim).toBe(true)
}, 35_000)
