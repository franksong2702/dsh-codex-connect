// @vitest-environment jsdom

import { StrictMode } from 'react'
import { BROWSER_REQUEST_TIMEOUT_MS } from '../src/client/request-json.ts'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { formatOpenAICodexResetAt, OpenAICodexSettings } from '../src/client/OpenAICodexSettings.tsx'
import { OpenAICodexConfiguration, validContextEdits } from '../src/client/OpenAICodexConfiguration.tsx'
import { en, zh } from '../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../src/client/locales.ts'
import { DEFAULT_OPENAI_CODEX_SETTINGS } from '../src/settings-contract.ts'
import type { OpenAICodexSettingsConfig } from '../src/settings-contract.ts'
import {
  OPENAI_CODEX_AUTH_ACCOUNTS_PATH,
  OPENAI_CODEX_AUTH_LOGIN_PATH,
  OPENAI_CODEX_AUTH_LOGOUT_PATH,
  OPENAI_CODEX_AUTH_STATUS_PATH,
} from '../src/auth-paths.ts'
import { OPENAI_CODEX_MODEL_CATALOG_PATH } from '../src/model-contract.ts'
import { OPENAI_CODEX_RUNTIME_PATH } from '../src/update-paths.ts'
import { modelCatalogFixture } from './model-catalog-fixture.ts'
import {
  OPENAI_CODEX_PROXY_DETECT_PATH,
  OPENAI_CODEX_PROXY_TEST_PATH,
} from '../src/proxy-paths.ts'

