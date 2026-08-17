import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertNoOpenAICodexProviderConflict,
  diagnoseOpenAICodex,
} from '../src/doctor.ts'

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('Codex Connect doctor', () => {
  it('reports defaults and a missing credential without starting OAuth', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-connect-doctor-'))
    const report = await diagnoseOpenAICodex({ credentialPath: join(root, 'missing.json') })
    expect(report.credentialFile.state).toBe('missing')
    expect(report.capabilities).toEqual({
      modelProvider: true,
      search: false,
      imageTool: false,
      changesHarnessDefaultModel: false,
      changesHarnessSearchRoute: false,
    })
    expect(report.compatibility.status).toBe('compatible')
  })

  it('uses metadata only and never returns credential content', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-connect-doctor-'))
    const filename = join(root, 'auth.json')
    const secret = 'access-token-must-not-leak'
    await writeFile(filename, secret, { mode: 0o600 })
    if (process.platform !== 'win32') await chmod(filename, 0o644)
    const report = await diagnoseOpenAICodex({ credentialPath: filename })
    expect(JSON.stringify(report)).not.toContain(secret)
    expect(report.credentialFile.state).toBe(process.platform === 'win32' ? 'owner-only' : 'permissions-too-broad')
  })

  it('gives a focused migration hint for a provider collision', async () => {
    const failure = () => assertNoOpenAICodexProviderConflict(['deepseek-official', 'openai-codex'])
    expect(failure).toThrow(/legacy dsh-codex bundle or manual openai-codex provider row/)
    await expect(diagnoseOpenAICodex({ providerIds: ['openai-codex'] }))
      .resolves.toMatchObject({ providerConflict: true })
  })

  it('reports incompatible dependencies and gives a non-mutating repair hint', async () => {
    const report = await diagnoseOpenAICodex({
      compatibilityOptions: {
        nodeVersion: 'v22.19.0',
        packageVersions: {
          '@deepseek-ai/dsh-llm': '0.1.0-rc.6',
          '@deepseek-ai/dsh-llm-pi-ai': '0.1.0-rc.5',
          '@earendil-works/pi-ai': '0.82.1',
        },
      },
    })
    expect(report.compatibility.status).toBe('incompatible')
    expect(report.hints.join('\n')).toMatch(/pin @earendil-works\/pi-ai to 0\.82\.1/)
  })

  it('reports unknown compatibility without pretending it is supported', async () => {
    const report = await diagnoseOpenAICodex({
      compatibilityOptions: { nodeVersion: 'not-a-node-version', packageVersions: {} },
    })
    expect(report.compatibility.status).toBe('unknown')
    expect(report.hints.join('\n')).toMatch(/Compatibility is unknown/)
  })
})
