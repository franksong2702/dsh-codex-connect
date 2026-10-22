import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { validateLibArtifactInventory } from './pack-lib-inventory.mjs'
import { resolveCommandInvocation } from './bounded-command.mjs'

const invocation = resolveCommandInvocation(process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['pack', '--dry-run', '--json', '--ignore-scripts'])
const result = spawnSync(invocation.command, invocation.args, {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
  windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  windowsHide: true,
})
if (result.error !== undefined) throw result.error
if (result.status !== 0) {
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

const [manifest] = JSON.parse(result.stdout)
const names = manifest.files.map(file => file.path)
const required = ['LICENSE', 'NOTICE', 'README.md', 'docs/README.zh.md', 'docs/reference.md', 'docs/reference.zh.md', 'docs/licenses/standalone-cli.txt', 'package.json', 'compatibility.json', 'cordis.patch.yml', 'lib/index.js', 'lib/index.d.ts', 'lib/client.js', 'lib/bin.js']
for (const name of required) {
  if (!names.includes(name)) throw new Error(`packed artifact is missing ${name}`)
}

const forbidden = names.filter(name => /(^|\/)(?:\.env(?:\.|$)|\.git|node_modules|tests?|scripts?|src)(?:\/|$)|auth\.json$|credential|token/iu.test(name))
if (forbidden.length > 0) throw new Error(`packed artifact contains forbidden files: ${forbidden.join(', ')}`)
const internalDocs = names.filter(name => /^docs\/(?:agent-notes|experiments|reviews)\//u.test(name))
if (internalDocs.length > 0) {
  throw new Error(`packed artifact contains internal maintenance records: ${internalDocs.join(', ')}`)
}
if (names.includes('docs/design/codex-connect-images-v4.md')) {
  throw new Error('core packed artifact must not include the images implementation design')
}
if (names.some(name => /^lib\/(?:anthropic-messages|openai-completions)[^/]*\.js$/u.test(name))) {
  throw new Error('standalone Codex CLI must not bundle unrelated model providers')
}

validateLibArtifactInventory(names)

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

const bin = await readFile(new URL('../lib/bin.js', import.meta.url), 'utf8')
if (bin.includes('openai-completions.lazy') || bin.includes('anthropic-messages.lazy')) {
  throw new Error('standalone Codex CLI imports unrelated model providers')
}

process.stdout.write(`validated ${names.length} packed files (${manifest.size} bytes, ${manifest.unpackedSize} unpacked bytes)\n`)
