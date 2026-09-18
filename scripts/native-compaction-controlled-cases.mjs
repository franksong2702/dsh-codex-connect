/** Explicit controlled cases for the durable probe; fixtures never receive an expected answer. */
import { randomBytes } from 'node:crypto'
import { mkdir, lstat, open } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { describeRecallPayload } from './native-compaction-recall-diagnostics.mjs'

export const CASE_NAMES = Object.freeze(['oversized-user', 'retained-user', 'assistant-origin'])
export const CONTROLLED_FAULTS = Object.freeze(['missing-native-target', 'plaintext-leak', 'retained-user-lost', 'checkpoint-altered', 'checkpoint-missing', 'case-only', 'wrapped', 'wrong', 'empty'])
export const ANCHOR_PROMPT = 'We are moving to the next stage. Reply ONLY ACK. Do not repeat any identifier or earlier material.'
export const CONTINUATION_PROMPT = 'What is the checkpoint label established earlier in this conversation? Return ONLY that label, not ACK. Do not invent a new label.'
const HEX = /^[0-9A-F]{12}$/u
const PREFIX = 'SYNTHETIC-REMEMBER-V1:'
const fail = code => { throw new Error(code) }
const has = (value, target) => JSON.stringify(value)?.toUpperCase().includes(target) === true
const contentText = item => typeof item.content === 'string' ? item.content : (item.content ?? []).filter(block => typeof block?.text === 'string').map(block => block.text).join('\n')
const words = text => text.trim().split(/\s+/u).filter(Boolean).length

/** Parse all public flags before credentials; old unnamed invocations keep the oversized case. */
export function parseDurableArgs(args) {
  const seen = new Set()
  const parsed = { caseName: 'oversized-user', live: false, offline: false, codexLogin: false, rejectNative: false, recallCase: undefined, fault: undefined, runId: undefined }
  for (const arg of args) {
    const key = arg.split('=')[0]
    if (seen.has(key)) fail('INVALID_MODE')
    seen.add(key)
    if (arg === '--live') parsed.live = true
    else if (arg === '--offline') parsed.offline = true
    else if (arg === '--codex-login') parsed.codexLogin = true
    else if (arg === '--reject-native') parsed.rejectNative = true
    else if (arg.startsWith('--case=')) parsed.caseName = arg.slice(7)
    else if (arg.startsWith('--offline-recall=')) parsed.recallCase = arg.slice(17)
    else if (arg.startsWith('--offline-fault=')) parsed.fault = arg.slice(16)
    else if (arg.startsWith('--run-id=')) parsed.runId = arg.slice(9)
    else fail('INVALID_MODE')
  }
  if (!CASE_NAMES.includes(parsed.caseName) || parsed.live !== parsed.codexLogin
    || (parsed.live && (parsed.offline || parsed.rejectNative || parsed.recallCase !== undefined || parsed.fault !== undefined))) fail('INVALID_MODE')
  if (parsed.recallCase !== undefined && (!parsed.offline || parsed.rejectNative || parsed.caseName !== 'oversized-user'
    || !['case-only', 'wrapped', 'wrong', 'empty'].includes(parsed.recallCase))) fail('INVALID_MODE')
  if (parsed.fault !== undefined && (!parsed.offline || parsed.rejectNative || parsed.caseName === 'oversized-user' || !CONTROLLED_FAULTS.includes(parsed.fault))) fail('INVALID_MODE')
  if (parsed.fault === 'plaintext-leak' && parsed.caseName !== 'assistant-origin') fail('INVALID_MODE')
  if (parsed.fault === 'retained-user-lost' && parsed.caseName !== 'retained-user') fail('INVALID_MODE')
  if (parsed.rejectNative && parsed.caseName !== 'oversized-user') fail('INVALID_MODE')
  if (parsed.runId !== undefined && (!parsed.live || !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(parsed.runId))) fail('INVALID_MODE')
  if (parsed.live && parsed.caseName !== 'oversized-user' && parsed.runId === undefined) fail('CONTROLLED_RUN_ID_REQUIRED')
  return parsed
}

export function stagesForCase(caseName) {
  if (!CASE_NAMES.includes(caseName)) fail('INVALID_CASE')
  return caseName === 'oversized-user' ? ['baseline', 'native', 'resume'] : ['baseline', 'anchor', 'native', 'resume']
}

