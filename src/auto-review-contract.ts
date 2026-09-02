/** Pure action, context, and circuit-breaker contracts for Codex Auto-review. */

import { createHash, randomUUID } from 'node:crypto'
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
    case 'tool-call':
    case 'tool-result': return undefined
    default: return undefined
  }
}

function renderToolBlock(block: ContentBlock): string | undefined {
  switch (block.type) {
    case 'tool-call': return `call ${block.name} ${block.arguments}`
    case 'tool-result': return `result ${String(block.toolCallId)} ${block.content.map(renderNarrativeBlock).filter(Boolean).join('\n')}`
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
    const content = message.content
      .map(tool ? renderToolBlock : renderNarrativeBlock)
      .filter((value): value is string => value !== undefined && value.length > 0)
      .join('\n')
    if (content.length === 0) return []
    const bounded = truncateUtf8(`[${tool ? 'tool' : narrativeLabel(message)}]\n${content}`, budget)
    return [{ index, trustedUser: !tool && message.source.kind === 'user', ...bounded }]
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
  const directory = truncateUtf8(`[available-tools]\n${JSON.stringify(agent.session.requestHeader()?.tools ?? [])}`, TOOL_BUDGET)
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
