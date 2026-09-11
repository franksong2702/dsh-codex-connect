import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import * as CodexConnect from '../src/index.ts'
import { runNativeLifecyclePhase } from '../scripts/native-compaction-lifecycle-fixture.mjs'

const require = createRequire(import.meta.url)
const importHost = (specifier: string) => import(pathToFileURL(require.resolve(specifier)).href)

it.each(['none', 'zstd'] as const)('runs the real DSH transaction, storage, resume, fork and tool replay (%s)', async compression => {
  const root = await mkdtemp(join(tmpdir(), 'codex-native-lifecycle-'))
  try {
    for (const phase of ['write', 'resume-fork', 'verify-child', 'failure-paths'] as const) {
      const report = await runNativeLifecyclePhase(phase, { root, importHost, plugin: CodexConnect, compression })
      expect(report.phase).toBe(phase)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
