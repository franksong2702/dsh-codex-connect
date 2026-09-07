import { readFile, stat } from 'node:fs/promises'
import './vendor-codex-oauth.mjs'
import { isAlphaReleaseVersion, validateReadmeInstallation, validateUpdateHighlights } from './release-metadata.mjs'
import './release-metadata.test.mjs'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const failures = []

if (packageJson.name !== 'dsh-codex-connect') failures.push('package name must be dsh-codex-connect')
if (!isAlphaReleaseVersion(packageJson.version)) failures.push('package version must be a numeric Alpha release without build metadata')
if (packageJson.publishConfig?.tag !== 'alpha') failures.push('publishConfig.tag must be alpha')
if (packageJson.displayName !== 'Codex Connect') failures.push('displayName mismatch')
if (packageJson.description !== 'ChatGPT OAuth and Codex models for DeepSeek Harness.') failures.push('description mismatch')
if (packageJson.author !== 'Frank Song') failures.push('package author must identify the Codex Connect author')
if (!Array.isArray(packageJson.contributors) || !packageJson.contributors.includes('Yan-Zero (original dsh-codex author)')) {
  failures.push('package contributors must retain upstream authorship')
}
for (const keyword of ['dsh-plugin', 'deepseek-harness', 'openai-codex', 'chatgpt-oauth']) {
  if (!Array.isArray(packageJson.keywords) || !packageJson.keywords.includes(keyword)) failures.push(`package keywords must include ${keyword}`)
}

const productFiles = [
  'package.json',
  'README.md',
  'docs/README.zh.md',
  'update-highlights.json',
  'INSTALL.md',
  'MIGRATION.md',
  'NOTICE',
  'LICENSE',
  'docs/design.md',
  'docs/design.zh.md',
]
const forbiddenProductTerms = [`${'conserv'}ative`, `${'unoff'}icial`]
for (const filename of productFiles) {
  const text = await readFile(new URL(`../${filename}`, import.meta.url), 'utf8')
  if (forbiddenProductTerms.some(term => text.toLowerCase().includes(term))) failures.push(`${filename} contains a forbidden product-description term`)
  if (/BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|\bsk-[A-Za-z0-9_-]{16,}|refresh_token\s*[=:]\s*[^\s"']+/u.test(text)) {
    failures.push(`${filename} appears to contain secret material`)
  }
}

const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')
if (!readme.includes('Use the image generation capability included with your current GPT subscription.')) {
  failures.push('README must describe image generation with the approved subscription copy')
}
const chineseReadme = await readFile(new URL('../docs/README.zh.md', import.meta.url), 'utf8')
if (!chineseReadme.includes('使用你当前 GPT 订阅计划提供的图片生成能力。')) {
  failures.push('Chinese README must describe image generation with the approved subscription copy')
}

try {
  const compatibility = JSON.parse(await readFile(new URL('../verified-compatibility.json', import.meta.url), 'utf8'))
  failures.push(...validateReadmeInstallation([readme, chineseReadme], compatibility, packageJson.version))
} catch {
  failures.push('verified-compatibility.json must be readable JSON')
}
try {
  const manifest = JSON.parse(await readFile(new URL('../update-highlights.json', import.meta.url), 'utf8'))
  failures.push(...validateUpdateHighlights(manifest, packageJson.version))
} catch {
  failures.push('update-highlights.json must be valid JSON')
}
try {
  await stat(new URL('../README.zh.md', import.meta.url))
  failures.push('root README.zh.md must migrate to docs/README.zh.md')
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const notice = await readFile(new URL('../NOTICE', import.meta.url), 'utf8')
const license = await readFile(new URL('../LICENSE', import.meta.url), 'utf8')
for (const [filename, text] of [['NOTICE', notice], ['LICENSE', license]]) {
  if (!text.includes('Copyright 2026 Frank Song')) failures.push(`${filename} must state Codex Connect copyright`)
  if (!text.includes('Copyright 2026 Yan-Zero')) failures.push(`${filename} must retain upstream copyright`)
}

const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
if (/^- id: agent-default-model/mu.test(patch) || /searchProvider:\s*openai-codex/u.test(patch)) {
  failures.push('bundle patch must not take over Harness routing')
}
if (!/^\s+enableImageGeneration: false$/mu.test(patch)) {
  failures.push('bundle patch must keep image generation disabled by default')
}
if (!/^\s+enableAutoReview: false$/mu.test(patch)) {
  failures.push('bundle patch must keep Auto-review disabled by default')
}

const clientInject = packageJson.dsh?.client?.inject
for (const platformModule of ['@deepseek-ai/dsh-client-ui-attachment', '@deepseek-ai/dsh-client-ui-slots']) {
  if (Array.isArray(clientInject) && clientInject.includes(platformModule)) {
    failures.push(`dsh.client.inject must not treat static platform module ${platformModule} as a plugin`)
  }
}
if (Object.keys(packageJson.scripts ?? {}).some(script => /images-install|release-workflow-images|workspace-linkage/u.test(script))) {
  failures.push('root package must not expose companion-package scripts')
}
try {
  await stat(new URL('../packages/images/package.json', import.meta.url))
  failures.push('companion images package must not remain in the single-plugin repository')
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`lint: ${failure}\n`)
  process.exitCode = 1
}
