import { describe, expect, it, vi } from 'vitest'
import type { ConfigForm, ConfigFormSnapshot, SettingsDescribeFace, SettingsMirrorSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { OpenAICodexConfigForm } from '../src/client/config-form.ts'
import { DEFAULT_OPENAI_CODEX_SETTINGS } from '../src/settings-contract.ts'

const loading: ConfigFormSnapshot<typeof DEFAULT_OPENAI_CODEX_SETTINGS> = {
  status: 'loading', value: undefined, base: undefined, user: undefined,
  revision: undefined, writable: false, mode: 'host',
}

function fixture(mode: 'host' | 'memory' | 'absent' = 'host') {
  // Explicitly simulate alpha.3's structural snapshot against the older dev SDK.
  const { mode: _legacyMode, ...withoutMode } = loading
  let formSnapshot = (mode === 'absent' ? withoutMode : { ...withoutMode, mode }) as ConfigFormSnapshot<typeof DEFAULT_OPENAI_CODEX_SETTINGS>
  let mirrorSnapshot: SettingsMirrorSnapshot = { status: 'loading', view: undefined, error: null }
  const formListeners = new Set<() => void>()
  const mirrorListeners = new Set<() => void>()
  const mutate = vi.fn(async () => true)
  const form = {
    getSnapshot: () => formSnapshot,
    subscribe: (listener: () => void) => { formListeners.add(listener); return () => { formListeners.delete(listener) } },
    mutate,
    set: vi.fn(async () => true),
    unset: vi.fn(async () => true),
  } as ConfigForm<typeof DEFAULT_OPENAI_CODEX_SETTINGS>
  const mirror = {
    getSnapshot: () => mirrorSnapshot,
    subscribe: (listener: () => void) => { mirrorListeners.add(listener); return () => { mirrorListeners.delete(listener) } },
  } as SettingsDescribeFace
  return {
    scope: new OpenAICodexConfigForm(form, mirror), mutate,
    publish(value: unknown, writable = true) {
      mirrorSnapshot = {
        status: 'ready', error: null,
        view: {
          writable, hasDocument: true,
          namespaces: [{ ns: 'llm-openai-codex', value, base: {}, user: {}, revision: 7 }],
        } as unknown as NonNullable<SettingsMirrorSnapshot['view']>,
      }
      for (const listener of mirrorListeners) listener()
    },
    rejectRead() {
      mirrorSnapshot = { status: 'unavailable', view: undefined, error: 'unavailable' }
      for (const listener of mirrorListeners) listener()
    },
    setMirrorStatus(status: SettingsMirrorSnapshot['status'], error: string | null = null) {
      mirrorSnapshot = { status, view: undefined, error }
      for (const listener of mirrorListeners) listener()
    },
    publishWithoutNamespace() {
      mirrorSnapshot = {
        status: 'ready', error: null,
        view: { writable: true, hasDocument: true, namespaces: [] } as unknown as NonNullable<SettingsMirrorSnapshot['view']>,
      }
      for (const listener of mirrorListeners) listener()
    },
    acceptNative() {
      formSnapshot = { ...formSnapshot, status: 'ready', value: DEFAULT_OPENAI_CODEX_SETTINGS, revision: 8, writable: true }
      for (const listener of formListeners) listener()
    },
  }
}

describe('Codex Connect Host configuration form', () => {
  it.each(['host', 'memory', 'absent'] as const)('preserves the version-specific mode shape (%s) through mirror fallback and native acceptance', mode => {
    const { scope, publish, acceptNative } = fixture(mode)
    publish({ ...DEFAULT_OPENAI_CODEX_SETTINGS }, false)
    const projected = scope.getSnapshot()
    expect(projected).toMatchObject({ status: 'ready', revision: 7, writable: false, base: {}, user: {} })
    expect('mode' in projected).toBe(mode !== 'absent')
    if (mode !== 'absent') expect(projected).toHaveProperty('mode', mode)
    expect(scope.getSnapshot()).toBe(projected)
    publish({ ...DEFAULT_OPENAI_CODEX_SETTINGS }, true)
    const writable = scope.getSnapshot()
    expect(writable).not.toBe(projected)
    expect(writable).toMatchObject({ revision: 7, writable: true })
    expect('mode' in writable).toBe(mode !== 'absent')
    acceptNative()
    const native = scope.getSnapshot()
    expect(native).toMatchObject({ status: 'ready', revision: 8, writable: true })
    expect('mode' in native).toBe(mode !== 'absent')
    expect(scope.getSnapshot()).toBe(native)
  })

  it('shows a valid Host section even when the generic form cannot decode its serialized schema', async () => {
    const { scope, publish, mutate, acceptNative } = fixture()
    expect(scope.getSnapshot().status).toBe('loading')
    publish({ ...DEFAULT_OPENAI_CODEX_SETTINGS })
    const accepted = scope.getSnapshot()
    expect(accepted).toMatchObject({ status: 'ready', revision: 7, writable: true })
    expect(accepted.value).toMatchObject({ enableProxy: false, searchModel: 'gpt-5.6-sol' })
    expect(scope.getSnapshot()).toBe(accepted)
    await expect(scope.mutate([{ op: 'set', path: ['enableSearch'], value: true }], 7)).resolves.toBe(true)
    expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['enableSearch'], value: true }], 7)
    acceptNative()
    expect(scope.getSnapshot()).toMatchObject({ status: 'ready', revision: 8 })
  })

  it('ends loading with unavailable when the Host section fails Codex Connect validation', () => {
    const { scope, publish } = fixture()
    publish({ ...DEFAULT_OPENAI_CODEX_SETTINGS, imageModelHint: 'bad value' })
    expect(scope.getSnapshot().status).toBe('unavailable')
  })

  it('ends loading with unavailable when the Host read fails', () => {
    const { scope, rejectRead } = fixture()
    rejectRead()
    expect(scope.getSnapshot().status).toBe('unavailable')
  })

  it('ends initial loading when the real Host mirror returns idle with a read error', () => {
    const { scope, setMirrorStatus } = fixture()
    setMirrorStatus('idle', 'settings describe failed')
    expect(scope.getSnapshot()).toMatchObject({ status: 'unavailable', value: undefined })
  })

  it.each(['idle', 'loading', 'ready'] as const)('keeps loading when the mirror has no view (%s)', status => {
    const { scope, setMirrorStatus } = fixture()
    setMirrorStatus(status)
    expect(scope.getSnapshot().status).toBe('loading')
  })

  it('ends loading with unavailable when the ready mirror has no Codex Connect namespace', () => {
    const { scope, publishWithoutNamespace } = fixture()
    publishWithoutNamespace()
    expect(scope.getSnapshot().status).toBe('unavailable')
  })

  it('notifies and disposes both subscriptions', () => {
    const { scope, publish, acceptNative } = fixture('absent')
    const listener = vi.fn()
    const stop = scope.subscribe(listener)
    publish({ ...DEFAULT_OPENAI_CODEX_SETTINGS })
    expect(listener).toHaveBeenCalledTimes(1)
    acceptNative()
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    publish({ ...DEFAULT_OPENAI_CODEX_SETTINGS })
    acceptNative()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
