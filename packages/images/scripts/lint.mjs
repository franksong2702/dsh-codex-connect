import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const compatibility = JSON.parse(await readFile(new URL('../compatibility.json', import.meta.url), 'utf8'))
const sourcePaths = [
  new URL('../src/index.ts', import.meta.url),
  new URL('../src/base64.ts', import.meta.url),
  new URL('../src/image-format.ts', import.meta.url),
  new URL('../src/image-presentation.ts', import.meta.url),
  new URL('../src/tool.ts', import.meta.url),
  new URL('../src/client/index.tsx', import.meta.url),
  new URL('../src/client/CodexImageToolView.tsx', import.meta.url),
  new URL('../src/client/CodexImagesPluginCard.tsx', import.meta.url),
  new URL('../src/client/locales.ts', import.meta.url),
  new URL('../src/client/settings-contract.ts', import.meta.url),
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

const sourceTexts = await Promise.all(sourcePaths.map(path => readFile(path, 'utf8')))
const sources = sourceTexts.join('\n')
const hostSources = sourceTexts.slice(0, 5).join('\n')
if (/\bfetch\s*\(|https?:\/\/|node:https|undici|chatgpt\.com/u.test(hostSources)) failures.push('images Host source must not contain a direct network route')
if (/https?:\/\/|node:https|undici|chatgpt\.com/u.test(sources)) failures.push('images source must not contain a direct upstream route')
if (!sources.includes('toolCtx.tools.register(imageGenerateTool(toolCtx))')) failures.push('images source must register the PR-3 tool through its injected lifecycle')
if (!sources.includes("key: 'codex_connect_image_generate'") || !sources.includes('ImageGallery')) failures.push('images client must register the PR-4 image tool view')
if (!sources.includes('key: IMAGES_SETTINGS_NAMESPACE')) failures.push('images client must register its namespaced settings card')
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
