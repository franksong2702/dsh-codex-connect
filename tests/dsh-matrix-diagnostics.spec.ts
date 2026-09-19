import { describe, expect, it } from 'vitest'
// @ts-expect-error Plain Node verification helper is outside the shipped TypeScript API.
import { matrixFailureMessage } from '../scripts/check-dsh-matrix.mjs'

describe('declared-host matrix failure evidence', () => {
  it('retains the failed host, exit status and nested checker diagnostic', () => {
    const text = matrixFailureMessage('0.1.5-rc.2', {
      status: 1,
      stderr: 'check-dsh-install: installed runtime contract failed with exit 1:\nAssertionError: checkpoint mismatch\n',
    })
    expect(text).toContain('DSH 0.1.5-rc.2 isolated check failed (exit=1)')
    expect(text).toContain('installed runtime contract failed')
    expect(text).toContain('AssertionError: checkpoint mismatch')
  })

  it('redacts paths and tokens with the existing canary sanitizer and never copies stdout', () => {
    const token = `${'a'.repeat(24)}.${'b'.repeat(24)}.${'c'.repeat(24)}`
    const text = matrixFailureMessage('0.1.2-rc.1', {
      status: 2, stdout: 'stdout-private-fixture',
      stderr: `check-dsh-install: failed at /Users/fixture/private/entry.js\n${process.cwd()}/private\n${token}`,
    })
    for (const privateText of ['/Users/fixture', process.cwd(), token, 'stdout-private-fixture']) {
      expect(text).not.toContain(privateText)
    }
    expect(text).toContain('<redacted-token>')
  })

  it('bounds retained lines and diagnostic length', () => {
    const text = matrixFailureMessage('0.1.5-rc.1', {
      status: 1, stderr: `old-line\n${Array.from({ length: 30 }, (_, i) => `line-${i}`).join('\n')}\n${'长'.repeat(5000)}`,
    })
    expect(text).not.toContain('old-line')
    expect(text).not.toContain('line-0\n')
    expect(text.length).toBeLessThanOrEqual(1800)
  })

  it('reports timeout and cleanup state without copying exception messages', () => {
    const text = matrixFailureMessage('0.1.2-rc.1', {
      status: null, stderr: '',
      error: Object.assign(new Error('private-command-arguments'), { code: 'ETIMEDOUT' }),
      cleanupError: new Error('private-cleanup-path'),
    })
    expect(text).toContain('exit=unknown')
    expect(text).toContain('error=ETIMEDOUT')
    expect(text).toContain('cleanup=failed')
    expect(text).toContain('no child stderr retained')
    expect(text).not.toContain('private-')
  })

  it('does not expose unknown error codes or invent a failure cause', () => {
    const text = matrixFailureMessage('0.1.5-alpha.1', {
      status: 1, stderr: '', error: { code: '/private/unknown', message: 'network probably failed' },
    })
    expect(text).toContain('error=unclassified')
    expect(text).not.toContain('/private')
    expect(text).not.toContain('network')
  })
})
