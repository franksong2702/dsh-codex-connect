/** Bounded explicit speed choices; no entitlement cache or credential material. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionStore } from '@deepseek-ai/dsh-session'
import { FastModeRegistry, isFastModeSessionId, OPENAI_CODEX_FAST_MODE_MAX_SESSIONS } from './fast-mode.ts'
import { supportsOpenAICodexUltrafast } from './speed-mode-contract.ts'
import type { OpenAICodexSpeedMode, ConversationSpeedState } from './speed-mode-contract.ts'

export interface ConversationSpeedScope {
  readonly workspace: string
  readonly accountKey: string | undefined
  readonly provider: string
  readonly model: string
}
interface Control {
  readonly generation: string
  revision: number
  mode: OpenAICodexSpeedMode
  expired?: boolean
  readonly scope: ConversationSpeedScope
  readonly selectionAvailable: boolean
}
export interface CapturedConversationSpeed {
  readonly mode: OpenAICodexSpeedMode
  readonly generation?: string
  readonly scope?: ConversationSpeedScope
  expired?: boolean
}
const sameScope = (a: ConversationSpeedScope, b: ConversationSpeedScope): boolean =>
  a.workspace === b.workspace && a.accountKey === b.accountKey && a.provider === b.provider && a.model === b.model

function validScope(scope: ConversationSpeedScope): void {
  if (scope.provider !== 'openai-codex' || typeof scope.workspace !== 'string' || !scope.workspace.trim() || scope.workspace.length > 256
    || typeof scope.model !== 'string' || !scope.model.trim() || scope.model.length > 256
    || (scope.accountKey !== undefined && !/^acct_[A-Za-z0-9_-]{43}$/u.test(scope.accountKey))) throw new TypeError('Invalid speed scope')
}

/** Legacy boolean Fast commands remain explicit Fast/Standard commands. */
export class ConversationSpeedRegistry extends FastModeRegistry {
  /** Separate plugin instances cannot reuse each other's choices or observations. */
  readonly workspace = randomUUID()
  private readonly controls = new Map<string, Control>()
  private readonly startupDefaults = new Map<string, { workspace: string; accountKey?: string | undefined; ready: boolean }>()
  private readonly controlLimit: number
  private accountEpoch = 0
  constructor(limit = OPENAI_CODEX_FAST_MODE_MAX_SESSIONS, private readonly selectionKey?: (sessionId: string) => string | undefined) {
    super(limit)
    this.controlLimit = limit
  }
  override set(sessionId: unknown, enabled: boolean): void {
    super.set(sessionId, enabled)
    this.startupDefaults.delete(sessionId as string)
    this.controls.delete(sessionId as string)
  }
  override delete(sessionId: unknown): void {
    super.delete(sessionId)
    this.startupDefaults.delete(sessionId as string)
    if (typeof sessionId === 'string') this.controls.delete(sessionId)
  }
  override clear(): void { super.clear(); this.controls.clear(); this.startupDefaults.clear() }

  /** Login/logout/account commands invalidate paid choices, including an A/B/A round trip. */
  invalidateAccountSelections(): void { this.accountEpoch++; this.controls.clear(); this.startupDefaults.clear() }

  /** A committed Host model choice retires the old control, preserving legacy Fast. */
  invalidateModelSelection(sessionId: unknown): void {
    if (isFastModeSessionId(sessionId)) { this.controls.delete(sessionId); this.startupDefaults.delete(sessionId) }
  }

  workspaceFor(sessionId: unknown): string {
    const key = typeof sessionId === 'string' ? this.selectionKey?.(sessionId) : undefined
    const workspace = this.accountEpoch === 0 ? this.workspace : this.workspace + ':account-' + this.accountEpoch
    return this.selectionKey === undefined ? workspace : workspace + ':' + (key ?? 'selection-unavailable')
  }

