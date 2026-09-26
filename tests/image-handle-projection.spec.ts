import { describe, expect, it } from 'vitest'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { withOpenAICodexImageSelectionHandles } from '../src/adapter.ts'

function image(id: string, name: string): ImageAttachmentRef {
  return { attachmentId: id as ImageAttachmentRef['attachmentId'], mediaType: 'image/png', width: 1, height: 1, bytes: 10, name }
}

describe('Codex image selection handle projection', () => {
  it('places stable handles immediately after each image in message order without mutating the source request', () => {
    const first = image('sha256:first', 'first.png')
    const second = image('sha256:second', 'second.png')
    const options = {
      provider: 'openai-codex', model: 'gpt-5.6-sol',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Edit the first using the second.' },
        { type: 'image', attachment: first },
        { type: 'image', attachment: second },
      ] }],
    } as GenerateOptions
    const projected = withOpenAICodexImageSelectionHandles(options)
    expect(projected).not.toBe(options)
    expect(options.messages[0]!.content).toHaveLength(3)
    expect(projected.messages[0]!.content).toEqual([
      { type: 'text', text: 'Edit the first using the second.' },
      { type: 'image', attachment: first },
      { type: 'text', text: expect.stringContaining('image 1 in this message: "first.png" attachmentId=sha256:first') },
      { type: 'image', attachment: second },
      { type: 'text', text: expect.stringContaining('image 2 in this message: "second.png" attachmentId=sha256:second') },
    ])
  })

  it('leaves requests without images by identity', () => {
    const options = { provider: 'openai-codex', model: 'gpt-5.6-sol', messages: [
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ] } as GenerateOptions
    expect(withOpenAICodexImageSelectionHandles(options)).toBe(options)
  })
})
