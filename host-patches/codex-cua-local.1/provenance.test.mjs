/** Pure filesystem/tar fixtures: no credentials, network, model or native driver. */
import { test } from 'node:test'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { assertClosure, assertIntegrity, verifyPublishedPackage, copyVerifiedPublishedPackage, localDependencyLayout, assertRequiredInstalled } from './provenance.mjs'
import { assertCuaFixturePackages } from '../../scripts/cua-fixture-packages.mjs'
import { resolveExactDshOverrides } from '../../scripts/exact-dsh-fixture.mjs'

const integrity = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`
test('verified package metadata keeps required paths required despite missing caller roots', async () => {
  const version = '0.2.2-alpha.2', root = '@deepseek-ai/dsh', required = '@deepseek-ai/dsh-agent', optional = '@deepseek-ai/dsh-experimental-cua-macos'
  const metadata = {
    [root]: { name: root, version, dependencies: { [required]: version }, optionalDependencies: { [optional]: version } },
    [required]: { name: required, version }, [optional]: { name: optional, version, os: ['darwin'] },
  }
  const graph = await resolveExactDshOverrides(version, async name => metadata[name])
  assert.deepEqual(Object.keys(graph.dependencies).sort(), [root, required].sort())
  assert.throws(() => assertRequiredInstalled(Object.keys(graph.dependencies), new Set([root, optional])), /Required published package is not installed/)
  assert.doesNotThrow(() => assertRequiredInstalled(Object.keys(graph.dependencies), new Set([root, required])))
})

test('closure cannot omit a patched or unpatched dependency or change patch provenance', () => {
  const names = ['@deepseek-ai/dsh', '@deepseek-ai/dsh-agent']
  const packages = Object.fromEntries(names.map(name => [name, { version: '0.2.2-alpha.2', integrity: 'sha512-YQ==', tarball: `https://registry.npmjs.org/@deepseek-ai/${name.split('/')[1]}/-/${name.split('/')[1]}-0.2.2-alpha.2.tgz` }]))
  const lock = { baseVersion: '0.2.2-alpha.2', packages }
  const spec = { baseVersion: '0.2.2-alpha.2', packages: { '@deepseek-ai/dsh-agent': { baseIntegrity: 'sha512-YQ==' } } }
  const dependencies = Object.fromEntries(names.map(name => [name, '0.2.2-alpha.2']))
  assert.deepEqual(assertClosure(dependencies, lock, spec), names)
  for (const omitted of names) assert.throws(() => assertClosure(Object.fromEntries(Object.entries(dependencies).filter(([name]) => name !== omitted)), lock, spec), /incomplete/)
  assert.throws(() => assertClosure({ ...dependencies, '@deepseek-ai/dsh-foreign': '0.2.2-alpha.2' }, lock, spec), /unexpected/)
  assert.throws(() => assertClosure(dependencies, lock, { ...spec, packages: { '@deepseek-ai/dsh-agent': { baseIntegrity: 'sha512-Yg==' } } }), /provenance/)
  assert.throws(() => assertClosure({ ...dependencies, '@deepseek-ai/dsh-agent': '^0.2.2-alpha.2' }, lock, spec), /exactly pinned/)
  const optional = { '@deepseek-ai/dsh-agent': '0.2.2-alpha.2' }, required = { '@deepseek-ai/dsh': '0.2.2-alpha.2' }
  assert.deepEqual(assertClosure({ ...optional, ...required }, lock, spec), names)
  const layout = localDependencyLayout({ dependencies: required, optionalDependencies: optional }, names)
  assert.equal(Object.hasOwn(layout.dependencies, '@deepseek-ai/dsh-agent'), false)
  assert.equal(layout.optionalDependencies['@deepseek-ai/dsh-agent'], 'file:../packages/dsh-agent')
  const requiredWins = localDependencyLayout({ dependencies, optionalDependencies: optional }, names)
  assert.equal(requiredWins.dependencies['@deepseek-ai/dsh-agent'], 'file:../packages/dsh-agent')
  assert.equal(Object.hasOwn(requiredWins.optionalDependencies, '@deepseek-ai/dsh-agent'), false)
  const overridesOnly = localDependencyLayout({ dependencies: required, overrides: dependencies }, names)
  assert.equal(Object.hasOwn(overridesOnly.dependencies, '@deepseek-ai/dsh-agent'), false)
  assert.equal(Object.hasOwn(overridesOnly.optionalDependencies, '@deepseek-ai/dsh-agent'), false)
  assert.equal(overridesOnly.overrides['@deepseek-ai/dsh-agent'], 'file:../packages/dsh-agent')
  assert.doesNotThrow(() => assertRequiredInstalled(['@deepseek-ai/dsh'], new Set(['@deepseek-ai/dsh'])))
  assert.throws(() => assertRequiredInstalled(names, new Set(['@deepseek-ai/dsh'])), /Required published package is not installed/)
})

