#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const workflowPath = fileURLToPath(new URL('../.github/workflows/upstream-dsh-canary.yml', import.meta.url))
const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const installCheckPath = fileURLToPath(new URL('./check-dsh-install.mjs', import.meta.url))
const nextCheckPath = fileURLToPath(new URL('./check-dsh-next.mjs', import.meta.url))
const workflow = readFileSync(workflowPath, 'utf8')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
const installCheck = readFileSync(installCheckPath, 'utf8')
const nextCheck = readFileSync(nextCheckPath, 'utf8')

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
  'permissions are limited to contents read and issues write',
  permissionNames.length === 2
    && permissionNames.includes('contents')
    && permissionNames.includes('issues')
    && /\bcontents:\s*read\b/.test(permissionBlock)
    && /\bissues:\s*write\b/.test(permissionBlock),
)
assertContract('all actions are pinned to full commit SHAs', (() => {
  const uses = [...workflow.matchAll(/^\s+uses:\s+([^\s#]+)/gm)].map(match => match[1])
  return uses.length > 0 && uses.every(ref => /@[0-9a-f]{40}$/.test(ref))
})())
assertContract('Node version is pinned', /node-version:\s*24\.15\.0/.test(workflow))
assertContract('pnpm version is pinned', /pnpm\/action-setup@[0-9a-f]{40}[\s\S]*?version:\s*10\.30\.3/.test(workflow))
assertContract('dependency installation is frozen', /pnpm\s+--config\.minimum-release-age=0\s+install\s+--frozen-lockfile/.test(workflow))
assertContract('daily workflow leaves the declared baseline to its existing gate', !/check:dsh-install/.test(workflow))
assertContract('candidate check writes a first report', /check:dsh-next -- --report \.canary\/first\.json/.test(workflow))
assertContract('candidate failure is retried once', /steps\.first-canary\.outcome == 'failure'[\s\S]*?check:dsh-next -- --report \.canary\/second\.json/.test(workflow))
assertContract('issue recording requires two failed attempts', /Record a confirmed compatibility alert[\s\S]*?if: steps\.first-canary\.outcome == 'failure' && steps\.second-canary\.outcome == 'failure'/.test(workflow))
assertContract('issue recording requires matching compatibility classifications', /first\.classification === 'compatibility'[\s\S]*?second\.classification === 'compatibility'[\s\S]*?first\.candidateVersion === second\.candidateVersion/.test(workflow))
assertContract('issues are deduplicated by candidate version', /dsh-next-canary:\$\{version\}[\s\S]*?listForRepo[\s\S]*?issue\.body\?\.includes\(marker\)/.test(workflow))
assertContract('closed alerts are reopened instead of duplicated', /existing\.state === 'closed'[\s\S]*?state: 'open'/.test(workflow))
assertContract('open alerts receive the latest bounded report', /Updated compatibility issue[\s\S]*?existing\.html_url/.test(workflow))
assertContract('confirmed failure leaves the workflow failed', /Fail after two unsuccessful checks[\s\S]*?run: exit 1/.test(workflow))
assertContract('candidate checker opts into the undeclared-version mode', /DSH_UNDECLARED_CANARY_VERSION:\s*'1'/.test(nextCheck))
assertContract('undeclared candidates install the packed artifact', /allowUndeclaredCanaryVersion[\s\S]*?npm[\s\S]*?'pack'[\s\S]*?pluginSpec = `file:/.test(installCheck))
assertContract('publishing and deployment commands are absent', !/npm publish|gh release create|\bdeploy\b|3080|3081/iu.test(workflow))
assertContract(
  'credential-bearing secrets are not requested',
  !/\$\{\{\s*secrets\.|DEEPSEEK_API_KEY|OPENAI_API_KEY|NPM_TOKEN|NODE_AUTH_TOKEN/iu.test(workflow),
)
assertContract('package exposes the workflow contract check', packageJson.scripts?.['check:canary-workflow'] === 'node scripts/check-canary-workflow.mjs && node scripts/check-dsh-next-contract.mjs')
assertContract('full check includes the canary workflow contract', /(?:^|&&)\s*pnpm run check:canary-workflow(?:\s|$)/.test(packageJson.scripts?.check ?? ''))

if (failures.length > 0) {
  console.error(`canary workflow contract failed (${failures.length}/${assertionCount}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`canary workflow contract: ${assertionCount}/${assertionCount} assertions passed`)
