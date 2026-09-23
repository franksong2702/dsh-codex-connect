/** Read the durable probe's actual direct runtime versions before credentials or dispatch. */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DSH_PACKAGES = [
  'dsh-llm', 'dsh-llm-pi-ai', 'dsh-session', 'dsh-session-projection',
  'dsh-system-prompt', 'dsh-tools', 'dsh-agent', 'dsh-agent-loop', 'dsh-compaction',
  'dsh-token-meter', 'dsh-compaction-basic', 'dsh-session-persistence-jsonl',
]
export const DURABLE_RUNTIME_VERSIONS = Object.freeze({
  '@deepseek-ai/cordis': '4.0.4',
  ...Object.fromEntries(DSH_PACKAGES.map(name => [`@deepseek-ai/${name}`, '0.1.7-rc.1'])),
  '@earendil-works/pi-ai': '0.85.1',
})

/** This probe is narrower than the plugin support matrix; mixed or new hosts fail closed. */
export function assertDurableRuntimeVersions(versions) {
  if (versions === null || typeof versions !== 'object' || Array.isArray(versions)
    || Object.keys(versions).length !== Object.keys(DURABLE_RUNTIME_VERSIONS).length
    || Object.entries(DURABLE_RUNTIME_VERSIONS).some(([name, version]) => versions[name] !== version)) {
    throw new Error('DURABLE_RUNTIME_MISMATCH')
  }
}

async function resolvedPackageVersion(name) {
  // Resolve the import condition used by the probe, not a potentially different require export.
  let directory = dirname(fileURLToPath(import.meta.resolve(name)))
  for (let depth = 0; depth < 12; depth += 1) {
    let manifest
    try { manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) }
    catch (error) { if (error?.code !== 'ENOENT') throw new Error('DURABLE_RUNTIME_METADATA_INVALID') }
    if (manifest !== undefined) {
      if (manifest.name !== name || typeof manifest.version !== 'string') throw new Error('DURABLE_RUNTIME_METADATA_INVALID')
      return manifest.version
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error('DURABLE_RUNTIME_METADATA_MISSING')
}

/** Return package names and versions only; never expose module paths in the report. */
export async function readVerifiedDurableRuntime() {
  const versions = Object.fromEntries(await Promise.all(Object.keys(DURABLE_RUNTIME_VERSIONS)
    .map(async name => [name, await resolvedPackageVersion(name)])))
  assertDurableRuntimeVersions(versions)
  return versions
}
