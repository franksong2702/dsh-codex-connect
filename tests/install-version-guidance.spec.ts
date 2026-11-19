import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const install = await readFile(new URL('../INSTALL.md', import.meta.url), 'utf8')
const compatibility = JSON.parse(await readFile(new URL('../verified-compatibility.json', import.meta.url), 'utf8'))
const releaseHistory = await readFile(new URL('../docs/release-notes/README.md', import.meta.url), 'utf8')
const firstInstall = install.indexOf('dsh plugin --profile web add ')
const preflight = install.slice(0, firstInstall)
const shellBlocks = [...install.matchAll(/```sh\s*\n([\s\S]*?)```/gu)]
  .flatMap(match => (match[1] ?? '').split('\n').map(line => line.trim()))
const retiredDshVersions = ['0.1.7-rc.1', '0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2']
const alpha5Hosts = [...retiredDshVersions,
  '0.2.1-alpha.1', '0.2.1-alpha.2', '0.2.1-alpha.3', '0.2.1-alpha.4', '0.2.1-alpha.5', '0.2.1-rc.1']
const alpha11Hosts = [...alpha5Hosts, '0.2.1-rc.2', '0.2.1-rc.3', '0.2.1-rc.4', '0.2.1-rc.5']
const alpha12Hosts = [...alpha11Hosts, '0.2.2-alpha.3']
const alpha13Hosts = [...alpha12Hosts, '0.2.2-rc.1']
const alpha14Hosts = [...alpha13Hosts, '0.2.2-rc.2']
const alpha15Hosts = [...alpha14Hosts, '0.2.2-rc.3']

