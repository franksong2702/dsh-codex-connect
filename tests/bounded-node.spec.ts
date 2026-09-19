import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
// @ts-expect-error Plain Node CI helper is outside the source build.
import { runBoundedNode } from '../scripts/bounded-command.mjs'

it('executes Node files with shell metacharacters in their path as literal argv', async () => {
  const root = await mkdtemp(join(tmpdir(), 'split-node & % path-'))
  try {
    const file = join(root, 'receive & literal.mjs')
    await writeFile(file, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))')
    const args = ['a&b|c', '%PATH%', '$(not-a-command)', 'quote"value', 'space value']
    const result = await runBoundedNode([file, ...args], { timeoutMs: 5_000 })
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(args)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('retains bounded output for direct Node work', async () => {
  const result = await runBoundedNode(['-e', 'process.stdout.write("x".repeat(200000))'], { timeoutMs: 5_000, maxBuffer: 64 })
  expect(result.error?.code).toBe('ENOBUFS')
  expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(64)
})

it('retains timeout and cleanup for direct Node work', async () => {
  const result = await runBoundedNode(['-e', 'setTimeout(() => {}, 20000)'], { timeoutMs: 150 })
  expect(result.error?.code).toBe('ETIMEDOUT')
  expect(result.cleanupError).toBeUndefined()
})
