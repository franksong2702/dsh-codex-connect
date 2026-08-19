import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const compatibility = JSON.parse(await readFile(new URL('../compatibility.json', import.meta.url), 'utf8'))
const sourcePaths = [
  new URL('../src/index.ts', import.meta.url),
  new URL('../src/base64.ts', import.meta.url),
  new URL('../src/image-format.ts', import.meta.url),
  new URL('../src/tool.ts', import.meta.url),
  new URL('../src/client/index.tsx', import.meta.url),
]
const failures = []

if (packageJson.name !== 'dsh-codex-connect-images') failures.push('package name mismatch')
if (packageJson.displayName !== 'Codex Connect — Images') failures.push('displayName mismatch')
if (!/^0\.1\.0-alpha\.[1-9]\d*(?:\.\d+)?$/u.test(packageJson.version)) failures.push('version must be a 0.1.0 alpha release')
if (packageJson.private !== true) failures.push('images implementation preview must remain private')
if (packageJson.publishConfig?.tag !== 'alpha') failures.push('publishConfig.tag must be alpha')
if (packageJson.peerDependencies?.['dsh-codex-connect'] !== compatibility.core?.version) failures.push('core peer range must match compatibility.json')
if (packageJson.devDependencies?.['dsh-codex-connect'] !== 'workspace:*') failures.push('core dev dependency must use workspace:*')
if (packageJson.dependencies?.['dsh-codex-connect'] !== undefined) failures.push('core must not be a regular dependency')

const sources = (await Promise.all(sourcePaths.map(path => readFile(path, 'utf8')))).join('\n')
if (/\bfetch\s*\(|https?:\/\/|node:https|undici|chatgpt\.com/u.test(sources)) failures.push('images source must not contain a direct network route')
if (!sources.includes('toolCtx.tools.register(imageGenerateTool(toolCtx))')) failures.push('images source must register the PR-3 tool through its injected lifecycle')
if (/ImageGallery|ImageLightbox/u.test(sources)) failures.push('images source must not contain PR-4 gallery or lightbox functionality')
if (/^import\s+(?!type\b)[^\n]*['"]dsh-codex-connect['"]/mu.test(sources)) failures.push('images source must import the core as types only')

const productFiles = ['README.md', 'docs/README.zh.md', 'SECURITY.md', 'RELEASING.md', 'NOTICE', 'LICENSE']
for (const filename of productFiles) {
  const text = await readFile(new URL(`../${filename}`, import.meta.url), 'utf8')
  if (/BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|\bsk-[A-Za-z0-9_-]{16,}|refresh_token\s*[=:]\s*[^\s"']+/u.test(text)) {
    failures.push(`${filename} appears to contain secret material`)
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`images lint: ${failure}\n`)
  process.exitCode = 1
}
