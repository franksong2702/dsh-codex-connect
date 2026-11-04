import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it.each(['3.18.5', '3.18.4', '3.18.6', '^3.18.5'])('checks the exact Schemastery manifest pin %s using the production checker', async version => {
  const root = await mkdtemp(join(tmpdir(), 'codex-compatibility-pin-'))
  try {
    await mkdir(join(root, 'scripts'))
    for (const name of ['scripts/check-compatibility.mjs', 'compatibility.json']) {
      await copyFile(new URL(`../${name}`, import.meta.url), join(root, name))
    }
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    pkg.dependencies['@deepseek-ai/schemastery'] = version
    await writeFile(join(root, 'package.json'), JSON.stringify(pkg))
    await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), join(root, 'node_modules'), 'dir')
    const result = spawnSync(process.execPath, [join(root, 'scripts/check-compatibility.mjs')], { encoding: 'utf8', timeout: 10_000 })
    expect(result.error).toBeUndefined()
    if (version === '3.18.5') {
      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout).status).toBe('compatible')
    } else {
      expect(result.status).toBe(1)
      expect(result.stderr.trim()).toBe('check-compatibility: runtime dependency @deepseek-ai/schemastery must match 3.18.5')
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