  readSpeed(sessionId: string, scope: ConversationSpeedScope): ConversationSpeedState {
    if (!isFastModeSessionId(sessionId)) throw new TypeError('Invalid speed session')
    validScope(scope)
    let control = this.controls.get(sessionId)
    if (control === undefined || control.expired || !sameScope(control.scope, scope)) {
      control = { generation: randomUUID(), revision: 0, mode: super.isEnabled(sessionId) ? 'fast' : 'standard', scope: { ...scope },
        selectionAvailable: this.selectionKey === undefined || this.selectionKey(sessionId) !== undefined }
    } else if (control.mode !== 'ultrafast') control.mode = super.isEnabled(sessionId) ? 'fast' : 'standard'
    this.controls.delete(sessionId)
    while (this.controls.size >= this.controlLimit) this.controls.delete(this.controls.keys().next().value!)
    this.controls.set(sessionId, control)
    const pending = this.startupDefaults.get(sessionId)
    if (pending?.ready && pending.accountKey !== undefined) {
      this.startupDefaults.delete(sessionId)
      if (pending.workspace === scope.workspace && pending.workspace === this.workspaceFor(sessionId)
        && pending.accountKey === scope.accountKey && supportsOpenAICodexUltrafast(scope.provider, scope.model)) {
        return this.selectSpeed(sessionId, scope, control.generation, control.revision, 'ultrafast')
      }
    }
    return this.snapshot(control)
  }

  /** Capture the startup opt-in before model routing exists; async reads cannot overwrite newer commands. */
  async seedUltrafastDefault(sessionId: string, resolveAccountKey: () => Promise<string | undefined>, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    if (!isFastModeSessionId(sessionId)) throw new TypeError('Invalid speed session')
    if (this.controls.has(sessionId) || super.isEnabled(sessionId)) return
    const pending: { workspace: string; accountKey?: string | undefined; ready: boolean } = { workspace: this.workspaceFor(sessionId), ready: false }
    while (this.startupDefaults.size >= this.controlLimit) this.startupDefaults.delete(this.startupDefaults.keys().next().value!)
    this.startupDefaults.set(sessionId, pending)
    try {
      const accountKey = await resolveAccountKey()
      signal?.throwIfAborted()
      if (this.startupDefaults.get(sessionId) !== pending || pending.workspace !== this.workspaceFor(sessionId)) return
      pending.accountKey = accountKey
      pending.ready = true
    } catch (error) {
      const current = this.startupDefaults.get(sessionId) === pending
      if (current) this.startupDefaults.delete(sessionId)
      if (!current && signal?.aborted !== true) return
      throw error
    }
  }

  /** Resolve the one startup intent against the Host's admitted route, before request preparation. */
  applyStartupDefault(sessionId: string, route: { provider: string; model: string }): void {
    const pending = this.startupDefaults.get(sessionId)
    if (pending === undefined || !pending.ready) return
    if (pending.workspace !== this.workspaceFor(sessionId) || !supportsOpenAICodexUltrafast(route.provider, route.model)) {
      this.startupDefaults.delete(sessionId)
      return
    }
    // Keep missing-auth failures sticky until an explicit account/model/manual command retires the intent.
    if (pending.accountKey === undefined) throw new TypeError('ULTRAFAST_SIGN_IN_REQUIRED')
    this.readSpeed(sessionId, { ...route, workspace: pending.workspace, accountKey: pending.accountKey })
  }

  selectSpeed(sessionId: string, scope: ConversationSpeedScope, generation: string, revision: number, mode: OpenAICodexSpeedMode): ConversationSpeedState {
    validScope(scope)
    const control = this.controls.get(sessionId)
    if (control === undefined || !sameScope(control.scope, scope) || control.generation !== generation || control.revision !== revision) {
      throw new TypeError('SPEED_SELECTION_STALE')
    }
    if (mode !== 'standard' && mode !== 'fast' && mode !== 'ultrafast') throw new TypeError('Invalid speed mode')
    if (mode === 'ultrafast') {
      if (!supportsOpenAICodexUltrafast(scope.provider, scope.model)) throw new TypeError('ULTRAFAST_MODEL_UNSUPPORTED')
      if (scope.accountKey === undefined) throw new TypeError('ULTRAFAST_SIGN_IN_REQUIRED')
      if (this.selectionKey !== undefined && this.selectionKey(sessionId) === undefined) throw new TypeError('ULTRAFAST_SELECTION_UNAVAILABLE')
      if (this.selectionKey !== undefined && scope.workspace !== this.workspaceFor(sessionId)) throw new TypeError('SPEED_SELECTION_STALE')
    }
    this.startupDefaults.delete(sessionId)
    super.set(sessionId, mode === 'fast')
    control.mode = mode
    control.revision++
    return this.snapshot(control)
  }

