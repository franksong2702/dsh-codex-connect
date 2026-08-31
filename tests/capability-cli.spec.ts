import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { run } from '../src/bin.ts'

let root: string | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

describe('assembled capability CLI', () => {
  it('snapshots the actual offline command with unread credential contents', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-capabilities-'))
    vi.stubEnv('DSH_HOME', root)
    await writeFile(join(root, '.openai-codex-auth.json'), 'invalid-private-credential', { mode: 0o600 })
    let output = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { output += String(chunk); return true })
    expect(await run(['capabilities', '--model', 'gpt-5.6-sol'])).toBe(2)
    expect(output).toMatchSnapshot()
    expect(output).not.toContain(root)
    expect(output).not.toContain('invalid-private-credential')
  })

  it('uses the real command to skip a probe when signed out', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-capabilities-'))
    vi.stubEnv('DSH_HOME', root)
    let output = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { output += String(chunk); return true })
    expect(await run(['capabilities', '--model', 'gpt-5.6-sol', '--probe', '--json'])).toBe(1)
    const report = JSON.parse(output)
    expect(report).toMatchObject({ scope: 'standalone-route-only', probe: { state: 'skipped' }, checks: { oauth: { status: 'rejected' }, responses: { status: 'unknown' } } })
    expect(output).not.toContain(root)
  })

  it('uses the real reviewer command to stay offline when signed out', async () => {
    root = await mkdtemp(join(tmpdir(), 'codex-capabilities-'))
    vi.stubEnv('DSH_HOME', root)
    let output = ''
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { output += String(chunk); return true })
    expect(await run(['auto-review-probe', '--json'])).toBe(1)
    expect(JSON.parse(output)).toMatchObject({ scope: 'auto-review-route-only', probe: { state: 'skipped' }, checks: { oauth: { status: 'rejected' }, reviewer: { status: 'unknown' } } })
    expect(output).not.toContain(root)
  })

  it.each([
    ['--probe'], ['--model'], ['--timeout-ms', '0'], ['--timeout-ms', '60001'],
    ['--proxy', 'https://user:private-password@example.test'], ['--json', '--json'], ['--token', 'private-access'],
  ])('rejects flags without echoing their contents: %j', async (...args) => {
    let output = ''
    vi.spyOn(process.stderr, 'write').mockImplementation(chunk => { output += String(chunk); return true })
    expect(await run(['capabilities', ...args])).toBe(2)
    expect(output).toContain('Usage:')
    expect(output).not.toContain('private-')
  })
})
