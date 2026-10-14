/** Action, bounded context, local policy, and circuit-breaker contracts for Codex Auto-review. */

import { createHash, randomUUID } from 'node:crypto'
import { lstat, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock, Message, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types'

/** Consecutive denials that stop automatic review for the active turn. */
export const AUTO_REVIEW_MAX_CONSECUTIVE_DENIALS = 3
/** Denials inside the rolling decision window that stop automatic review. */
export const AUTO_REVIEW_MAX_WINDOW_DENIALS = 10
/** Decisions retained for the rolling denial breaker. */
export const AUTO_REVIEW_DECISION_WINDOW = 50
/** Denials retained for explicit human override. */
export const AUTO_REVIEW_RECENT_DENIAL_LIMIT = 10

const TRANSCRIPT_BUDGET = 20_000
const TOOL_BUDGET = 10_000
const MESSAGE_ENTRY_BUDGET = 5_000
const TOOL_ENTRY_BUDGET = 1_000
const NON_USER_ENTRY_LIMIT = 40

/** Exact immutable action reconstructed from one DSH approval request. */
export interface AutoReviewAction {
  readonly toolName: string
  readonly callId: ToolCallId
  readonly turn: number
  readonly arguments: unknown
  readonly cwd?: string
  readonly reason?: string
  readonly fingerprint: string
}

/** Bounded provider input with explicit omission and truncation facts. */
export interface AutoReviewContext {
  readonly transcript: string
  readonly tools: string
  readonly transcriptEntriesOmitted: number
  readonly toolEntriesOmitted: number
  readonly entriesTruncated: number
  /** Actual retained user evidence, never inferred from transcript labels. */
  readonly hasTrustedUserEvidence?: boolean
  readonly sensitiveValuesRedacted?: number
}

/** Local minimum risk; unsupported actions remain owned by human approval. */
export type AutoReviewActionPolicy =
  | { readonly riskFloor: 'low' | 'medium' }
  | { readonly humanReason: string }

const REDACTED = '[REDACTED]'
const SENSITIVE_FIELD = /^(?:auth|authentication|authorization|proxyauthorization|cookie|setcookie|access|refresh)$|(?:password|passwd|passphrase|secret|secretkey|token|apikey|privatekey|credentials?)$/iu
const SENSITIVE_PATH = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.(?:ssh|aws|dsh|codex|git|agents|npmrc|pypirc|netrc|bashrc|zshrc)|credentials?(?:\.[^/]*)?|auth\.json|[^/]*\.key|[^/]*\.pem|keychains?)(?:\/|$)/iu
const SENSITIVE_WRITE_PATH = /(?:^|\/)(?:\.(?:claude|config|github|vscode|idea|mcp\.json|profile|bash_profile|zprofile|zshenv)|(?:AGENTS|CLAUDE|GEMINI|SKILL)\.md|copilot-instructions\.md|cordis(?:\.patch)?\.ya?ml)(?:\/|$)/iu

/** Best-effort redaction for text that might be included in a remote review. */
export function redactAutoReviewText(text: string): { readonly text: string; readonly redactions: number } {
  let redactions = 0
  const replace = (_value: string): string => { redactions++; return REDACTED }
  const redacted = text
    // Header values can contain several cookies with opaque names and values.
    .replace(/((?<![A-Za-z0-9_\-])(?:set[\-_]?)?cookie[ \t]*:[ \t]*)[^\r\n]*/giu,
      (_value, prefix: string) => { redactions++; return `${prefix}${REDACTED}` })
    .replace(/-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----[\s\S]*?-----END (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----/gu, replace)
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.\-]+/giu, replace)
    .replace(/\b(?:sk-[A-Za-z0-9_\-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|AKIA[A-Z0-9]{16})\b/gu, replace)
    .replace(/\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/gu, replace)
    .replace(/((?<![A-Za-z0-9_\-])"?(?:[A-Za-z0-9_\-]*(?:password|passwd|passphrase|secret|token|api[_\-]?key)|auth|authentication|authorization|(?:set[\-_]?)?cookie|access|refresh)"?\s*[=:]\s*)(?:"(?:[^"\\]|\\.)*"|'[^']*'|[^\s,;&}]+)/giu,
      (_value, prefix: string) => { redactions++; return `${prefix}${REDACTED}` })
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/giu,
      (_value, prefix: string) => { redactions++; return `${prefix}${REDACTED}@` })
  return { text: redacted, redactions }
}

