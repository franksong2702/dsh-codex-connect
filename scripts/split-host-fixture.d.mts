import type * as Implementation from './split-experiment-entry.ts'
export const SPLIT_HOST_SCENARIOS: readonly string[]
export function runSplitHostScenario(scenario: string, options: {
  root: string
  implementation: typeof Implementation
  importHost: (specifier: string) => Promise<unknown>
}): Promise<Readonly<Record<string, unknown>>>
