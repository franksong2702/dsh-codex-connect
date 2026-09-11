import type * as CodexConnect from '../src/index.ts'

export type NativeLifecyclePhase = 'write' | 'resume-fork' | 'verify-child' | 'failure-paths'

/** Typed entry to the shared executable fixture; its report contains only synthetic operational facts. */
export function runNativeLifecyclePhase(phase: NativeLifecyclePhase, options: {
  root: string
  importHost: (specifier: string) => Promise<unknown>
  plugin: typeof CodexConnect
  compression?: 'none' | 'zstd'
}): Promise<{ phase: NativeLifecyclePhase } & Readonly<Record<string, unknown>>>
