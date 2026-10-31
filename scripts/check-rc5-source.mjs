/** Scoped public upstream comparison, not whole-closure or live acceptance. */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const names = ['dsh', 'dsh-agent', 'dsh-agent-loop', 'dsh-llm', 'dsh-llm-pi-ai', 'dsh-tools', 'dsh-session',
  'dsh-compaction', 'dsh-attachment', 'dsh-timeout', 'dsh-subagent', 'dsh-client-ui-chat']
const versions = ['0.2.1-rc.4', '0.2.1-rc.5']
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
if (!process.argv[2]) throw new Error('usage: check-rc5-source <report.json> [verified-ui-output-directory]')
const temporary = await mkdtemp(join(tmpdir(), 'rc5-provenance-'))
const packages = []
try {
  if (process.argv[3]) await mkdir(process.argv[3], { recursive: true })
  for (const name of names) {
    const maps = [], receipts = []
    for (const version of versions) {
      const response = await fetch('https://registry.npmjs.org/@deepseek-ai%2f' + name + '/' + version)
      if (!response.ok) throw new Error('Registry metadata unavailable')
      const metadata = await response.json()
      if (metadata.name !== '@deepseek-ai/' + name || metadata.version !== version || !metadata.dist?.integrity?.startsWith('sha512-')) throw new Error('Metadata identity mismatch')
      const url = new URL(metadata.dist.tarball)
      if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org') throw new Error('Unexpected source')
      const download = await fetch(url)
      if (!download.ok) throw new Error('Tarball unavailable')
      const bytes = Buffer.from(await download.arrayBuffer())
      if ('sha512-' + createHash('sha512').update(bytes).digest('base64') !== metadata.dist.integrity) throw new Error('Integrity mismatch')
      const archive = join(temporary, name + '-' + version + '.tgz')
      await writeFile(archive, bytes)
      const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n').filter(file => !file.endsWith('/'))
      const map = new Map()
      for (const file of files) {
        if (!file.startsWith('package/') || file.split('/').includes('..')) throw new Error('Unexpected archive path')
        const data = execFileSync('tar', ['-xOzf', archive, file], { maxBuffer: 32 * 1024 * 1024 })
        if (process.argv[3] && name === 'dsh-client-ui-chat' && file === 'package/lib/client.js') {
          await writeFile(join(process.argv[3], version + '-client.js'), data)
        }
        let normalized = data
        try {
          const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data)
          normalized = Buffer.from(text.replaceAll(versions[0], '0.2.1-rc.X').replaceAll(versions[1], '0.2.1-rc.X'))
        } catch { /* Non-UTF-8 files are compared byte for byte. */ }
        map.set(file, hash(normalized))
      }
      maps.push(map)
      receipts.push({ version, integrity: metadata.dist.integrity, tarSha256: hash(bytes), files: map.size })
    }
    const changed = [...new Set([...maps[0].keys(), ...maps[1].keys()])].filter(file => maps[0].get(file) !== maps[1].get(file))
    packages.push({ name: '@deepseek-ai/' + name, receipts, normalizedChangedFiles: changed })
    console.error(name + ': ' + changed.length + ' changed')
  }
  await writeFile(process.argv[2], JSON.stringify({ source: 'official exact npm tarballs; SHA512 checked before reading',
    normalization: 'only exact rc.4/rc.5 literals in valid UTF8; other bytes compared unchanged', packages, liveAcceptance: false }, null, 2) + '\n')
} finally { await rm(temporary, { recursive: true, force: true }) }
