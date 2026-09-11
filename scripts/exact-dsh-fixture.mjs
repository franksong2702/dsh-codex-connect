/** Pin the published DSH dependency closure for an exact-version test fixture. */

const DSH_PACKAGE = /^@deepseek-ai\/dsh(?:-[a-z0-9-]+)?$/u

/** Resolve only DSH packages; leave third-party requirements owned by their manifests. */
export async function resolveExactDshOverrides(version, readManifest) {
  const overrides = {}
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
      for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies })) {
        if (DSH_PACKAGE.test(dep) && overrides[dep] === undefined && !batch.includes(dep) && !pending.includes(dep)) pending.push(dep)
      }
    }
    if (Object.keys(overrides).length + pending.length > 512) throw new Error('DSH fixture dependency closure exceeds 512 packages')
  }
  return overrides
}

/**
 * Pin peer-only packages as direct fixture roots as well as transitive overrides.
 * Overrides alone can leave npm's auto-installed DSH peers at a newer release.
 * This manifest belongs only to the temporary test host, never a user's profile.
 */
export function exactDshFixtureManifest(overrides) {
  const entries = Object.entries(overrides)
  if (typeof overrides['@deepseek-ai/dsh'] !== 'string'
    || entries.some(([name, version]) => !DSH_PACKAGE.test(name) || version !== overrides['@deepseek-ai/dsh'])) {
    throw new Error('An exact fixture requires one consistent DSH-only package set')
  }
  return { private: true, dependencies: { ...overrides }, overrides: { ...overrides } }
}

/** Read a public, exact npm manifest with a bounded network deadline. */
export async function readDshRegistryManifest(name, version) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status} for ${name}@${version}`)
  return response.json()
}
