import type * as CodexConnect from '../src/index.ts'
export const AUTOMATIC_SCENARIOS: readonly string[]
export function runNativeAutomaticScenario(scenario: string, options: {
  root: string
  importHost: (specifier: string) => Promise<unknown>
  plugin: typeof CodexConnect
  compression?: 'none' | 'zstd'
}): Promise<Readonly<Record<string, unknown>>>
