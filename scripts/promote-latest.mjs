import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { runBoundedCommand } from './bounded-command.mjs'
import { isAlphaReleaseVersion } from './release-metadata.mjs'

const repo = 'franksong2702/dsh-codex-connect'
const pkg = 'dsh-codex-connect'
const dsh = '@deepseek-ai/dsh'
const registry = 'https://registry.npmjs.org'
const api = 'https://api.github.com/repos/' + repo
const sha = /^[0-9a-f]{40}$/u
const digest = /^[0-9a-f]{64}$/u
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u
const safeVersion = value => typeof value === 'string' && value.length <= 80 && versionPattern.test(value)

function compareAlpha(a, b) {
  const parts = v => v.replace('-alpha.', '.').split('.').map(BigInt)
  const x = parts(a), y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1
    if (y[i] === undefined) return 1
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  }
  return 0
}

export function selectPromotion(compat, evidence, host, packument) {
  assert.equal(compat?.schemaVersion, 1, 'Unsupported compatibility schema')
  assert.ok(Array.isArray(compat.pluginVersions) && compat.pluginVersions.length <= 256, 'Invalid compatibility catalog')
  assert.equal(evidence?.schemaVersion, 1, 'Unsupported release evidence schema')
  assert.ok(Array.isArray(evidence.releases) && evidence.releases.length <= 256, 'Invalid release evidence')
  const versions = packument?.versions
  const { latest, alpha } = packument?.['dist-tags'] ?? {}
  assert.ok(safeVersion(host) && isAlphaReleaseVersion(latest) && isAlphaReleaseVersion(alpha)
    && versions && typeof versions === 'object' && Object.hasOwn(versions, latest)
    && Object.hasOwn(versions, alpha), 'Registry snapshot is incomplete or not in the supported Alpha channel')
  const seen = new Set()
  const eligible = compat.pluginVersions.filter(row => {
    assert.ok(isAlphaReleaseVersion(row?.version) && !seen.has(row.version)
      && Array.isArray(row.verifiedDshVersions) && row.verifiedDshVersions.every(safeVersion), 'Invalid or duplicate compatibility entry')
    seen.add(row.version)
    return row.verifiedDshVersions.includes(host) && Object.hasOwn(versions, row.version)
      && !versions[row.version]?.deprecated
  }).map(row => row.version).sort(compareAlpha)
  const target = eligible.at(-1)
  if (!target) throw new Error('No published compatibility pair for current DSH latest')
  if (compareAlpha(target, latest) < 0) throw new Error('Refusing automatic downgrade of latest')
  if (target === latest) return { host, latest, alpha, target, noop: true }
  const matches = evidence.releases.filter(row => row.version === target)
  assert.ok(matches.length === 1 && sha.test(matches[0].commit) && digest.test(matches[0].sha256),
    'Highest eligible version lacks unambiguous exact release evidence')
  return { host, latest, alpha, target, commit: matches[0].commit, sha256: matches[0].sha256, noop: false }
}

export function assertSamePlan(verified, current) {
  for (const field of ['host', 'latest', 'alpha', 'target', 'commit', 'sha256', 'noop']) {
    assert.equal(current[field], verified[field], 'Promotion inputs moved: ' + field)
  }
}

async function http(url, limit, headers = {}) {
  const response = await fetch(url, { headers: { 'cache-control': 'no-cache', ...headers },
    redirect: 'error', signal: AbortSignal.timeout(20_000) })
  if (!response.ok || !response.body) throw new Error('Read-only registry/GitHub lookup failed with HTTP ' + response.status)
  const parts = []
  let size = 0
  for await (const part of response.body) {
    size += part.length
    if (size > limit) throw new Error('Release lookup exceeded the size bound')
    parts.push(part)
  }
  return Buffer.concat(parts)
}
const json = async (url, headers) => JSON.parse((await http(url, 12 * 1024 * 1024, headers)).toString())
const gh = path => json(api + '/' + path, { 'user-agent': 'codex-connect-latest-gate',
  accept: 'application/vnd.github+json', ...(process.env.GH_TOKEN ? { authorization: 'Bearer ' + process.env.GH_TOKEN } : {}) })
const readLocal = filename => readFile(new URL('../' + filename, import.meta.url), 'utf8').then(JSON.parse)
const hostLatest = () => json(registry + '/' + encodeURIComponent(dsh) + '/latest')
const pluginPackument = () => json(registry + '/' + pkg, { accept: 'application/vnd.npm.install-v1+json' })

async function snapshot() {
  const [compat, evidence, host, pkgInfo, branch] = await Promise.all([
    readLocal('verified-compatibility.json'), readLocal('latest-release-evidence.json'),
    hostLatest(), pluginPackument(), gh('branches/main'),
  ])
  assert.ok(process.env.GITHUB_REPOSITORY === repo && process.env.GITHUB_REF === 'refs/heads/main'
    && sha.test(process.env.GITHUB_SHA ?? '') && branch.protected === true && branch.commit?.sha === process.env.GITHUB_SHA,
  'Run is not on the current canonical main head')
  assert.equal(host.name, dsh, 'DSH registry identity mismatch')
  const plan = selectPromotion(compat, evidence, host.version, pkgInfo)
  if (plan.noop) return plan
  const tag = 'v' + plan.target
  const [release, gitTag, comparison] = await Promise.all([
    gh('releases/tags/' + tag), gh('git/ref/tags/' + tag),
    gh('compare/' + plan.commit + '...' + process.env.GITHUB_SHA),
  ])
  assert.ok(release.tag_name === tag && release.draft === false && release.prerelease === true
    && comparison.merge_base_commit?.sha === plan.commit, 'Candidate release is not a completed canonical prerelease')
  let tagObject = gitTag.object
  if (tagObject?.type === 'tag' && sha.test(tagObject.sha ?? '')) tagObject = (await gh('git/tags/' + tagObject.sha)).object
  assert.ok(tagObject?.type === 'commit' && tagObject.sha === plan.commit, 'Release tag does not match committed evidence')
  return plan
}