function t(key: OpenAICodexSettingsKey, params: Record<string, unknown> = {}): string {
  return Object.entries(params).reduce(
    (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
    en[key],
  )
}

function json(value: unknown, status = 200): Response {
  const projected = typeof value === 'object' && value !== null && 'status' in value
    ? { ...value, accounts: value.status === 'signed-in' || value.status === 'reauth-required' ? [{
      accountKey: `acct_${'a'.repeat(43)}`, active: true, displayName: 'Work account',
      maskedEmail: 'wo••@example.com', profileSource: 'oauth',
    }] : [] }
    : value
  return new Response(JSON.stringify(projected), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function requestPath(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname
}

function popupFixture(): { popup: Window; close: ReturnType<typeof vi.fn>; replace: ReturnType<typeof vi.fn> } {
  const close = vi.fn()
  const replace = vi.fn()
  return {
    popup: { close, opener: window, location: { replace } } as unknown as Window,
    close,
    replace,
  }
}

function settingsScopeFixture(
  writable = true,
  initial: OpenAICodexSettingsConfig = DEFAULT_OPENAI_CODEX_SETTINGS,
  snapshotMode: 'host' | 'memory' | 'absent' = 'host',
): {
  scope: ConfigForm<OpenAICodexSettingsConfig>
  set: ReturnType<typeof vi.fn>
  mutate: ReturnType<typeof vi.fn>
} {
  // Alpha.3 omits mode; the dev SDK still requires the legacy property.
  let snapshot: Omit<ConfigFormSnapshot<OpenAICodexSettingsConfig>, 'mode'> & { mode?: 'host' | 'memory' } = {
    status: 'ready',
    value: { ...initial },
    base: { ...initial },
    user: undefined,
    revision: 0,
    writable,
    ...(snapshotMode === 'absent' ? {} : { mode: snapshotMode }),
  }
  const listeners = new Set<() => void>()
  const set = vi.fn(async (field: string, value: unknown) => {
    const current = snapshot.value
    if (current === undefined || !(field in current)) throw new Error(`unknown field ${field}`)
    snapshot = {
      ...snapshot,
      value: { ...current, [field]: value },
      user: { ...typeof snapshot.user === 'object' && snapshot.user !== null ? snapshot.user : {}, [field]: value },
      revision: (snapshot.revision ?? 0) + 1,
    }
    for (const listener of listeners) listener()
    return true
  })
  const mutate = vi.fn<ConfigForm<OpenAICodexSettingsConfig>['mutate']>(async (ops, revision) => {
    if (revision !== snapshot.revision) throw new Error('stale revision')
    const next = { ...snapshot.value! }
    for (const op of ops) {
      if (op.path.length !== 1) throw new Error('fixture requires top-level fields')
      Object.assign(next, { [op.path[0]!]: op.op === 'set' ? ['reasoningEffort', 'newSessionSpeedMode', 'newSubagentSpeedMode'].includes(String(op.path[0])) && op.value === null ? undefined : op.value : undefined })
    }
    snapshot = { ...snapshot, value: next, revision: (snapshot.revision ?? 0) + 1 }
    for (const listener of listeners) listener()
    return true
  })
  return {
    set,
    mutate,
    scope: {
      getSnapshot: () => snapshot as ConfigFormSnapshot<OpenAICodexSettingsConfig>,
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      set,
      mutate,
      unset: vi.fn(async () => true),
    },
  }
}

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) { this.setAttribute('open', '') },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) { this.removeAttribute('open') },
    },
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('OpenAI Codex Plugin configuration card', () => {
  it('counts saved native context and Reserve capabilities without counting an unsaved draft', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }])) : json({ status: 'signed-out' })))
    const { scope } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, enableReserveFallback: true })
    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    const capabilities = screen.getByRole('tab', { name: en.capabilitiesModule })
    expect(within(capabilities).getByText(t('capabilitiesModuleEnabled', { count: 1 }))).toBeTruthy()
    fireEvent.click(capabilities)
    fireEvent.click(screen.getByRole('checkbox', { name: en.enableNativeCompaction }))
    expect(within(capabilities).getByText(t('capabilitiesModuleEnabled', { count: 1 }))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await within(capabilities).findByText(t('capabilitiesModuleEnabled', { count: 2 }))
  })

  it('shows a dedicated remote-origin trust state without auth mutations and copies only the suggested command', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      expect([OPENAI_CODEX_AUTH_STATUS_PATH, OPENAI_CODEX_RUNTIME_PATH]).toContain(requestPath(input))
      return json({ error: 'remote-web-origin-not-trusted' }, 403)
    })
    const writeText = vi.fn(async (_value: string): Promise<void> => undefined)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const popup = vi.spyOn(window, 'open')

    render(<OpenAICodexSettings t={t} embedded />)
    expect(await screen.findByText(en.remoteOriginDescription)).toBeTruthy()
    const command = `dsh plugin --profile web exec dsh-codex-connect trust-origin ${window.location.origin}`
    expect(screen.getByText(command)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.login })).toBeNull()
    expect(screen.queryByRole('button', { name: en.logout })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.remoteOriginCopy }))
    await waitFor(() => { expect(writeText).toHaveBeenCalledWith(command) })
    expect(popup).not.toHaveBeenCalled()
    const paths = fetchMock.mock.calls.map(([input]) => requestPath(input))
    expect(paths.filter(path => path !== OPENAI_CODEX_RUNTIME_PATH)).toEqual([OPENAI_CODEX_AUTH_STATUS_PATH])
    expect(paths.filter(path => path === OPENAI_CODEX_RUNTIME_PATH)).toHaveLength(1)
  })

  it('offers a user-clicked browser link when the popup is blocked', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_RUNTIME_PATH) return json({}, 404)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return json({ status: 'signed-out' })
      expect(path).toBe(OPENAI_CODEX_AUTH_LOGIN_PATH)
      return json({ url: 'https://auth.openai.com/authorize' })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'open').mockReturnValue(null)

    render(<OpenAICodexSettings t={t} embedded />)
    const login = await screen.findByRole('button', { name: en.login }) as HTMLButtonElement
    expect(login.style.background).toBe('var(--dsw-alias-button-primary-fill)')
    expect(login.style.color).toBe('var(--dsw-alias-label-primary-foreground)')
    fireEvent.click(login)

    expect(await screen.findByText(en.authorizationHelp)).toBeTruthy()
    const link = screen.getByRole('link', { name: en.openLoginInBrowser }) as HTMLAnchorElement
    expect(link.href).toBe('https://auth.openai.com/authorize')
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noopener')
    expect(link.rel).toContain('noreferrer')
    const paths = fetchMock.mock.calls.map(([input]) => requestPath(input))
    expect(paths.filter(path => path !== OPENAI_CODEX_RUNTIME_PATH)).toEqual([OPENAI_CODEX_AUTH_STATUS_PATH, OPENAI_CODEX_AUTH_LOGIN_PATH])
    expect(paths.filter(path => path === OPENAI_CODEX_RUNTIME_PATH)).toHaveLength(1)
  })

  it('closes the popup and surfaces a failed login request', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_RUNTIME_PATH) return json({}, 404)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return json({ status: 'signed-out' })
      expect(path).toBe(OPENAI_CODEX_AUTH_LOGIN_PATH)
      return json({ error: 'OAuth is unavailable' }, 503)
    })
    const { popup, close } = popupFixture()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'open').mockReturnValue(popup)

    render(<OpenAICodexSettings t={t} embedded />)
    fireEvent.click(await screen.findByRole('button', { name: en.login }))

    expect(await screen.findByText('OAuth is unavailable')).toBeTruthy()
    expect(close).toHaveBeenCalledOnce()
  })

  it('renders reauth-required and reuses the sign-in flow without logout', async () => {
    const reauthMessage = 'OpenAI Codex authorization must be renewed'
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_RUNTIME_PATH) return json({}, 404)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) {
        return json({ status: 'reauth-required', message: reauthMessage })
      }
      expect(path).toBe(OPENAI_CODEX_AUTH_LOGIN_PATH)
      return json({ url: 'https://auth.openai.com/authorize' })
    })
    const { popup, replace } = popupFixture()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'open').mockReturnValue(popup)

    render(<OpenAICodexSettings t={t} embedded />)
    expect(await screen.findByText(reauthMessage)).toBeTruthy()
    expect(within(screen.getByRole('tabpanel', { name: en.accountModule })).getByRole('status').textContent).toContain(en.reauthRequired)
    expect(screen.getByRole('button', { name: en.reauthorize })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.logout })).toBeNull()
    expect(zh.reauthRequired).toBe('需要重新登录')

    fireEvent.click(screen.getByRole('button', { name: en.reauthorize }))
    await waitFor(() => { expect(replace).toHaveBeenCalledWith('https://auth.openai.com/authorize') })

    const paths = fetchMock.mock.calls.map(([input]) => requestPath(input))
    expect(paths).toContain(OPENAI_CODEX_AUTH_LOGIN_PATH)
    expect(paths).not.toContain(OPENAI_CODEX_AUTH_LOGOUT_PATH)
    expect(popup.opener).toBeNull()
  })

  it('renders signed-in quota semantics and signs out', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) {
        return json({
          status: 'signed-in',
          usage: {
            rateLimits: [{
              id: 'codex',
              name: 'Codex',
              windows: [{ remainingPercent: 72.5, windowSeconds: 18_000 }],
            }, {
              id: 'codex_bengalfox',
              name: 'GPT-5.3-Codex-Spark',
              windows: [
                { remainingPercent: 100, windowSeconds: 18_000 },
                { remainingPercent: 50, windowSeconds: 604_800 },
              ],
            }],
          },
        })
      }
      expect(path).toBe(OPENAI_CODEX_AUTH_LOGOUT_PATH)
      return json({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} embedded />)
    const progress = await screen.findByRole('progressbar', { name: `Codex · ${en.fiveHourLimit}` })
    expect(progress.getAttribute('aria-valuenow')).toBe('72.5')
    expect(progress.getAttribute('aria-valuetext')).toBe('72.5% remaining')
    expect(screen.getByRole('progressbar', { name: `GPT-5.3-Codex-Spark · ${en.fiveHourLimit}` })).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: `GPT-5.3-Codex-Spark · ${en.weeklyLimit}` })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: en.manageAccounts }))
    fireEvent.click(screen.getByRole('button', { name: en.signOutAll }))
    expect((await screen.findAllByText(en.signedOut)).length).toBeGreaterThan(0)
  })

  it('renders each quota window reset in the browser locale and names missing resets unavailable', async () => {
    const resetAt = 1_735_689_600
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      expect(requestPath(input)).toBe(OPENAI_CODEX_AUTH_STATUS_PATH)
      return json({
        status: 'signed-in',
        usage: {
          rateLimits: [{
            id: 'codex',
            name: 'Codex',
            windows: [
              { remainingPercent: 72.5, windowSeconds: 18_000, resetAt },
              { remainingPercent: 80, windowSeconds: 604_800 },
            ],
          }],
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} embedded />)
    expect(await screen.findByText(en.resetAt.replace('{time}', formatOpenAICodexResetAt(resetAt) ?? ''))).toBeTruthy()
    expect(screen.getAllByText(en.resetAt.replace('{time}', en.resetUnavailable))).toHaveLength(1)
  })

  it('disables account actions while a login request is pending', async () => {
    let resolveLogin: ((value: Response) => void) | undefined
    const fetchMock = vi.fn((input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return Promise.resolve(json({ status: 'signed-out' }))
      return new Promise(resolve => { resolveLogin = resolve })
    })
    const { popup, replace } = popupFixture()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'open').mockReturnValue(popup)

    render(<OpenAICodexSettings t={t} embedded />)
    fireEvent.click(await screen.findByRole('button', { name: en.login }))
    const working = await screen.findByRole('button', { name: en.working })
    expect((working as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      resolveLogin?.(json({ url: 'https://auth.openai.com/authorize' }))
    })
    await waitFor(() => { expect(replace).toHaveBeenCalledWith('https://auth.openai.com/authorize') })
  })

  it('does not update state after unmount and aborts its status request', () => {
    let statusSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      statusSignal = init?.signal instanceof AbortSignal ? init.signal : undefined
      return new Promise(() => {})
    })
    vi.stubGlobal('fetch', fetchMock)

    const rendered = render(<OpenAICodexSettings t={t} embedded />)
    rendered.unmount()

    expect(statusSignal?.aborted).toBe(true)
  })

  it('surfaces logout failure and keeps account actions accessible', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) {
        return json({ status: 'signed-in', usage: { rateLimits: [] } })
      }
      expect(path).toBe(OPENAI_CODEX_AUTH_LOGOUT_PATH)
      return json({ error: 'Could not sign out' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} embedded />)
    fireEvent.click(await screen.findByRole('button', { name: en.manageAccounts }))
    fireEvent.click(screen.getByRole('button', { name: en.signOutAll }))

    expect(await screen.findByText('Could not sign out')).toBeTruthy()
    expect((screen.getByRole('button', { name: en.signOutAll }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('preserves another editor\'s untouched fields when saving a draft', async () => {
    const { scope } = settingsScopeFixture()
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const image = await screen.findByRole('checkbox', { name: /Enable GPT Image generation/u })
    fireEvent.click(image)
    await act(async () => { await scope.set('searchModel', 'remote-model') })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(scope.getSnapshot().value).toMatchObject({ searchModel: 'remote-model', enableImageGeneration: true })
  })

  it('publishes all edited fields in one revision and one notification', async () => {
    const { scope, mutate, set } = settingsScopeFixture()
    const observed: unknown[] = []
    scope.subscribe(() => { observed.push(scope.getSnapshot().value) })
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Enable GPT Image generation/u }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable Codex search provider/u }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(set).not.toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['enableImageGeneration'], value: true },
      { op: 'set', path: ['enableSearch'], value: true },
    ], 0)
    expect(observed).toHaveLength(1)
    expect(observed[0]).toMatchObject({ enableSearch: true, enableImageGeneration: true })
  })

  it('retains the draft without writing when another editor changes the same field', async () => {
    const { scope, mutate } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, enableSearch: true })
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const model = await screen.findByRole<HTMLInputElement>('textbox', { name: en.searchModel })
    fireEvent.change(model, { target: { value: 'local-model' } })
    await act(async () => { await scope.set('searchModel', 'remote-model') })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(mutate).not.toHaveBeenCalled()
    expect(scope.getSnapshot().value?.searchModel).toBe('remote-model')
    expect(model.value).toBe('local-model')
  })

  it('rejects an intervening revision without partially saving the draft', async () => {
    const { scope, mutate } = settingsScopeFixture()
    const commit = vi.mocked(scope.mutate).getMockImplementation()!
    mutate.mockImplementationOnce(async (ops, revision) => {
      await scope.set('searchModel', 'remote-model')
      await commit(ops, revision)
    })
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Enable GPT Image generation/u }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable Codex search provider/u }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(scope.getSnapshot().value).toMatchObject({ searchModel: 'remote-model', enableImageGeneration: false, enableSearch: false })
  })

  it('stages, saves, reloads, and discards the Reserve fallback opt-in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }]))))
    const { scope, mutate } = settingsScopeFixture()
    const first = render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const reserve = await screen.findByRole('checkbox', { name: /Automatic Luna Reserve/u }) as HTMLInputElement

    expect(reserve.checked).toBe(false)
    fireEvent.click(reserve)
    expect(reserve.checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    expect(reserve.checked).toBe(false)
    expect(mutate).not.toHaveBeenCalled()

    fireEvent.click(reserve)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenCalledExactlyOnceWith([
      { op: 'set', path: ['enableReserveFallback'], value: true },
    ], 0)
    expect(scope.getSnapshot().value?.enableReserveFallback).toBe(true)

    first.unmount()
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const reloaded = await screen.findByRole('checkbox', { name: /Automatic Luna Reserve/u }) as HTMLInputElement
    expect(reloaded.checked).toBe(true)
    fireEvent.click(reloaded)
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    expect(reloaded.checked).toBe(true)
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('saves separate explicit speed defaults and resets to the preserved legacy preference', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-6.1-sol', name: 'GPT Sol' }]))))
    const { scope, mutate } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, enableNewSessionFastMode: true })
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const top = await screen.findByRole('combobox', { name: en.newSessionSpeedMode })
    const child = screen.getByRole('combobox', { name: en.newSubagentSpeedMode })
    fireEvent.change(top, { target: { value: 'ultrafast' } })
    fireEvent.change(child, { target: { value: 'standard' } })
    expect((screen.getByRole('checkbox', { name: /Fast Mode for new conversations/u }) as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenLastCalledWith([
      { op: 'set', path: ['newSessionSpeedMode'], value: 'ultrafast' },
      { op: 'set', path: ['newSubagentSpeedMode'], value: 'standard' },
    ], 0)
    fireEvent.change(top, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['newSessionSpeedMode'], value: null }], 1) })
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(scope.getSnapshot().value).toMatchObject({ newSessionSpeedMode: undefined, newSubagentSpeedMode: 'standard', enableNewSessionFastMode: true })
    expect((screen.getByRole('checkbox', { name: /Fast Mode for new conversations/u }) as HTMLInputElement).disabled).toBe(false)
  })

  it('saves a reasoning fallback and resets it with a null mask through the Host revision queue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-6.1-sol', name: 'GPT Sol' }]))))
    const { scope, mutate } = settingsScopeFixture()
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const select = await screen.findByRole('combobox', { name: /Default reasoning effort/u })
    fireEvent.change(select, { target: { value: 'max' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['reasoningEffort'], value: 'max' }], 0)
    fireEvent.change(select, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['reasoningEffort'], value: null }], 1) })
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(scope.getSnapshot().value?.reasoningEffort).toBeUndefined()
  })

  it('saves independent, default-off Fast Mode choices for new top-level and subagent sessions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    const { scope, mutate } = settingsScopeFixture()
    const first = render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const topLevel = await screen.findByRole('checkbox', { name: /Fast Mode for new conversations/u }) as HTMLInputElement
    const subagent = screen.getByRole('checkbox', { name: /Fast Mode for new subagent conversations/u }) as HTMLInputElement
    expect(topLevel.checked).toBe(false)
    expect(subagent.checked).toBe(false)

    fireEvent.click(topLevel)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['enableNewSessionFastMode'], value: true }], 0)
    expect(scope.getSnapshot().value).toMatchObject({ enableNewSessionFastMode: true, enableNewSubagentFastMode: false })

    fireEvent.click(subagent)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['enableNewSubagentFastMode'], value: true }], 1)
    first.unmount()
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const reloaded = await screen.findByRole('checkbox', { name: /Fast Mode for new conversations/u }) as HTMLInputElement
    expect(reloaded.checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Fast Mode for new subagent conversations/u }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(reloaded)
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    expect(reloaded.checked).toBe(true)
  })

  it('stages, saves, reloads, discards, and disables Codex native context management', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    const { scope, mutate } = settingsScopeFixture()
    const first = render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const native = await screen.findByRole('checkbox', { name: en.enableNativeCompaction }) as HTMLInputElement

    expect(native.checked).toBe(false)
    fireEvent.click(native)
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    expect(native.checked).toBe(false)
    expect(mutate).not.toHaveBeenCalled()

    fireEvent.click(native)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenCalledExactlyOnceWith([
      { op: 'set', path: ['enableNativeCompaction'], value: true },
    ], 0)
    expect(scope.getSnapshot().value?.enableNativeCompaction).toBe(true)
    expect(scope.getSnapshot().value).toEqual({ ...DEFAULT_OPENAI_CODEX_SETTINGS, enableNativeCompaction: true })
    expect(screen.getByText(en.nativeCompactionSavedOn)).toBeTruthy()
    expect(screen.queryByText(en.nativeCompactionPending)).toBeNull()

    first.unmount()
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const reloaded = await screen.findByRole('checkbox', { name: en.enableNativeCompaction }) as HTMLInputElement
    expect(reloaded.checked).toBe(true)
    fireEvent.click(reloaded)
    expect(screen.getByText(en.nativeCompactionSavedOn)).toBeTruthy()
    expect(screen.getByText(en.nativeCompactionPending)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.nativeCompactionSavedOff)
    expect(scope.getSnapshot().value).toEqual(DEFAULT_OPENAI_CODEX_SETTINGS)
    expect(mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['enableNativeCompaction'], value: false }], 1)
  })

  it.each([['en', en], ['zh', zh]] as const)('explains native context consent and benefits in %s without enabling it on view', async (_language, copy) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }]))))
    const { scope, mutate } = settingsScopeFixture()
    render(<OpenAICodexConfiguration scope={scope} t={key => copy[key]} activeModule="capabilities" />)
    const group = screen.getByRole('group', { name: copy.enableNativeCompaction })
    const native = within(group).getByRole('checkbox', { name: copy.enableNativeCompaction }) as HTMLInputElement
    expect(native.checked).toBe(false)
    for (const key of ['enableNativeCompactionHelp', 'nativeCompactionBadge', 'nativeCompactionConsent', 'nativeCompactionRisk', 'nativeCompactionSavedOff'] as const) {
      expect(within(group).getByText(copy[key])).toBeTruthy()
    }
    expect(copy.enableNativeCompaction).toContain('Codex')
    fireEvent.click(within(group).getByText(copy.nativeCompactionDetails))
    expect(within(group).getByText(copy.nativeCompactionHostPolicy)).toBeTruthy()
    expect(within(group).getByText(copy.nativeCompactionDisableHelp)).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.click(native)
    expect(within(group).getByText(copy.nativeCompactionPending)).toBeTruthy()
    expect(within(group).getByText(copy.nativeCompactionSavedOff)).toBeTruthy()
    expect(scope.getSnapshot().value?.enableNativeCompaction).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: copy.discard }))
    expect(native.checked).toBe(false)
    expect(within(group).queryByText(copy.nativeCompactionPending)).toBeNull()
    expect(mutate).not.toHaveBeenCalled()
  })

  it.each([false, true])('keeps the last saved native-context value %s when saving fails', async initialEnabled => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }]))))
    const initial = { ...DEFAULT_OPENAI_CODEX_SETTINGS, enableNativeCompaction: initialEnabled }
    const { scope, mutate } = settingsScopeFixture(true, initial)
    mutate.mockRejectedValueOnce(new Error('fixture write failed'))
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: en.enableNativeCompaction }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(scope.getSnapshot().value).toEqual(initial)
    expect(screen.getByText(initialEnabled ? en.nativeCompactionSavedOn : en.nativeCompactionSavedOff)).toBeTruthy()
    expect(screen.getByText(en.nativeCompactionPending)).toBeTruthy()
  })

  it('disables the native-context control when the settings are read-only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }]))))
    const { scope, mutate } = settingsScopeFixture(false)
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const native = screen.getByRole('checkbox', { name: en.enableNativeCompaction }) as HTMLInputElement
    expect(native.matches(':disabled')).toBe(true)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('stages, discards, and saves optional capability settings in the same card', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }, { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))
      : json({ status: 'signed-out' }))
    const { scope, mutate } = settingsScopeFixture()
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.capabilitiesModule }))
    const enableSearch = await screen.findByRole('checkbox', { name: /Enable Codex search provider/u }) as HTMLInputElement
    const enableImageGeneration = screen.getByRole('checkbox', { name: /Enable GPT Image generation/u }) as HTMLInputElement
    const imageModelHint = screen.getByRole('textbox', { name: /Image route model hint/u }) as HTMLInputElement
    const enableAutoReview = screen.getByRole('checkbox', { name: /Codex Auto-review/u }) as HTMLInputElement
    const model = screen.getByRole('textbox', { name: en.searchModel }) as HTMLInputElement
    const save = screen.getByRole('button', { name: en.save }) as HTMLButtonElement
    expect(save.style.background).toBe('var(--dsw-alias-button-primary-fill)')
    expect(save.style.color).toBe('var(--dsw-alias-label-primary-foreground)')
    expect(enableSearch.checked).toBe(false)
    expect(enableImageGeneration.checked).toBe(false)
    expect(imageModelHint.placeholder).toContain('gpt-image-2')
    expect(enableAutoReview.checked).toBe(false)
    expect(en.enableImageGenerationHelp).toContain('keeping your current chat model, including DeepSeek')
    expect(en.enableImageGenerationHelp).toContain('only the selected target and reference images')
    expect(zh.enableImageGeneration).toBe('启用 GPT Image 图片生成')
    expect(zh.enableImageGenerationHelp).toContain('保持当前聊天模型（包括 DeepSeek）')
    expect(zh.enableImageGenerationHelp).toContain('仅将本次选定的主图和参考图')
    expect(screen.getByText(en.autoReviewOfficialBadge)).toBeTruthy()
    expect(screen.getByText(en.enableAutoReviewHelp)).toBeTruthy()
    expect(en.autoReviewDisclosure).toContain('to chatgpt.com')
    expect(zh.autoReviewDisclosure).toContain('会发送到 chatgpt.com')
    const details = screen.getByText(en.autoReviewDetails).closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    fireEvent.click(screen.getByText(en.autoReviewDetails))
    expect(details.open).toBe(true)
    const officialDocs = screen.getByRole('link', { name: en.autoReviewOfficialDocs }) as HTMLAnchorElement
    expect(officialDocs.href).toBe('https://learn.chatgpt.com/docs/sandboxing/auto-review')
    expect(model.disabled).toBe(true)

    fireEvent.click(enableSearch)
    expect(model.disabled).toBe(false)
    fireEvent.change(model, { target: { value: 'temporary-model' } })
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    expect(enableSearch.checked).toBe(false)
    expect(model.value).toBe(DEFAULT_OPENAI_CODEX_SETTINGS.searchModel)

    fireEvent.click(enableSearch)
    fireEvent.change(model, { target: { value: 'gpt-search-custom' } })
    fireEvent.change(screen.getByRole('combobox', { name: en.searchMode }), { target: { value: 'live' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: en.searchMaxOutputTokens }), { target: { value: '2048' } })
    fireEvent.click(enableImageGeneration)
    fireEvent.change(imageModelHint, { target: { value: 'custom-image-route' } })
    fireEvent.click(enableAutoReview)
    expect(screen.getByRole('dialog', { name: en.autoReviewConfirmTitle })).toBeTruthy()
    expect(enableAutoReview.checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: en.autoReviewCancel }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(enableAutoReview.checked).toBe(false)
    fireEvent.click(enableAutoReview)
    fireEvent.click(screen.getByRole('button', { name: en.autoReviewConfirm }))
    expect(enableAutoReview.checked).toBe(true)
    fireEvent.click(save)

    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['enableSearch'], value: true }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['searchModel'], value: 'gpt-search-custom' }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['searchMode'], value: 'live' }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['searchMaxOutputTokens'], value: 2048 }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['enableImageGeneration'], value: true }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['imageModelHint'], value: 'custom-image-route' }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['autoReviewDisclosureAcknowledged'], value: true }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['enableAutoReview'], value: true }]), expect.any(Number))
    fireEvent.click(enableAutoReview)
    fireEvent.click(save)
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    fireEvent.click(enableAutoReview)
    expect(enableAutoReview.checked).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps an invalid image hint staged and disables Save until it is cleared', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))))
    const { scope, mutate } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, imageModelHint: 'existing-route' })
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    const hint = await screen.findByRole('textbox', { name: /Image route model hint/u }) as HTMLInputElement
    const save = screen.getByRole('button', { name: en.save }) as HTMLButtonElement
    fireEvent.change(hint, { target: { value: 'https://invalid.example' } })
    expect(save.disabled).toBe(true)
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.change(hint, { target: { value: '' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await screen.findByText(en.settingsSaved)
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['imageModelHint'], value: '' }]), expect.any(Number))
  })

  it('stages model visibility in provider order and saves it with the other plugin settings', async () => {
    const availableModels = [
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' },
    ]
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? json(modelCatalogFixture(availableModels))
      : json({ status: 'signed-out' }))
    const { scope, mutate } = settingsScopeFixture()
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
    const luna = await screen.findByRole<HTMLInputElement>('checkbox', { name: /GPT-5\.6 Luna/u })
    const sol = screen.getByRole<HTMLInputElement>('checkbox', { name: /GPT-5\.6 Sol/u })
    const terra = screen.getByRole<HTMLInputElement>('checkbox', { name: /GPT-5\.6 Terra/u })
    expect([luna.checked, sol.checked, terra.checked]).toEqual([true, true, true])

    fireEvent.click(sol)
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    expect(sol.checked).toBe(true)

    fireEvent.click(sol)
    fireEvent.click(screen.getByRole('button', { name: en.save }))

    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['models'], value: ['gpt-5.6-luna', 'gpt-5.6-terra'] }]), expect.any(Number))
    expect(fetchMock.mock.calls.some(([input]) => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH)).toBe(true)
  })

  it('keeps direct mode until explicit proxy confirmation and save', async () => {
    const candidate = 'http://127.0.0.1:7897'
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return json({ status: 'signed-out' })
      expect(path).toBe(OPENAI_CODEX_PROXY_DETECT_PATH)
      expect(init?.method).toBe('POST')
      return json({
        candidates: [{ proxyUrl: candidate, reachable: true, classification: 'reachable', status: 401 }],
        results: [{ proxyUrl: candidate, reachable: true, classification: 'reachable', status: 401 }],
      })
    })
    const { scope, mutate } = settingsScopeFixture()
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.networkModule }))
    expect(within(await screen.findByRole('group', { name: en.currentConnection })).getByText(en.directConnection)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.scanLocalProxy }))
    expect(await screen.findByText(candidate)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.useThisProxy }))
    expect(screen.getByText(en.pendingProxy.replace('{proxyUrl}', candidate))).toBeTruthy()
    expect(screen.getAllByText(en.selectedProxy).length).toBeGreaterThan(0)
    expect(within(screen.getByRole('group', { name: en.currentConnection })).getByText(en.directConnection)).toBeTruthy()
    expect(mutate).not.toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['enableProxy'], value: true }]), expect.any(Number))

    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['proxyUrl'], value: candidate }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['enableProxy'], value: true }]), expect.any(Number))
    expect(fetchMock.mock.calls.some(([input]) => requestPath(input) === OPENAI_CODEX_PROXY_TEST_PATH)).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: en.disableProxy }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['enableProxy'], value: false }]), expect.any(Number)) })
  })

  it('activates only the exact manual proxy draft that passed its latest test', async () => {
    const first = 'http://127.0.0.1:8110'
    const second = 'http://127.0.0.1:8111'
    const tested: string[] = []
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return json({ status: 'signed-out' })
      expect(path.startsWith(`${OPENAI_CODEX_PROXY_TEST_PATH}?`)).toBe(true)
      const requestUrl = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        'http://localhost',
      )
      const proxyUrl = requestUrl.searchParams.get('proxyUrl') ?? ''
      tested.push(proxyUrl)
      return json({ proxyUrl, reachable: true, classification: 'reachable', status: 401 })
    })
    const { scope, mutate } = settingsScopeFixture()
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.networkModule }))
    expect(within(await screen.findByRole('group', { name: en.currentConnection })).getByText(en.directConnection)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    const address = screen.getByRole('textbox', { name: en.proxyAddress })
    const useProxy = (): HTMLButtonElement => screen.getByRole('button', { name: en.useThisProxy }) as HTMLButtonElement

    fireEvent.change(address, { target: { value: first } })
    expect(useProxy().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    await waitFor(() => { expect(useProxy().disabled).toBe(false) })

    fireEvent.change(address, { target: { value: second } })
    expect(useProxy().disabled).toBe(true)
    expect(screen.queryByText(en.proxyTestSucceeded.replace('{status}', '401'))).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    await waitFor(() => { expect(useProxy().disabled).toBe(false) })
    fireEvent.click(useProxy())

    expect(screen.getByText(en.pendingProxy.replace('{proxyUrl}', second))).toBeTruthy()
    expect(screen.getByText(en.selectedProxy)).toBeTruthy()
    expect(within(screen.getByRole('group', { name: en.currentConnection })).getByText(en.directConnection)).toBeTruthy()
    expect(mutate).not.toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['enableProxy'], value: true }]), expect.any(Number))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['proxyUrl'], value: second }]), expect.any(Number))
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['enableProxy'], value: true }]), expect.any(Number))
    expect(tested).toEqual([first, second])
  })

  it('requires a fresh test before replacing an enabled proxy', async () => {
    const first = 'http://127.0.0.1:8110'
    const second = 'http://127.0.0.1:8111'
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return json({ status: 'signed-out' })
      const requestUrl = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        'http://localhost',
      )
      const proxyUrl = requestUrl.searchParams.get('proxyUrl') ?? ''
      return json({ proxyUrl, reachable: true, classification: 'reachable', status: 401 })
    })
    const { scope, mutate } = settingsScopeFixture(true, {
      ...DEFAULT_OPENAI_CODEX_SETTINGS,
      enableProxy: true,
      proxyUrl: first,
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.networkModule }))
    await screen.findByText(first)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    fireEvent.change(screen.getByRole('textbox', { name: en.proxyAddress }), { target: { value: second } })
    const save = screen.getByRole('button', { name: en.save }) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    const useProxy = await screen.findByRole('button', { name: en.useThisProxy }) as HTMLButtonElement
    await waitFor(() => { expect(useProxy.disabled).toBe(false) })
    expect(save.disabled).toBe(true)
    fireEvent.click(useProxy)
    expect(save.disabled).toBe(false)
    expect(screen.getByText(en.pendingProxy.replace('{proxyUrl}', second))).toBeTruthy()
    fireEvent.click(save)

    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['proxyUrl'], value: second }]), expect.any(Number))
    expect(mutate).not.toHaveBeenCalledWith(expect.arrayContaining([{ op: 'set', path: ['enableProxy'], value: false }]), expect.any(Number))
    expect(scope.getSnapshot().value?.enableProxy).toBe(true)
  })

  it('ignores a late current-connection result after the saved proxy changes', async () => {
    const current = 'http://127.0.0.1:8110'
    let probeSignal: AbortSignal | null | undefined
    let resolveProbe: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return Promise.resolve(json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }])))
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return Promise.resolve(json({ status: 'signed-out' }))
      expect(path.startsWith(`${OPENAI_CODEX_PROXY_TEST_PATH}?`)).toBe(true)
      probeSignal = init?.signal
      return new Promise(resolve => { resolveProbe = resolve })
    })
    const { scope } = settingsScopeFixture(true, {
      ...DEFAULT_OPENAI_CODEX_SETTINGS,
      enableProxy: true,
      proxyUrl: current,
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.networkModule }))
    await screen.findByText(current)
    fireEvent.click(screen.getByRole('button', { name: en.checkCurrentConnection }))
    expect(screen.getByText(en.checkingCurrentConnection)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.disableProxy }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(probeSignal?.aborted).toBe(true)

    resolveProbe?.(json({ proxyUrl: current, reachable: true, classification: 'reachable', status: 401 }))
    await waitFor(() => { expect(screen.queryByText(en.currentConnectionHealthy)).toBeNull() })
    expect(within(screen.getByRole('group', { name: en.currentConnection })).getByText(en.directConnection)).toBeTruthy()
  })

  it('keeps the pending proxy change available when the Host save fails', async () => {
    const current = 'http://127.0.0.1:8110'
    const { scope, mutate } = settingsScopeFixture(true, {
      ...DEFAULT_OPENAI_CODEX_SETTINGS,
      enableProxy: true,
      proxyUrl: current,
    })
    mutate.mockRejectedValueOnce(new Error('write failed'))
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request): Promise<Response> => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))
      : json({ status: 'signed-out' })))

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.networkModule }))
    await screen.findByText(current)
    fireEvent.click(screen.getByRole('button', { name: en.disableProxy }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))

    expect(await screen.findByText(en.settingsSaveFailed)).toBeTruthy()
    expect(screen.getByText(en.pendingDirect)).toBeTruthy()
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(current)).toBeTruthy()
  })

  it('keeps an unsaved draft and its actions available across the account module', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request): Promise<Response> => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))
      : json({ status: 'signed-out' })))
    const { scope, mutate } = settingsScopeFixture()

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
    const model = await screen.findByRole<HTMLInputElement>('checkbox', { name: /GPT-5\.6 Sol/u })
    fireEvent.click(model)
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByRole('tab', { name: en.accountModule }))
    expect(document.getElementById(screen.getByRole('tab', { name: en.modelsModule }).getAttribute('aria-controls') ?? '')?.style.display).toBe('none')
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('tab', { name: en.modelsModule }))
    expect(model.checked).toBe(false)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('disables capability edits when the Host settings document is read-only', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => json({ status: 'signed-out' }))
    const { scope } = settingsScopeFixture(false)
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.capabilitiesModule }))

    expect(await screen.findByText(en.settingsReadOnly)).toBeTruthy()
    expect(document.querySelector('fieldset')?.disabled).toBe(true)
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(true)
  })
})


