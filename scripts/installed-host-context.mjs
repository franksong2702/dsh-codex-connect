/** Start the published DSH profile resolver before importing an installed plugin. */
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const from = (anchor, specifier) => import(pathToFileURL(createRequire(anchor).resolve(specifier)).href)

/** Use the unmodified host's own runtime resolution for one installed-profile check. */
export async function createInstalledHostContext(profilePackagePath, hostPackagePath) {
  const profilePath = resolve(profilePackagePath)
  const hostPath = resolve(hostPackagePath)
  const [{ Context }, { PluginPackages, createRuntimeResolution, loadProfileDirectory }] = await Promise.all([
    from(hostPath, '@deepseek-ai/cordis'),
    from(hostPath, '@deepseek-ai/dsh-app-boot'),
  ])
  const profileDir = dirname(profilePath)
  const profile = loadProfileDirectory('dsh', profileDir, hostPath, { userLayer: false })
  const resolution = await createRuntimeResolution({
    installAnchor: hostPath,
    profile,
    home: dirname(dirname(profileDir)),
  })
  const ctx = new Context()
  try {
    await ctx.plugin(PluginPackages, { resolution })
  } catch (error) {
    await ctx.fiber.dispose()
    throw error
  }
  return {
    ctx,
    importHost: specifier => from(hostPath, specifier),
    importProfile: specifier => from(profilePath, specifier),
  }
}
