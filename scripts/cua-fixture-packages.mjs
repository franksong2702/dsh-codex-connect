/** Required Host modules stay required; a platform-only native optional may be absent. */
import { createRequire } from 'node:module'

export function assertCuaFixturePackages(require, version, manifest, platform = process.platform) {
  for (const name of ['dsh', 'dsh-agent', 'dsh-tools', 'dsh-agent-preset-registry', 'dsh-cua', 'dsh-tool-executor-native', 'dsh-cua-bundle']) {
    if (require(`@deepseek-ai/${name}/package.json`).version !== version) throw new Error(`Wrong exact Host package: ${name}`)
  }
  const name = '@deepseek-ai/dsh-experimental-cua-macos'
  // The published bundle owns this optional edge; strict pnpm need not expose
  // the transitive package as a fixture-root import even on macOS.
  const ownerRequire = createRequire(require.resolve('@deepseek-ai/dsh-cua-bundle/package.json'))
  let metadata
  try { metadata = ownerRequire(`${name}/package.json`) } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND' || !error.message.includes(`'${name}/package.json'`) || platform === 'darwin' || Object.hasOwn(manifest.dependencies ?? {}, name) || !Object.hasOwn(manifest.optionalDependencies ?? {}, name) && !Object.hasOwn(manifest.overrides ?? {}, name)) throw error
    return { nativeBackend: 'omitted_platform_optional', nativeExecuted: false }
  }
  if (metadata.version !== version) throw new Error('Wrong exact Host package: dsh-experimental-cua-macos')
  return { nativeBackend: 'installed_exact', nativeExecuted: false }
}
