/** Browser-owned cache and observable state for the global update reminder. */

import {
  parseOpenAICodexUpdateResult,
} from '../update.ts'
import type { OpenAICodexUpdateHighlight, OpenAICodexUpdateResult } from '../update.ts'
import { OPENAI_CODEX_UPDATE_PATH } from '../update-paths.ts'

export const OPENAI_CODEX_UPGRADE_COMMAND = 'dsh plugin --profile web update dsh-codex-connect'
export const OPENAI_CODEX_UPDATE_CACHE_KEY = 'dsh-codex-connect:update-check'
export const OPENAI_CODEX_UPDATE_DISMISSED_KEY = 'dsh-codex-connect:update-dismissed'
export const OPENAI_CODEX_UPDATE_CACHE_TTL_MS = 24 * 60 * 60 * 1_000

export type OpenAICodexUpdateSnapshot = {
  status: 'idle' | 'checking' | OpenAICodexUpdateResult['status']
  currentVersion: string
  latestVersion?: string
  versionsBehind?: number
  highlights?: OpenAICodexUpdateHighlight[]
  releaseUrl?: string
  releaseName?: string
  releaseNotes?: string
  publishedAt?: string
  dismissedVersion?: string
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

function resultSnapshot(result: OpenAICodexUpdateResult, dismissedVersion?: string): OpenAICodexUpdateSnapshot {
  return {
    status: result.status,
    currentVersion: result.currentVersion,
    ...result.status === 'up-to-date' || result.status === 'update-available'
      ? { latestVersion: result.latestVersion }
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
    ...dismissedVersion === undefined ? {} : { dismissedVersion },
  }
}

/** Observable browser state shared by the global overlay and settings card. */
export class OpenAICodexUpdateStore {
  private snapshot: OpenAICodexUpdateSnapshot
  private readonly listeners = new Set<() => void>()
  private request: AbortController | undefined
  private disposed = false

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

  private dismissedVersion(): string | undefined {
    try {
      const value = storage()?.getItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY)
      return value === null || value === '' ? undefined : value
    } catch {
      return undefined
    }
  }

  private readCached(): OpenAICodexUpdateResult | undefined {
    try {
      const raw = storage()?.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY)
      if (raw === null || raw === undefined) return undefined
      const cached = JSON.parse(raw) as CachedUpdate
      if (!Number.isSafeInteger(cached.checkedAt) || Date.now() - cached.checkedAt > OPENAI_CODEX_UPDATE_CACHE_TTL_MS) return undefined
      return parseOpenAICodexUpdateResult(cached.result)
    } catch {
      return undefined
    }
  }

  private writeCached(result: OpenAICodexUpdateResult): void {
    if (result.status === 'unavailable') return
    try {
      storage()?.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), result }))
    } catch {
      // A blocked or full browser storage should not disable the reminder.
    }
  }

  /** Check once per day by default; force=true is used by the settings button. */
  async refresh(force = false): Promise<void> {
    if (this.disposed || this.request !== undefined) return
    if (!force) {
      const cached = this.readCached()
      if (cached !== undefined) {
        this.setSnapshot(resultSnapshot(cached, this.dismissedVersion()))
        return
      }
    }
    const controller = new AbortController()
    this.request = controller
    this.setSnapshot({ status: 'checking', currentVersion: this.currentVersion, ...this.snapshot.dismissedVersion === undefined ? {} : { dismissedVersion: this.snapshot.dismissedVersion } })
    try {
      const response = await fetch(OPENAI_CODEX_UPDATE_PATH, {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
      })
      const value: unknown = await response.json().catch(() => undefined)
      const result = response.ok ? parseOpenAICodexUpdateResult(value) : undefined
      const safeResult = result ?? {
        status: 'unavailable' as const,
        currentVersion: this.currentVersion,
        reason: 'registry-unavailable' as const,
      }
      this.writeCached(safeResult)
      this.setSnapshot(resultSnapshot(safeResult, this.dismissedVersion()))
    } catch {
      if (!controller.signal.aborted && !this.disposed) {
        const unavailable: OpenAICodexUpdateResult = {
          status: 'unavailable',
          currentVersion: this.currentVersion,
          reason: 'registry-unavailable',
        }
        this.writeCached(unavailable)
        this.setSnapshot(resultSnapshot(unavailable, this.dismissedVersion()))
      }
    } finally {
      if (this.request === controller) this.request = undefined
    }
  }

  dismiss(version: string): void {
    try {
      storage()?.setItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY, version)
    } catch {
      // Dismissal remains effective for this mounted store even if storage is blocked.
    }
    this.setSnapshot({ ...this.snapshot, dismissedVersion: version })
  }

  dispose(): void {
    this.disposed = true
    this.request?.abort()
    this.request = undefined
    this.listeners.clear()
  }
}
