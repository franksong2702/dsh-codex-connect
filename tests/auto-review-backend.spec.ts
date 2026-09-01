import { describe, expect, it } from 'vitest'
import { parseAutoReviewAssessment, parseAutoReviewStream } from '../src/auto-review-backend.ts'

const assessment = {
  risk_level: 'high',
  user_authorization: 'medium',
  outcome: 'allow',
  rationale: 'The user authorized this exact bounded action.',
} as const

function stream(value: unknown): string {
  return `data: ${JSON.stringify({
    type: 'response.completed',
    response: {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
    },
  })}\n\ndata: [DONE]\n\n`
}

describe('Auto-review backend protocol', () => {
  it('accepts only the exact structured assessment', () => {
    expect(parseAutoReviewAssessment(JSON.stringify(assessment))).toEqual(assessment)
    expect(parseAutoReviewAssessment(JSON.stringify({ ...assessment, extra: true }))).toBeUndefined()
    expect(parseAutoReviewAssessment(JSON.stringify({ ...assessment, rationale: '' }))).toBeUndefined()
    expect(parseAutoReviewAssessment(JSON.stringify({ ...assessment, rationale: 'x'.repeat(4097) }))).toBeUndefined()
    expect(parseAutoReviewAssessment('not-json')).toBeUndefined()
  })

  it('accepts one completed SSE assessment and rejects fail-open variants', () => {
    expect(parseAutoReviewStream(stream(assessment))).toEqual(assessment)
    expect(parseAutoReviewStream(`${stream(assessment)}${stream(assessment)}`)).toBeUndefined()
    expect(parseAutoReviewStream('data: {"type":"response.failed"}\n\n')).toBeUndefined()
    expect(parseAutoReviewStream('data: {')).toBeUndefined()
  })
})
