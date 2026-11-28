/** Canonical DSH admission shared by the runtime, browser and repo checks. */
import semver from 'semver'
import compatibility from '../compatibility.json' with { type: 'json' }

const prerelease = { includePrerelease: true }

function assertVersion(value) {
  if (typeof value !== 'string' || semver.valid(value) !== value) {
    throw new Error('DSH admission policy requires an exact semantic version')
  }
}

/** Construct the requirements string and classify exact installed DSH versions. */
export function createDshAdmission(verified, { minimum, before, denied }) {
  for (const value of [minimum, before, ...verified, ...denied]) assertVersion(value)
  if (!semver.lt(minimum, before)) throw new Error('DSH admission bounds must be ordered')
  const deniedVersions = [...new Set(denied)].sort(semver.compare)
  const exact = new Set(verified)
  const base = `>=${minimum} <${before}`
  const isDenied = version => deniedVersions.some(value => semver.eq(value, version))
  const clauses = verified.filter(version => !isDenied(version) && !semver.satisfies(version, base))
  let lower = `>=${minimum}`
  for (const deniedVersion of deniedVersions.filter(version => semver.satisfies(version, base, prerelease))) {
    if (deniedVersion !== minimum) clauses.push(`${lower} <${deniedVersion}`)
    lower = `>${deniedVersion}`
  }
  clauses.push(`${lower} <${before}`)
  const range = clauses.join(' || ')
  if (range.length > 512) throw new Error('DSH admission range exceeds the runtime receipt limit')
  return {
    range,
    verifiedVersions: verified.filter(version => !isDenied(version)),
    classify(version) {
      if (typeof version !== 'string' || semver.valid(version) === null) return 'outside-range'
      if (isDenied(version)) return 'known-bad'
      if (exact.has(version)) return 'verified'
      return semver.satisfies(version, range, prerelease) ? 'unverified-in-range' : 'outside-range'
    },
  }
}

export const dshPluginApi = compatibility.dshPluginApi
export const dshAdmission = createDshAdmission(dshPluginApi.versions, dshPluginApi.admission)

/** Additional Node.js requirement for an exact DSH host, when declared. */
export function dshHostNodeRange(version) {
  return dshPluginApi.hostRequirements[version]?.node
    ?? (dshPluginApi.node.dshVersions.includes(version) ? dshPluginApi.node.range : undefined)
}

/** Additional Cordis requirement for an exact DSH host, when declared. */
export function dshHostCordisRange(version) {
  return dshPluginApi.hostRequirements[version]?.cordis
    ?? (dshPluginApi.cordis.dshVersions.includes(version) ? dshPluginApi.cordis.range : undefined)
}

/** Whether the Node.js version satisfies the host-specific requirement. */
export function dshHostSupportsNode(version, nodeVersion) {
  const range = dshHostNodeRange(version)
  return range === undefined || semver.satisfies(nodeVersion, range)
}
