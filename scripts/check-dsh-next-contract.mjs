#!/usr/bin/env node

import { resolve } from 'node:path'

import {
  classifyCandidateCheckStatus,
  confirmedCompatibilityFailure,
  duplicateCandidate,
  parseCanaryArgs,
  parseRegistryDistTags,
  parseRegistryVersion,
  sanitizeSummary,
} from './check-dsh-next.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
import {
  CompatibilityCheckError,
  InfrastructureCheckError,
  installCheckExitCode,
} from './check-dsh-install.mjs'

const failures = []
let assertionCount = 0

function assertContract(name, condition) {
  assertionCount += 1
  if (!condition) failures.push(name)
}

assertContract('JSON registry versions are accepted', parseRegistryVersion('"0.1.2-rc.1"\n') === '0.1.2-rc.1')
assertContract('plain registry versions are accepted', parseRegistryVersion('0.1.2') === '0.1.2')
assertContract('latest and next registry tags are accepted', (() => {
  const tags = parseRegistryDistTags('{"latest":"0.1.2","next":"0.1.3-rc.1"}')
  return tags.latest === '0.1.2' && tags.next === '0.1.3-rc.1'
})())
assertContract('incomplete registry tags are rejected', (() => {
  try {
    parseRegistryDistTags('{"latest":"0.1.2"}')
    return false
  } catch {
    return true
  }
})())
assertContract('invalid registry output is rejected', (() => {
  try {
    parseRegistryVersion('["0.1.2"]')
    return false
  } catch {
    return true
  }
})())
assertContract('channel, deduplication, and report arguments are parsed', (() => {
  const args = parseCanaryArgs([
    '--',
    '--channel', 'next',
    '--dedupe-against', 'latest',
    '--resolved-latest', '0.1.2',
    '--resolved-next', '0.1.3-rc.1',
    '--report', '.canary/report.json',
  ])
  return args.channel === 'next'
    && args.dedupeAgainst === 'latest'
    && args.resolvedDistTags.latest === '0.1.2'
    && args.resolvedDistTags.next === '0.1.3-rc.1'
    && args.outputPath === resolve('.canary/report.json')
})())
assertContract('dist-tag output mode is parsed separately', (() => {
  const args = parseCanaryArgs(['--dist-tags-output', '.canary/github-output'])
  return args.distTagsOutputPath === resolve('.canary/github-output')
})())
assertContract('partial resolved snapshots are rejected', (() => {
  try {
    parseCanaryArgs(['--resolved-latest', '0.1.2'])
    return false
  } catch {
    return true
  }
})())
assertContract('a channel cannot deduplicate against itself', (() => {
  try {
    parseCanaryArgs(['--channel', 'latest', '--dedupe-against', 'latest'])
    return false
  } catch {
    return true
  }
})())
assertContract(
  'next deduplicates an identical latest candidate',
  duplicateCandidate('next', 'latest', { latest: '0.1.2', next: '0.1.2' }),
)
assertContract(
  'different channel versions remain independent candidates',
  !duplicateCandidate('next', 'latest', { latest: '0.1.2', next: '0.1.3-rc.1' }),
)

const scrubbedEnvironment = scrubCanaryEnvironment({
  PATH: '/bin',
  HTTPS_PROXY: 'http://proxy.invalid',
  DEEPSEEK_API_KEY: 'secret',
  GITHUB_TOKEN: 'secret',
  CI_JOB_JWT: 'secret',
  SSH_AUTH_SOCK: '/private/socket',
})
assertContract('non-secret execution environment is retained', scrubbedEnvironment.PATH === '/bin' && scrubbedEnvironment.HTTPS_PROXY === 'http://proxy.invalid')
assertContract('credential-bearing environment is removed', scrubbedEnvironment.DEEPSEEK_API_KEY === undefined && scrubbedEnvironment.GITHUB_TOKEN === undefined && scrubbedEnvironment.CI_JOB_JWT === undefined && scrubbedEnvironment.SSH_AUTH_SOCK === undefined)

const sanitized = sanitizeSummary(`${process.cwd()}/secret\n${process.env.HOME}/private\na.b.c`)
assertContract('repository paths are redacted', !sanitized.includes(process.cwd()) && sanitized.includes('<repository>'))
assertContract('home paths are redacted', process.env.HOME === undefined || !sanitized.includes(process.env.HOME))

const compatibilityFailure = version => ({
  status: 'fail',
  classification: 'compatibility',
  channel: 'next',
  candidateVersion: version,
})
assertContract(
  'two matching compatibility failures are confirmed',
  confirmedCompatibilityFailure(compatibilityFailure('0.1.2-rc.1'), compatibilityFailure('0.1.2-rc.1')),
)
assertContract(
  'different candidate versions are not confirmed',
  !confirmedCompatibilityFailure(compatibilityFailure('0.1.2-rc.1'), compatibilityFailure('0.1.2-rc.2')),
)
assertContract(
  'different candidate channels are not confirmed',
  !confirmedCompatibilityFailure(
    compatibilityFailure('0.1.2-rc.1'),
    { ...compatibilityFailure('0.1.2-rc.1'), channel: 'latest' },
  ),
)
assertContract(
  'infrastructure failures are not confirmed',
  !confirmedCompatibilityFailure(
    compatibilityFailure('0.1.2-rc.1'),
    { status: 'fail', classification: 'infrastructure', candidateVersion: '0.1.2-rc.1' },
  ),
)
assertContract(
  'candidate exit one is an explicit compatibility failure',
  classifyCandidateCheckStatus(1) === 'compatibility',
)
assertContract(
  'all other candidate exits fail closed as infrastructure',
  classifyCandidateCheckStatus(2) === 'infrastructure' && classifyCandidateCheckStatus(null) === 'infrastructure',
)
assertContract(
  'only typed compatibility errors use exit one',
  installCheckExitCode(new CompatibilityCheckError('unmet peer dependency')) === 1,
)
assertContract(
  'typed infrastructure errors use exit two',
  installCheckExitCode(new InfrastructureCheckError('ECONNRESET')) === 2,
)
assertContract(
  'unknown checker errors fail closed as infrastructure',
  installCheckExitCode(new SyntaxError('Unexpected end of JSON input')) === 2
    && installCheckExitCode(new Error('npm pack did not report one package filename')) === 2,
)

if (failures.length > 0) {
  console.error(`DSH next checker contract failed (${failures.length}/${assertionCount}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`DSH next checker contract: ${assertionCount}/${assertionCount} assertions passed`)
