import { readFile, stat } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const failures = []

if (packageJson.name !== 'dsh-codex-connect') failures.push('package name must be dsh-codex-connect')
if (!/^0\.1\.0-alpha\.[1-9]\d*(?:\.\d+)?$/u.test(packageJson.version)) failures.push('package version must be a 0.1.0 alpha release')
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
const fullDescription = 'Connect your ChatGPT subscription to DeepSeek Harness with OAuth, user-controlled defaults, Harness-native approvals, diagnostics, and reliable session recovery.'
if (!readme.startsWith(`# Codex Connect\n\n[![npm version](https://img.shields.io/npm/v/dsh-codex-connect?label=npm&color=cb3837)](https://www.npmjs.com/package/dsh-codex-connect)\n\nEnglish | [中文](docs/README.zh.md)\n\n${fullDescription}\n`)) {
  failures.push('README opening description mismatch')
}
if (!readme.includes('dsh plugin --profile web add dsh-codex-connect@alpha')) failures.push('README must prefer the npm alpha install command')
if (!(await readFile(new URL('../docs/README.zh.md', import.meta.url), 'utf8')).includes('dsh plugin --profile web add dsh-codex-connect@alpha')) {
  failures.push('Chinese README must prefer the npm alpha install command')
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

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`lint: ${failure}\n`)
  process.exitCode = 1
}
