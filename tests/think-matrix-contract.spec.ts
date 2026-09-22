import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
// @ts-expect-error Plain Node matrix helper is outside the source build.
import { assertThinkMatrix, inspectThinkTestReport, THINK_HOST_CASES, THINK_IDENTITY_CASE, THINK_RUNTIME_PACKAGES } from '../scripts/think-matrix-contract.mjs'
// @ts-expect-error Plain Node matrix helper is outside the source build.
import { readThinkHostIdentity } from '../scripts/check-think-matrix.mjs'
// @ts-expect-error Plain Node case contract is outside the source build.
import { ADAPTIVE_SPLIT_CASES } from '../scripts/adaptive-split-cases.mjs'
// @ts-expect-error Plain Node case contract is outside the source build.
import { ADAPTIVE_TASK_CASES } from '../scripts/adaptive-task-cases.mjs'

const caseCount = 42 + ADAPTIVE_SPLIT_CASES.length + ADAPTIVE_TASK_CASES.length

const version = '0.1.5-rc.1'
const digest = 'a'.repeat(64)
const tests = () => ({ success: true, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
  numTotalTests: caseCount + 1, numPassedTests: caseCount + 1,
  testResults: [{ assertionResults: [...THINK_HOST_CASES, THINK_IDENTITY_CASE].map((title: string) => ({ title, status: 'passed' })) }],
})
const host = () => ({ version, bundleDigest: digest, cases: [...THINK_HOST_CASES], tests: caseCount + 1,
  pid: 1001, node: 'v22.22.3', runtimePackages: Object.fromEntries(THINK_RUNTIME_PACKAGES.map((name: string) => [name, version])),
  piAiVersion: '0.85.1', syntheticOnly: true, realProviderDispatches: 0, externalNetworkAttempts: 0 })
const report = () => ({ schemaVersion: 2, kind: 'think-native-host-matrix', bundleDigest: digest,
  syntheticOnly: true, productSettingsExercised: true, adaptiveSplitExercised: true, adaptiveTaskExercised: true,
  productionDefaultsChanged: false, realProviderDispatches: 0, reports: [host()] })

it('requires existing Think/Split, every task-level case and exact runtime identity', () => {
  expect(THINK_HOST_CASES).toHaveLength(caseCount)
  expect(new Set(THINK_HOST_CASES).size).toBe(caseCount)
  expect(THINK_HOST_CASES.slice(42, 42 + ADAPTIVE_SPLIT_CASES.length)).toEqual(ADAPTIVE_SPLIT_CASES.map((name: string) => `Adaptive Split host: ${name}`))
  expect(ADAPTIVE_TASK_CASES).toHaveLength(25)
  expect(THINK_HOST_CASES.slice(42 + ADAPTIVE_SPLIT_CASES.length)).toEqual(ADAPTIVE_TASK_CASES)
  expect(inspectThinkTestReport(tests())).toEqual({ cases: THINK_HOST_CASES, tests: caseCount + 1 })
  expect(assertThinkMatrix(report(), [version], digest)).toEqual(report())
})
it.each(['failed', 'skipped', 'todo', 'missing', 'duplicate', 'renamed'])(
  'rejects incomplete test execution: %s', kind => {
    const value = tests()
    if (kind === 'failed') value.success = false
    if (kind === 'skipped') value.numPendingTests = 1
    if (kind === 'todo') value.numTodoTests = 1
    if (kind === 'missing') value.testResults[0]!.assertionResults.pop()
    if (kind === 'duplicate') value.testResults[0]!.assertionResults[1] = value.testResults[0]!.assertionResults[0]!
    if (kind === 'renamed') value.testResults[0]!.assertionResults[0]!.title = 'ordinary install succeeded'
    expect(() => inspectThinkTestReport(value)).toThrow()
  })
