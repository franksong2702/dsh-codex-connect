/** Exact installed-Host ownership policy for saved Tasks. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { taskFailure } from './adaptive-task-store.ts'
import { dshAdmission } from './dsh-admission.mjs'

export const TASK_HOST_RECOVERY_ONLY = 'TASK_HOST_RECOVERY_ONLY'
const require = createRequire(import.meta.url)
const packages = ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-tools'] as const
const subagentRecoveryVersions = new Set(['0.2.2-rc.2', '0.2.2-rc.3', '0.2.2-rc.4', '0.2.2-rc.5'])

function taskHostPackageVersions(): (string | undefined)[] {
  return packages.map(name => {
    try {
      const metadata: unknown = JSON.parse(readFileSync(require.resolve(name + '/package.json'), 'utf8'))
      if (metadata !== null && typeof metadata === 'object' && 'name' in metadata && metadata.name === name
        && 'version' in metadata && typeof metadata.version === 'string') return metadata.version
    } catch { /* Missing metadata cannot manufacture an alpha.3 match. */ }
    return undefined
  })
}

/** Read package metadata only; exact recovery Hosts retain safety exits. */
function recoveryVersion(versions = taskHostPackageVersions()): string | undefined {
  const recovery = versions.find(version => version !== undefined
    && (version === '0.2.2-alpha.3' || version === '0.2.2-rc.1' || subagentRecoveryVersions.has(version)))
  if (recovery === undefined) return undefined
  if (!versions.every(version => version === recovery)) taskFailure('TASK_HOST_VERSION_MISMATCH')
  return recovery
}

function verifiedTaskHost(versions: readonly (string | undefined)[]): boolean {
  const [version] = versions
  return dshAdmission.classify(version) === 'verified' && versions.every(peer => peer === version)
}

/** Existing ownership APIs confer authority only on their verified exact Host. */
export function assertVerifiedTaskHostOwnership(): void {
  if (!verifiedTaskHost(taskHostPackageVersions())) taskFailure('TASK_HOST_OWNERSHIP_UNVERIFIED')
}

export function taskHostRecoveryOnly(): boolean { return recoveryVersion() !== undefined }

/** The new ownership query is admitted only with its exact published package. */
export function taskHostUsesSubagentOwnership(): boolean {
  const version = recoveryVersion()
  if (version === undefined || !subagentRecoveryVersions.has(version)) return false
  if (dshAdmission.classify(version) !== 'verified') return false
  try {
    const metadata: unknown = JSON.parse(readFileSync(require.resolve('@deepseek-ai/dsh-subagent/package.json'), 'utf8'))
    if (metadata !== null && typeof metadata === 'object' && 'name' in metadata && metadata.name === '@deepseek-ai/dsh-subagent'
      && 'version' in metadata && metadata.version === version) return true
  } catch { /* No replacement authority without exact metadata. */ }
  taskFailure('TASK_HOST_VERSION_MISMATCH')
}
