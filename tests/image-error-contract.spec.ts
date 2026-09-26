import { describe, expect, it } from 'vitest'
import { IMAGE_INPUT_FAILURE_REASONS, imageInputFailureMessage, safeImageFailure, imageTransportErrorMessage } from '../src/image-error-contract.ts'
const content = (text: string) => [{ type: 'text', text }]

describe('public image error boundary', () => {
  it.each(IMAGE_INPUT_FAILURE_REASONS)('renders the fixed input reason, not an upstream string: %s', reason => {
    const message = imageInputFailureMessage('Reference image 2', reason)
    expect(safeImageFailure(content(message))).toMatchObject({ message, retryable: false, recovery: 'input' })
    expect(safeImageFailure(content('Error: ' + message))?.message).toBe('Error: ' + message)
  })
  it.each([
    'Bearer PRIVATE_FIXTURE_TOKEN',
    '/Users/private-account/image.png',
    '<img src=x onerror=alert(1)>',
    'data:image/png;base64,PRIVATE_FIXTURE',
    'Target image: is required. Bearer PRIVATE_FIXTURE_TOKEN',
    'Error: Error: Target image: is required.',
    'Reference image 50: is required.',
  ])('never exposes arbitrary raw failure content: %s', text => {
    expect(safeImageFailure(content(text))).toBeUndefined()
  })
  it('keeps transient failures retryable and sign-in failures actionable', () => {
    expect(safeImageFailure(content(imageTransportErrorMessage('OPENAI_CODEX_TIMEOUT')))).toMatchObject({ retryable: true })
    expect(safeImageFailure(content(imageTransportErrorMessage('OPENAI_CODEX_SIGNED_OUT')))).toMatchObject({ retryable: false, recovery: 'account' })
    expect(imageTransportErrorMessage('toString')).toBe('Image generation failed without exposing private response details.')
  })
})
