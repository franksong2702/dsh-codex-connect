/** Exact installed-Host policy; no user, model or environment flag can reopen Task. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Tools from '@deepseek-ai/dsh-tools'
import { taskFailure } from './adaptive-task-store.ts'

export const TASK_HOST_RECOVERY_ONLY = 'TASK_HOST_RECOVERY_ONLY'
const require = createRequire(import.meta.url)
const packages = ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-tools'] as const

/** Read package metadata only; alpha.3's existing records retain safety exits, never automation. */
export function taskHostRecoveryOnly(): boolean {
  const versions = packages.map(name => {
    try {
      const metadata: unknown = JSON.parse(readFileSync(require.resolve(name + '/package.json'), 'utf8'))
      if (metadata !== null && typeof metadata === 'object' && 'name' in metadata && metadata.name === name
        && 'version' in metadata && typeof metadata.version === 'string') return metadata.version
    } catch { /* Missing metadata cannot manufacture an alpha.3 match. */ }
    return undefined
  })
  if (!versions.includes('0.2.2-alpha.3')) return false
  if (!versions.every(version => version === '0.2.2-alpha.3')) taskFailure('TASK_HOST_VERSION_MISMATCH')
  return true
}

export function assertTaskHostAutomation(): void {
  if (taskHostRecoveryOnly()) taskFailure(TASK_HOST_RECOVERY_ONLY)
  // Unknown/new executor-only runtimes must not regain automation merely because
  // their package metadata is unavailable. Recovery exits do not use this guard.
  if (typeof Reflect.get(Tools.prototype, 'presentAs') !== 'function') taskFailure('TASK_HOST_AUTOMATION_UNVERIFIED')
}
