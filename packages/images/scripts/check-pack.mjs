import { spawnSync } from 'node:child_process'

const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
})
if (result.status !== 0) {
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

const [manifest] = JSON.parse(result.stdout)
const names = manifest.files.map(file => file.path)
const required = ['LICENSE', 'NOTICE', 'README.md', 'package.json', 'compatibility.json', 'cordis.patch.yml', 'lib/index.js', 'lib/index.d.ts', 'lib/client.js']
for (const name of required) {
  if (!names.includes(name)) throw new Error(`packed images artifact is missing ${name}`)
}

const forbidden = names.filter(name => /(^|\/)(?:\.env(?:\.|$)|\.git|node_modules|tests?|scripts?|src)(?:\/|$)|auth\.json$|credential|token/iu.test(name))
if (forbidden.length > 0) throw new Error(`packed images artifact contains forbidden files: ${forbidden.join(', ')}`)

process.stdout.write(`validated ${names.length} images packed files (${manifest.size} bytes, ${manifest.unpackedSize} unpacked bytes)\n`)
