#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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
assertContract('latest and next channels are both monitored', /channel:\s*latest[\s\S]*?channel:\s*next/.test(workflow))
assertContract('next deduplicates a candidate already owned by latest', /channel:\s*next[\s\S]*?dedupe_args:\s*--dedupe-against latest/.test(workflow))
assertContract('one resolve job owns the immutable dist-tag snapshot', /^  resolve:\s*$[\s\S]*?outputs:[\s\S]*?latest: \$\{\{ steps\.dist-tags\.outputs\.latest \}\}[\s\S]*?next: \$\{\{ steps\.dist-tags\.outputs\.next \}\}[\s\S]*?--dist-tags-output "\$GITHUB_OUTPUT"/m.test(workflow))
assertContract('candidate jobs depend on the shared snapshot', /^  canary:\s*$[\s\S]*?needs:\s*resolve/m.test(workflow))
assertContract('each channel has a sixty minute retry budget', /timeout-minutes:\s*60/.test(workflow))
assertContract('the job budget covers two candidate timeouts plus ten minutes', (() => {
  const jobMinutes = Number(workflow.match(/^  canary:\s*$[\s\S]*?timeout-minutes:\s*(\d+)/mu)?.[1])
  const candidateMinutes = Number(nextCheck.match(/CANDIDATE_CHECK_TIMEOUT_MS\s*=\s*(\d+) \* 60 \* 1000/u)?.[1])
  return Number.isFinite(jobMinutes) && Number.isFinite(candidateMinutes) && jobMinutes >= candidateMinutes * 2 + 10
})())
assertContract('daily workflow leaves the declared baseline to its existing gate', !/check:dsh-install/.test(workflow))
assertContract('candidate check consumes the shared snapshot and writes a first report', /check:dsh-next -- --channel "\$\{\{ matrix\.channel \}\}"[^\n]*?--resolved-latest "\$\{\{ needs\.resolve\.outputs\.latest \}\}" --resolved-next "\$\{\{ needs\.resolve\.outputs\.next \}\}" --report \.canary\/first\.json/.test(workflow))
assertContract('candidate failure retries the same shared snapshot once', /steps\.first-canary\.outcome == 'failure'[\s\S]*?check:dsh-next -- --channel "\$\{\{ matrix\.channel \}\}"[^\n]*?--resolved-latest "\$\{\{ needs\.resolve\.outputs\.latest \}\}" --resolved-next "\$\{\{ needs\.resolve\.outputs\.next \}\}" --report \.canary\/second\.json/.test(workflow))
assertContract('issue recording requires two failed attempts', /Record a confirmed compatibility alert[\s\S]*?if: steps\.first-canary\.outcome == 'failure' && steps\.second-canary\.outcome == 'failure'/.test(workflow))
assertContract('issue recording requires matching channel and compatibility classifications', /first\.classification === 'compatibility'[\s\S]*?second\.classification === 'compatibility'[\s\S]*?first\.channel === second\.channel[\s\S]*?first\.candidateVersion === second\.candidateVersion/.test(workflow))
assertContract('issues are deduplicated by candidate version', /dsh-canary:\$\{version\}[\s\S]*?listForRepo[\s\S]*?issue\.body\?\.includes\(marker\)/.test(workflow))
assertContract('closed alerts are reopened instead of duplicated', /existing\.state === 'closed'[\s\S]*?state: 'open'/.test(workflow))
assertContract('open alerts receive the latest bounded report', /github\.rest\.issues\.update\([\s\S]*?issue_number: existing\.number,[\s\S]*?body,[\s\S]*?Updated compatibility issue/.test(workflow))
assertContract('confirmed failure leaves the workflow failed', /Fail after two unsuccessful checks[\s\S]*?run: exit 1/.test(workflow))
assertContract('candidate checker opts into the undeclared-version mode', /DSH_UNDECLARED_CANARY_VERSION:\s*'1'/.test(nextCheck))
assertContract('candidate classification is driven by fail-closed exit codes', /classifyCandidateCheckStatus\(candidateCheck\.status\)/.test(nextCheck) && /error instanceof CompatibilityCheckError \? 1 : 2/.test(installCheck))
assertContract('registry and candidate subprocesses have explicit timeouts', /REGISTRY_TIMEOUT_MS\s*=\s*60 \* 1000[\s\S]*?CANDIDATE_CHECK_TIMEOUT_MS\s*=\s*25 \* 60 \* 1000/.test(nextCheck) && /timeoutMs:\s*COMMAND_TIMEOUT_MS/.test(installCheck))
assertContract('candidate subprocesses receive a scrubbed environment', /scrubCanaryEnvironment\(process\.env\)/.test(nextCheck) && /allowUndeclaredCanaryVersion[\s\S]*?scrubCanaryEnvironment\(process\.env\)/.test(installCheck))
assertContract('credential-bearing environment names are filtered', /AUTH\|BEARER\|COOKIE\|CREDENTIAL\|JWT\|KEY\|PASS\|SECRET\|SESSION\|TOKEN/.test(canaryEnvironment))
assertContract('undeclared candidates install the packed artifact', /allowUndeclaredCanaryVersion[\s\S]*?npm[\s\S]*?'pack'[\s\S]*?pluginSpec = `file:/.test(installCheck))
assertContract(
  'candidate checks boot the installed model runtime',
  /check-installed-runtime/.test(installCheck) && /installed runtime contract/.test(installCheck),
)
assertContract('publishing and deployment commands are absent', !/npm publish|gh release create|\bdeploy\b|3080|3081/iu.test(workflow))
assertContract(
  'credential-bearing secrets are not requested',
  !/\$\{\{\s*secrets\.|DEEPSEEK_API_KEY|OPENAI_API_KEY|NPM_TOKEN|NODE_AUTH_TOKEN/iu.test(workflow),
)
assertContract('package exposes the workflow contract check', packageJson.scripts?.['check:canary-workflow'] === 'node scripts/check-canary-workflow.mjs && node scripts/check-dsh-next-contract.mjs')
assertContract('full check includes the canary workflow contract', /(?:^|&&)\s*pnpm run check:canary-workflow(?:\s|$)/.test(packageJson.scripts?.check ?? ''))
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
