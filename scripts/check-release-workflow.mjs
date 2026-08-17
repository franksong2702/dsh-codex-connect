import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const workflowPath = fileURLToPath(new URL('../.github/workflows/release.yml', import.meta.url))
const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const workflow = readFileSync(workflowPath, 'utf8')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))

const failures = []
let assertionCount = 0

function assertContract(name, condition) {
  assertionCount += 1
  if (!condition) failures.push(name)
}

assertContract('workflow is manually triggered', /^on:\s*\n\s+workflow_dispatch:/m.test(workflow))
assertContract('version input is required', /workflow_dispatch:[\s\S]*?inputs:[\s\S]*?^\s+version:\s*\n[\s\S]*?required:\s*true/m.test(workflow))
assertContract('explicit publish confirmation input is required', /workflow_dispatch:[\s\S]*?inputs:[\s\S]*?^\s+confirm:\s*\n[\s\S]*?required:\s*true/m.test(workflow))
assertContract('confirmation is checked for exact PUBLISH', /if\s+\[\[\s*"\$CONFIRM"\s*!=\s*['"]PUBLISH['"]\s*\]\]/.test(workflow))
assertContract('automatic triggers are absent', !/^\s+(?:push|pull_request|schedule):/m.test(workflow))
assertContract('release is gated to main', /if:\s*github\.ref\s*==\s*['"]refs\/heads\/main['"]/.test(workflow))
assertContract('npm-release environment is required', /^\s+environment:\s*npm-release\s*$/m.test(workflow))
assertContract('release concurrency is configured', /^concurrency:\s*\n/m.test(workflow))

const permissionBlock = workflow.match(/^permissions:\s*\n((?:^[ \t]+[^\n]*\n?)+)/m)?.[1] ?? ''
const permissionNames = [...permissionBlock.matchAll(/^\s+([a-z-]+):/gm)].map((match) => match[1])
assertContract(
  'permissions are limited to contents write and id-token write',
  permissionNames.length === 2 &&
    permissionNames.includes('contents') &&
    permissionNames.includes('id-token') &&
    /\bcontents:\s*write\b/.test(permissionBlock) &&
    /\bid-token:\s*write\b/.test(permissionBlock),
)
assertContract('long-lived npm token names are absent', !/\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)\b/i.test(workflow))
assertContract('all actions are pinned to full commit SHAs', (() => {
  const uses = [...workflow.matchAll(/^\s+uses:\s+([^\s#]+)/gm)].map((match) => match[1])
  return uses.length > 0 && uses.every((ref) => /@[0-9a-f]{40}$/.test(ref))
})())
assertContract('pnpm version is pinned', /pnpm\/action-setup@[0-9a-f]{40}[\s\S]*?version:\s*10\.30\.3/.test(workflow))
assertContract('Node version is pinned', /node-version:\s*24\.15\.0/.test(workflow))
assertContract('npm version is pinned', /npm\s+install\s+--global\s+npm@11\.6\.4/.test(workflow))
assertContract('dependency installation is frozen', /pnpm(?:\s+--config\.minimum-release-age=0)?\s+install\s+--frozen-lockfile/.test(workflow))
assertContract('workflow inputs are passed through environment variables',
  /VERSION:\s*\$\{\{\s*inputs\.version\s*\}\}/.test(workflow) &&
  /CONFIRM:\s*\$\{\{\s*inputs\.confirm\s*\}\}/.test(workflow))
assertContract('strict alpha semver validation is present', /VERSION"\s*=~\s*\^\(0\|[\s\S]*-alpha\\\./.test(workflow))
assertContract('input version is compared with package.json', /package_version[\s\S]*?VERSION/.test(workflow))
assertContract('npm target existence is checked before publishing', /npm view "\$PACKAGE\@\$VERSION" version/.test(workflow))
assertContract('git tag target existence is checked before publishing', /git ls-remote --exit-code --refs origin "refs\/tags\/v\$\{VERSION\}"/.test(workflow))
assertContract('GitHub release target existence is checked before publishing', /gh release view "v\$\{VERSION\}"/.test(workflow))

const publishIndex = workflow.indexOf('npm publish --tag alpha --provenance')
const checkIndex = workflow.indexOf('pnpm run check')
assertContract('complete check precedes npm publish', checkIndex >= 0 && publishIndex > checkIndex)
assertContract('publish uses npm OIDC provenance and alpha tag', publishIndex >= 0)
assertContract('post-publish version and alpha tag verification is retried',
  /for attempt in 1 2 3 4 5 6/.test(workflow) &&
  /npm view "\$PACKAGE\@\$VERSION" version/.test(workflow) &&
  /npm view "\$PACKAGE" dist-tags\.alpha/.test(workflow))
assertContract('GitHub prerelease is created from the workflow SHA',
  /gh release create[\s\S]*?--prerelease[\s\S]*?--target "\$GITHUB_SHA"[\s\S]*?--generate-notes/.test(workflow))
assertContract('workflow never promotes the latest dist-tag', !/npm dist-tag add/.test(workflow))
assertContract('package check invokes this contract', packageJson.scripts?.['check:release-workflow'] === 'node scripts/check-release-workflow.mjs')
assertContract('full check includes the release contract', /(?:^|&&)\s*pnpm run check:release-workflow(?:\s|$)/.test(packageJson.scripts?.check ?? ''))

if (failures.length > 0) {
  console.error(`release workflow contract failed (${failures.length}/${assertionCount}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`release workflow contract: ${assertionCount}/${assertionCount} assertions passed`)
