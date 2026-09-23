#!/usr/bin/env node

import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkInstalledReserve } from './check-installed-reserve.mjs'
import { checkInstalledNativeCompaction } from './check-installed-native-compaction.mjs'
import { checkInstalledImages } from './check-installed-images.mjs'
import { createInstalledHostContext } from './installed-host-context.mjs'

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

/** Boot the installed plugin against one isolated DSH profile and inspect its runtime registration. */
export async function checkInstalledRuntime(profilePackagePath, hostPackagePath = profilePackagePath) {
  const packagePath = resolve(profilePackagePath)
  const hostPath = resolve(hostPackagePath)
  const { ctx, importHost, importProfile } = await createInstalledHostContext(packagePath, hostPath)
  try {
    const [{ default: LlmRuntime }, PiAiRuntime, OpenAICodex] = await Promise.all([
      importHost('@deepseek-ai/dsh-llm'),
      importHost('@deepseek-ai/dsh-llm-pi-ai'),
      importProfile('dsh-codex-connect'),
    ])
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(PiAiRuntime, {})
    const plugin = await ctx.plugin(OpenAICodex, {})
    const providers = ctx.llm.listProviders()
    const listed = await ctx.llm.listModels(PROVIDER_ID)
    const models = await Promise.all(listed.map(model => ctx.llm.resolveModelInfo(PROVIDER_ID, model.id)))
    const projection = validateRuntimeProjection(providers, models)
    for (const id of ['gpt-6-sol', 'gpt-6-luna']) {
      const model = models.find(model => model.id === id)
      if (model?.reasoning?.efforts.map(effort => effort.id).join(',') !== 'low,medium,high,xhigh,max') {
        throw new Error(`runtime is missing calibrated GPT-6 compatibility for ${id}`)
      }
    }
    for (const model of models) {
      const prepared = await ctx.llm.prepareCall({ provider: PROVIDER_ID, model: model.id })
      if (prepared.config.provider !== PROVIDER_ID || prepared.config.model !== model.id) {
        throw new Error(`runtime prepared the wrong model for ${model.id}`)
      }
    }

    await plugin.dispose()
    if (ctx.llm.listProviders().some(provider => provider.id === PROVIDER_ID)) {
      throw new Error(`runtime retained the ${PROVIDER_ID} provider after plugin disposal`)
    }

    const reserveTransitionsVerified = await checkInstalledReserve(importHost, OpenAICodex)
    const nativeCompactionLifecycle = await checkInstalledNativeCompaction(packagePath, hostPath)
    const toolsManifest = JSON.parse(await readFile(createRequire(hostPath).resolve('@deepseek-ai/dsh-tools/package.json'), 'utf8'))
    const images = await checkInstalledImages(importHost, OpenAICodex, toolsManifest)

    return {
      schemaVersion: JSON_SCHEMA_VERSION,
      provider: PROVIDER_ID,
      ...projection,
      preparedModelCount: models.length,
      disposalVerified: true,
      reserveTransitionsVerified,
      nativeCompactionLifecycle,
      images,
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
