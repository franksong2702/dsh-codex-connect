/** Exact installed-Host policy; no user, model or environment flag can reopen Task. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Tools from '@deepseek-ai/dsh-tools'
import { taskFailure } from './adaptive-task-store.ts'

export const TASK_HOST_RECOVERY_ONLY = 'TASK_HOST_RECOVERY_ONLY'
const require = createRequire(import.meta.url)
const packages = ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-tools'] as const

/** Read package metadata only; alpha.3's existing records retain safety exits, never automation. */
function recoveryVersion(): string | undefined {
  const versions = packages.map(name => {
    try {
      const metadata: unknown = JSON.parse(readFileSync(require.resolve(name + '/package.json'), 'utf8'))
      if (metadata !== null && typeof metadata === 'object' && 'name' in metadata && metadata.name === name
        && 'version' in metadata && typeof metadata.version === 'string') return metadata.version
    } catch { /* Missing metadata cannot manufacture an alpha.3 match. */ }
    return undefined
  })
  const recovery = versions.find(version => version === '0.2.2-alpha.3' || version === '0.2.2-rc.1' || version === '0.2.2-rc.2' || version === '0.2.2-rc.3')
  if (recovery === undefined) return undefined
  if (!versions.every(version => version === recovery)) taskFailure('TASK_HOST_VERSION_MISMATCH')
  return recovery
}

export function taskHostRecoveryOnly(): boolean { return recoveryVersion() !== undefined }

/** The new ownership query is admitted only with its exact published package. */
export function taskHostUsesSubagentOwnership(): boolean {
  const version = recoveryVersion()
  if (version !== '0.2.2-rc.2' && version !== '0.2.2-rc.3') return false
  try {
    const metadata: unknown = JSON.parse(readFileSync(require.resolve('@deepseek-ai/dsh-subagent/package.json'), 'utf8'))
    if (metadata !== null && typeof metadata === 'object' && 'name' in metadata && metadata.name === '@deepseek-ai/dsh-subagent'
      && 'version' in metadata && metadata.version === version) return true
  } catch { /* No replacement authority without exact metadata. */ }
  taskFailure('TASK_HOST_VERSION_MISMATCH')
}

export function assertTaskHostAutomation(): void {
  if (taskHostRecoveryOnly()) taskFailure(TASK_HOST_RECOVERY_ONLY)
  // Unknown/new executor-only runtimes must not regain automation merely because
  // their package metadata is unavailable. Recovery exits do not use this guard.
  if (typeof Reflect.get(Tools.prototype, 'presentAs') !== 'function') taskFailure('TASK_HOST_AUTOMATION_UNVERIFIED')
}