describe('local manual proxy input drafts', () => {
  it('releases manual input ownership after Use and Save accepts the exact input, then follows the Host', async () => {
    const accepted = 'http://127.0.0.1:8111'
    const next = 'http://127.0.0.1:8112'
    const fetchMock = vi.fn(async (path: string) => {
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return json([])
      expect(path).toBe(`${OPENAI_CODEX_PROXY_TEST_PATH}?proxyUrl=${encodeURIComponent(accepted)}`)
      return json({ proxyUrl: accepted, reachable: true, classification: 'reachable' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { scope, mutate } = settingsScopeFixture()
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    const address = screen.getByRole('textbox', { name: en.proxyAddress })
    fireEvent.change(address, { target: { value: accepted } })
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    await waitFor(() => { expect(screen.getByRole('button', { name: en.useThisProxy })).toHaveProperty('disabled', false) })
    fireEvent.click(screen.getByRole('button', { name: en.useThisProxy }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(scope.getSnapshot().value).toMatchObject({ enableProxy: true, proxyUrl: accepted })
    expect(address).toHaveProperty('value', accepted)
    expect(screen.getByRole('button', { name: en.discard })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    await act(async () => { await scope.set('proxyUrl', next) })
    expect(address).toHaveProperty('value', next)
    expect(screen.getByRole('button', { name: en.discard })).toHaveProperty('disabled', true)
    expect(screen.queryByText(t('proxyTestSucceeded', { status: 'reachable' }))).toBeNull()
    expect(mutate).toHaveBeenCalledExactlyOnceWith([
      { op: 'set', path: ['enableProxy'], value: true },
      { op: 'set', path: ['proxyUrl'], value: accepted },
    ], 0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('becomes clean on returning to exact accepted text without reviving a stale pending probe', async () => {
    const accepted = 'http://127.0.0.1:8111'
    const next = 'http://127.0.0.1:8112'
    let signal: AbortSignal | null | undefined
    let complete!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((path: string, init: RequestInit) => {
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return Promise.resolve(json([]))
      signal = init.signal
      return new Promise<Response>(done => { complete = done })
    }))
    const { scope, mutate } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, proxyUrl: accepted })
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    const address = screen.getByRole('textbox', { name: en.proxyAddress })
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    // Normalized equality alone is not exact-text equality and must retain the edit.
    fireEvent.change(address, { target: { value: ` ${accepted}/ ` } })
    expect(screen.getByRole('button', { name: en.discard })).toHaveProperty('disabled', false)
    fireEvent.change(address, { target: { value: accepted } })
    expect(signal?.aborted).toBe(true)
    expect(screen.getByRole('button', { name: en.discard })).toHaveProperty('disabled', true)
    await act(async () => { complete(json({ proxyUrl: accepted, reachable: true, classification: 'reachable' })) })
    expect(screen.getByRole('button', { name: en.useThisProxy })).toHaveProperty('disabled', true)
    expect(screen.queryByText(t('proxyTestSucceeded', { status: 'reachable' }))).toBeNull()
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    await act(async () => { await scope.set('proxyUrl', next) })
    expect(address).toHaveProperty('value', next)
    expect(screen.getByRole('button', { name: en.discard })).toHaveProperty('disabled', true)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('preserves a different tested candidate across an unrelated save without applying or saving it', async () => {
    const accepted = 'http://127.0.0.1:8110'
    const candidate = 'http://127.0.0.1:8111'
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return json([])
      expect(path).toBe(`${OPENAI_CODEX_PROXY_TEST_PATH}?proxyUrl=${encodeURIComponent(candidate)}`)
      return json({ proxyUrl: candidate, reachable: true, classification: 'reachable' })
    }))
    const { scope, mutate } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, enableProxy: true, proxyUrl: accepted })
    const view = render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    fireEvent.change(screen.getByRole('textbox', { name: en.proxyAddress }), { target: { value: candidate } })
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    await waitFor(() => { expect(screen.getByRole('button', { name: en.useThisProxy })).toHaveProperty('disabled', false) })
    view.rerender(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(mutate).toHaveBeenCalledExactlyOnceWith([{ op: 'set', path: ['enableSearch'], value: true }], 0)
    expect(scope.getSnapshot().value).toMatchObject({ enableProxy: true, proxyUrl: accepted })
    view.rerender(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    expect(screen.getByRole('textbox', { name: en.proxyAddress })).toHaveProperty('value', candidate)
    expect(screen.getByRole('button', { name: en.useThisProxy })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.discard })).toHaveProperty('disabled', false)
    expect(screen.queryByText(t('pendingProxy', { proxyUrl: candidate }))).toBeNull()
  })

  it('preserves typed input across unrelated Host snapshots without enabling Save or mutating settings', async () => {
    const fetchMock = vi.fn(async () => json([]))
    vi.stubGlobal('fetch', fetchMock)
    const { scope, set, mutate } = settingsScopeFixture()
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    const address = screen.getByRole('textbox', { name: en.proxyAddress })
    const candidate = 'http://127.0.0.1:8111'
    fireEvent.change(address, { target: { value: candidate } })
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.discard })).toHaveProperty('disabled', false)
    expect(set).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
    expect(scope.getSnapshot().value).toEqual(DEFAULT_OPENAI_CODEX_SETTINGS)
    await act(async () => { await scope.set('searchModel', 'external-model') })
    expect(address).toHaveProperty('value', candidate)
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(mutate).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(OPENAI_CODEX_MODEL_CATALOG_PATH, expect.anything())
  })

  it('preserves a manual candidate when an unrelated setting is successfully saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([])))
    const { scope, mutate } = settingsScopeFixture()
    const view = render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    const candidate = 'http://127.0.0.1:8111'
    fireEvent.change(screen.getByRole('textbox', { name: en.proxyAddress }), { target: { value: candidate } })
    view.rerender(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(mutate).toHaveBeenCalledExactlyOnceWith([{ op: 'set', path: ['enableSearch'], value: true }], 0)
    expect(scope.getSnapshot().value?.proxyUrl).toBe(DEFAULT_OPENAI_CODEX_SETTINGS.proxyUrl)
    view.rerender(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    expect(screen.getByRole('textbox', { name: en.proxyAddress })).toHaveProperty('value', candidate)
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.useThisProxy })).toHaveProperty('disabled', true)
  })

  it('keeps untouched input following the Host even while an unrelated setting is staged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([])))
    const { scope, mutate } = settingsScopeFixture()
    const view = render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    view.rerender(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    const accepted = 'http://127.0.0.1:8112'
    await act(async () => { await scope.set('proxyUrl', accepted) })
    expect(screen.getByRole('textbox', { name: en.proxyAddress })).toHaveProperty('value', accepted)
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    const newest = 'http://127.0.0.1:8113'
    await act(async () => { await scope.set('proxyUrl', newest) })
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    expect(screen.getByRole('textbox', { name: en.proxyAddress })).toHaveProperty('value', newest)
    expect(screen.getByRole('button', { name: en.discard })).toHaveProperty('disabled', true)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('discards a manual-only draft to the newest accepted value and cancels its obsolete probe', async () => {
    const accepted = 'http://127.0.0.1:8112'
    const candidate = 'http://127.0.0.1:8111'
    let signal: AbortSignal | null | undefined
    let complete!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((path: string, init: RequestInit) => {
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return Promise.resolve(json([]))
      signal = init.signal
      return new Promise<Response>(done => { complete = done })
    }))
    const { scope, mutate } = settingsScopeFixture()
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    fireEvent.change(screen.getByRole('textbox', { name: en.proxyAddress }), { target: { value: candidate } })
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    await act(async () => { await scope.set('proxyUrl', accepted) })
    expect(screen.getByRole('textbox', { name: en.proxyAddress })).toHaveProperty('value', candidate)
    fireEvent.click(screen.getByRole('button', { name: en.discard }))
    expect(signal?.aborted).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    expect(screen.getByRole('textbox', { name: en.proxyAddress })).toHaveProperty('value', accepted)
    await act(async () => { complete(json({ proxyUrl: candidate, reachable: true, classification: 'reachable' })) })
    expect(screen.queryByText(t('proxyTestSucceeded', { status: 'reachable' }))).toBeNull()
    expect(screen.getByRole('button', { name: en.useThisProxy })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.discard })).toHaveProperty('disabled', true)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('resets the old candidate on scope replacement and rejects the old pending probe', async () => {
    const oldCandidate = 'http://127.0.0.1:8111'
    const accepted = 'http://127.0.0.1:8112'
    let signal: AbortSignal | null | undefined
    let complete!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((path: string, init: RequestInit) => {
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return Promise.resolve(json([]))
      signal = init.signal
      return new Promise<Response>(done => { complete = done })
    }))
    const first = settingsScopeFixture()
    const second = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, proxyUrl: accepted })
    const view = render(<OpenAICodexConfiguration scope={first.scope} t={t} activeModule="network" />)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    fireEvent.change(screen.getByRole('textbox', { name: en.proxyAddress }), { target: { value: oldCandidate } })
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    view.rerender(<OpenAICodexConfiguration scope={second.scope} t={t} activeModule="network" />)
    expect(signal?.aborted).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    expect(screen.getByRole('textbox', { name: en.proxyAddress })).toHaveProperty('value', accepted)
    await act(async () => { complete(json({ proxyUrl: oldCandidate, reachable: true, classification: 'reachable' })) })
    expect(screen.queryByText(t('proxyTestSucceeded', { status: 'reachable' }))).toBeNull()
    expect(screen.getByRole('button', { name: en.useThisProxy })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.discard })).toHaveProperty('disabled', true)
    expect(first.mutate).not.toHaveBeenCalled()
    expect(second.mutate).not.toHaveBeenCalled()
  })

  it.each(['changed', 'restored', 'discarded'] as const)('does not let a stale pending probe authorize %s input', async change => {
    const candidate = 'http://127.0.0.1:8111'
    let signal: AbortSignal | null | undefined
    let complete!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn((path: string, init: RequestInit) => {
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return Promise.resolve(json([]))
      signal = init.signal
      return new Promise<Response>(done => { complete = done })
    }))
    const { scope, mutate } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, proxyUrl: candidate })
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    const address = screen.getByRole('textbox', { name: en.proxyAddress })
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    fireEvent.change(address, { target: { value: 'http://127.0.0.1:8112' } })
    if (change === 'restored') fireEvent.change(address, { target: { value: candidate } })
    if (change === 'discarded') {
      fireEvent.click(screen.getByRole('button', { name: en.discard }))
      fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    }
    expect(signal?.aborted).toBe(true)
    await act(async () => { complete(json({ proxyUrl: candidate, reachable: true, classification: 'reachable' })) })
    expect(address).toHaveProperty('value', change === 'changed' ? 'http://127.0.0.1:8112' : candidate)
    expect(screen.getByRole('button', { name: en.useThisProxy })).toHaveProperty('disabled', true)
    expect(screen.queryByText(t('proxyTestSucceeded', { status: 'reachable' }))).toBeNull()
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('requires a successful result for the current normalized address before explicit Use and Save', async () => {
    const candidate = 'http://127.0.0.1:8111'
    let reachable = false
    const fetchMock = vi.fn(async (path: string) => {
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return json([])
      expect(new URL(path, 'http://localhost').searchParams.get('proxyUrl')).toBe(candidate)
      return json({ proxyUrl: candidate, reachable, classification: reachable ? 'reachable' : 'connect-failure' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { scope, mutate } = settingsScopeFixture()
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    fireEvent.change(screen.getByRole('textbox', { name: en.proxyAddress }), { target: { value: ` ${candidate}/ ` } })
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    await screen.findByText(t('proxyTestFailed', { reason: 'connect-failure' }))
    expect(screen.getByRole('button', { name: en.useThisProxy })).toHaveProperty('disabled', true)
    reachable = true
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    await waitFor(() => { expect(screen.getByRole('button', { name: en.useThisProxy })).toHaveProperty('disabled', false) })
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en.useThisProxy }))
    expect(screen.getByText(t('pendingProxy', { proxyUrl: candidate }))).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(mutate).toHaveBeenCalledExactlyOnceWith([
      { op: 'set', path: ['enableProxy'], value: true },
      { op: 'set', path: ['proxyUrl'], value: candidate },
    ], 0)
  })
})


