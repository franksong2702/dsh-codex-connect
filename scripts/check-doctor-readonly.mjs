/** Direct compiled-bin regression: synthetic fixtures only, never a package-manager wrapper. */
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runBoundedCommand } from './bounded-command.mjs'
import { dshPluginApi } from '../src/dsh-admission.mjs'

export async function checkReadonlyDoctor(fixture, pluginRoot, inheritedEnvironment) {
  fixture = await realpath(fixture)
  pluginRoot = await realpath(pluginRoot)
  const home = join(fixture, 'doctor-home')
  const credential = join(home, '.openai-codex-auth.json')
  const sentinel = 'SYNTHETIC_DOCTOR_FIXTURE_MUST_NOT_BE_READ'
  await mkdir(home)
  await writeFile(credential, sentinel, { mode: 0o600 })
  const virtualArchive = join(fixture, 'metadata.asar')
  const preload = join(fixture, 'doctor-readonly-tripwire.mjs')
  await writeFile(preload, `
import fs from 'node:fs'; import fsp from 'node:fs/promises';
import cp from 'node:child_process'; import http from 'node:http';
import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module'; import { fileURLToPath } from 'node:url';
const privateHome = ${JSON.stringify(home)};
const virtualArchive = ${JSON.stringify(virtualArchive)};
let violations = 0;
function deny() { violations++; throw new Error('doctor readonly tripwire'); }
function privateRead(path) {
  const value = path instanceof URL ? fileURLToPath(path) : String(path);
  return value.startsWith(privateHome) || value.startsWith(virtualArchive) || /(?:^|[/\\\\])(?:auth\\.json|\\.openai-codex-auth\\.json|cordis\\.ya?ml|\\.npmrc|pnpm-lock\\.yaml|pnpm-workspace\\.yaml)$/u.test(value);
}
for (const object of [fs, fsp]) {
  for (const name of ['readFile', 'readFileSync', 'createReadStream']) {
    if (typeof object[name] !== 'function') continue;
    const original = object[name];
    object[name] = function(path, ...args) { if (privateRead(path)) return deny(); return original.call(this, path, ...args); };
  }
  for (const name of ['open', 'openSync']) {
    if (typeof object[name] !== 'function') continue;
    const original = object[name];
    object[name] = function(path, flags, ...args) {
      const write = typeof flags === 'number'
        ? Boolean(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_TRUNC))
        : /[wa+]/u.test(String(flags ?? 'r'));
      if (write || privateRead(path)) return deny();
      return original.call(this, path, flags, ...args);
    };
  }
  for (const name of ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream', 'mkdir', 'mkdirSync', 'mkdtemp', 'mkdtempSync', 'rename', 'renameSync', 'unlink', 'unlinkSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync', 'truncate', 'truncateSync', 'chmod', 'chmodSync', 'link', 'linkSync', 'symlink', 'symlinkSync', 'copyFile', 'copyFileSync', 'cp', 'cpSync']) {
    if (typeof object[name] === 'function') object[name] = deny;
  }
}
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[name] = deny;
for (const object of [http, https]) { object.request = deny; object.get = deny; }
net.connect = deny; net.createConnection = deny; tls.connect = deny; globalThis.fetch = deny;
process.on('exit', () => { if (violations) process.exitCode = 3; });
syncBuiltinESMExports();
`)
  const env = { ...inheritedEnvironment, DSH_HOME: home }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  // Prove the tripwire is actually connected before trusting a quiet doctor.
  // Broken controls touch only synthetic fixture data or an invalid fetch port.
  const controls = [
    `await (await import('node:fs/promises')).readFile(${JSON.stringify(credential)}, 'utf8')`,
    `await (await import('node:fs/promises')).writeFile(${JSON.stringify(join(fixture, 'forbidden-probe'))}, 'fixture')`,
    `const fs = await import('node:fs'); const handle = await (await import('node:fs/promises')).open(${JSON.stringify(credential)}, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0)); await handle.close()`,
    `const fs = await import('node:fs'); const handle = await (await import('node:fs/promises')).open(${JSON.stringify(join(fixture, 'forbidden-open-probe'))}, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC); await handle.close()`,
    `(await import('node:child_process')).spawn(${JSON.stringify(join(fixture, 'missing-executable'))})`,
    `await fetch('http://127.0.0.1:9')`,
  ]
  for (const control of controls) {
    const result = await runBoundedCommand(process.execPath, [
      '--import', pathToFileURL(preload).href, '--input-type=module', '--eval', `try { ${control} } catch {}`,
    ], { cwd: fixture, env, timeoutMs: 15_000, maxBuffer: 4096 })
    if (result.error || result.cleanupError || result.status !== 3) throw new Error('doctor read-only tripwire positive control failed')
  }
  const run = async (anchor, status) => {
    const result = await runBoundedCommand(process.execPath, [
      '--import', pathToFileURL(preload).href, join(pluginRoot, 'lib/bin.js'), 'doctor', '--json',
      ...anchor === undefined ? [] : ['--install-anchor', anchor],
    ], { cwd: fixture, env, timeoutMs: 15_000, maxBuffer: 16_384 })
    if (result.error || result.cleanupError || result.status !== status || result.stdout.trim().split('\n').length !== 1) {
      throw new Error('direct doctor read-only execution failed')
    }
    const report = JSON.parse(result.stdout)
    if (report.schemaVersion !== 1 || report.identity?.pluginVersionState !== 'match'
      || result.stdout.includes(fixture) || result.stdout.includes(sentinel)
      || await readFile(credential, 'utf8') !== sentinel) throw new Error('direct doctor receipt violated its allowlist')
    return report
  }
  const standalone = await run(undefined, 1)
  if (standalone.identity.scope !== 'standalone' || standalone.compatibility?.status !== 'unverified') {
    throw new Error('standalone scope must report the development SDK as unverified')
  }
  const anchor = join(fixture, 'selected-host/node_modules/@deepseek-ai/dsh/package.json')
  const modules = join(fixture, 'selected-host/node_modules')
  const version = dshPluginApi.version
  const writeHostMetadata = async modules => {
    for (const name of ['@deepseek-ai/dsh', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-compaction']) {
      const path = join(modules, name, 'package.json')
      await mkdir(join(modules, name), { recursive: true })
      await writeFile(path, JSON.stringify({ name, version }))
    }
  }
  await writeHostMetadata(modules)
  const selected = await run(anchor, 0)
  if (selected.identity.scope !== 'selected-installation' || selected.identity.dshMetadataSource !== 'explicit-install-anchor'
    || selected.compatibility?.status !== 'compatible') throw new Error('selected metadata was mistaken for a running Host')
  const invalid = await run(join(fixture, 'absent/package.json'), 1)
  if (invalid.compatibility?.status !== 'unknown' || invalid.identity.dshMetadataSource !== 'unknown') throw new Error('invalid anchor fell back to ambient metadata')
  const virtualModules = join(virtualArchive, 'node_modules')
  await writeHostMetadata(virtualModules)
  const virtual = await run(join(virtualModules, '@deepseek-ai/dsh/package.json'), 1)
  if (virtual.compatibility?.status !== 'unknown' || virtual.identity.dshMetadataSource !== 'unknown') throw new Error('virtual ASAR metadata was not left unknown')
  process.stdout.write('direct doctor read-only checks passed: standalone, selected, invalid anchor, ASAR unknown; six positive controls; no subprocess/network/private reads/writes\n')
}