it.each(['wrong-kind', 'wrong-host', 'mixed-runtime', 'missing-runtime', 'different-bundle', 'live', 'network', 'enabled', 'missing-case', 'old-schema', 'no-product', 'no-split', 'no-task'])(
  'rejects unsupported matrix evidence: %s', kind => {
    const value = report(); const result = value.reports[0]!
    if (kind === 'wrong-kind') value.kind = 'ordinary-install-matrix'
    if (kind === 'wrong-host') result.version = '0.1.2-rc.1'
    if (kind === 'mixed-runtime') result.runtimePackages['@deepseek-ai/dsh-user-questions'] = '0.1.2-rc.1'
    if (kind === 'missing-runtime') delete result.runtimePackages['@deepseek-ai/dsh-agent-loop']
    if (kind === 'different-bundle') result.bundleDigest = 'b'.repeat(64)
    if (kind === 'live') result.realProviderDispatches = 1
    if (kind === 'network') result.externalNetworkAttempts = 1
    if (kind === 'enabled') value.productionDefaultsChanged = true
    if (kind === 'old-schema') value.schemaVersion = 1
    if (kind === 'no-product') value.productSettingsExercised = false
    if (kind === 'no-split') value.adaptiveSplitExercised = false
    if (kind === 'no-task') value.adaptiveTaskExercised = false
    if (kind === 'missing-case') result.cases.pop()
    expect(() => assertThinkMatrix(value, [version], digest)).toThrow()
  })
it('does not accept empty or reused-process host evidence', () => {
  expect(() => assertThinkMatrix({ ...report(), reports: [] }, [version], digest)).toThrow()
  const second = { ...host(), version: '0.1.5-rc.2',
    runtimePackages: Object.fromEntries(THINK_RUNTIME_PACKAGES.map((name: string) => [name, '0.1.5-rc.2'])) }
  expect(() => assertThinkMatrix({ ...report(), reports: [host(), second] }, [version, second.version], digest)).toThrow(/fresh test process/)
})
it('runs dedicated Think acceptance rather than substituting an installation check in CI', async () => {
  const yaml = await readFile('.github/workflows/ci.yml', 'utf8')
  const validation = yaml.split('  validate:')[1]!.split('  browser-ui-regression:')[0]!
  expect(validation).toContain("node-version: ['22.19.0', '24.x']")
  expect(validation).toContain('run: node scripts/check-think-matrix.mjs')
  expect(validation).toContain('run: pnpm --silent run check:dsh-matrix')
  expect(validation).not.toContain('continue-on-error: true')
})
it('rejects mixed versions and escaped package links before loading a host', async () => {
  const root = await mkdtemp(join(tmpdir(), 'think-identity-contract-'))
  const hostRoot = join(root, 'host'); const name = '@deepseek-ai/dsh-session'
  const directory = join(hostRoot, 'node_modules', name)
  const metadata = (version: string) => JSON.stringify({ name, version, type: 'module',
    exports: { '.': './index.js', './package.json': './package.json' } })
  try {
    await mkdir(directory, { recursive: true }); await writeFile(join(hostRoot, 'package.json'), '{}')
    await writeFile(join(directory, 'package.json'), metadata(version)); await writeFile(join(directory, 'index.js'), 'export {}')
    expect((await readThinkHostIdentity(hostRoot, version, [name])).packages).toEqual({ [name]: version })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version, type: 'module', exports: { '.': { import: './index.js' } } }))
    expect((await readThinkHostIdentity(hostRoot, version, [name])).packages).toEqual({ [name]: version })
    await writeFile(join(directory, 'package.json'), metadata('0.1.2-rc.1'))
    await expect(readThinkHostIdentity(hostRoot, version, [name])).rejects.toThrow(/Mixed Think host/)
    await writeFile(join(directory, 'package.json'), metadata(version))
    const outside = join(root, 'outside.js'); await writeFile(outside, 'export {}')
    await rm(join(directory, 'index.js')); await symlink(outside, join(directory, 'index.js'))
    await expect(readThinkHostIdentity(hostRoot, version, [name])).rejects.toThrow(/escaped/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