/** A durable one-shot claim survives temporary-session cleanup. A run id cannot be reused across cases. */
export async function claimControlledRun(directory, runId, caseName) {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(runId) || !CASE_NAMES.includes(caseName)) fail('INVALID_MODE')
  await mkdir(directory, { mode: 0o700, recursive: true })
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid()) fail('RUN_LEDGER_UNSAFE')
  let handle
  try { handle = await open(join(directory, `${runId}.json`), 'wx', 0o600) }
  catch (error) { if (error.code === 'EEXIST') fail('RUN_ALREADY_CLAIMED_NO_RETRY'); throw error }
  try { await handle.writeFile(JSON.stringify({ schema_version: 1, case: caseName, state: 'claimed-no-retry', maximum_dispatches: stagesForCase(caseName).length })); await handle.sync() }
  finally { await handle.close() }
}

export function controlledBaselinePrompt(caseName, target) {
  const material = ' Then write 600 to 750 words of ordinary prose explaining how to organize a small community library: receiving books, arranging shelves, recording loans, returning books, and checking the catalogue. Do not include hexadecimal examples or repeat any checkpoint label. This is neutral disposable test material.'
  if (caseName === 'retained-user') {
    if (!HEX.test(target)) fail('CONTROLLED_TARGET_INVALID')
    return `Remember the checkpoint label ${target}. Do not echo it in this reply.${material}`
  }
  if (caseName === 'assistant-origin') return `Generate a new twelve-character uppercase hexadecimal checkpoint label. The first line must be exactly CHECKPOINT_LABEL: followed by one space and the label. Use the label only once.${material}`
  fail('INVALID_CASE')
}

export function extractAssistantTarget(reply) {
  if (typeof reply !== 'string') fail('BASELINE_LABEL_INVALID')
  const match = /^CHECKPOINT_LABEL: ([0-9A-F]{12})\r?\n/u.exec(reply.trim())
  if (!match || (reply.match(/[0-9A-F]{12}/giu) ?? []).length !== 1) fail('BASELINE_LABEL_INVALID')
  return match[1]
}

export function assertControlledBaseline(caseName, reply, target, request) {
  if (typeof reply !== 'string' || words(reply) < 400 || words(reply) > 1100 || Buffer.byteLength(reply) > 12000) fail('BASELINE_MATERIAL_INVALID')
  if (caseName === 'assistant-origin') {
    if (extractAssistantTarget(reply) !== target || has(request, target)) fail('BASELINE_TARGET_LEAK')
  } else {
    const observation = describeRecallPayload(request, target)
    const rest = describeRecallPayload({ ...request, input: request.input.filter(item => item?.role !== 'user') }, target)
    if (has(reply, target) || !observation.user_contains_target || rest.outside_compaction_contains_target) fail('BASELINE_TARGET_LEAK')
  }
}

/** Assert target provenance on the final outgoing body, before any provider dispatch. */
export function assertControlledPayload(caseName, stage, body, target, retained, checkpointMatches, retainedMatches) {
  const observation = describeRecallPayload(body, target)
  const withoutIntendedRole = role => describeRecallPayload({ ...body, input: body.input.filter(item => item?.role !== role) }, target)
  if (stage === 'native') {
    const role = caseName === 'assistant-origin' ? 'assistant' : 'user'
    if (!(role === 'assistant' ? observation.assistant_contains_target : observation.user_contains_target)) fail('COMPACTED_PREFIX_TARGET_MISSING')
    if (withoutIntendedRole(role).outside_compaction_contains_target) fail('COMPACTED_PREFIX_TARGET_LEAK')
    const projected = describeRecallPayload({ input: retained }, target)
    if (caseName === 'retained-user' ? !projected.user_contains_target : projected.outside_compaction_contains_target) fail('RETAINED_TARGET_CONTRACT_FAILED')
  }
  if (stage === 'resume') {
    if (observation.compaction_items !== 1 || checkpointMatches !== true) fail('REPLAY_CHECKPOINT_MISMATCH')
    if (retainedMatches !== true) fail('REPLAY_RETAINED_INPUT_MISMATCH')
    if (caseName === 'retained-user') {
      if (!observation.user_contains_target || withoutIntendedRole('user').outside_compaction_contains_target) fail('REPLAY_TARGET_CONTRACT_FAILED')
      const tail = { ...body, input: body.input.slice(body.input.findIndex(item => item?.type === 'compaction')) }
      if (describeRecallPayload(tail, target).outside_compaction_contains_target) fail('REPLAY_TARGET_LEAK')
    } else if (observation.outside_compaction_contains_target) fail('REPLAY_TARGET_LEAK')
  }
}