async function packageBytes(plan) {
  const manifest = await json(registry + '/' + pkg + '/' + plan.target)
  const expectedTarball = registry + '/' + pkg + '/-/' + pkg + '-' + plan.target + '.tgz'
  assert.ok(manifest.name === pkg && manifest.version === plan.target && manifest.dist?.tarball === expectedTarball
    && /^sha512-[A-Za-z0-9+/]{86}==$/u.test(manifest.dist.integrity ?? ''), 'Registry archive identity is invalid')
  const bytes = await http(expectedTarball, 8 * 1024 * 1024)
  assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), manifest.dist.integrity, 'Registry integrity mismatch')
  assert.equal(createHash('sha256').update(bytes).digest('hex'), plan.sha256, 'Published archive differs from release evidence')
  return bytes
}

async function prepare() {
  const plan = await snapshot()
  if (plan.noop) {
    console.log('No promotion necessary: ' + plan.target + ' already matches DSH ' + plan.host)
    return
  }
  const archive = process.env.RUNNER_TEMP + '/latest-candidate.tgz'
  await writeFile(archive, await packageBytes(plan), { flag: 'wx', mode: 0o600 })
  const result = await runBoundedCommand(process.execPath, ['scripts/check-dsh-install.mjs'], {
    timeoutMs: 20 * 60_000, maxBuffer: 256 * 1024,
    env: { ...process.env, GH_TOKEN: '', DSH_VERSION: plan.host, DSH_PROMOTION_ARTIFACT: archive,
      DSH_PROMOTION_VERSION: plan.target },
  })
  if (result.status !== 0 || result.error || result.cleanupError) throw new Error('Exact stock DSH isolated install/runtime check failed; latest was not changed')
  const report = JSON.parse(result.stdout.trim())
  assert.ok(report.dshVersion === plan.host && report.pluginVersion === plan.target
    && report.pluginArtifactSha256 === plan.sha256 && report.defaultsUnchanged === true
    && report.runtime?.nativeCompactionLifecycle?.syntheticOnly === true, 'Unexpected isolated validation identity')
  await appendFile(process.env.GITHUB_OUTPUT, 'plan=' + JSON.stringify(plan) + '\n')
  console.log('Verified exact public package and stock DSH without credentials: ' + JSON.stringify(plan))
}

async function apply() {
  assert.equal(process.env.LATEST_PROMOTION_ENABLED, 'true', 'Promotion is not enabled')
  const plan = JSON.parse(process.env.VERIFIED_PLAN ?? 'null')
  assert.ok(plan && plan.noop === false, 'No verified promotion plan')
  const result = await applyVerifiedPromotion(plan, {
    readPlan: snapshot, write: writeLatest, read: async () => {
      const [host, packument] = await Promise.all([hostLatest(), pluginPackument()])
      assert.equal(host.name, dsh, 'DSH registry identity mismatch')
      return { host: host.version, ...packument['dist-tags'] }
    },
    sleep: () => delay(10_000),
  })
  console.log('Readback confirmed latest=' + result.target + '; previous latest=' + plan.latest + '; alpha unchanged=' + plan.alpha)
}

async function writeLatest(plan) {
  return runBoundedCommand('npm', ['dist-tag', 'add', pkg + '@' + plan.target, 'latest',
    '--registry=' + registry, '--fetch-retries=0', '--fetch-timeout=12000'], {
    timeoutMs: 20_000, maxBuffer: 64 * 1024,
  })
}

export async function applyVerifiedPromotion(plan, { readPlan, write, read, sleep, attempts = 12 }) {
  assert.ok(plan && plan.noop === false, 'No verified promotion plan')
  assertSamePlan(plan, await readPlan())
  // Even an ambiguous timeout may have committed. Do not repeat the write or roll back on stale information.
  const result = await Promise.resolve().then(() => write(plan)).catch(() => ({ status: null }))
  for (let attempt = 0; attempt < attempts; attempt++) {
    let tags
    try { tags = await read() } catch {}
    if (tags) {
      if (tags.host !== plan.host || tags.alpha !== plan.alpha) {
        throw new Error('An external DSH latest or plugin alpha change raced promotion; inspect current tags before any recovery')
      }
      if (tags.latest === plan.target) return plan
      if (tags.latest !== plan.latest) throw new Error('Another publisher changed latest; do not overwrite it')
    }
    if (attempt < attempts - 1) await sleep()
  }
  throw new Error('Could not confirm promotion readback (npm exit ' + (result.status ?? 'unknown') + '); inspect registry before any retry or rollback')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2]
  assert.ok(mode === 'prepare' || mode === 'apply', 'Expected prepare or apply')
  await (mode === 'prepare' ? prepare() : apply())
}
