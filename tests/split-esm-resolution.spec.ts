import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
const helper = new URL('../scripts/split-esm-resolution.mjs', import.meta.url).href
async function provider(base: string, name = '@earendil-works/pi-ai') {
  const root = join(base, 'node_modules/@earendil-works/pi-ai')
  await mkdir(join(root, 'dist'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ name, version: '0.84.4', type: 'module', exports: { '.': { import: './dist/index.js' } } }))
  await writeFile(join(root, 'dist/index.js'), 'export const fixture = true\n')
  return root
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'split-esm-resolution-'))
  roots.push(root)
  const adapter = join(root, 'node_modules/fixture-adapter/index.js')
  await mkdir(dirname(adapter), { recursive: true })
  await writeFile(adapter, '')
  return { root, adapter }
}
function resolveProvider(root: string, adapter: string) {
  return JSON.parse(execFileSync(process.execPath, ['--experimental-import-meta-resolve', '--input-type=module', '--eval',
    `import { resolveSplitPiAi } from ${JSON.stringify(helper)}; const result = await resolveSplitPiAi(${JSON.stringify(root)}, ${JSON.stringify(adapter)}); console.log(JSON.stringify({version: result.version}))`,
  ], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] }))
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
it('resolves import-only exports from the isolated parent without a package.json export', async () => {
  const f = await fixture()
  await provider(f.root)
  expect(resolveProvider(f.root, f.adapter)).toEqual({ version: '0.84.4' })
})
it('rejects a different adapter-local provider even at the same version', async () => {
  const f = await fixture()
  await provider(f.root)
  await provider(dirname(f.adapter))
  expect(() => resolveProvider(f.root, f.adapter)).toThrow('same pi-ai installation')
})
it('rejects a provider symlink outside the isolated host root', async () => {
  const f = await fixture()
  const external = await fixture()
  const externalProvider = await provider(external.root)
  const parent = join(f.root, 'node_modules/@earendil-works')
  await mkdir(parent, { recursive: true })
  await symlink(externalProvider, join(parent, 'pi-ai'))
  expect(() => resolveProvider(f.root, f.adapter)).toThrow('escaped its isolated installation')
})
it('rejects the wrong package identity instead of trusting an adjacent manifest', async () => {
  const f = await fixture()
  await provider(f.root, 'different-package')
  expect(() => resolveProvider(f.root, f.adapter)).toThrow()
})
