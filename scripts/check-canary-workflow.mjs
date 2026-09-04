#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { buildCanaryTrackingIssue } from './canary-tracking.mjs'

const workflowPath = fileURLToPath(new URL('../.github/workflows/upstream-dsh-canary.yml', import.meta.url))
const ciWorkflowPath = fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url))
const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const installCheckPath = fileURLToPath(new URL('./check-dsh-install.mjs', import.meta.url))
const nextCheckPath = fileURLToPath(new URL('./check-dsh-next.mjs', import.meta.url))
const canaryEnvironmentPath = fileURLToPath(new URL('./canary-environment.mjs', import.meta.url))
const workflow = readFileSync(workflowPath, 'utf8')
const ciWorkflow = readFileSync(ciWorkflowPath, 'utf8')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
const installCheck = readFileSync(installCheckPath, 'utf8')
const nextCheck = readFileSync(nextCheckPath, 'utf8')
const canaryEnvironment = readFileSync(canaryEnvironmentPath, 'utf8')

const failures = []
let assertionCount = 0

function assertContract(name, condition) {
  assertionCount += 1
  if (!condition) failures.push(name)
}

assertContract('workflow runs daily', /^\s+schedule:\s*\n\s+- cron: ["']0 3 \* \* \*["']/m.test(workflow))
assertContract('workflow supports manual dispatch', /^\s+workflow_dispatch:\s*$/m.test(workflow))
assertContract('push and pull request triggers are absent', !/^\s+(?:push|pull_request):/m.test(workflow))
assertContract('overlapping canaries do not cancel each other', /group:\s*upstream-dsh-canary[\s\S]*?cancel-in-progress:\s*false/.test(workflow))

const permissionBlock = workflow.match(/^permissions:\s*\n((?:^[ \t]+[^\n]*\n?)+)/m)?.[1] ?? ''
const permissionNames = [...permissionBlock.matchAll(/^\s+([a-z-]+):/gm)].map(match => match[1])
assertContract(
  'default permissions are limited to contents read',
  permissionNames.length === 1
    && permissionNames[0] === 'contents'
    && /\bcontents:\s*read\b/.test(permissionBlock),
)
assertContract('only candidate jobs receive issue write permission', /^  canary:\s*$[\s\S]*?^    permissions:\s*$\n      contents: read\n      issues: write$/m.test(workflow))
assertContract('all actions are pinned to full commit SHAs', (() => {
  const uses = [...workflow.matchAll(/^\s+uses:\s+([^\s#]+)/gm)].map(match => match[1])
  return uses.length > 0 && uses.every(ref => /@[0-9a-f]{40}$/.test(ref))
})())
assertContract('Node version is pinned', /node-version:\s*24\.15\.0/.test(workflow))
assertContract('pnpm version is pinned', /pnpm\/action-setup@[0-9a-f]{40}[\s\S]*?version:\s*10\.30\.3/.test(workflow))
assertContract('dependency installation is frozen', /pnpm\s+--config\.minimum-release-age=0\s+install\s+--frozen-lockfile/.test(workflow))
assertContract('latest, next, and alpha channels are monitored', /channel:\s*latest[\s\S]*?channel:\s*next[\s\S]*?channel:\s*alpha/.test(workflow))
assertContract('next deduplicates a candidate already owned by latest', /channel:\s*next[\s\S]*?dedupe_args:\s*--dedupe-against latest/.test(workflow))
assertContract('alpha deduplicates candidates owned by stable channels', /channel:\s*alpha[\s\S]*?dedupe_args:\s*--dedupe-against latest --dedupe-against next/.test(workflow))
assertContract('one resolve job owns the immutable dist-tag snapshot', /^  resolve:\s*$[\s\S]*?outputs:[\s\S]*?latest: \$\{\{ steps\.dist-tags\.outputs\.latest \}\}[\s\S]*?next: \$\{\{ steps\.dist-tags\.outputs\.next \}\}[\s\S]*?alpha: \$\{\{ steps\.dist-tags\.outputs\.alpha \}\}[\s\S]*?--dist-tags-output "\$GITHUB_OUTPUT"/m.test(workflow))
assertContract('candidate jobs depend on the shared snapshot', /^  canary:\s*$[\s\S]*?needs:\s*resolve/m.test(workflow))
assertContract('each channel has a sixty minute retry budget', /timeout-minutes:\s*60/.test(workflow))
assertContract('the job budget covers two candidate timeouts plus ten minutes', (() => {
  const jobMinutes = Number(workflow.match(/^  canary:\s*$[\s\S]*?timeout-minutes:\s*(\d+)/mu)?.[1])
  const candidateMinutes = Number(nextCheck.match(/CANDIDATE_CHECK_TIMEOUT_MS\s*=\s*(\d+) \* 60 \* 1000/u)?.[1])
  return Number.isFinite(jobMinutes) && Number.isFinite(candidateMinutes) && jobMinutes >= candidateMinutes * 2 + 10
})())
assertContract('daily workflow leaves the declared baseline to its existing gate', !/check:dsh-install/.test(workflow))
assertContract('candidate check consumes the shared snapshot and writes a first report', /check:dsh-next -- --channel "\$\{\{ matrix\.channel \}\}"[^\n]*?--resolved-latest "\$\{\{ needs\.resolve\.outputs\.latest \}\}" --resolved-next "\$\{\{ needs\.resolve\.outputs\.next \}\}" --resolved-alpha "\$\{\{ needs\.resolve\.outputs\.alpha \}\}" --report \.canary\/first\.json/.test(workflow))
assertContract('candidate failure retries the same shared snapshot once', /steps\.first-canary\.outcome == 'failure'[\s\S]*?check:dsh-next -- --channel "\$\{\{ matrix\.channel \}\}"[^\n]*?--resolved-latest "\$\{\{ needs\.resolve\.outputs\.latest \}\}" --resolved-next "\$\{\{ needs\.resolve\.outputs\.next \}\}" --resolved-alpha "\$\{\{ needs\.resolve\.outputs\.alpha \}\}" --report \.canary\/second\.json/.test(workflow))
assertContract('candidate tracking runs after successful and failed checks', /Record candidate tracking state[\s\S]*?if: always\(\) && steps\.first-canary\.outcome != 'skipped'/.test(workflow))
assertContract('candidate tracking reads an optional retry report through the tested helper', /canary-tracking\.mjs[\s\S]*?existsSync\(process\.env\.SECOND_REPORT\)[\s\S]*?buildCanaryTrackingIssue\(first, second/.test(workflow))
assertContract('issues are deduplicated by candidate version', /listForRepo[\s\S]*?issue\.body\?\.includes\(tracking\.marker\)/.test(workflow))
assertContract('closed alerts are reopened instead of duplicated', /existing\.state === 'closed'[\s\S]*?state: 'open'/.test(workflow))
assertContract('unchanged tracker state and title do not rewrite an open issue', /existing\.body\?\.includes\(tracking\.stateMarker\) && existing\.title === tracking\.title[\s\S]*?no update is needed/.test(workflow))
assertContract('tracker state changes preserve unrelated labels', /new Set\(existing\.labels[\s\S]*?labels\.delete\('bug'\)[\s\S]*?labels\.delete\('enhancement'\)[\s\S]*?labels\.add\(tracking\.label\)/.test(workflow))
assertContract('open trackers receive a changed bounded state', /github\.rest\.issues\.update\([\s\S]*?issue_number: existing\.number,[\s\S]*?body: tracking\.body,[\s\S]*?Updated DSH candidate tracker/.test(workflow))
assertContract('confirmed failure leaves the workflow failed', /Fail after two unsuccessful checks[\s\S]*?run: exit 1/.test(workflow))

const trackingMetadata = {
  runUrl: 'https://github.com/franksong2702/dsh-codex-connect/actions/runs/123',
  pluginCommit: '0123456789abcdef',
}
const candidateReport = overrides => ({
  status: 'pass',
  classification: 'candidate-compatible',
  channel: 'alpha',
  supportedVersion: '0.1.2-rc.1',
  candidateVersion: '0.1.2-rc.2',
  stage: 'isolated-install',
  nodeVersion: 'v24.15.0',
  pluginCommit: null,
  summary: 'candidate check passed',
  ...overrides,
})
const passedTracking = buildCanaryTrackingIssue(candidateReport(), undefined, trackingMetadata)
assertContract(
  'a passing newer candidate becomes a preliminary validation tracker',
  passedTracking?.state === 'passed-needs-full-validation'
    && passedTracking.marker === '<!-- dsh-canary:0.1.2-rc.2 -->'
    && passedTracking.label === 'enhancement'
    && passedTracking.body.includes('preliminary evidence only'),
)
const compatibilityTracking = buildCanaryTrackingIssue(
  candidateReport({ status: 'fail', classification: 'compatibility', summary: 'first failure' }),
  candidateReport({ status: 'fail', classification: 'compatibility', summary: 'second failure' }),
  trackingMetadata,
)
assertContract(
  'two matching compatibility failures become an adaptation tracker',
  compatibilityTracking?.state === 'compatibility-failed'
    && compatibilityTracking.label === 'bug'
    && compatibilityTracking.body.includes('failed twice'),
)
const infrastructureTracking = buildCanaryTrackingIssue(
  candidateReport({ status: 'fail', classification: 'infrastructure', summary: 'registry timeout' }),
  candidateReport({ status: 'fail', classification: 'infrastructure', summary: 'registry timeout' }),
  trackingMetadata,
)
assertContract(
  'repeated infrastructure failures remain distinct from compatibility failures',
  infrastructureTracking?.state === 'infrastructure-blocked'
    && infrastructureTracking.label === 'enhancement'
    && infrastructureTracking.body.includes('infrastructure failure'),
)
const recoveredTracking = buildCanaryTrackingIssue(
  candidateReport({ status: 'fail', classification: 'infrastructure', summary: 'transient timeout' }),
  candidateReport(),
  trackingMetadata,
)
assertContract('a successful retry records preliminary success', recoveredTracking?.state === 'passed-needs-full-validation')
assertContract(
  'unchanged and deduplicated channel results do not create trackers',
  buildCanaryTrackingIssue(candidateReport({ classification: 'unchanged' }), undefined, trackingMetadata) === undefined
    && buildCanaryTrackingIssue(candidateReport({ classification: 'duplicate' }), undefined, trackingMetadata) === undefined,
)
assertContract('mismatched retry candidates fail closed', (() => {
  try {
    buildCanaryTrackingIssue(candidateReport(), candidateReport({ candidateVersion: '0.1.2-alpha.7' }), trackingMetadata)
    return false
  } catch {
    return true
  }
})())
assertContract('candidate checker opts into the undeclared-version mode', /DSH_UNDECLARED_CANARY_VERSION:\s*'1'/.test(nextCheck))
assertContract('only candidates that supersede declared support reach isolated installation', /compareSemanticVersions\(candidateVersion, supportedVersion\) > 0[\s\S]*?versionClassification === 'not-newer'[\s\S]*?const candidateCheck/u.test(nextCheck))
assertContract('candidate classification is driven by fail-closed exit codes', /classifyCandidateCheckStatus\(candidateCheck\.status\)/.test(nextCheck) && /error instanceof CompatibilityCheckError \? 1 : 2/.test(installCheck))
assertContract('registry and candidate subprocesses have explicit timeouts', /REGISTRY_TIMEOUT_MS\s*=\s*60 \* 1000[\s\S]*?CANDIDATE_CHECK_TIMEOUT_MS\s*=\s*25 \* 60 \* 1000/.test(nextCheck) && /timeoutMs:\s*COMMAND_TIMEOUT_MS/.test(installCheck))
assertContract('candidate subprocesses receive a scrubbed environment', /scrubCanaryEnvironment\(process\.env\)/.test(nextCheck) && /allowUndeclaredCanaryVersion[\s\S]*?scrubCanaryEnvironment\(process\.env\)/.test(installCheck))
assertContract('credential-bearing environment names are filtered', /AUTH\|BEARER\|COOKIE\|CREDENTIAL\|JWT\|KEY\|PASS\|SECRET\|SESSION\|TOKEN/.test(canaryEnvironment))
assertContract('undeclared candidates install the packed artifact', /allowUndeclaredCanaryVersion[\s\S]*?npm[\s\S]*?'pack'[\s\S]*?pluginSpec = `file:/.test(installCheck))
assertContract(
  'candidate checks boot the installed model runtime',
  /check-installed-runtime/.test(installCheck) && /installed runtime contract/.test(installCheck),
)
assertContract(
  'candidate checks compose the installed profile before plugin commands',
  /\['web', '--help'\][\s\S]*?installed profile boot[\s\S]*?plugin doctor/u.test(installCheck),
)
assertContract('publishing and deployment commands are absent', !/npm publish|gh release create|\bdeploy\b|3080|3081/iu.test(workflow))
assertContract(
  'credential-bearing secrets are not requested',
  !/\$\{\{\s*secrets\.|DEEPSEEK_API_KEY|OPENAI_API_KEY|NPM_TOKEN|NODE_AUTH_TOKEN/iu.test(workflow),
)
assertContract('package exposes the workflow contract check', packageJson.scripts?.['check:canary-workflow'] === 'node scripts/check-canary-workflow.mjs && node scripts/check-dsh-next-contract.mjs')
assertContract('full check includes the canary workflow contract', /(?:^|&&)\s*pnpm run check:canary-workflow(?:\s|$)/.test(packageJson.scripts?.check ?? ''))
// Match a dedicated, required step in validate, not a comment or another job.
const ciValidateJob = ciWorkflow.match(/^  validate:\s*\n([\s\S]*?)(?=^  \S|(?![\s\S]))/m)?.[1] ?? ''
const ciValidateSteps = [...ciValidateJob.matchAll(/^      - [\s\S]*?(?=^      - |(?![\s\S]))/gm)]
assertContract(
  'PR CI validate runs the canary workflow contract as a required step',
  !/^    (?:if|continue-on-error):/m.test(ciValidateJob) && ciValidateSteps.some(([step]) =>
    /^        run: pnpm run check:canary-workflow[ \t]*$/m.test(step) &&
    !step.split('\n').some(line => /^(?:      - |        )(?:if|continue-on-error):/.test(line)),
  ),
)
assertContract(
  'CI executes Windows command-script and process-tree contracts',
  /^  windows-canary-contract:\s*$[\s\S]*?runs-on:\s*windows-latest[\s\S]*?node scripts\/check-dsh-next-contract\.mjs/mu.test(ciWorkflow),
)

if (failures.length > 0) {
  console.error(`canary workflow contract failed (${failures.length}/${assertionCount}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`canary workflow contract: ${assertionCount}/${assertionCount} assertions passed`)
