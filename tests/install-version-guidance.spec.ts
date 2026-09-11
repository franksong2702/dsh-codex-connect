import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const install = await readFile(new URL('../INSTALL.md', import.meta.url), 'utf8')
const compatibility = JSON.parse(await readFile(new URL('../verified-compatibility.json', import.meta.url), 'utf8'))
const firstInstall = install.indexOf('dsh plugin --profile web add ')
const preflight = install.slice(0, firstInstall)
const shellBlocks = [...install.matchAll(/```sh\s*\n([\s\S]*?)```/gu)]
  .flatMap(match => (match[1] ?? '').split('\n').map(line => line.trim()))

describe('installation version guidance', () => {
  it.each([
    ['0.1.0-rc.7', '0.1.0-alpha.4.14'],
    ['0.1.1-rc.2', '0.1.0-alpha.4.21'],
    ['0.1.2-alpha.2', '0.1.0-alpha.4.23'],
    ['0.1.2-alpha.5', '0.1.0-alpha.4.25'],
    ['0.1.2-rc.1', '0.1.0-alpha.4.35'],
    ['0.1.5-alpha.1', '0.1.0-alpha.4.35'],
    ['0.1.5-rc.1', '0.1.0-alpha.4.35'],
    ['0.1.5-rc.2', '0.1.0-alpha.4.35'],
  ])('selects the recorded DSH %s / Codex Connect %s pair before installation', (dsh, plugin) => {
    expect(firstInstall).toBeGreaterThan(0)
    expect(compatibility.pluginVersions).toContainEqual(expect.objectContaining({
      version: plugin,
      verifiedDshVersions: expect.arrayContaining([dsh]),
    }))
    const rows = preflight.split('\n').filter(line => line.trim().startsWith('|'))
      .map(line => line.split('|').slice(1, -1).map(cell => cell.replaceAll('`', '').trim()))
    expect(rows).toContainEqual([dsh, plugin])
    expect(shellBlocks).toContain(`dsh plugin --profile web add dsh-codex-connect@${plugin}`)
  })

  it('separates published Reserve availability from default-channel promotion and live acceptance', async () => {
    const [english, chinese] = await Promise.all([
      readFile(new URL('../README.md', import.meta.url), 'utf8'),
      readFile(new URL('../docs/README.zh.md', import.meta.url), 'utf8'),
    ])
    for (const guide of [english, chinese]) {
      expect(guide).toContain('dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.35')
      expect(guide).toContain('`latest`')
    }
    expect(english).toContain('**Published experiment:**')
    expect(english).toContain('disabled by default')
    expect(english).toContain('Real-account Reserve entry and recovery remain unverified')
    expect(chinese).toContain('**已发布的实验功能：**')
    expect(chinese).toContain('仍默认关闭')
    expect(chinese).toContain('仍未验证')
    expect(install).toContain('`latest` intentionally remains on `0.1.0-alpha.4.34`')
    expect(install).toContain('enableReserveFallback: false')
  })

  it('requires version checks and warns against blind alpha installation before any add command', () => {
    expect(preflight).toContain('dsh --version')
    expect(preflight).toContain('verified-compatibility.json')
    expect(preflight).toMatch(/(?:unknown|not listed|unlisted)[^.]*\b(?:verify|check)\b/iu)
    expect(preflight).toMatch(/(?:do not|never)[^\n]*dsh-codex-connect@alpha/iu)
    expect(shellBlocks).not.toContain('dsh plugin --profile web add dsh-codex-connect@alpha')
  })

  it('retains exact GitHub fallbacks for the latest releases when npm is unavailable', () => {
    expect(install).toMatch(/npm is unavailable[^\n]*github:franksong2702\/dsh-codex-connect#v0\.1\.0-alpha\.4\.21/iu)
    expect(install).toMatch(/npm is unavailable[^\n]*github:franksong2702\/dsh-codex-connect#v0\.1\.0-alpha\.4\.23/iu)
    expect(install).toMatch(/npm is unavailable[^\n]*github:franksong2702\/dsh-codex-connect#v0\.1\.0-alpha\.4\.25/iu)
    expect(install).toMatch(/npm is unavailable[^\n]*github:franksong2702\/dsh-codex-connect#v0\.1\.0-alpha\.4\.35/iu)
  })
})
