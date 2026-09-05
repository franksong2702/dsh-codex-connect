// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { formatOpenAICodexResetAt, OpenAICodexSettings } from '../src/client/OpenAICodexSettings.tsx'
import { OpenAICodexConfiguration } from '../src/client/OpenAICodexConfiguration.tsx'
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
): {
  scope: SettingsScope<OpenAICodexSettingsConfig>
  set: ReturnType<typeof vi.fn>
} {
  let snapshot: SettingsScopeSnapshot<OpenAICodexSettingsConfig> = {
    status: 'ready',
    value: { ...initial },
    base: { ...initial },
    user: undefined,
    revision: 0,
    writable,
    mode: 'host',
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
  })
  return {
    set,
    scope: {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      set,
      mutate: vi.fn(async () => { throw new Error('This fixture supports single-field settings writes only.') }),
      unset: vi.fn(async () => undefined),
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
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('OpenAI Codex Plugin configuration card', () => {
  it('shows a dedicated remote-origin trust state without auth mutations and copies only the suggested command', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      expect(requestPath(input)).toBe(OPENAI_CODEX_AUTH_STATUS_PATH)
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
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('offers a user-clicked browser link when the popup is blocked', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
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
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('closes the popup and surfaces a failed login request', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
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
    expect(screen.getByRole('status').textContent).toContain(en.reauthRequired)
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

  it('stages, discards, and saves optional capability settings in the same card', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? json(modelCatalogFixture([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }, { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }]))
      : json({ status: 'signed-out' }))
    const { scope, set } = settingsScopeFixture()
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    fireEvent.click(screen.getByRole('tab', { name: en.capabilitiesModule }))
    const enableSearch = await screen.findByRole('checkbox', { name: /Enable Codex search provider/u }) as HTMLInputElement
    const enableImageGeneration = screen.getByRole('checkbox', { name: /Enable GPT Image generation/u }) as HTMLInputElement
    const enableAutoReview = screen.getByRole('checkbox', { name: /Codex Auto-review/u }) as HTMLInputElement
    const model = screen.getByRole('textbox', { name: en.searchModel }) as HTMLInputElement
    const save = screen.getByRole('button', { name: en.save }) as HTMLButtonElement
    expect(save.style.background).toBe('var(--dsw-alias-button-primary-fill)')
    expect(save.style.color).toBe('var(--dsw-alias-label-primary-foreground)')
    expect(enableSearch.checked).toBe(false)
    expect(enableImageGeneration.checked).toBe(false)
    expect(enableAutoReview.checked).toBe(false)
    expect(en.enableImageGenerationHelp).toBe('Let GPT models use GPT Image to generate images in conversations.')
    expect(zh.enableImageGeneration).toBe('启用 GPT Image 图片生成')
    expect(zh.enableImageGenerationHelp).toBe('启用后，GPT 模型可以在对话中调用 GPT Image 生成图片。')
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
    expect(set).toHaveBeenCalledWith('enableSearch', true)
    expect(set).toHaveBeenCalledWith('searchModel', 'gpt-search-custom')
    expect(set).toHaveBeenCalledWith('searchMode', 'live')
    expect(set).toHaveBeenCalledWith('searchMaxOutputTokens', 2048)
    expect(set).toHaveBeenCalledWith('enableImageGeneration', true)
    expect(set).toHaveBeenCalledWith('autoReviewDisclosureAcknowledged', true)
    expect(set).toHaveBeenCalledWith('enableAutoReview', true)
    fireEvent.click(enableAutoReview)
    fireEvent.click(save)
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    fireEvent.click(enableAutoReview)
    expect(enableAutoReview.checked).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
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
    const { scope, set } = settingsScopeFixture()
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
    expect(set).toHaveBeenCalledWith('models', ['gpt-5.6-luna', 'gpt-5.6-terra'])
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
    const { scope, set } = settingsScopeFixture()
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
    expect(set).not.toHaveBeenCalledWith('enableProxy', true)

    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(set).toHaveBeenCalledWith('proxyUrl', candidate)
    expect(set).toHaveBeenCalledWith('enableProxy', true)
    expect(fetchMock.mock.calls.some(([input]) => requestPath(input) === OPENAI_CODEX_PROXY_TEST_PATH)).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: en.disableProxy }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(set).toHaveBeenCalledWith('enableProxy', false) })
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
    const { scope, set } = settingsScopeFixture()
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
    expect(set).not.toHaveBeenCalledWith('enableProxy', true)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(set).toHaveBeenCalledWith('proxyUrl', second)
    expect(set).toHaveBeenCalledWith('enableProxy', true)
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
    const { scope, set } = settingsScopeFixture(true, {
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
    expect(set).toHaveBeenCalledWith('proxyUrl', second)
    expect(set).not.toHaveBeenCalledWith('enableProxy', false)
    expect(scope.getSnapshot().value?.enableProxy).toBe(true)
  })

  it('ignores a late current-connection result after the saved proxy changes', async () => {
    const current = 'http://127.0.0.1:8110'
    let resolveProbe: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return Promise.resolve(json(modelCatalogFixture([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }])))
      if (path === OPENAI_CODEX_AUTH_STATUS_PATH) return Promise.resolve(json({ status: 'signed-out' }))
      expect(path.startsWith(`${OPENAI_CODEX_PROXY_TEST_PATH}?`)).toBe(true)
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

    resolveProbe?.(json({ proxyUrl: current, reachable: true, classification: 'reachable', status: 401 }))
    await waitFor(() => { expect(screen.queryByText(en.currentConnectionHealthy)).toBeNull() })
    expect(within(screen.getByRole('group', { name: en.currentConnection })).getByText(en.directConnection)).toBeTruthy()
  })

  it('keeps the pending proxy change available when the Host save fails', async () => {
    const current = 'http://127.0.0.1:8110'
    const { scope, set } = settingsScopeFixture(true, {
      ...DEFAULT_OPENAI_CODEX_SETTINGS,
      enableProxy: true,
      proxyUrl: current,
    })
    set.mockRejectedValueOnce(new Error('write failed'))
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
    const { scope, set } = settingsScopeFixture()

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
    expect(set).not.toHaveBeenCalled()
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
