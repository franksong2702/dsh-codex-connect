// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { OpenAICodexPluginCard } from '../src/client/OpenAICodexPluginCard.tsx'
import { en } from '../src/client/locales.ts'

vi.mock('../src/client/OpenAICodexSettings.tsx', () => ({
  OpenAICodexSettings: ({ embedded }: { embedded?: boolean }) => <section data-testid="codex-settings-page" data-embedded={embedded} />,
}))

afterEach(cleanup)

it.each([true, false])('renders the settings page with embedded chrome mode %s', embedded => {
  render(<OpenAICodexPluginCard
    t={key => en[key]}
    configScope={undefined as never}
    embedded={embedded}
  />)

  expect(screen.getByTestId('codex-settings-page').getAttribute('data-embedded')).toBe(String(embedded))
})
