/** Required Host modules stay required; a platform-only native optional may be absent. */
export function assertCuaFixturePackages(require, version, manifest, platform = process.platform) {
  for (const name of ['dsh', 'dsh-agent', 'dsh-tools', 'dsh-agent-preset-registry', 'dsh-cua', 'dsh-tool-executor-native']) {
    if (require(`@deepseek-ai/${name}/package.json`).version !== version) throw new Error(`Wrong exact Host package: ${name}`)
  }
  const name = '@deepseek-ai/dsh-experimental-cua-macos'
  let metadata
  try { metadata = require(`${name}/package.json`) } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND' || !error.message.includes(`'${name}/package.json'`) || platform === 'darwin' || Object.hasOwn(manifest.dependencies ?? {}, name) || !Object.hasOwn(manifest.optionalDependencies ?? {}, name) && !Object.hasOwn(manifest.overrides ?? {}, name)) throw error
    return { nativeBackend: 'omitted_platform_optional', nativeExecuted: false }
  }
  if (metadata.version !== version) throw new Error('Wrong exact Host package: dsh-experimental-cua-macos')
  return { nativeBackend: 'installed_exact', nativeExecuted: false }
}