/** Redact nested argument fields without changing the original exact action. */
export function redactAutoReviewValue(value: unknown): { readonly value: unknown; readonly redactions: number } {
  let redactions = 0
  let entries = 0
  const seen = new WeakSet<object>()
  const visit = (entry: unknown, depth: number): unknown => {
    if (++entries > 10_000 || depth > 32) { redactions++; return REDACTED }
    if (typeof entry === 'string') {
      const result = redactAutoReviewText(entry)
      redactions += result.redactions
      return result.text
    }
    if (entry !== null && typeof entry === 'object') {
      if (seen.has(entry)) { redactions++; return REDACTED }
      seen.add(entry)
      if (Array.isArray(entry)) return entry.map(child => visit(child, depth + 1))
      return Object.fromEntries(Object.entries(entry).map(([key, child]) => {
        if (SENSITIVE_FIELD.test(key.replace(/[^a-z]/giu, ''))) { redactions++; return [key, REDACTED] }
        return [key, visit(child, depth + 1)]
      }))
    }
    return entry
  }
  const result = visit(value, 0)
  return { value: result, redactions }
}

/** Conservative tool/target check independent of model-authored risk labels. */
export function assessAutoReviewActionPolicy(action: AutoReviewAction): AutoReviewActionPolicy {
  const human = (humanReason: string): AutoReviewActionPolicy => ({ humanReason })
  try {
    if (Buffer.byteLength(JSON.stringify(action), 'utf8') > TOOL_BUDGET) return human('The exact action exceeds the local review input limit.')
  } catch { return human('The action cannot be serialized safely.') }
  if (redactAutoReviewValue(action.arguments).redactions > 0) return human('The action contains potentially sensitive data.')
  if (!record(action.arguments) || action.cwd === undefined || !isAbsolute(action.cwd)) return human('The action or workspace cannot be resolved locally.')
  const args = action.arguments
  const schemas: Record<string, readonly string[]> = {
    read: ['file_path', 'offset', 'limit'],
    read_image: ['file_path'],
    write: ['file_path', 'content'],
    edit: ['file_path', 'old_string', 'new_string', 'replace_all'],
    str_replace_editor: ['command', 'path', 'file_text', 'insert_line', 'new_str', 'old_str', 'view_range'],
  }
  const fields = Object.hasOwn(schemas, action.toolName) ? schemas[action.toolName] : undefined
  if (fields === undefined || Object.keys(args).some(key => !fields.includes(key))) return human('This tool or argument schema has no local automatic-review policy.')
  for (const [key, value] of Object.entries(args)) {
    if (['offset', 'limit', 'insert_line'].includes(key)) {
      if (value !== null && !(typeof value === 'number' && Number.isSafeInteger(value))) return human('An argument has an unrecognized type.')
    } else if (key === 'view_range') {
      if (value !== null && !(Array.isArray(value) && value.length === 2 && value.every(Number.isSafeInteger))) return human('An argument has an unrecognized type.')
    } else if (key === 'replace_all') {
      if (typeof value !== 'boolean') return human('An argument has an unrecognized type.')
    } else if (typeof value !== 'string' && !(['file_text', 'new_str', 'old_str'].includes(key) && value === null)) {
      return human('An argument has an unrecognized type.')
    }
  }
  const required = action.toolName === 'write' ? ['content'] : action.toolName === 'edit' ? ['old_string', 'new_string'] : []
  if (required.some(key => typeof args[key] !== 'string')) return human('Required tool arguments are missing.')
  const writes = action.toolName === 'write' || action.toolName === 'edit'
    || action.toolName === 'str_replace_editor' && args['command'] !== 'view'
  const target = args['file_path'] ?? args['path']
  if (typeof target !== 'string' || target.trim().length === 0 || /[\x00-\x1f\\~$%]/u.test(target)) return human('The action target is ambiguous.')
  const path = resolve(action.cwd, target)
  const fromWorkspace = relative(action.cwd, path)
  if (fromWorkspace === '..' || fromWorkspace.startsWith(`..${sep}`) || isAbsolute(fromWorkspace)) return human('The action targets a path outside the session workspace.')
  if (SENSITIVE_PATH.test(path.replaceAll(sep, '/')) || writes && SENSITIVE_WRITE_PATH.test(path.replaceAll(sep, '/'))) {
    return human('The action targets credentials, permissions, or persistent agent configuration.')
  }
  if (action.toolName === 'str_replace_editor' && !['view', 'create', 'str_replace', 'insert'].includes(String(args['command']))) return human('The editor operation is not recognized.')
  if (action.toolName === 'str_replace_editor' && (args['command'] === 'create' && typeof args['file_text'] !== 'string'
    || args['command'] === 'str_replace' && typeof args['old_str'] !== 'string'
    || args['command'] === 'insert' && (typeof args['new_str'] !== 'string' || !Number.isSafeInteger(args['insert_line'])))) return human('Required editor arguments are missing.')
  return { riskFloor: writes ? 'medium' : 'low' }
}

