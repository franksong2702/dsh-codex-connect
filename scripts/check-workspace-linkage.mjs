#!/usr/bin/env node

import { readFile, realpath } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IMAGES_ROOT = resolve(REPO_ROOT, 'packages/images')

function parseAlpha(version) {
  const match = /^0\.1\.0-alpha\.(\d+(?:\.\d+)*)$/u.exec(version)
  if (match === null) throw new Error(`unsupported alpha version: ${version}`)
  return match[1].split('.').map(Number)
}

function compareParts(left, right) {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

function rangeIncludes(version, range) {
  const match = /^>=([^ ]+) <([^ ]+)$/u.exec(range)
  if (match === null) throw new Error(`unsupported core peer range: ${range}`)
  const actual = parseAlpha(version)
  return compareParts(actual, parseAlpha(match[1])) >= 0
    && compareParts(actual, parseAlpha(match[2])) < 0
}

const [rootPackage, imagesPackage, workspaceText, rootReal, linkedCoreReal] = await Promise.all([
  readFile(resolve(REPO_ROOT, 'package.json'), 'utf8').then(JSON.parse),
  readFile(resolve(IMAGES_ROOT, 'package.json'), 'utf8').then(JSON.parse),
  readFile(resolve(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8'),
  realpath(REPO_ROOT),
  realpath(resolve(IMAGES_ROOT, 'node_modules/dsh-codex-connect')),
])

if (!/^\s*- \.\s*$/mu.test(workspaceText) || !/^\s*- packages\/\*\s*$/mu.test(workspaceText)) {
  throw new Error('pnpm workspace must contain both the root package and packages/*')
}
if (imagesPackage.devDependencies?.['dsh-codex-connect'] !== 'workspace:*') {
  throw new Error('images devDependency must use dsh-codex-connect: workspace:*')
}
if (imagesPackage.dependencies?.['dsh-codex-connect'] !== undefined) {
  throw new Error('images package must not materialize core as a regular dependency')
}
if (rootReal !== linkedCoreReal) {
  throw new Error('images workspace link does not resolve to the repository root')
}
const peerRange = imagesPackage.peerDependencies?.['dsh-codex-connect']
if (typeof peerRange !== 'string' || !rangeIncludes(rootPackage.version, peerRange)) {
  throw new Error(`root ${rootPackage.version} does not satisfy images core peer ${String(peerRange)}`)
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  package: imagesPackage.name,
  coreVersion: rootPackage.version,
  peerRange,
  workspaceLinked: true,
  singleCoreInstance: true,
})}\n`)
