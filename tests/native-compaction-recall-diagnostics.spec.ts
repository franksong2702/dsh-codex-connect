import { describe, expect, it } from 'vitest'
// @ts-expect-error Plain Node probe helper is not a shipped TypeScript API.
import { diagnoseRecall, describeRecallPayload } from '../scripts/native-compaction-recall-diagnostics.mjs'
import { retainedNativeCompactionInput } from '../src/native-compaction.ts'

const label = 'A1B2C3D4E5F6'
describe('content-free recall diagnostics', () => {
  it.each([
    [label, 'exact', true],
    [` \n${label}\t`, 'exact', true],
    [label.toLowerCase(), 'case-only', false],
    [`The label is ${label}.`, 'target-with-extra-text', false],
    [`\`${label.toLowerCase()}\``, 'case-and-extra-text', false],
    ['001122334455', 'different-label', false],
    ['', 'empty', false],
    [' \n\t ', 'empty', false],
    ['I cannot recall it.', 'no-target-match', false],
    ['Ａ1B2C3D4E5F6', 'no-target-match', false],
  ])('classifies %s without treating a mismatch as accepted', (reply, classification, accepted) => {
    const diagnostic = diagnoseRecall(reply, label)
    expect(diagnostic).toMatchObject({ classification, exact_match: accepted })
    expect(diagnostic.exact_match).toBe((reply as string).trim() === label)
  })
  it('emits only fixed metadata, never target, answer, paths, tokens or fragments', () => {
    const secret = 'private-response /Users/fixture/private Bearer fixture-token'
    const report = diagnoseRecall(`${secret} ${label} 中文`, label)
    expect(report.raw_utf8_bytes).toBe(Buffer.byteLength(`${secret} ${label} 中文`))
    expect(JSON.stringify(report)).not.toMatch(/A1B2|private-response|Users|Bearer|fixture-token|中文/u)
    expect(Object.values(report).every(value => ['string', 'number', 'boolean'].includes(typeof value))).toBe(true)
    expect(report.exact_match).toBe(false)
  })
  it('rejects malformed diagnostic arguments without reflecting them in the error', () => {
    expect(() => diagnoseRecall('private-text', '')).toThrow('RECALL_DIAGNOSTIC_INPUT_INVALID')
    expect(() => diagnoseRecall(null, label)).toThrow('RECALL_DIAGNOSTIC_INPUT_INVALID')
    expect(() => describeRecallPayload({}, label)).toThrow('RECALL_DIAGNOSTIC_INPUT_INVALID')
  })
  it('separates user, assistant, instructions and opaque input without exposing their contents', () => {
    const report = describeRecallPayload({ instructions: `private-${label}`, input: [
      { role: 'user', content: label.toLowerCase() },
      { role: 'assistant', content: label },
      { type: 'compaction', encrypted_content: `opaque-${label}` },
      { type: 'compaction_trigger' },
    ] }, label)
    expect(report).toMatchObject({ user_contains_target: true, assistant_contains_target: true,
      instructions_contain_target: true, compaction_items: 1, trigger_items: 1 })
    expect(JSON.stringify(report)).not.toMatch(/A1B2|opaque-|private-/u)
    expect(describeRecallPayload({ input: [{ type: 'compaction', encrypted_content: label }] }, label))
      .toMatchObject({ outside_compaction_contains_target: false, plaintext_input_contains_target: false })
  })
  it('detects plaintext target leakage outside input items', () => {
    expect(describeRecallPayload({ input: [], tools: [{ description: label }] }, label))
      .toMatchObject({ plaintext_input_contains_target: false, outside_compaction_contains_target: true })
  })
  it('exposes the padded-user retention confound without claiming opaque recall', () => {
    const input = [{ role: 'user', content: [{ type: 'input_text', text: `Remember ${label}[${' '.repeat(65000)}]` }] },
      { role: 'assistant', content: [{ type: 'output_text', text: 'ACK' }] }]
    expect(describeRecallPayload({ input }, label)).toMatchObject({ user_contains_target: true, assistant_contains_target: false })
    const retained = retainedNativeCompactionInput(input)
    expect(retained).toEqual([])
    expect(describeRecallPayload({ input: retained }, label)).toMatchObject({ user_items: 0, outside_compaction_contains_target: false })
    // Ordinary short user content does remain in the client-owned retained projection.
    expect(retainedNativeCompactionInput([{ role: 'user', content: label }])).toHaveLength(1)
  })
})
