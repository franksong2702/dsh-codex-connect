import { expect, it } from 'vitest'
// @ts-expect-error Plain Node CI helper is outside the source build.
import { requireCleanCodeqlReport } from '../scripts/check-codeql-report.mjs'

const valid = () => ({ version: '2.1.0', runs: [{ tool: { driver: { name: 'CodeQL', rules: [{ id: 'js/example' }] } },
  invocations: [{ executionSuccessful: true }], results: [] as unknown[] }] })

it('requires a successful CodeQL execution and zero findings', () => {
  expect(requireCleanCodeqlReport(valid())).toEqual({ runs: 1, rules: 1, findings: 0 })
})
it.each(['missing-runs', 'other-tool', 'no-rules', 'no-invocation', 'failed-analysis', 'finding'] as const)('rejects %s evidence', kind => {
  const report = valid()
  const run = report.runs[0]!
  if (kind === 'missing-runs') report.runs = []
  if (kind === 'other-tool') run.tool.driver.name = 'Other'
  if (kind === 'no-rules') run.tool.driver.rules = []
  if (kind === 'no-invocation') run.invocations = []
  if (kind === 'failed-analysis') run.invocations[0]!.executionSuccessful = false
  if (kind === 'finding') run.results.push({ ruleId: 'js/example', level: 'warning' })
  expect(() => requireCleanCodeqlReport(report)).toThrow()
})
