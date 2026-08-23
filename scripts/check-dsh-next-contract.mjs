#!/usr/bin/env node

import {
  classifyCandidateCheckFailure,
  confirmedCompatibilityFailure,
  parseRegistryVersion,
  sanitizeSummary,
} from './check-dsh-next.mjs'

const failures = []
let assertionCount = 0

function assertContract(name, condition) {
  assertionCount += 1
  if (!condition) failures.push(name)
}

assertContract('JSON registry versions are accepted', parseRegistryVersion('"0.1.2-rc.1"\n') === '0.1.2-rc.1')
assertContract('plain registry versions are accepted', parseRegistryVersion('0.1.2') === '0.1.2')
assertContract('invalid registry output is rejected', (() => {
  try {
    parseRegistryVersion('["0.1.2"]')
    return false
  } catch {
    return true
  }
})())

const sanitized = sanitizeSummary(`${process.cwd()}/secret\n${process.env.HOME}/private\na.b.c`)
assertContract('repository paths are redacted', !sanitized.includes(process.cwd()) && sanitized.includes('<repository>'))
assertContract('home paths are redacted', process.env.HOME === undefined || !sanitized.includes(process.env.HOME))

const compatibilityFailure = version => ({
  status: 'fail',
  classification: 'compatibility',
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
  'infrastructure failures are not confirmed',
  !confirmedCompatibilityFailure(
    compatibilityFailure('0.1.2-rc.1'),
    { status: 'fail', classification: 'infrastructure', candidateVersion: '0.1.2-rc.1' },
  ),
)
assertContract(
  'DSH installation failures are infrastructure failures',
  classifyCandidateCheckFailure('check-dsh-install: npm install failed with exit 1') === 'infrastructure',
)
assertContract(
  'network failures during plugin installation are infrastructure failures',
  classifyCandidateCheckFailure('check-dsh-install: local plugin install failed: ECONNRESET') === 'infrastructure',
)
assertContract(
  'plugin installation contract failures are compatibility failures',
  classifyCandidateCheckFailure('check-dsh-install: local plugin install failed: unmet peer dependency') === 'compatibility',
)
assertContract(
  'doctor mismatches are compatibility failures',
  classifyCandidateCheckFailure('check-dsh-install: doctor JSON did not report compatible packages') === 'compatibility',
)

if (failures.length > 0) {
  console.error(`DSH next checker contract failed (${failures.length}/${assertionCount}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`DSH next checker contract: ${assertionCount}/${assertionCount} assertions passed`)