describe('bounded configuration recovery', () => {
  it.each(['replace', 'disable'] as const)('aborts and resets saved checks on external Host %s without disturbing manual probes/edits', async change => {
    const a = 'http://127.0.0.1:8110'
    const b = 'http://127.0.0.1:8111'
    const signals: AbortSignal[] = []
    const complete: ((response: Response) => void)[] = []
    vi.stubGlobal('fetch', vi.fn((path: string, init: RequestInit) => {
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return Promise.resolve(json([]))
      signals.push(init.signal!)
      return new Promise<Response>(done => { complete.push(done) })
    }))
    const { scope } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, enableProxy: true, proxyUrl: a })
    const view = render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    view.rerender(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    fireEvent.click(screen.getByRole('button', { name: en.checkCurrentConnection }))
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    fireEvent.change(screen.getByRole('textbox', { name: en.proxyAddress }), { target: { value: b } })
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    await act(async () => { await scope.set(change === 'replace' ? 'proxyUrl' : 'enableProxy', change === 'replace' ? b : false) })
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
    expect(screen.getByRole('textbox', { name: en.proxyAddress })).toHaveProperty('value', b)
    if (change === 'replace') expect(screen.getByRole('button', { name: en.checkCurrentConnection })).toHaveProperty('disabled', false)
    await act(async () => { complete[0]!(json({ proxyUrl: a, reachable: true })) })
    expect(screen.queryByText(en.currentConnectionHealthy)).toBeNull()
  })
  it.each(['headers', 'body'] as const)('times out catalog %s, ignores late completion and retries explicitly', async phase => {
    vi.useFakeTimers()
    let resolve!: (value: any) => void
    let signal: AbortSignal | null | undefined
    const stalled = new Promise<any>(done => { resolve = done })
    const catalog = modelCatalogFixture([{ id: 'sol', name: 'Sol' }])
    const fetchMock = vi.fn((_path: string, init: RequestInit) => {
      signal = init.signal
      return phase === 'headers' ? stalled : Promise.resolve({ ok: true, json: () => stalled })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { scope } = settingsScopeFixture()
    render(<OpenAICodexConfiguration scope={scope} t={t} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS) })
    expect(signal?.aborted).toBe(true)
    expect(screen.getByText(en.modelCatalogFailed)).toBeTruthy()
    await act(async () => { resolve(phase === 'headers' ? json(catalog) : catalog) })
    expect(screen.queryByRole('checkbox', { name: /Sol/ })).toBeNull()
    fetchMock.mockImplementation(() => Promise.resolve(json(catalog)))
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await act(async () => {})
    expect(screen.getByRole('checkbox', { name: /Sol/ })).toBeTruthy()
  })

  it.each(['detect', 'manual', 'current'] as const)('settles %s timeout and allows explicit retry', async kind => {
    vi.useFakeTimers()
    let retry = false
    let signal: AbortSignal | null | undefined
    const url = 'http://127.0.0.1:8110'
    vi.stubGlobal('fetch', vi.fn((path: string, init: RequestInit) => {
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return Promise.resolve(json([]))
      signal = init.signal
      const result = { proxyUrl: url, reachable: true, classification: 'reachable' }
      return retry ? Promise.resolve(json(kind === 'detect' ? { candidates: [result], results: [result] } : result))
        : Promise.resolve({ ok: true, json: () => new Promise(() => {}) })
    }))
    const { scope } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, enableProxy: true, proxyUrl: url })
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="network" />)
    if (kind === 'manual') fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    const name = kind === 'detect' ? en.scanLocalProxy : kind === 'manual' ? en.testProxy : en.checkCurrentConnection
    fireEvent.click(screen.getByRole('button', { name }))
    await act(async () => { await vi.advanceTimersByTimeAsync(BROWSER_REQUEST_TIMEOUT_MS) })
    expect(signal?.aborted).toBe(true)
    expect(screen.getByRole('button', { name })).toHaveProperty('disabled', false)
    if (kind === 'detect') expect(screen.getByText(en.proxyDetectionFailedTitle)).toBeTruthy()
    if (kind === 'current') expect(screen.getByText(en.currentConnectionFailed)).toBeTruthy()
    if (kind === 'manual') expect(screen.getByText(/Proxy test failed/)).toBeTruthy()
    retry = true
    fireEvent.click(screen.getByRole('button', { name }))
    await act(async () => {})
    if (kind === 'detect') expect(screen.getByText(en.proxyCandidatesFound)).toBeTruthy()
    if (kind === 'current') expect(screen.getByText(en.currentConnectionHealthy)).toBeTruthy()
    if (kind === 'manual') expect(screen.getByText(t('proxyTestSucceeded', { status: 'reachable' }))).toBeTruthy()
  })

  it('aborts superseded manual probes and all pending reads on scope replacement/unmount in StrictMode', async () => {
    const signals: AbortSignal[] = []
    const completions: ((value: Response) => void)[] = []
    vi.stubGlobal('fetch', vi.fn((_path: string, init: RequestInit) => {
      signals.push(init.signal!)
      return new Promise<Response>(done => { completions.push(done) })
    }))
    const first = settingsScopeFixture().scope
    const second = settingsScopeFixture().scope
    const view = render(<StrictMode><OpenAICodexConfiguration scope={first} t={t} activeModule="network" /></StrictMode>)
    expect(signals[0]?.aborted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en.scanLocalProxy }))
    fireEvent.click(screen.getByRole('tab', { name: en.manualEntry }))
    fireEvent.change(screen.getByRole('textbox', { name: en.proxyAddress }), { target: { value: 'http://127.0.0.1:8110' } })
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    const probe = signals.at(-1)!
    fireEvent.change(screen.getByRole('textbox', { name: en.proxyAddress }), { target: { value: 'http://127.0.0.1:8111' } })
    expect(probe.aborted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en.testProxy }))
    view.rerender(<StrictMode><OpenAICodexConfiguration scope={second} t={t} activeModule="network" /></StrictMode>)
    expect(signals.slice(0, -1).every(signal => signal.aborted)).toBe(true)
    await act(async () => { completions.slice(0, -1).forEach(done => done(json({ candidates: [], results: [], reachable: true }))) })
    expect(screen.queryByText(en.proxyCandidatesFound)).toBeNull()
    view.unmount()
    expect(signals.every(signal => signal.aborted)).toBe(true)
  })
})