/** Do not accept the last historical assistant response as a new completed turn. */
export function newAssistantText(events, beforeSeq) {
  const last = events.findLast(event => event.type === 'assistant/message')
  if (!last || last.seq <= beforeSeq) fail('AGENT_TURN_FAILED')
  return last.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

/** Inspect the actual physical JSONL, not just a marker substring or an in-memory checkpoint. */
export function jsonlContainsCheckpoint(text, expected) {
  const visit = value => {
    if (value === null || typeof value !== 'object') return false
    if (isDeepStrictEqual(value, expected)) return true
    return Object.values(value).some(visit)
  }
  return text.split(/\r?\n/u).filter(line => line.trim() !== '').some(line => visit(JSON.parse(line)))
}

const MATERIAL = Array.from({ length: 36 }, (_, i) => `Library task ${i + 1}: volunteers check the catalogue, arrange the books carefully, and record each return before closing.`).join('\n')
function userTarget(body) {
  const matches = body.input.filter(item => item?.role === 'user').flatMap(item => [...contentText(item).matchAll(/Remember the checkpoint label ([0-9A-F]{12})\./gu)])
  if (matches.length !== 1) fail('FIXTURE_RETAINED_TARGET_MISSING')
  return matches[0][1]
}
function assistantTarget(body) {
  const items = body.input.filter(item => item?.role === 'assistant' && contentText(item).startsWith('CHECKPOINT_LABEL: '))
  if (items.length !== 1) fail('FIXTURE_ASSISTANT_TARGET_MISSING')
  return extractAssistantTarget(contentText(items[0]))
}

/** No comparator/target argument: answers come only from actual wire input or baseline generation. */
export function controlledFixtureItem(stage, body, caseName, fault) {
  if (!['retained-user', 'assistant-origin'].includes(caseName)) fail('INVALID_CASE')
  let value
  if (stage === 'native') {
    const target = caseName === 'assistant-origin' ? assistantTarget(body) : null
    return { type: 'compaction', id: 'cmp_controlled_fixture', encrypted_content: PREFIX + Buffer.from(JSON.stringify({ fixture: true, case: caseName, target })).toString('base64') }
  }
  if (stage === 'baseline') value = caseName === 'assistant-origin' ? `CHECKPOINT_LABEL: A${randomBytes(6).toString('hex').toUpperCase().slice(0, 11)}\n${MATERIAL}` : MATERIAL
  else if (stage === 'anchor') value = 'ACK'
  else if (stage === 'resume') {
    if (caseName === 'retained-user') value = userTarget(body)
    else {
      const items = body.input.filter(item => item?.type === 'compaction')
      const encoded = items[0]?.encrypted_content
      if (items.length !== 1 || typeof encoded !== 'string' || !encoded.startsWith(PREFIX)) fail('FIXTURE_CHECKPOINT_INVALID')
      let decoded
      try { decoded = JSON.parse(Buffer.from(encoded.slice(PREFIX.length), 'base64').toString('utf8')) } catch { fail('FIXTURE_CHECKPOINT_INVALID') }
      if (decoded.fixture !== true || decoded.case !== caseName || !HEX.test(decoded.target)) fail('FIXTURE_CHECKPOINT_INVALID')
      value = decoded.target
    }
    if (fault === 'case-only') value = value.toLowerCase()
    if (fault === 'wrapped') value = `The label is ${value}.`
    if (fault === 'wrong') value = `${value.slice(0, -1)}${value.endsWith('0') ? '1' : '0'}`
    if (fault === 'empty') value = ''
  } else fail('FIXTURE_STAGE_INVALID')
  return { type: 'message', id: `msg_controlled_${stage}`, role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: value, annotations: [] }] }
}

/** Deliberate, offline-only wire corruption for testing the guards; never a history rewrite. */
export function corruptControlledPayload(body, stage, caseName, target, fault) {
  const changed = structuredClone(body)
  if (stage === 'native' && fault === 'missing-native-target') changed.input = changed.input.filter(item => !has(item, target))
  if (stage === 'resume') {
    if (fault === 'plaintext-leak') changed.input.push({ role: 'user', content: [{ type: 'input_text', text: target }] })
    if (fault === 'retained-user-lost') changed.input = changed.input.filter(item => !(item?.role === 'user' && has(item, target)))
    if (fault === 'checkpoint-missing') changed.input = changed.input.filter(item => item?.type !== 'compaction')
    if (fault === 'checkpoint-altered') for (const item of changed.input) if (item?.type === 'compaction') item.encrypted_content += '-changed'
  }
  return changed
}
