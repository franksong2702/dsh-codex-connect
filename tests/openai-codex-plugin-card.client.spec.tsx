// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICodexPluginCard } from '../src/client/OpenAICodexPluginCard.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
})

describe('OpenAI Codex Plugin configuration card', () => {
  it('uses the DSH native 14px outline chevron for the disclosure control', () => {
    render(
      <OpenAICodexPluginCard
        t={(key) => en[key]}
        configScope={undefined as never}
        useSessions={vi.fn() as never}
        useWorkspaces={vi.fn() as never}
        useSessionPendingInteraction={vi.fn() as never}
      />,
    )

    const header = screen.getByRole('button', { name: `${en.expand}: ${en.title}` })
    expect(header.textContent).toContain('GPT Image')
    expect(header.closest('li')?.style.background).toBe('var(--dsw-alias-bg-layer-3)')
    fireEvent.click(header)
    expect(header.closest('li')?.style.background).toBe('var(--dsw-alias-bg-layer-2)')
    const icon = header.querySelector('svg')

    expect(icon?.getAttribute('viewBox')).toBe('0 0 14 14')
    expect(icon?.getAttribute('width')).toBe('14')
    expect(icon?.getAttribute('height')).toBe('14')
    expect(icon?.querySelector('path')?.getAttribute('d')).toContain('M11.8486 5.5L11.4238 5.92383')
  })
})