test('whole-package validation catches unpatched source tampering, extra files, missing files and archive corruption', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cua-provenance-'))
  try {
    const input = join(root, 'input'), packed = join(root, 'packed'), original = join(packed, 'package'), archive = join(root, 'package.tgz')
    await mkdir(input); await mkdir(original, { recursive: true })
    for (const directory of [input, original]) {
      await writeFile(join(directory, 'patched.js'), 'original patched file\n')
      await writeFile(join(directory, 'unpatched.js'), 'original unpatched file\n')
    }
    assert.equal(spawnSync('tar', ['-czf', archive, '-C', packed, 'package']).status, 0)
    const expected = integrity(await readFile(archive))
    await verifyPublishedPackage(input, archive, expected, root)
    await writeFile(join(input, 'unpatched.js'), 'tampered\n')
    await assert.rejects(verifyPublishedPackage(input, archive, expected, root), /contents mismatch/)
    await writeFile(join(input, 'unpatched.js'), 'original unpatched file\n')
    await writeFile(join(input, 'extra.js'), 'extra\n')
    await assert.rejects(verifyPublishedPackage(input, archive, expected, root), /contents mismatch/)
    await rm(join(input, 'extra.js')); await rm(join(input, 'unpatched.js'))
    await assert.rejects(verifyPublishedPackage(input, archive, expected, root), /contents mismatch/)
    assert.throws(() => assertIntegrity(Buffer.from('corrupt'), expected), /integrity mismatch/)
    await symlink('outside', join(original, 'link'))
    assert.equal(spawnSync('tar', ['-czf', archive, '-C', packed, 'package']).status, 0)
    await assert.rejects(verifyPublishedPackage(input, archive, integrity(await readFile(archive)), root), /links or special/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('a platform-skipped optional archive is copied as verified source without changing its OS contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cua-source-only-'))
  try {
    const packed = join(root, 'packed'), original = join(packed, 'package'), archive = join(root, 'package.tgz'), destination = join(root, 'source-only')
    await mkdir(original, { recursive: true })
    const metadata = { name: '@deepseek-ai/dsh-experimental-cua-macos', version: '0.2.2-alpha.2', os: ['darwin'] }
    await writeFile(join(original, 'package.json'), JSON.stringify(metadata))
    await writeFile(join(original, 'native.swift'), '// Synthetic source only; never compiled or executed\n')
    assert.equal(spawnSync('tar', ['-czf', archive, '-C', packed, 'package']).status, 0)
    const expected = integrity(await readFile(archive))
    await copyVerifiedPublishedPackage(archive, expected, destination, root)
    assert.deepEqual(JSON.parse(await readFile(join(destination, 'package.json'))), metadata)
    await verifyPublishedPackage(destination, archive, expected, root)
    await assert.rejects(copyVerifiedPublishedPackage(archive, 'sha512-Yg==', join(root, 'bad'), root), /integrity mismatch/)
    await writeFile(join(destination, 'native.swift'), 'tampered source\n')
    await assert.rejects(verifyPublishedPackage(destination, archive, expected, root), /contents mismatch/)
    await symlink('outside', join(original, 'link'))
    assert.equal(spawnSync('tar', ['-czf', archive, '-C', packed, 'package']).status, 0)
    await assert.rejects(copyVerifiedPublishedPackage(archive, integrity(await readFile(archive)), join(root, 'links'), root), /links or special/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Host version admission resolves the real bundle-owned optional and rejects missing required or wrong versions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cua-package-layout-'))
  const native = '@deepseek-ai/dsh-experimental-cua-macos', version = '0.2.2-alpha.2'
  const overrides = { overrides: { [native]: version } }, optional = { optionalDependencies: { [native]: version } }
  const cases = [
    { platform: 'darwin', manifest: overrides, installed: true, expected: 'installed_exact' },
    { platform: 'darwin', manifest: overrides, installed: true, atRoot: true, expected: 'installed_exact' },
    { platform: 'linux', manifest: optional, expected: 'omitted_platform_optional' },
    { platform: 'linux', manifest: overrides, expected: 'omitted_platform_optional' },
    { platform: 'darwin', manifest: overrides, error: /Cannot find module/ },
    { platform: 'linux', manifest: {}, error: /Cannot find module/ },
    { platform: 'linux', manifest: { ...overrides, dependencies: { [native]: version } }, error: /Cannot find module/ },
    { platform: 'linux', manifest: overrides, installed: true, nativeVersion: 'wrong', error: /Wrong exact Host/ },
    { platform: 'linux', manifest: overrides, commonVersion: 'wrong', error: /Wrong exact Host/ },
    { platform: 'linux', manifest: overrides, installed: true, invalidNativeJson: true, error: /JSON|Unexpected|property name|Invalid package config/ },
  ]
  try {
    for (const [index, scenario] of cases.entries()) {
      const base = join(root, String(index)), modules = join(base, 'node_modules')
      await mkdir(base); await writeFile(join(base, 'package.json'), '{"private":true}')
      for (const name of ['dsh', 'dsh-agent', 'dsh-tools', 'dsh-agent-preset-registry', 'dsh-cua', 'dsh-tool-executor-native', 'dsh-cua-bundle']) {
        const folder = join(modules, '@deepseek-ai', name); await mkdir(folder, { recursive: true })
        await writeFile(join(folder, 'package.json'), JSON.stringify({ name: '@deepseek-ai/' + name, version: scenario.commonVersion ?? version }))
      }
      if (scenario.installed) {
        const folder = join(scenario.atRoot ? modules : join(modules, '@deepseek-ai/dsh-cua-bundle/node_modules'), native)
        await mkdir(folder, { recursive: true })
        await writeFile(join(folder, 'package.json'), scenario.invalidNativeJson ? '{invalid' : JSON.stringify({ name: native, version: scenario.nativeVersion ?? version, os: ['darwin'] }))
      }
      const require = createRequire(join(base, 'package.json'))
      if (scenario.installed && !scenario.atRoot) assert.throws(() => require(native + '/package.json'), { code: 'MODULE_NOT_FOUND' })
      const verify = () => assertCuaFixturePackages(require, version, scenario.manifest, scenario.platform)
      if (scenario.error) assert.throws(verify, scenario.error)
      else assert.equal(verify().nativeBackend, scenario.expected)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
