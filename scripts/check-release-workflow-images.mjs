import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const workflow = readFileSync(fileURLToPath(new URL('../.github/workflows/release-images.yml', import.meta.url)), 'utf8')
const rootPackage = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
const imagesPackage = JSON.parse(readFileSync(fileURLToPath(new URL('../packages/images/package.json', import.meta.url)), 'utf8'))
const failures = []
let assertionCount = 0

function assertContract(name, condition) {
  assertionCount += 1
  if (!condition) failures.push(name)
}

assertContract('workflow is manually triggered', /^on:\s*\n\s+workflow_dispatch:/m.test(workflow))
assertContract('required version input is present', /workflow_dispatch:[\s\S]*?version:[\s\S]*?required:\s*true/m.test(workflow))
assertContract('required confirmation input is present', /workflow_dispatch:[\s\S]*?confirm:[\s\S]*?required:\s*true/m.test(workflow))
assertContract('confirmation is exact PUBLISH', /if\s+\[\[\s*"\$CONFIRM"\s*!=\s*['"]PUBLISH['"]\s*\]\]/.test(workflow))
assertContract('automatic triggers are absent', !/^\s+(?:push|pull_request|schedule):/m.test(workflow))
assertContract('release is gated to main', /if:\s*github\.ref\s*==\s*['"]refs\/heads\/main['"]/.test(workflow))
assertContract('npm release environment is required', /^\s+environment:\s*npm-release\s*$/m.test(workflow))
assertContract('images release has independent concurrency', /^\s+group:\s*npm-release-images\s*$/m.test(workflow) && !/^\s+group:\s*npm-release\s*$/m.test(workflow))

const permissionBlock = workflow.match(/^permissions:\s*\n((?:^[ \t]+[^\n]*\n?)+)/m)?.[1] ?? ''
const permissionNames = [...permissionBlock.matchAll(/^\s+([a-z-]+):/gm)].map(match => match[1])
assertContract('permissions are limited to contents and id-token write', permissionNames.length === 2
  && permissionNames.includes('contents') && permissionNames.includes('id-token')
  && /contents:\s*write/.test(permissionBlock) && /id-token:\s*write/.test(permissionBlock))
assertContract('long-lived npm tokens are absent', !/\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)\b/i.test(workflow))
assertContract('actions are pinned to full SHAs', (() => {
  const uses = [...workflow.matchAll(/^\s+uses:\s+([^\s#]+)/gm)].map(match => match[1])
  return uses.length > 0 && uses.every(ref => /@[0-9a-f]{40}$/.test(ref))
})())
assertContract('pnpm is pinned', /version:\s*10\.30\.3/.test(workflow))
assertContract('Node is pinned', /node-version:\s*24\.15\.0/.test(workflow))
assertContract('npm is pinned', /npm\s+install\s+--global\s+npm@11\.6\.4/.test(workflow))
assertContract('lockfile installation is frozen', /pnpm(?:\s+--config\.minimum-release-age=0)?\s+install\s+--frozen-lockfile/.test(workflow))
assertContract('inputs are passed through environment variables', /VERSION:\s*\$\{\{\s*inputs\.version\s*\}\}/.test(workflow)
  && /CONFIRM:\s*\$\{\{\s*inputs\.confirm\s*\}\}/.test(workflow))
assertContract('strict alpha semver validation is present', /VERSION"\s*=~\s*\^\(0\|[\s\S]*-alpha\\\./.test(workflow))
assertContract('images package and manifest are exact', /readonly PACKAGE='dsh-codex-connect-images'/.test(workflow)
  && /readonly MANIFEST='packages\/images\/package\.json'/.test(workflow))
assertContract('private skeleton fails closed', /package_private[\s\S]*?== 'true'[\s\S]*?cannot be published/.test(workflow))
assertContract('npm target is checked before publishing', /npm view "\$PACKAGE@\$VERSION" version/.test(workflow))
assertContract('images git tag target is checked', /refs\/tags\/images-v\$\{VERSION\}/.test(workflow))
assertContract('images GitHub release target is checked', /gh release view "images-v\$\{VERSION\}"/.test(workflow))
assertContract('core tag namespace is never used', !/refs\/tags\/v\$\{VERSION\}|gh release (?:view|create) "v\$\{VERSION\}"/.test(workflow))

const validationStep = workflow.match(/^      - name: Validate images release input and target availability\n([\s\S]*?)(?=^      - name:|(?![\s\S]))/m)?.[1] ?? ''
const validationEnv = validationStep.match(/^        env:\n((?:^          [^\n]*\n?)+)/m)?.[1] ?? ''
assertContract('GitHub availability check uses workflow token', /gh release view/.test(validationStep)
  && /GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/.test(validationEnv))

const publishIndex = workflow.indexOf('npm publish --tag alpha --provenance')
const checkIndex = workflow.indexOf('pnpm run check:all')
const coreInstallIndex = workflow.indexOf('pnpm --silent run check:dsh-install')
const imagesInstallIndex = workflow.indexOf('pnpm --silent run check:dsh-images-install')
assertContract('check all precedes images publish', checkIndex >= 0 && publishIndex > checkIndex)
assertContract('both isolated install gates precede images publish', coreInstallIndex > checkIndex
  && imagesInstallIndex > coreInstallIndex && publishIndex > imagesInstallIndex)
assertContract('publish uses images workspace and OIDC provenance', /pnpm --filter dsh-codex-connect-images exec npm publish --tag alpha --provenance/.test(workflow))
assertContract('post-publish readback retries npm version and alpha tag', /for attempt in 1 2 3 4 5 6/.test(workflow)
  && /dist-tags\.alpha/.test(workflow))
assertContract('images prerelease targets workflow SHA', /gh release create "images-v\$\{VERSION\}"[\s\S]*?--prerelease[\s\S]*?--target "\$GITHUB_SHA"/.test(workflow))
assertContract('workflow never promotes latest', !/npm dist-tag add/.test(workflow))
assertContract('images package remains alpha-tagged', imagesPackage.publishConfig?.tag === 'alpha')
assertContract('images version is a strict alpha', /^0\.1\.0-alpha\.[1-9]\d*(?:\.\d+)?$/u.test(imagesPackage.version))
assertContract('root package exposes this workflow contract', rootPackage.scripts?.['check:release-workflow-images'] === 'node scripts/check-release-workflow-images.mjs')
assertContract('check all contains images package check', /pnpm --filter dsh-codex-connect-images run check/.test(rootPackage.scripts?.['check:all'] ?? ''))
assertContract('check all contains images release contract', /pnpm run check:release-workflow-images/.test(rootPackage.scripts?.['check:all'] ?? ''))

if (failures.length > 0) {
  console.error(`images release workflow contract failed (${failures.length}/${assertionCount}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`images release workflow contract: ${assertionCount}/${assertionCount} assertions passed`)
