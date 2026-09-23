// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { OpenAICodexPluginCard } from '../src/client/OpenAICodexPluginCard.tsx'
import { en } from '../src/client/locales.ts'

vi.mock('../src/client/OpenAICodexSettings.tsx', () => ({
  OpenAICodexSettings: ({ embedded }: { embedded?: boolean }) => <section data-testid="codex-settings-page" data-embedded={embedded} />,
}))

afterEach(cleanup)

it('renders the settings page directly inside its dedicated Plugins tab', () => {
  render(<OpenAICodexPluginCard
    t={key => en[key]}
    configScope={undefined as never}
    useSessions={vi.fn() as never}
    useSessionStatus={vi.fn() as never}
    useSessionRetainInfo={vi.fn() as never}
    useWorkspaces={vi.fn() as never}
    usePanelInfo={vi.fn() as never}
  />)

  expect(screen.getByTestId('codex-settings-page').getAttribute('data-embedded')).toBe('true')
})
