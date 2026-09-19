/** Content-free diagnostics for the bounded recall probe; no IO or acceptance relaxation. */
const LABEL = /^[0-9A-F]{12}$/u
function validLabel(label) {
  if (typeof label !== 'string' || !LABEL.test(label)) throw new Error('RECALL_DIAGNOSTIC_INPUT_INVALID')
}

/** Classify a reply without returning its text, the target, fragments, or reversible encodings. */
export function diagnoseRecall(reply, label) {
  validLabel(label)
  if (typeof reply !== 'string') throw new Error('RECALL_DIAGNOSTIC_INPUT_INVALID')
  const text = reply.trim()
  const exact = text === label
  const caseOnly = !exact && text.toUpperCase() === label
  const containsExact = text.includes(label)
  const containsFolded = text.toUpperCase().includes(label)
  const classification = exact ? 'exact'
    : text === '' ? 'empty'
      : caseOnly ? 'case-only'
        : containsExact ? 'target-with-extra-text'
          : containsFolded ? 'case-and-extra-text'
            : /^[0-9a-f]{12}$/iu.test(text) ? 'different-label' : 'no-target-match'
  return {
    schema_version: 1,
    classification,
    exact_match: exact,
    case_only_match: caseOnly,
    contains_exact_target: containsExact,
    contains_case_insensitive_target: containsFolded,
    outer_whitespace_removed: reply !== text,
    raw_utf8_bytes: Buffer.byteLength(reply),
    trimmed_utf8_bytes: Buffer.byteLength(text),
  }
}

/** Observe the actual wire body. Opaque content is counted but never searched for a target. */
export function describeRecallPayload(body, label) {
  validLabel(label)
  if (body === null || typeof body !== 'object' || !Array.isArray(body.input)) {
    throw new Error('RECALL_DIAGNOSTIC_INPUT_INVALID')
  }
  const input = body.input
  const plain = input.filter(item => item?.type !== 'compaction')
  const has = value => {
    try { return JSON.stringify(value)?.toUpperCase().includes(label) === true }
    catch { throw new Error('RECALL_DIAGNOSTIC_INPUT_INVALID') }
  }
  const users = plain.filter(item => item?.role === 'user')
  const assistants = plain.filter(item => item?.role === 'assistant')
  return {
    schema_version: 1,
    input_items: input.length,
    input_utf8_bytes: Buffer.byteLength(JSON.stringify(input)),
    user_items: users.length,
    assistant_items: assistants.length,
    compaction_items: input.filter(item => item?.type === 'compaction').length,
    trigger_items: input.filter(item => item?.type === 'compaction_trigger').length,
    user_contains_target: has(users),
    assistant_contains_target: has(assistants),
    plaintext_input_contains_target: has(plain),
    instructions_contain_target: has(body.instructions ?? ''),
    outside_compaction_contains_target: has({ ...body, input: plain }),
  }
}
