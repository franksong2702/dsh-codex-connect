#!/usr/bin/env node

import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const JSON_SCHEMA_VERSION = 1
const PROVIDER_ID = 'openai-codex'

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

/** Validate the provider and resolved model data consumed by DSH selectors. */
export function validateRuntimeProjection(providers, models) {
  if (!Array.isArray(providers) || !providers.some(provider => provider?.id === PROVIDER_ID)) {
    throw new Error(`runtime did not register the ${PROVIDER_ID} provider`)
  }
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('runtime returned an empty Codex model catalog')
  }

  const modelIds = new Set()
  let reasoningModelCount = 0
  for (const model of models) {
    if (model?.provider !== PROVIDER_ID) throw new Error('runtime returned a model for the wrong provider')
    const modelId = requireNonEmptyString(model.id, 'model id')
    requireNonEmptyString(model.name, `model ${modelId} name`)
    if (modelIds.has(modelId)) throw new Error(`runtime returned duplicate model id ${modelId}`)
    modelIds.add(modelId)

    const efforts = model.reasoning?.efforts
    if (!Array.isArray(efforts) || efforts.length === 0) {
      throw new Error(`runtime model ${modelId} has no reasoning efforts`)
    }
    const effortIds = new Set()
    for (const effort of efforts) {
      const effortId = requireNonEmptyString(effort?.id, `model ${modelId} reasoning effort id`)
      requireNonEmptyString(effort?.name, `model ${modelId} reasoning effort ${effortId} name`)
      if (effortIds.has(effortId)) {
        throw new Error(`runtime model ${modelId} returned duplicate reasoning effort ${effortId}`)
      }
      effortIds.add(effortId)
    }
    reasoningModelCount += 1
  }

  return { modelCount: models.length, reasoningModelCount }
}

async function importFromProfile(profilePackagePath, specifier) {
  const require = createRequire(profilePackagePath)
  return import(pathToFileURL(require.resolve(specifier)).href)
}

/** Boot the installed plugin against one isolated DSH profile and inspect its runtime registration. */
export async function checkInstalledRuntime(profilePackagePath, hostPackagePath = profilePackagePath) {
  const packagePath = resolve(profilePackagePath)
  const hostPath = resolve(hostPackagePath)
  const [{ Context }, { default: LlmRuntime }, PiAiRuntime, OpenAICodex] = await Promise.all([
    importFromProfile(hostPath, '@deepseek-ai/cordis'),
    importFromProfile(hostPath, '@deepseek-ai/dsh-llm'),
    importFromProfile(hostPath, '@deepseek-ai/dsh-llm-pi-ai'),
    importFromProfile(packagePath, 'dsh-codex-connect'),
  ])

  const ctx = new Context()
  try {
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(PiAiRuntime, {})
    const plugin = await ctx.plugin(OpenAICodex, {})
    const providers = ctx.llm.listProviders()
    const listed = await ctx.llm.listModels(PROVIDER_ID)
    const models = await Promise.all(listed.map(model => ctx.llm.resolveModelInfo(PROVIDER_ID, model.id)))
    const projection = validateRuntimeProjection(providers, models)

    await plugin.dispose()
    if (ctx.llm.listProviders().some(provider => provider.id === PROVIDER_ID)) {
      throw new Error(`runtime retained the ${PROVIDER_ID} provider after plugin disposal`)
    }

    return {
      schemaVersion: JSON_SCHEMA_VERSION,
      provider: PROVIDER_ID,
      ...projection,
      disposalVerified: true,
    }
  } finally {
    await ctx.fiber.dispose()
  }
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const profilePackagePath = process.argv[2]
  const hostPackagePath = process.argv[3]
  if (profilePackagePath === undefined || process.argv.length > 4) {
    process.stderr.write('usage: check-installed-runtime <profile-package.json> [host-package.json]\n')
    process.exitCode = 1
  } else {
    try {
      process.stdout.write(`${JSON.stringify(await checkInstalledRuntime(profilePackagePath, hostPackagePath))}\n`)
    } catch (error) {
      process.stderr.write(`check-installed-runtime: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    }
  }
}