describe('installation version guidance', () => {
  it.each(['0.2.1-alpha.4', '0.2.1-alpha.5', '0.2.1-rc.1'])('preserves the first published %s support in historical Alpha 5', version => {
    expect(releaseHistory).toContain('../../INSTALL.md#020-alpha5-verified-publication')
    expect(install).toContain('Historical Alpha 5')
    expect(install).toContain(`\`${version}\``)
    const firstAlpha5 = compatibility.pluginVersions.findIndex((entry: { version: string }) => entry.version === '0.2.0-alpha.5')
    expect(firstAlpha5).toBeGreaterThanOrEqual(0)
    expect(compatibility.pluginVersions.slice(0, firstAlpha5)
      .every((entry: { verifiedDshVersions: string[] }) =>
      !entry.verifiedDshVersions.includes(version))).toBe(true)
  })

  it('retires the four oldest source pairings', async () => {
    const declared = JSON.parse(await readFile(new URL('../compatibility.json', import.meta.url), 'utf8'))
    expect(declared.dshPluginApi.versions).toEqual([...alpha15Hosts.slice(retiredDshVersions.length), '0.2.2-rc.4', '0.2.2-rc.5'])
  })

  it('preserves historical pairings including the first rc.5 support', () => {
    expect(compatibility.pluginVersions.find((entry: { version: string }) => entry.version === '0.2.0-alpha.5')?.verifiedDshVersions)
      .toEqual(alpha5Hosts)
    expect(compatibility.pluginVersions.find((entry: { version: string }) => entry.version === '0.2.0-alpha.10')?.verifiedDshVersions)
      .toEqual([...alpha5Hosts, '0.2.1-rc.2', '0.2.1-rc.3'])
    expect(compatibility.pluginVersions.find((entry: { version: string }) => entry.version === '0.2.0-alpha.11')?.verifiedDshVersions)
      .toEqual(alpha11Hosts)
    expect(compatibility.pluginVersions.find((entry: { version: string }) => entry.version === '0.2.0-alpha.9')?.verifiedDshVersions)
      .toEqual([...alpha5Hosts, '0.2.1-rc.2'])
    expect(install).toContain('### 0.2.0-alpha.9 verified publication')
    expect(install).toContain('### 0.2.0-alpha.8 verified publication')
    expect(compatibility.pluginVersions.find((entry: { version: string }) => entry.version === '0.2.0-alpha.8')?.verifiedDshVersions)
      .toEqual([...alpha5Hosts, '0.2.1-rc.2'])
    expect(install).toContain('### 0.2.0-alpha.7 verified publication')
    expect(compatibility.pluginVersions.find((entry: { version: string }) => entry.version === '0.2.0-alpha.7')?.verifiedDshVersions)
      .toEqual([...alpha5Hosts, '0.2.1-rc.2'])
    expect(install).not.toContain('does not support DSH `0.2.1-rc.2`')
  })

  it('links the historical Alpha 10 and Alpha 9 pairings separately', () => {
    expect(releaseHistory).toContain('(0.2.0-alpha.10.md)')
    expect(releaseHistory).toContain('../../INSTALL.md#020-alpha9-verified-publication')
    expect(compatibility.pluginVersions.find((entry: { version: string }) => entry.version === '0.2.0-alpha.9')?.verifiedDshVersions)
      .not.toContain('0.2.1-rc.3')
  })

  it('recommends published Alpha 15 while preserving Alpha 12 and earlier host limits', () => {
    expect(install).toContain('0.2.2-alpha.3')
    expect(install).toContain('**Published Alpha 15:**')
    expect(install).not.toContain('Alpha 12 candidate, not yet published')
    expect(compatibility.pluginVersions.find((entry: { version: string }) => entry.version === '0.2.0-alpha.12')?.verifiedDshVersions)
      .toEqual(alpha12Hosts)
    expect(install).toContain('**Historical Alpha 12:**')
    expect(install).toContain('### 0.2.0-alpha.12 verified publication')
    expect(install).toContain('### 0.2.0-alpha.13 verified publication')
    expect(install).toContain('https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.2.0-alpha.12')
    expect(releaseHistory).toContain('(0.2.0-alpha.12.md)')
    const firstAlpha12 = compatibility.pluginVersions.findIndex((entry: { version: string }) => entry.version === '0.2.0-alpha.12')
    expect(firstAlpha12).toBeGreaterThanOrEqual(0)
    expect(compatibility.pluginVersions.slice(0, firstAlpha12)
      .every((entry: { verifiedDshVersions: string[] }) => !entry.verifiedDshVersions.includes('0.2.2-alpha.3'))).toBe(true)
  })

  it.each(['0.2.1-rc.4', '0.2.1-rc.5'])('recommends %s with published Alpha 15 and preserves Alpha 10/11 records', version => {
    expect(compatibility.pluginVersions.find((entry: { version: string }) => entry.version === '0.2.0-alpha.10')?.verifiedDshVersions)
      .not.toContain(version)
    expect(compatibility.pluginVersions.find((entry: { version: string }) => entry.version === '0.2.0-alpha.11')?.verifiedDshVersions)
      .toContain(version)
    expect(install).toContain('**Published Alpha 15:**')
    expect(install).toContain('**Historical Alpha 11:**')
    expect(install).not.toContain('**Unpublished compatibility candidate:**')
    expect(install).toContain('add dsh-codex-connect@0.2.0-alpha.15')
  })

  it.each([
    ['0.1.0-rc.7', '0.1.0-alpha.4.14'],
    ['0.1.1-rc.2', '0.1.0-alpha.4.21'],
    ['0.1.2-alpha.2', '0.1.0-alpha.4.23'],
    ['0.1.2-alpha.5', '0.1.0-alpha.4.25'],
    ['0.1.2-rc.1', '0.1.0-alpha.4.41'],
    ['0.1.5-alpha.1', '0.1.0-alpha.4.41'],
    ['0.1.5-rc.1', '0.1.0-alpha.4.41'],
    ['0.1.5-rc.2', '0.1.0-alpha.4.41'],
    ['0.2.1-alpha.1', '0.2.0-alpha.15'],
    ['0.2.1-alpha.2', '0.2.0-alpha.15'],
    ['0.2.1-alpha.3', '0.2.0-alpha.15'],
    ['0.2.1-alpha.4', '0.2.0-alpha.15'],
    ['0.2.1-alpha.5', '0.2.0-alpha.15'],
    ['0.2.1-rc.1', '0.2.0-alpha.15'],
    ['0.2.1-rc.2', '0.2.0-alpha.15'],
    ['0.2.1-rc.3', '0.2.0-alpha.15'],
    ['0.2.1-rc.4', '0.2.0-alpha.15'],
    ['0.2.1-rc.5', '0.2.0-alpha.15'],
    ['0.2.2-alpha.3', '0.2.0-alpha.15'],
    ['0.2.2-rc.1', '0.2.0-alpha.15'],
    ['0.2.2-rc.2', '0.2.0-alpha.15'],
    ['0.2.2-rc.3', '0.2.0-alpha.15'],
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

  it('shows the verified default installation before release history in both languages', async () => {
    const [english, chinese] = await Promise.all([
      readFile(new URL('../README.md', import.meta.url), 'utf8'),
      readFile(new URL('../docs/README.zh.md', import.meta.url), 'utf8'),
    ])
    for (const guide of [english, chinese]) {
      const quickStart = guide.slice(0, guide.indexOf('### 2.'))
      const versionCheck = quickStart.indexOf('dsh --version')
      const command = quickStart.indexOf('dsh plugin --profile web add dsh-codex-connect@0.2.0-alpha.15')
      expect(versionCheck).toBeGreaterThan(0)
      expect(command).toBeGreaterThan(versionCheck)
      expect(quickStart).toContain('`0.2.2-rc.1`')
      expect(quickStart).toContain('`dsh-codex-connect@latest`')
      expect(quickStart).not.toContain('0.2.0-alpha.10')
      expect(guide).toContain('release-notes/README.md')
    }
    expect(english).toContain('**Luna Reserve has been removed.**')
    expect(english).toContain('Legacy `enableReserveFallback` settings are ignored')
    expect(english).toContain('Old return files are not read, migrated or deleted')
    expect(chinese).toContain('**Luna Reserve 已移除。**')
    expect(chinese).toContain('旧 `enableReserveFallback` 开关会被忽略')
    expect(chinese).toContain('不读取、迁移或删除')
    expect(install).toContain('The verified default pair is Codex Connect `0.2.0-alpha.15` with DSH `0.2.2-rc.1`')
    expect(install).toContain('Stock rc.1 keeps Task controls paused')
    expect(install).toContain('Luna Reserve has been removed')
  })

  it('keeps the historical Desktop comparison in its acceptance record', () => {
    expect(releaseHistory).toContain('../../INSTALL.md#official-desktop')
    expect(install).toContain('On 2026-10-10 the maintainer reported successful login and normal use')
    expect(install).toContain('not independent live-account verification of a later npm artifact')
  })

  it('requires version checks and warns against blind alpha installation before any add command', () => {
    expect(preflight).toContain('dsh --version')
    expect(preflight).toContain('verified-compatibility.json')
    expect(preflight).toMatch(/(?:unknown|not listed|unlisted)[^.]*\b(?:verify|check)\b/iu)
    expect(preflight).toMatch(/(?:do not|never)[^\n]*dsh-codex-connect@alpha/iu)
    expect(shellBlocks).not.toContain('dsh plugin --profile web add dsh-codex-connect@alpha')
  })

  it('uses the bundled CLI and separate profile for the published Desktop installation', () => {
    expect(shellBlocks).toContain('"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --version')
    expect(shellBlocks).toContain('"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-codex-connect@0.2.0-alpha.15')
    expect(install).toContain('fully quit it before CLI package operations')
    expect(install).toContain('Use the intended `DSH_HOME`')
    expect(install).toContain('Preserve profile patches, default models, optional capabilities and OAuth state')
    expect(install).toContain('Reopen Desktop after installing')
    expect(install).not.toContain('trust-origin dsh-app://app')
  })

  it('retains exact GitHub fallbacks for the latest releases when npm is unavailable', () => {
    expect(install).toMatch(/npm is unavailable[^\n]*github:franksong2702\/dsh-codex-connect#v0\.1\.0-alpha\.4\.21/iu)
    expect(install).toMatch(/npm is unavailable[^\n]*github:franksong2702\/dsh-codex-connect#v0\.1\.0-alpha\.4\.23/iu)
    expect(install).toMatch(/npm is unavailable[^\n]*github:franksong2702\/dsh-codex-connect#v0\.1\.0-alpha\.4\.25/iu)
    expect(install).toMatch(/npm is unavailable[^\n]*github:franksong2702\/dsh-codex-connect#v0\.1\.0-alpha\.4\.41/iu)
    expect(install).toMatch(/npm is unavailable[^\n]*github:franksong2702\/dsh-codex-connect#v0\.1\.0-alpha\.4\.46/iu)
    expect(install).toMatch(/npm is unavailable[^\n]*github:franksong2702\/dsh-codex-connect#v0\.2\.0-alpha\.15/iu)
  })
})

it('records published Alpha 13 as the first exact 0.2.2-rc.1 support', () => {
  const firstAlpha13 = compatibility.pluginVersions.findIndex((entry: { version: string }) => entry.version === '0.2.0-alpha.13')
  expect(firstAlpha13).toBeGreaterThanOrEqual(0)
  expect(compatibility.pluginVersions.slice(0, firstAlpha13).every((entry: { verifiedDshVersions: string[] }) =>
    !entry.verifiedDshVersions.includes('0.2.2-rc.1'))).toBe(true)
  expect(compatibility.pluginVersions[firstAlpha13]?.verifiedDshVersions).toEqual(alpha13Hosts)
})

it('records published Alpha15 and the exact Alpha16 and rc.5 pairing', () => {
  const candidateIndex = compatibility.pluginVersions.findIndex((entry: { version: string }) => entry.version === '0.2.0-alpha.14')
  expect(candidateIndex).toBe(compatibility.pluginVersions.length - 3)
  const published = compatibility.pluginVersions.slice(0, candidateIndex)
  expect(published.at(-1)?.version).toBe('0.2.0-alpha.13')
  for (const entry of published) expect(entry.verifiedDshVersions).not.toContain('0.2.2-rc.2')
  expect(compatibility.pluginVersions[candidateIndex]?.verifiedDshVersions).toEqual(alpha14Hosts)
  for (const entry of compatibility.pluginVersions.slice(0, candidateIndex + 1)) expect(entry.verifiedDshVersions).not.toContain('0.2.2-rc.3')
  expect(compatibility.pluginVersions[candidateIndex + 1]).toEqual({
    version: '0.2.0-alpha.15', verifiedDshVersions: alpha15Hosts,
  })
  for (const entry of compatibility.pluginVersions.slice(0, -1)) expect(entry.verifiedDshVersions).not.toContain('0.2.2-rc.5')
  expect(compatibility.pluginVersions.at(-1)).toEqual({
    version: '0.2.0-alpha.16', verifiedDshVersions: ['0.2.2-rc.5'],
  })
})

it.each(retiredDshVersions)('preserves published Alpha15 fallback guidance for retired DSH %s', async version => {
  const migration = await readFile(new URL('../MIGRATION.md', import.meta.url), 'utf8')
  expect(install).toContain('| `' + version + '` | `0.2.0-alpha.15` |')
  expect(install).toContain('MIGRATION.md#dsh-support-window')
  expect(migration).toContain('`' + version + '`')
  expect(migration).toContain('Cross-host recovery of active Task state remains unverified.')
})
