import { expect, it } from 'vitest'
// @ts-expect-error Plain Node matrix helper is outside the source build.
import { inspectTaskTestReport, TASK_HOST_CASES, TASK_IDENTITY_CASE } from '../scripts/adaptive-task-matrix-contract.mjs'

function report() {
  const cases = [...TASK_HOST_CASES, TASK_IDENTITY_CASE]
  return { success: true, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    numTotalTests: cases.length, numPassedTests: cases.length,
    testResults: [{ assertionResults: cases.map(title => ({ title, status: 'passed' })) }] }
}
it('requires the independent task contract including every host behavior and identity', () => {
  expect(inspectTaskTestReport(report()).tests).toBe(TASK_HOST_CASES.length + 1)
})
it.each(['missing', 'renamed', 'duplicated', 'skipped', 'failed'])('rejects %s task-matrix evidence even when the runner reports success', kind => {
  const data = report(); const cases = data.testResults[0]!.assertionResults
  if (kind === 'missing') cases.pop()
  if (kind === 'renamed') cases[0]!.title = 'unrelated passing test'
  if (kind === 'duplicated') cases[0]!.title = cases[1]!.title
  if (kind === 'skipped') cases[0]!.status = 'pending'
  if (kind === 'failed') cases[0]!.status = 'failed'
  expect(() => inspectTaskTestReport(data)).toThrow()
})