/** Check local filesystem metadata; never read file contents or follow an escape. */
export async function resolveAutoReviewLocalPolicy(action: AutoReviewAction): Promise<AutoReviewActionPolicy> {
  const policy = assessAutoReviewActionPolicy(action)
  if ('humanReason' in policy) return policy
  const args = action.arguments as Record<string, unknown>
  const target = resolve(action.cwd!, String(args['file_path'] ?? args['path'] ?? '.'))
  try {
    const workspace = await realpath(action.cwd!)
    let actualTarget: string
    try { actualTarget = await realpath(target) } catch (error: unknown) {
      if (policy.riskFloor !== 'medium' || !record(error) || error['code'] !== 'ENOENT') throw error
      // Only a genuinely absent output may use an existing canonical parent.
      // A dangling symlink must not become an automatically approved write.
      try { await lstat(target); return { humanReason: 'The target cannot be resolved safely.' } } catch (missing: unknown) {
        if (!record(missing) || missing['code'] !== 'ENOENT') throw missing
      }
      actualTarget = join(await realpath(dirname(target)), basename(target))
    }
    const fromWorkspace = relative(workspace, actualTarget)
    if (fromWorkspace === '..' || fromWorkspace.startsWith(`..${sep}`) || isAbsolute(fromWorkspace)) {
      return { humanReason: 'The canonical target or output parent escapes the session workspace.' }
    }
    if (SENSITIVE_PATH.test(actualTarget.replaceAll(sep, '/'))
      || policy.riskFloor === 'medium' && SENSITIVE_WRITE_PATH.test(actualTarget.replaceAll(sep, '/'))) {
      return { humanReason: 'The canonical target is security-sensitive.' }
    }
    return policy
  } catch {
    return { humanReason: 'Local filesystem metadata is unavailable. The host must approve this action.' }
  }
}

/** One recent structured denial available to `/approve`. */
export interface AutoReviewDenial {
  readonly id: string
  readonly fingerprint: string
  readonly toolName: string
  readonly rationale: string
}

interface RenderedEntry {
  readonly index: number
  readonly trustedUser: boolean
  readonly text: string
  readonly truncated: boolean
  readonly redactions: number
}

