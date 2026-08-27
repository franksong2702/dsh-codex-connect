import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const options = { cwd: new URL('..', import.meta.url), encoding: 'utf8' }
// Node 24 requires a shell to launch the npm.cmd shim on Windows. The command
// is a fixed literal and accepts no user input.
const result = process.platform === 'win32'
  ? spawnSync('npm pack --dry-run --json --ignore-scripts', { ...options, shell: true })
  : spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], options)
if (result.error !== undefined) throw result.error
if (result.status !== 0) {
  if (result.stderr !== undefined) process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

const [manifest] = JSON.parse(result.stdout)
const names = manifest.files.map(file => file.path)
const required = ['LICENSE', 'NOTICE', 'README.md', 'package.json', 'compatibility.json', 'cordis.patch.yml', 'lib/index.js', 'lib/index.d.ts', 'lib/client.js', 'lib/bin.js']
for (const name of required) {
  if (!names.includes(name)) throw new Error(`packed artifact is missing ${name}`)
}

const forbidden = names.filter(name => /(^|\/)(?:\.env(?:\.|$)|\.git|node_modules|tests?|scripts?|src)(?:\/|$)|auth\.json$|credential|token/iu.test(name))
if (forbidden.length > 0) throw new Error(`packed artifact contains forbidden files: ${forbidden.join(', ')}`)
if (names.includes('docs/design/codex-connect-images-v4.md')) {
  throw new Error('core packed artifact must not include the images implementation design')
}

const declaration = await readFile(new URL('../lib/index.d.ts', import.meta.url), 'utf8')
if (!/declare module ['"]@deepseek-ai\/cordis['"]/u.test(declaration)) {
  throw new Error('lib/index.d.ts lost the Cordis Context augmentation')
}
if (!/openaiCodexTransport/u.test(declaration)) {
  throw new Error('lib/index.d.ts does not expose openaiCodexTransport')
}
if (!/IMAGE_GENERATE_TOOL_NAME/u.test(declaration)) {
  throw new Error('lib/index.d.ts does not expose the bundled image generation tool')
}

const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
if (!/codex_connect_image_generate/u.test(client)) {
  throw new Error('lib/client.js does not register the image generation result view')
}

process.stdout.write(`validated ${names.length} packed files (${manifest.size} bytes, ${manifest.unpackedSize} unpacked bytes)\n`)
