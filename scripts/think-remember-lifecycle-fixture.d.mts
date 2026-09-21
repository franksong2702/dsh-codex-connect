import type * as CodexConnect from '../src/index.ts'
export type ThinkRememberPhase = 'write' | 'resume' | 'verify' | 'faults'
/** Synthetic-only lifecycle fixture. Runtime facts are distinct from live model acceptance. */
export function runThinkRememberPhase(phase: ThinkRememberPhase, options: {
  root: string
  importHost: (specifier: string) => Promise<unknown>
  plugin: typeof CodexConnect
  compression?: 'none' | 'zstd'
  mode?: 'native' | 'fallback'
  scenario?: 'lifecycle' | 'cancel-compaction' | 'pending-before-compaction' | 'manual-after-compaction' | 'decline' | 'automatic-pressure' | 'system-head-refresh'
}): Promise<{ phase: ThinkRememberPhase; syntheticOnly: true } & Readonly<Record<string, unknown>>>
