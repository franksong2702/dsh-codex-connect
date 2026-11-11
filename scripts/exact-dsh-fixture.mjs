/** Pin the published DSH dependency closure for an exact-version test fixture. */

const DSH_PACKAGE = /^@deepseek-ai\/dsh(?:-[a-z0-9-]+)?$/u

/** Resolve only DSH packages; leave third-party requirements owned by their manifests. */
export async function resolveExactDshOverrides(version, readManifest) {
  const overrides = {}
  const requiredEdges = new Map()
  let pending = ['@deepseek-ai/dsh']
  while (pending.length > 0) {
    const batch = pending.splice(0, 8)
    const manifests = await Promise.all(batch.map(name => readManifest(name, version)))
    for (const [index, manifest] of manifests.entries()) {
      const name = batch[index]
      if (manifest?.name !== name || manifest.version !== version) {
        throw new Error(`Registry did not return the exact ${name}@${version} manifest`)
      }
      overrides[name] = version
      // Match npm's precedence: optional dependencies override ordinary deps
      // and peers; optional peers do not make a package an install requirement.
      const required = new Set(Object.keys(manifest.peerDependencies ?? {})
        .filter(dep => manifest.peerDependenciesMeta?.[dep]?.optional !== true))
      for (const dep of Object.keys(manifest.dependencies ?? {})) required.add(dep)
      for (const dep of Object.keys(manifest.optionalDependencies ?? {})) required.delete(dep)
      requiredEdges.set(name, [...required].filter(dep => DSH_PACKAGE.test(dep)))
      for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies })) {
        if (DSH_PACKAGE.test(dep) && overrides[dep] === undefined && !batch.includes(dep) && !pending.includes(dep)) pending.push(dep)
      }
    }
    if (Object.keys(overrides).length + pending.length > 512) throw new Error('DSH fixture dependency closure exceeds 512 packages')
  }
  // Classify after reading the graph so a later required path upgrades both
  // an earlier optional package and its required descendants, without refetching.
  const required = new Set(['@deepseek-ai/dsh'])
  for (const name of required) for (const dep of requiredEdges.get(name) ?? []) required.add(dep)
  const dependencies = Object.fromEntries(Object.entries(overrides).filter(([name]) => required.has(name)))
  return { overrides, dependencies }
}

/**
 * Pin required peer-only packages as direct roots as well as overrides. Leave
 * optional dependencies/peers under their original published manifests: making
 * them direct roots would change platform skipping or auto-install behavior.
 */
export function exactDshFixtureManifest(resolution) {
  const { overrides, dependencies } = resolution ?? {}
  if (!overrides || !dependencies) throw new Error('An exact fixture requires resolved dependency classifications')
  const entries = Object.entries(overrides)
  if (typeof overrides['@deepseek-ai/dsh'] !== 'string'
    || entries.some(([name, version]) => !DSH_PACKAGE.test(name) || version !== overrides['@deepseek-ai/dsh'])) {
    throw new Error('An exact fixture requires one consistent DSH-only package set')
  }
  if (dependencies['@deepseek-ai/dsh'] !== overrides['@deepseek-ai/dsh']
    || Object.entries(dependencies).some(([name, version]) => overrides[name] !== version)) {
    throw new Error('Required fixture roots must be a consistent subset of the exact DSH pins')
  }
  return { private: true, dependencies: { ...dependencies }, overrides: { ...overrides } }
}

const REGISTRY_ATTEMPTS = 3
const REGISTRY_ATTEMPT_TIMEOUT_MS = 30_000

/** Whether an HTTP status is a transient registry condition worth retrying. */
function retryableRegistryStatus(status) {
  return status === 408 || status === 429 || status >= 500
}

/**
 * Read a public, exact npm manifest with a bounded deadline per attempt.
 * Network errors, timeouts and 408/429/5xx are retried with backoff; any
 * other HTTP status fails at once.
 */
export async function readDshRegistryManifest(name, version, {
  fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`
  let last
  for (let attempt = 1; attempt <= REGISTRY_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(1_000 * 2 ** (attempt - 2))
    let response
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(REGISTRY_ATTEMPT_TIMEOUT_MS) })
    } catch (error) {
      last = error
      continue
    }
    if (response.ok) {
      try { return await response.json() } catch (error) {
        // The same request deadline also covers the response body. Do not lose
        // bounded transport retries after headers; malformed JSON fails at once.
        if (!(error instanceof TypeError) && error?.name !== 'TimeoutError' && error?.name !== 'AbortError') throw error
        last = error
        continue
      }
    }
    last = new Error(`npm registry returned HTTP ${response.status} for ${name}@${version}`)
    if (!retryableRegistryStatus(response.status)) throw last
  }
  throw new Error(`npm registry unavailable for ${name}@${version} after ${REGISTRY_ATTEMPTS} attempts: ${last instanceof Error ? last.message : String(last)}`, { cause: last })
}