interface ReviewTurnState {
  turn: number
  consecutiveDenials: number
  decisions: boolean[]
  timedOutFingerprints: Set<string>
  recentDenials: AutoReviewDenial[]
  armedFingerprint?: string
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (record(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new TypeError('Auto-review action contains a non-JSON value')
  return encoded
}

/** Resolve one exact, unambiguous tool call; all other requests stay human-owned. */
export function resolveAutoReviewAction(request: ApprovalRequestEvent): AutoReviewAction | undefined {
  if (request.callId === undefined) return undefined
  const calls = request.agent.session.snapshotEvents().filter(event => event.type === 'tool/call' && event.data.callId === request.callId)
  if (calls.length !== 1) return undefined
  const call = calls[0]!
  if (call.type !== 'tool/call' || call.data.name !== request.toolName) return undefined
  let args: unknown
  try { args = JSON.parse(call.data.arguments) } catch { return undefined }
  const cwd = request.agent.session.header.cwd
  const envelope = {
    toolName: request.toolName,
    arguments: args,
    ...cwd === undefined ? {} : { cwd },
  }
  return Object.freeze({
    toolName: request.toolName,
    callId: request.callId,
    turn: call.data.turn,
    arguments: args,
    ...cwd === undefined ? {} : { cwd },
    ...request.reason === undefined ? {} : { reason: request.reason },
    fingerprint: createHash('sha256').update(canonicalJson(envelope)).digest('hex'),
  })
}

function utf8Size(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

function truncateUtf8(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (utf8Size(text) <= maxBytes) return { text, truncated: false }
  const chars = Array.from(text)
  let low = 0
  let high = chars.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (utf8Size(chars.slice(0, middle).join('')) <= maxBytes - 3) low = middle
    else high = middle - 1
  }
  return { text: `${chars.slice(0, low).join('')}…`, truncated: true }
}

function renderNarrativeBlock(block: ContentBlock): string | undefined {
  switch (block.type) {
    case 'text': return block.text
    case 'image': return '[image attachment]'
    case 'reasoning':
    case 'tool-call': return undefined
    default: return undefined
  }
}

function renderToolBlock(block: ContentBlock): string | undefined {
  switch (block.type) {
    case 'tool-call': return `call ${block.name} ${block.arguments}`
    case 'text':
    case 'image':
    case 'reasoning': return undefined
    default: return undefined
  }
}

function narrativeLabel(message: Message): string {
  if (message.source.kind === 'user') return 'trusted-user'
  if (message.source.kind === 'model') return 'assistant'
  return 'untrusted-context'
}

function renderedEntries(messages: readonly Message[], tool: boolean): RenderedEntry[] {
  const budget = tool ? TOOL_ENTRY_BUDGET : MESSAGE_ENTRY_BUDGET
  return messages.flatMap((message, index) => {
    const content = message.role === 'tool'
      ? tool ? `result ${String(message.toolCallId)}${message.isError ? ' (error)' : ''} ${message.content.map(renderNarrativeBlock).filter(Boolean).join('\n')}` : ''
      : message.content
        .map(tool ? renderToolBlock : renderNarrativeBlock)
        .filter((value): value is string => value !== undefined && value.length > 0)
        .join('\n')
    if (content.length === 0) return []
    const redacted = redactAutoReviewText(content)
    const bounded = truncateUtf8(`[${tool ? 'tool' : narrativeLabel(message)}]\n${redacted.text}`, budget)
    return [{ index, trustedUser: !tool && message.source.kind === 'user', redactions: redacted.redactions, ...bounded }]
  })
}

function takeWithin(entries: readonly RenderedEntry[], budget: number): RenderedEntry[] {
  const selected: RenderedEntry[] = []
  let used = 0
  for (const entry of entries) {
    const size = utf8Size(entry.text)
    if (used + size > budget) continue
    selected.push(entry)
    used += size
  }
  return selected
}

function selectNarrative(entries: readonly RenderedEntry[]): RenderedEntry[] {
  const users = entries.filter(entry => entry.trustedUser)
  const selected = new Map<number, RenderedEntry>()
  let used = 0
  const add = (entry: RenderedEntry): void => {
    if (selected.has(entry.index)) return
    const size = utf8Size(entry.text)
    if (used + size > TRANSCRIPT_BUDGET) return
    selected.set(entry.index, entry)
    used += size
  }
  if (users.reduce((sum, entry) => sum + utf8Size(entry.text), 0) <= TRANSCRIPT_BUDGET) users.forEach(add)
  else {
    if (users[0] !== undefined) add(users[0])
    if (users.at(-1) !== undefined) add(users.at(-1)!)
    users.slice(1, -1).reverse().forEach(add)
  }
  entries.filter(entry => !entry.trustedUser).slice(-NON_USER_ENTRY_LIMIT).reverse().forEach(add)
  return [...selected.values()].sort((left, right) => left.index - right.index)
}

/** Build the official-style bounded review context from the retained session surface. */
export function buildAutoReviewContext(agent: Agent): AutoReviewContext {
  const messages = agent.session.deriveMessages()
  const narrative = renderedEntries(messages, false)
  const selectedNarrative = selectNarrative(narrative)
  const historicalTools = takeWithin(renderedEntries(messages, true).reverse(), TOOL_BUDGET).reverse()
  const redactedDirectory = redactAutoReviewValue(agent.session.requestHeader()?.tools ?? [])
  const directory = truncateUtf8(`[available-tools]\n${JSON.stringify(redactedDirectory.value)}`, TOOL_BUDGET)
  const remaining = Math.max(0, TOOL_BUDGET - utf8Size(directory.text))
  const selectedTools = takeWithin(historicalTools.reverse(), remaining).reverse()
  const transcriptEntriesOmitted = narrative.length - selectedNarrative.length
  const toolEntriesOmitted = renderedEntries(messages, true).length - selectedTools.length
  const transcriptPrefix = transcriptEntriesOmitted > 0 ? `[${transcriptEntriesOmitted} transcript entries omitted]\n` : ''
  const toolPrefix = toolEntriesOmitted > 0 ? `[${toolEntriesOmitted} tool entries omitted]\n` : ''
  const transcript = truncateUtf8(`${transcriptPrefix}${selectedNarrative.map(entry => entry.text).join('\n\n')}`, TRANSCRIPT_BUDGET)
  const tools = truncateUtf8(`${toolPrefix}${[directory.text, ...selectedTools.map(entry => entry.text)].join('\n\n')}`, TOOL_BUDGET)
  const entriesTruncated = [...narrative, ...renderedEntries(messages, true)].filter(entry => entry.truncated).length
    + (directory.truncated ? 1 : 0) + (transcript.truncated ? 1 : 0) + (tools.truncated ? 1 : 0)
  return Object.freeze({
    transcript: transcript.text,
    tools: tools.text,
    transcriptEntriesOmitted,
    toolEntriesOmitted,
    entriesTruncated,
    hasTrustedUserEvidence: !transcript.truncated && selectedNarrative.some(entry => entry.trustedUser)
      && selectedNarrative.filter(entry => entry.trustedUser).length === narrative.filter(entry => entry.trustedUser).length
      && selectedNarrative.filter(entry => entry.trustedUser).every(entry => !entry.truncated && entry.redactions === 0),
    sensitiveValuesRedacted: [...selectedNarrative, ...selectedTools].reduce((count, entry) => count + entry.redactions, redactedDirectory.redactions),
  })
}

/** In-memory turn state matching Codex denial, timeout, and exact retry semantics. */
export class AutoReviewState {
  private readonly sessions = new WeakMap<Agent, ReviewTurnState>()

  constructor(private readonly createId: () => string = randomUUID) {}

  private state(agent: Agent, turn: number): ReviewTurnState {
    const current = this.sessions.get(agent)
    if (current !== undefined && current.turn === turn) return current
    const created: ReviewTurnState = {
      turn,
      consecutiveDenials: 0,
      decisions: [],
      timedOutFingerprints: new Set(),
      recentDenials: current?.recentDenials ?? [],
      ...current?.armedFingerprint === undefined ? {} : { armedFingerprint: current.armedFingerprint },
    }
    this.sessions.set(agent, created)
    return created
  }

  /** Record an allow/deny assessment and retain a bounded denial descriptor. */
  recordDecision(agent: Agent, action: AutoReviewAction, denied: boolean, rationale: string): AutoReviewDenial | undefined {
    const state = this.state(agent, action.turn)
    state.consecutiveDenials = denied ? state.consecutiveDenials + 1 : 0
    state.decisions.push(denied)
    if (state.decisions.length > AUTO_REVIEW_DECISION_WINDOW) state.decisions.shift()
    if (!denied) return undefined
    const denial = Object.freeze({ id: this.createId(), fingerprint: action.fingerprint, toolName: action.toolName, rationale })
    state.recentDenials.push(denial)
    if (state.recentDenials.length > AUTO_REVIEW_RECENT_DENIAL_LIMIT) state.recentDenials.shift()
    return denial
  }

  /** Whether the current turn must return to human review. */
  breakerOpen(agent: Agent, turn: number): boolean {
    const state = this.state(agent, turn)
    return state.consecutiveDenials >= AUTO_REVIEW_MAX_CONSECUTIVE_DENIALS
      || state.decisions.filter(Boolean).length >= AUTO_REVIEW_MAX_WINDOW_DENIALS
  }

  /** Mark a timeout; false means the same exact action already consumed its one automatic retry. */
  allowTimeoutRetry(agent: Agent, action: AutoReviewAction): boolean {
    const state = this.state(agent, action.turn)
    if (state.timedOutFingerprints.has(action.fingerprint)) return false
    state.timedOutFingerprints.add(action.fingerprint)
    return true
  }

  /** List recent denials for the active turn, newest first. */
  denials(agent: Agent): readonly AutoReviewDenial[] {
    const state = this.sessions.get(agent)
    return Object.freeze([...(state?.recentDenials ?? [])].reverse())
  }

  /** Arm one exact denial for the next approval request. */
  arm(agent: Agent, denialId: string): AutoReviewDenial | undefined {
    const state = this.sessions.get(agent)
    const denial = state?.recentDenials.find(candidate => candidate.id === denialId)
    if (state === undefined || denial === undefined) return undefined
    state.armedFingerprint = denial.fingerprint
    return denial
  }

  /** Consume the one-shot override at the next approval boundary. */
  consume(agent: Agent, action: AutoReviewAction): 'matched' | 'mismatched' | 'none' {
    const state = this.state(agent, action.turn)
    if (state.armedFingerprint === undefined) return 'none'
    const matched = state.armedFingerprint === action.fingerprint
    delete state.armedFingerprint
    return matched ? 'matched' : 'mismatched'
  }
}
