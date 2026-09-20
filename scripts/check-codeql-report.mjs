/** Supplemental stacked-PR CodeQL gate; never uploads or changes repository security settings. */
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function inspectCodeqlReport(report) {
  assert.equal(report?.version, '2.1.0', 'expected SARIF 2.1.0')
  assert.ok(Array.isArray(report.runs) && report.runs.length > 0, 'missing analysis runs')
  let findings = 0
  let rules = 0
  for (const run of report.runs) {
    assert.equal(run.tool?.driver?.name, 'CodeQL', 'not a CodeQL analysis')
    // Current CodeQL SARIF places query-pack rules in tool.extensions; the
    // driver may have an empty rule table even when queries ran successfully.
    const extensions = run.tool.extensions ?? []
    assert.ok(Array.isArray(extensions), 'invalid query-pack components')
    let runRules = 0
    for (const component of [run.tool.driver, ...extensions]) {
      if (component.rules === undefined) continue
      assert.ok(Array.isArray(component.rules), 'invalid query rules')
      runRules += component.rules.length
    }
    assert.ok(runRules > 0, 'missing query rules')
    assert.ok(Array.isArray(run.results), 'missing results')
    assert.ok(Array.isArray(run.invocations) && run.invocations.length > 0, 'missing execution evidence')
    assert.ok(run.invocations.every(item => item.executionSuccessful === true), 'analysis execution failed')
    rules += runRules
    findings += run.results.length
  }
  return { runs: report.runs.length, rules, findings }
}

export function requireCleanCodeqlReport(report) {
  const summary = inspectCodeqlReport(report)
  assert.equal(summary.findings, 0, 'CodeQL findings require review; no suppression or baseline is applied')
  return summary
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2]
  assert.ok(directory && process.argv.length === 3, 'usage: check-codeql-report.mjs <sarif-directory>')
  const files = (await readdir(directory)).filter(name => name.endsWith('.sarif'))
  assert.ok(files.length > 0, 'no CodeQL report was produced')
  for (const file of files) {
    const bytes = await readFile(join(directory, file))
    assert.ok(bytes.length <= 64 * 1024 * 1024, 'report exceeds review bound')
    const report = JSON.parse(bytes.toString('utf8'))
    console.log(JSON.stringify({ file, ...inspectCodeqlReport(report) }))
    requireCleanCodeqlReport(report)
  }
}
