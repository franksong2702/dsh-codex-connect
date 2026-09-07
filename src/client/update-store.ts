/** Browser-owned cache and observable state for the global update reminder. */

import {
  parseOpenAICodexVersion,
  parseOpenAICodexUpdateResult,
} from '../update.ts'
import type { OpenAICodexDshCompatibilityAdvice, OpenAICodexUpdateHighlight, OpenAICodexUpdateResult } from '../update.ts'
import { OPENAI_CODEX_RUNTIME_PATH, OPENAI_CODEX_UPDATE_PATH } from '../update-paths.ts'
import { requestJson } from './request-json.ts'

export const OPENAI_CODEX_REPOSITORY_URL = 'https://github.com/franksong2702/dsh-codex-connect'
export const OPENAI_CODEX_UPDATE_CACHE_KEY = 'dsh-codex-connect:update-check'
export const OPENAI_CODEX_UPDATE_DISMISSED_KEY = 'dsh-codex-connect:update-dismissed'
export const OPENAI_CODEX_UPDATE_CACHE_TTL_MS = 24 * 60 * 60 * 1_000
/** Unconfirmed compatibility is rechecked while the page remains open. */
export const OPENAI_CODEX_COMPATIBILITY_RECHECK_MS = 5 * 60 * 1_000

export type OpenAICodexUpdateSnapshot = {
  status: 'idle' | 'checking' | OpenAICodexUpdateResult['status']
  currentVersion: string
  checkedAt?: number
  currentDshVersion?: string
  latestVersion?: string
  versionsBehind?: number
  highlights?: OpenAICodexUpdateHighlight[]
  releaseUrl?: string
  releaseName?: string
  releaseNotes?: string
  publishedAt?: string
  compatibility?: OpenAICodexDshCompatibilityAdvice
  dismissedNotice?: string
}

interface CachedUpdate {
  checkedAt: number
  result: unknown
}

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function resultSnapshot(result: OpenAICodexUpdateResult, dismissedNotice?: string): OpenAICodexUpdateSnapshot {
  return {
    status: result.status,
    currentVersion: result.currentVersion,
    ...result.currentDshVersion === undefined ? {} : { currentDshVersion: result.currentDshVersion },
    ...result.status === 'up-to-date' || result.status === 'update-available'
      ? { latestVersion: result.latestVersion, compatibility: result.compatibility }
      : {},
    ...result.status === 'update-available' && result.versionsBehind !== undefined
      ? { versionsBehind: result.versionsBehind }
      : {},
    ...result.status === 'update-available' ? { highlights: result.highlights } : {},
    ...result.status === 'update-available'
      ? {
          releaseUrl: result.releaseUrl,
          ...result.releaseName === undefined ? {} : { releaseName: result.releaseName },
          ...result.releaseNotes === undefined ? {} : { releaseNotes: result.releaseNotes },
          ...result.publishedAt === undefined ? {} : { publishedAt: result.publishedAt },
        }
      : {},
    ...dismissedNotice === undefined ? {} : { dismissedNotice },
  }
}

/** Observable browser state shared by the global overlay and settings card. */
export class OpenAICodexUpdateStore {
  private snapshot: OpenAICodexUpdateSnapshot
  private readonly listeners = new Set<() => void>()
  private request: AbortController | undefined
  private disposed = false
  private recheckTimer: ReturnType<typeof setTimeout> | undefined

  constructor(readonly currentVersion: string) {
    this.snapshot = { status: 'idle', currentVersion }
  }

  getSnapshot = (): OpenAICodexUpdateSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private setSnapshot(next: OpenAICodexUpdateSnapshot): void {
    if (this.disposed) return
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  private dismissedNotice(): string | undefined {
    try {
      const value = storage()?.getItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY)
      return value === null || value === '' ? undefined : value
    } catch {
      return undefined
    }
  }

