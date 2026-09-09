#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBoundedCommand } from './bounded-command.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Require every exact host target to pass against identical package bytes. */
export function validateDshMatrix(reports, versions, pluginVersion) {
  if (reports.length !== versions.length || new Set(versions).size !== versions.length || versions.length === 0) {
    throw new Error('DSH matrix must contain exactly one report for every target')
  }
  for (const [index, report] of reports.entries()) {
    if (report?.schemaVersion !== 1 || report.dshVersion !== versions[index]
      || report.plugin !== 'dsh-codex-connect' || report.pluginVersion !== pluginVersion
      || !/^[a-f0-9]{64}$/u.test(report.pluginArtifactSha256 ?? '')
      || report.defaultsUnchanged !== true || report.runtime?.disposalVerified !== true
      || report.runtime?.schemaVersion !== 1 || report.runtime?.provider !== 'openai-codex'
      || ['enableProxy', 'enableSearch', 'enableImageTool', 'enableImageGeneration', 'enableAutoReview', 'enableReasoningUpdates'].some(key => report.capabilities?.[key] !== false)
      || !Number.isInteger(report.runtime?.modelCount) || report.runtime.modelCount < 1
      || report.runtime.reasoningModelCount !== report.runtime.modelCount) {
      throw new Error('DSH matrix contains an incomplete or mismatched install report')
    }
  }
  if (new Set(reports.map(report => report.pluginArtifactSha256)).size !== 1) {
    throw new Error('DSH matrix must verify the same packed artifact for every target')
  }
}

async function main() {
  const compatibility = JSON.parse(await readFile(join(ROOT, 'compatibility.json'), 'utf8'))
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  const versions = compatibility.dshPluginApi.versions
  const reports = []
  for (const version of versions) {
    process.stderr.write(`Checking declared DSH ${version}\n`)
    const env = { ...scrubCanaryEnvironment(process.env), DSH_VERSION: version }
    delete env.DSH_UNDECLARED_CANARY_VERSION
    const result = await runBoundedCommand(process.execPath, [join(ROOT, 'scripts/check-dsh-install.mjs')], {
      cwd: ROOT, env, timeoutMs: 25 * 60 * 1000,
    })
    if (result.error !== undefined || result.status !== 0) {
      throw new Error(`DSH ${version} isolated check failed; rerun check:dsh-install for the bounded diagnostic`)
    }
    reports.push(JSON.parse(result.stdout.trim()))
  }
  validateDshMatrix(reports, versions, pkg.version)
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, pluginVersion: pkg.version, sameArtifact: true, reports })}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(`check-dsh-matrix: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
