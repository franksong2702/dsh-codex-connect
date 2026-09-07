import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('capability documentation', () => {
  it.each([
    ['README.i18n.yaml', ['README.md', 'docs/README.zh.md']],
    ['docs/reference.i18n.yaml', ['docs/reference.md', 'docs/reference.zh.md']],
  ])('records the reviewed bilingual pair in %s', async (record, paths) => {
    const pairing = await readFile(new URL(`../${record}`, import.meta.url), 'utf8')
    for (const path of paths) {
      const bytes = await readFile(new URL(`../${path}`, import.meta.url))
      const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
      expect(pairing).toContain(`${path}: ${hash}`)
    }
  })

  it('keeps the bilingual command and evidence terminology in the reference', async () => {
    for (const path of ['docs/reference.md', 'docs/reference.zh.md']) {
      const text = await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
      for (const term of ['capabilities --model gpt-5.6-sol --json', 'capabilities --model gpt-5.6-sol --probe --json', 'auto-review-probe --json', '--timeout-ms <1..60000>', '--proxy <http(s)-origin>', 'supported', 'rejected', 'unknown', '64 KiB']) expect(text).toContain(term)
    }
  })
})