  private readCached(): { result: OpenAICodexUpdateResult; checkedAt: number } | undefined {
    try {
      const raw = storage()?.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)
      if (raw === null || raw === undefined) return undefined
      const cached = JSON.parse(raw) as CachedUpdate
      if (!Number.isSafeInteger(cached.checkedAt) || cached.checkedAt > Date.now() || Date.now() - cached.checkedAt > OPENAI_CODEX_UPDATE_CACHE_TTL_MS) return undefined
      const result = parseOpenAICodexUpdateResult(cached.result)
      // A missing verification record can change without either installed version changing.
      if (result === undefined || result.status === 'unavailable' || result.compatibility.status !== 'compatible') return undefined
      return { result, checkedAt: cached.checkedAt }
    } catch {
      return undefined
    }
  }

  private writeCached(result: OpenAICodexUpdateResult, checkedAt: number): void {
    try {
      if (result.status === 'unavailable') storage()?.removeItem(OPENAI_CODEX_UPDATE_CACHE_KEY)
      else storage()?.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({ checkedAt, result }))
    } catch {
      // A blocked or full browser storage should not disable the reminder.
    }
  }

  private acceptResult(result: OpenAICodexUpdateResult): void {
    if (this.disposed) return
    const checkedAt = Date.now()
    this.writeCached(result, checkedAt)
    this.setSnapshot({ ...resultSnapshot(result, this.dismissedNotice()), checkedAt })
    if (result.status === 'unavailable' || result.compatibility.status !== 'compatible') {
      this.recheckTimer = setTimeout(() => { void this.refresh(true) }, OPENAI_CODEX_COMPATIBILITY_RECHECK_MS)
    }
  }

  /** Reuse verified results for one day; force bypasses that cache for manual checks. */
  async refresh(force = false): Promise<void> {
    if (this.disposed || this.request !== undefined) return
    clearTimeout(this.recheckTimer)
    this.recheckTimer = undefined
    const controller = new AbortController()
    this.request = controller
    let currentDshVersion: string | undefined
    this.setSnapshot({ status: 'checking', currentVersion: this.currentVersion, ...this.snapshot.dismissedNotice === undefined ? {} : { dismissedNotice: this.snapshot.dismissedNotice } })
    try {
      const { response: runtimeResponse, value: runtimeValue } = await requestJson(OPENAI_CODEX_RUNTIME_PATH, {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
      })
      const runtimeRecord = typeof runtimeValue === 'object' && runtimeValue !== null && !Array.isArray(runtimeValue)
        ? runtimeValue as Record<string, unknown>
        : undefined
      const rawCurrentDshVersion = runtimeRecord?.['currentDshVersion']
      currentDshVersion = runtimeResponse.ok
        && typeof rawCurrentDshVersion === 'string'
        && parseOpenAICodexVersion(rawCurrentDshVersion) !== undefined
        ? rawCurrentDshVersion
        : undefined
      const currentDsh = currentDshVersion === undefined ? {} : { currentDshVersion }
      if (!force) {
        const cached = this.readCached()
        if (cached !== undefined
          && cached.result.currentVersion === this.currentVersion
          && cached.result.currentDshVersion === currentDshVersion) {
          this.setSnapshot({ ...resultSnapshot(cached.result, this.dismissedNotice()), checkedAt: cached.checkedAt })
          return
        }
      }
      const { response, value } = await requestJson(OPENAI_CODEX_UPDATE_PATH, {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
      })
      const result = response.ok ? parseOpenAICodexUpdateResult(value) : undefined
      const safeResult = result ?? {
        status: 'unavailable' as const,
        currentVersion: this.currentVersion,
        ...currentDsh,
        reason: 'registry-unavailable' as const,
      }
      this.acceptResult(safeResult)
    } catch {
      if (!controller.signal.aborted && !this.disposed) {
        const unavailable: OpenAICodexUpdateResult = {
          status: 'unavailable',
          currentVersion: this.currentVersion,
          ...currentDshVersion === undefined ? {} : { currentDshVersion },
          reason: 'registry-unavailable',
        }
        this.acceptResult(unavailable)
      }
    } finally {
      if (this.request === controller) this.request = undefined
    }
  }

  dismiss(notice: string): void {
    try {
      storage()?.setItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY, notice)
    } catch {
      // Dismissal remains effective for this mounted store even if storage is blocked.
    }
    this.setSnapshot({ ...this.snapshot, dismissedNotice: notice })
  }

  dispose(): void {
    this.disposed = true
    clearTimeout(this.recheckTimer)
    this.request?.abort()
    this.request = undefined
    this.listeners.clear()
  }
}
