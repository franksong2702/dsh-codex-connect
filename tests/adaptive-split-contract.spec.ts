import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

it('keeps M3 host staging internal and never enables delegation through Think settings or public exports', async () => {
  const [entry, client, metadata, patch, adapter] = await Promise.all([
    readFile('src/index.ts', 'utf8'), readFile('src/client/index.tsx', 'utf8'), readFile('package.json', 'utf8'),
    readFile('cordis.patch.yml', 'utf8'), readFile('src/adapter.ts', 'utf8'),
  ])
  expect(entry).not.toMatch(/attachAdaptiveSplit|attachApprovedSplitWorker|adaptive-split/u)
  expect(client).not.toMatch(/adaptive-split|split-worker/u)
  expect(patch).not.toMatch(/enableSplit|inspect_with_worker/u)
  expect(patch).toContain('enableReasoningUpdates: false')
  const pkg = JSON.parse(metadata)
  expect(JSON.stringify(pkg.exports)).not.toMatch(/split|adaptive-decision/u)
  for (const name of ['@deepseek-ai/dsh-subagent-spawn-in-process', '@deepseek-ai/dsh-subagent-in-process-driver']) {
    expect(pkg.dependencies[name]).toBeUndefined()
    expect(pkg.devDependencies[name]).toBe('0.1.2-rc.1')
  }
  expect(adapter).toContain('withSplitProviderBounds(')
  expect(adapter).toContain('withCodexDiagnosticFetch(options, backendRequests)')
})