describe('unchanged Host-accepted context budgets', () => {
  it.each(['loading', 'failed'] as const)('allows intended disables only while catalog is %s', async state => {
    for (const field of ['enableSearch', 'enableImageGeneration', 'enableProxy'] as const) {
      vi.stubGlobal('fetch', vi.fn(() => state === 'loading' ? new Promise<Response>(() => {}) : Promise.resolve(json({}, 503))))
      const initial = { ...DEFAULT_OPENAI_CODEX_SETTINGS, contextWindowOverrides: { sol: 400_000 }, enableSearch: true, enableImageGeneration: true, enableProxy: true, proxyUrl: 'http://127.0.0.1:8110' }
      const { scope, mutate } = settingsScopeFixture(true, initial)
      const view = render(<OpenAICodexConfiguration scope={scope} t={t} activeModule={field === 'enableProxy' ? 'network' : 'capabilities'} />)
      if (state === 'failed') await act(async () => {})
      fireEvent.click(field === 'enableProxy' ? screen.getByRole('button', { name: en.disableProxy }) : screen.getByRole('checkbox', { name: field === 'enableSearch' ? new RegExp(en.enableSearch) : new RegExp(en.enableImageGeneration) }))
      expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', false)
      fireEvent.click(screen.getByRole('button', { name: en.save }))
      await screen.findByText(en.settingsSaved)
      expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: [field], value: false }], 0)
      expect(scope.getSnapshot().value?.contextWindowOverrides).toEqual(initial.contextWindowOverrides)
      view.unmount()
    }
  })

  it.each([undefined, { sol: 400_000 }])('blocks new/edited out-of-range budgets and retains reset masks (%j)', async overrides => {
    vi.stubGlobal('fetch', vi.fn(async () => json(modelCatalogFixture([{ id: 'sol', name: 'Sol' }]))))
    const { scope, mutate } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, contextWindowOverrides: overrides })
    render(<OpenAICodexConfiguration scope={scope} t={t} />)
    await screen.findByRole('checkbox', { name: /Sol/ })
    fireEvent.click(screen.getByRole('button', { name: en.contextAdjust }))
    const budget = screen.getByRole('spinbutton', { name: en.contextTokens })
    fireEvent.change(budget, { target: { value: '900000' } })
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.change(budget, { target: { value: '450000' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(scope.getSnapshot().value?.contextWindowOverrides).toEqual({ sol: 450_000 })
    fireEvent.click(screen.getByRole('button', { name: en.contextReset }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(mutate).toHaveBeenLastCalledWith([{ op: 'set', path: ['contextWindowOverrides'], value: { sol: null } }], 1) })
  })

  it('rejects legacy memory snapshots even if a fixture advertises writable settings', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { scope, mutate } = settingsScopeFixture(true, DEFAULT_OPENAI_CODEX_SETTINGS, 'memory')
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(mutate).not.toHaveBeenCalled()
    expect(scope.getSnapshot().value?.enableSearch).toBe(false)
  })

  it.each([
    { writable: false },
    { revision: undefined },
    { status: 'unavailable' as const },
    { value: undefined },
  ])('refuses an absent-mode save when the latest Host snapshot loses its fence or authority (%j)', async latest => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { scope, mutate } = settingsScopeFixture(true, DEFAULT_OPENAI_CODEX_SETTINGS, 'absent')
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    const changed = { ...scope.getSnapshot(), ...latest }
    // Silent replacement simulates a Host update between rendering and save.
    vi.spyOn(scope, 'getSnapshot').mockReturnValue(changed)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(mutate).not.toHaveBeenCalled()
    expect('mode' in scope.getSnapshot()).toBe(false)
  })

  it.each(['host', 'absent'] as const)('preserves unrelated concurrent changes with latest revision and rejects conflicting same-field edits (%s mode)', async snapshotMode => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const { scope, mutate } = settingsScopeFixture(true, { ...DEFAULT_OPENAI_CODEX_SETTINGS, contextWindowOverrides: { sol: 400_000 }, enableSearch: true }, snapshotMode)
    render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    await act(async () => { await scope.set('enableNativeCompaction', true) })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaved)
    expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['enableSearch'], value: false }], 1)
    expect(scope.getSnapshot().revision).toBe(2)
    expect('mode' in scope.getSnapshot()).toBe(snapshotMode !== 'absent')
    expect(scope.getSnapshot().value?.enableNativeCompaction).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    fireEvent.change(screen.getByRole('textbox', { name: en.searchModel }), { target: { value: 'mine' } })
    await act(async () => { await scope.set('searchModel', 'theirs') })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(scope.getSnapshot().value?.searchModel).toBe('theirs')
  })

  it.each(['host', 'absent'] as const)('honors Host refusal and read-only state without using the missing catalog as authority (%s mode)', async snapshotMode => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const initial = { ...DEFAULT_OPENAI_CODEX_SETTINGS, contextWindowOverrides: { sol: 400_000 }, enableSearch: true }
    const { scope, mutate } = settingsScopeFixture(true, initial, snapshotMode)
    mutate.mockResolvedValueOnce(false)
    const view = render(<OpenAICodexConfiguration scope={scope} t={t} activeModule="capabilities" />)
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(en.enableSearch) }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await screen.findByText(en.settingsSaveFailed)
    expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['enableSearch'], value: false }], 0)
    expect(scope.getSnapshot().value?.enableSearch).toBe(true)
    expect(scope.getSnapshot().revision).toBe(0)
    view.unmount()
    const readonly = settingsScopeFixture(false, initial, snapshotMode)
    render(<OpenAICodexConfiguration scope={readonly.scope} t={t} activeModule="capabilities" />)
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(readonly.mutate).not.toHaveBeenCalled()
  })
})


it('rejects new/edited budgets without trustworthy caps and malformed unchanged structure', () => {
  const accepted = { sol: 400_000 }
  expect(validContextEdits({ ...accepted }, accepted, undefined)).toBe(true)
  expect(validContextEdits({ sol: 450_000 }, accepted, undefined)).toBe(false)
  expect(validContextEdits({ ...accepted, other: 200_000 }, accepted, undefined)).toBe(false)
  expect(validContextEdits({ sol: NaN }, { sol: NaN }, undefined)).toBe(false)
  expect(validContextEdits({ sol: 0 }, { sol: 0 }, undefined)).toBe(false)
  expect(validContextEdits({ sol: 450_000 }, accepted, [])).toBe(false)
  expect(validContextEdits({}, accepted, undefined)).toBe(false)
})
