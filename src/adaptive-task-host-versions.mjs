import semver from 'semver'
import { dshAdmission } from './dsh-admission.mjs'

/** Saved-Task ownership stays on verified hosts through DSH 0.2.2. */
export function hasVerifiedTaskHostOwnershipVersion(version) {
  return dshAdmission.classify(version) === 'verified' && semver.lt(version, '0.2.3-0')
}

export const verifiedTaskHostVersions = dshAdmission.verifiedVersions.filter(hasVerifiedTaskHostOwnershipVersion)