  /** Legacy boolean clients cannot represent a selected or pending startup Ultrafast preference. */
  isUltrafastSelected(sessionId: unknown): boolean {
    return typeof sessionId === 'string' && (this.controls.get(sessionId)?.mode === 'ultrafast' || this.startupDefaults.has(sessionId))
  }

  captureSpeed(sessionId: unknown): CapturedConversationSpeed {
    if (!isFastModeSessionId(sessionId)) return { mode: 'standard' }
    if (super.isEnabled(sessionId)) return { mode: 'fast' }
    const control = this.controls.get(sessionId)
    return control?.mode === 'ultrafast'
      ? { mode: 'ultrafast', generation: control.generation, scope: { ...control.scope }, expired: control.expired === true }
      : { mode: 'standard' }
  }

  confirmCapturedSpeed(sessionId: unknown, captured: CapturedConversationSpeed, scope: ConversationSpeedScope): OpenAICodexSpeedMode {
    validScope(scope)
    if (captured.mode !== 'ultrafast') return captured.mode
    if (captured.expired || captured.scope === undefined || !sameScope(captured.scope, scope)
      || !supportsOpenAICodexUltrafast(scope.provider, scope.model)) {
      captured.expired = true
      if (typeof sessionId === 'string') {
        const current = this.controls.get(sessionId)
        if (current !== undefined && current.generation === captured.generation && !current.expired) { current.expired = true; current.revision++ }
      }
      throw new TypeError('ULTRAFAST_SELECTION_EXPIRED')
    }
    return 'ultrafast'
  }

  requestSpeed(sessionId: unknown, scope: ConversationSpeedScope): OpenAICodexSpeedMode {
    if (!isFastModeSessionId(sessionId)) return 'standard'
    validScope(scope)
    if (super.isEnabled(sessionId)) return 'fast'
    const control = this.controls.get(sessionId)
    if (control?.mode !== 'ultrafast') return 'standard'
    if (control.expired || !sameScope(control.scope, scope) || !supportsOpenAICodexUltrafast(scope.provider, scope.model)) {
      // Keep the failure sticky until an explicit control reread/choice. A Host
      // retry must not turn the same expired request into a Standard dispatch.
      if (!control.expired) { control.expired = true; control.revision++ }
      throw new TypeError('ULTRAFAST_SELECTION_EXPIRED')
    }
    return 'ultrafast'
  }

  private snapshot(control: Control): ConversationSpeedState {
    return { generation: control.generation, revision: control.revision, mode: control.mode, model: control.scope.model,
      modelSupported: supportsOpenAICodexUltrafast(control.scope.provider, control.scope.model), eligibility: 'unknown',
      hasAccount: control.scope.accountKey !== undefined, selectionAvailable: control.selectionAvailable }
  }
}

/** Read only the Host's existing selection revision, including an away/back change. */
export function createConversationSpeedRegistry(ctx: Context): ConversationSpeedRegistry {
  const selections = new WeakMap<Session, { generation: string; revision: number }>()
  const liveSession = (sessionId: string): Session | undefined => {
    // Some supported Host declarations expose only the minimal ISessions surface.
    const sessions = ctx.get('sessions') as Partial<SessionStore> | undefined
    return sessions?.get?.(SessionId(sessionId))
  }
  const entry = (session: Session) => {
    let value = selections.get(session)
    if (value === undefined) { value = { generation: randomUUID(), revision: 0 }; selections.set(session, value) }
    return value
  }
  const registry = new ConversationSpeedRegistry(OPENAI_CODEX_FAST_MODE_MAX_SESSIONS, sessionId => {
    // Missing live lookup fails closed rather than enabling a paid choice.
    const session = liveSession(sessionId)
    if (session === undefined) return undefined
    const selection = entry(session)
    return selection.generation + ':' + selection.revision
  })
  // The committed Host lifecycle owns invalidation, never a view unmount.
  // Bump the scope before retiring the control so captured old requests stay guarded.
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'model/selection' || liveSession(session.id) !== session) return
    entry(session).revision++
    registry.invalidateModelSelection(session.id)
  }, { global: true })
  return registry
}
