// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { formatOpenAICodexResetAt, OpenAICodexSettings } from '../src/client/OpenAICodexSettings.tsx'
import { en, zh } from '../src/client/locales.ts'
import type { OpenAICodexSettingsKey } from '../src/client/locales.ts'
import { DEFAULT_OPENAI_CODEX_SETTINGS } from '../src/settings-contract.ts'
import type { OpenAICodexSettingsConfig } from '../src/settings-contract.ts'
import {
  OPENAI_CODEX_AUTH_LOGIN_PATH,
  OPENAI_CODEX_AUTH_LOGOUT_PATH,
  OPENAI_CODEX_AUTH_STATUS_PATH,
} from '../src/auth-paths.ts'
import { OPENAI_CODEX_MODEL_CATALOG_PATH } from '../src/model-contract.ts'
import { OPENAI_CODEX_PROXY_DETECT_PATH, OPENAI_CODEX_PROXY_TEST_PATH } from '../src/proxy-paths.ts'

function t(key: OpenAICodexSettingsKey, params: Record<string, unknown> = {}): string {
  return Object.entries(params).reduce(
    (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
    en[key],
  )
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
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

function settingsScopeFixture(writable = true): {
  scope: SettingsScope<OpenAICodexSettingsConfig>
  set: ReturnType<typeof vi.fn>
} {
  let snapshot: SettingsScopeSnapshot<OpenAICodexSettingsConfig> = {
    status: 'ready',
    value: { ...DEFAULT_OPENAI_CODEX_SETTINGS },
    base: { ...DEFAULT_OPENAI_CODEX_SETTINGS },
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
      unset: vi.fn(async () => undefined),
    },
  }
}

afterEach(() => {
  cleanup()
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
    fireEvent.click(await screen.findByRole('button', { name: en.login }))

    expect(await screen.findByText(en.popupBlockedFallback)).toBeTruthy()
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
    expect(screen.getAllByRole('status').some(status => status.textContent?.includes(en.reauthRequired))).toBe(true)
    expect(screen.getByRole('button', { name: en.loginAgain })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.logout })).toBeNull()
    expect(zh.reauthRequired).toBe('需要重新登录')

    fireEvent.click(screen.getByRole('button', { name: en.loginAgain }))
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

    fireEvent.click(screen.getByRole('button', { name: en.logout }))
    expect(await screen.findByText(en.signedOut)).toBeTruthy()
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
    fireEvent.click(await screen.findByRole('button', { name: en.logout }))

    expect(await screen.findByText('Could not sign out')).toBeTruthy()
    expect((screen.getByRole('button', { name: en.loginAgain }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('stages, discards, and saves optional capability settings in the same card', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? json([{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }, { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }])
      : json({ status: 'signed-out' }))
    const { scope, set } = settingsScopeFixture()
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    const enableSearch = await screen.findByRole('checkbox', { name: /Enable Codex search provider/u }) as HTMLInputElement
    const enableImageGeneration = screen.getByRole('checkbox', { name: /Enable GPT Image generation/u }) as HTMLInputElement
    const model = screen.getByRole('textbox', { name: en.searchModel }) as HTMLInputElement
    expect(enableSearch.checked).toBe(false)
    expect(enableImageGeneration.checked).toBe(false)
    expect(en.enableImageGenerationHelp).toBe('Let GPT models use GPT Image to generate images in conversations.')
    expect(zh.enableImageGeneration).toBe('启用 GPT Image 图片生成')
    expect(zh.enableImageGenerationHelp).toBe('启用后，GPT 模型可以在对话中调用 GPT Image 生成图片。')
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
    fireEvent.click(screen.getByRole('button', { name: en.save }))

    expect(await screen.findByText(en.settingsSaved)).toBeTruthy()
    expect(set).toHaveBeenCalledWith('enableSearch', true)
    expect(set).toHaveBeenCalledWith('searchModel', 'gpt-search-custom')
    expect(set).toHaveBeenCalledWith('searchMode', 'live')
    expect(set).toHaveBeenCalledWith('searchMaxOutputTokens', 2048)
    expect(set).toHaveBeenCalledWith('enableImageGeneration', true)
  })

  it('keeps Detect and Test draft-only, then activates and disables explicitly', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const path = requestPath(input)
      if (path === OPENAI_CODEX_PROXY_DETECT_PATH) {
        return json({ detected: true, source: 'HTTPS_PROXY', valid: true, proxyUrl: 'http://127.0.0.1:9000' })
      }
      if (path === OPENAI_CODEX_PROXY_TEST_PATH) return json({ ok: true, statusCode: 404 })
      if (path === OPENAI_CODEX_MODEL_CATALOG_PATH) return json([])
      return json({ status: 'signed-out' })
    })
    const { scope, set } = settingsScopeFixture()
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
    expect(await screen.findByText(en.proxyStatusDirect)).toBeTruthy()
    expect(document.querySelector('[data-openai-codex-proxy-rail="direct"]')).toBeTruthy()
    const draft = screen.getByRole('textbox', { name: en.proxyUrl }) as HTMLInputElement
    expect(draft.value).toBe(DEFAULT_OPENAI_CODEX_SETTINGS.proxyUrl)

    fireEvent.click(screen.getByRole('button', { name: en.proxyDetect }))
    expect(await screen.findByText(en.proxyEnvironmentDetected
      .replace('{source}', 'HTTPS_PROXY')
      .replace('{url}', 'http://127.0.0.1:9000'))).toBeTruthy()
    expect(draft.value).toBe('http://127.0.0.1:9000')
    expect(set).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: en.proxyTest }))
    expect(await screen.findByText(en.proxyTestSucceeded)).toBeTruthy()
    expect(set).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: en.proxyActivate }))
    expect(await screen.findByText(en.proxyActivated)).toBeTruthy()
    expect(set).toHaveBeenNthCalledWith(1, 'proxyUrl', 'http://127.0.0.1:9000')
    expect(set).toHaveBeenNthCalledWith(2, 'enableProxy', true)
    expect(document.querySelector('[data-openai-codex-proxy-rail="active"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: en.proxyDisable }))
    expect(await screen.findByText(en.proxyDisabled)).toBeTruthy()
    expect(set).toHaveBeenLastCalledWith('enableProxy', false)
    expect(document.querySelector('[data-openai-codex-proxy-rail="direct"]')).toBeTruthy()
  })

  it('stages model visibility in provider order and saves it with the other plugin settings', async () => {
    const availableModels = [
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' },
    ]
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => requestPath(input) === OPENAI_CODEX_MODEL_CATALOG_PATH
      ? json(availableModels)
      : json({ status: 'signed-out' }))
    const { scope, set } = settingsScopeFixture()
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)
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

  it('disables capability edits when the Host settings document is read-only', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => json({ status: 'signed-out' }))
    const { scope } = settingsScopeFixture(false)
    vi.stubGlobal('fetch', fetchMock)

    render(<OpenAICodexSettings t={t} configScope={scope} embedded />)

    expect(await screen.findByText(en.settingsReadOnly)).toBeTruthy()
    expect(document.querySelector('fieldset')?.disabled).toBe(true)
    expect((screen.getByRole('button', { name: en.save }) as HTMLButtonElement).disabled).toBe(true)
  })
})
