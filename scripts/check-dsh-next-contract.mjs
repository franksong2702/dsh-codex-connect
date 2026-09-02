#!/usr/bin/env node

import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { resolveCommandInvocation, runBoundedCommand } from './bounded-command.mjs'

import {
  classifyCandidateVersion,
  classifyCandidateCheckStatus,
  confirmedCompatibilityFailure,
  duplicateCandidateOwner,
  parseCanaryArgs,
  parseRegistryDistTags,
  parseRegistryVersion,
  runCanary,
  sanitizeSummary,
} from './check-dsh-next.mjs'
import { scrubCanaryEnvironment } from './canary-environment.mjs'
import {
  CompatibilityCheckError,
  InfrastructureCheckError,
  commandFailureClassification,
  installCheckExitCode,
} from './check-dsh-install.mjs'
import { validateRuntimeProjection } from './check-installed-runtime.mjs'

const failures = []
let assertionCount = 0

function assertContract(name, condition) {
  assertionCount += 1
  if (!condition) failures.push(name)
}

assertContract('JSON registry versions are accepted', parseRegistryVersion('"0.1.2-rc.1"\n') === '0.1.2-rc.1')
assertContract('plain registry versions are accepted', parseRegistryVersion('0.1.2') === '0.1.2')
assertContract('invalid numeric prerelease identifiers are rejected', (() => {
  try {
    parseRegistryVersion('0.1.2-alpha.01')
    return false
  } catch {
    return true
  }
})())
assertContract('latest, next, and alpha registry tags are accepted', (() => {
  const tags = parseRegistryDistTags('{"latest":"0.1.2","next":"0.1.3-rc.1","alpha":"0.1.4-alpha.1"}')
  return tags.latest === '0.1.2' && tags.next === '0.1.3-rc.1' && tags.alpha === '0.1.4-alpha.1'
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
    '--channel', 'alpha',
    '--dedupe-against', 'latest',
    '--dedupe-against', 'next',
    '--resolved-latest', '0.1.2',
    '--resolved-next', '0.1.3-rc.1',
    '--resolved-alpha', '0.1.4-alpha.1',
    '--report', '.canary/report.json',
  ])
  return args.channel === 'alpha'
    && JSON.stringify(args.dedupeAgainst) === JSON.stringify(['latest', 'next'])
    && args.resolvedDistTags.latest === '0.1.2'
    && args.resolvedDistTags.next === '0.1.3-rc.1'
    && args.resolvedDistTags.alpha === '0.1.4-alpha.1'
    && args.outputPath === resolve('.canary/report.json')
})())
assertContract('dist-tag output mode is parsed separately', (() => {
  const args = parseCanaryArgs(['--dist-tags-output', '.canary/github-output'])
  return args.distTagsOutputPath === resolve('.canary/github-output')
})())
assertContract('partial resolved snapshots are rejected', (() => {
  try {
    parseCanaryArgs(['--resolved-latest', '0.1.2', '--resolved-next', '0.1.3-rc.1'])
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
assertContract('a deduplication owner cannot be repeated', (() => {
  try {
    parseCanaryArgs(['--channel', 'alpha', '--dedupe-against', 'latest', '--dedupe-against', 'latest'])
    return false
  } catch {
    return true
  }
})())
assertContract(
  'alpha deduplicates against the first identical prior candidate',
  duplicateCandidateOwner('alpha', ['latest', 'next'], {
    latest: '0.1.2',
    next: '0.1.3-rc.1',
    alpha: '0.1.3-rc.1',
  }) === 'next',
)
assertContract(
  'different channel versions remain independent candidates',
  duplicateCandidateOwner('alpha', ['latest', 'next'], {
    latest: '0.1.2',
    next: '0.1.3-rc.1',
    alpha: '0.1.4-alpha.1',
  }) === undefined,
)
assertContract('an exact declared version is unchanged', classifyCandidateVersion('0.1.2-alpha.5', '0.1.2-alpha.5') === 'unchanged')
assertContract('an older stable candidate is not newer than a declared alpha', classifyCandidateVersion('0.1.1-rc.2', '0.1.2-alpha.5') === 'not-newer')
assertContract(
  'later prereleases and stable releases supersede a declared alpha',
  classifyCandidateVersion('0.1.2-alpha.6', '0.1.2-alpha.5') === 'newer'
    && classifyCandidateVersion('0.1.2', '0.1.2-alpha.5') === 'newer',
)
assertContract(
  'numeric prerelease identifiers and build metadata follow semantic-version precedence',
  classifyCandidateVersion('0.1.2-alpha.10', '0.1.2-alpha.5') === 'newer'
    && classifyCandidateVersion('0.1.2-alpha.5+candidate', '0.1.2-alpha.5+declared') === 'not-newer',
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
assertContract(
  'network failures are recognized across stderr and stdout',
  commandFailureClassification({
    stderr: 'npm printed a warning',
    stdout: 'fetch failed: ECONNRESET',
  }, 'compatibility') === 'infrastructure',
)

const runtimeProjection = validateRuntimeProjection(
  [{ id: 'openai-codex', name: 'OpenAI Codex' }],
  [{
    provider: 'openai-codex',
    id: 'gpt-contract-fixture',
    name: 'GPT contract fixture',
    reasoning: { efforts: [{ id: 'medium', name: 'Medium' }] },
  }],
)
assertContract(
  'installed runtime projection accepts a model with reasoning metadata',
  runtimeProjection.modelCount === 1 && runtimeProjection.reasoningModelCount === 1,
)
assertContract('installed runtime projection rejects missing reasoning metadata', (() => {
  try {
    validateRuntimeProjection(
      [{ id: 'openai-codex', name: 'OpenAI Codex' }],
      [{ provider: 'openai-codex', id: 'gpt-contract-fixture', name: 'GPT contract fixture' }],
    )
    return false
  } catch {
    return true
  }
})())

async function runCandidateFixture(exitCode) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-next-contract-'))
  try {
    const candidateCheck = join(root, 'candidate-check.mjs')
    const reportPath = join(root, 'report.json')
    await writeFile(
      candidateCheck,
      `process.stderr.write('candidate fixture exit ${String(exitCode)}\\n')\nprocess.exitCode = ${String(exitCode)}\n`,
      'utf8',
    )
    const compatibility = JSON.parse(await readFile(resolve('compatibility.json'), 'utf8'))
    const supportedVersion = compatibility.dshPluginApi.version
    const status = await runCanary(parseCanaryArgs([
      '--channel', 'next',
      '--resolved-latest', supportedVersion,
      '--resolved-next', '9.9.9-next.1',
      '--resolved-alpha', supportedVersion,
      '--report', reportPath,
    ]), { candidateCheckPath: candidateCheck })
    return {
      status,
      report: JSON.parse(await readFile(reportPath, 'utf8')),
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function runSupersededCandidateFixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-superseded-contract-'))
  try {
    const reportPath = join(root, 'report.json')
    const status = await runCanary(parseCanaryArgs([
      '--channel', 'latest',
      '--resolved-latest', '0.1.1-rc.2',
      '--resolved-next', '0.1.1-rc.2',
      '--resolved-alpha', '0.1.2-alpha.5',
      '--report', reportPath,
    ]), { candidateCheckPath: join(root, 'must-not-run.mjs') })
    return {
      status,
      report: JSON.parse(await readFile(reportPath, 'utf8')),
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const supersededFixture = await runSupersededCandidateFixture()
assertContract(
  'issue 86 regression: an older channel is skipped before the isolated checker runs',
  supersededFixture.status === 0
    && supersededFixture.report.status === 'pass'
    && supersededFixture.report.classification === 'not-newer'
    && supersededFixture.report.stage === 'compare-candidate',
)

const compatibilityFixture = await runCandidateFixture(1)
assertContract(
  'a real candidate child exit one produces a compatibility report',
  compatibilityFixture.status === 1
    && compatibilityFixture.report.status === 'fail'
    && compatibilityFixture.report.classification === 'compatibility',
)
const infrastructureFixture = await runCandidateFixture(2)
assertContract(
  'a real candidate child exit two produces an infrastructure report',
  infrastructureFixture.status === 2
    && infrastructureFixture.report.status === 'fail'
    && infrastructureFixture.report.classification === 'infrastructure',
)

const windowsInvocation = resolveCommandInvocation('C:\\tools\\check.cmd', ['argument with spaces'], 'win32')
assertContract(
  'Windows command scripts are invoked through cmd.exe with an escaped command line',
  /cmd\.exe$/iu.test(windowsInvocation.command)
    && windowsInvocation.args.slice(0, 3).join('\0') === ['/d', '/s', '/c'].join('\0')
    && windowsInvocation.args[3].includes('C:\\tools\\check.cmd')
    && windowsInvocation.args[3].includes('argument^ with^ spaces')
    && windowsInvocation.windowsVerbatimArguments,
)

if (process.platform === 'win32') {
  const commandRoot = await mkdtemp(join(tmpdir(), 'dsh-command-contract-'))
  try {
    const commandDirectory = join(commandRoot, 'command & space', 'node_modules', '.bin')
    const commandScript = join(commandDirectory, 'fixture.cmd')
    const receiverScript = join(commandRoot, 'receive-arguments.mjs')
    const expectedArguments = [
      'plugin',
      '--profile',
      'web',
      'add',
      'file:C:\\plugin path & space\\plugin.tgz',
      '"(foo|bar>baz|foz)"',
    ]
    await mkdir(commandDirectory, { recursive: true })
    await writeFile(
      receiverScript,
      'process.stdout.write(JSON.stringify(process.argv.slice(2)))\n',
      'utf8',
    )
    await writeFile(commandScript, [
      `@IF EXIST "${process.execPath}" (`,
      `  "${process.execPath}" "${receiverScript}" %*`,
      ') ELSE (',
      '  @SETLOCAL',
      '  @SET PATHEXT=%PATHEXT:;.JS;=;%',
      `  node "${receiverScript}" %*`,
      ')',
    ].join('\r\n'), 'utf8')
    const commandResult = await runBoundedCommand(
      commandScript,
      expectedArguments,
      { timeoutMs: 10_000 },
    )
    let receivedArguments
    try {
      receivedArguments = JSON.parse(commandResult.stdout)
    } catch {}
    assertContract(
      'Windows command shims preserve DSH paths and quoted shell metacharacters',
      commandResult.status === 0
        && JSON.stringify(receivedArguments) === JSON.stringify(expectedArguments),
    )
  } finally {
    await rm(commandRoot, { recursive: true, force: true })
  }
}

const processTreeRoot = await mkdtemp(join(tmpdir(), 'dsh-process-tree-contract-'))
try {
  const readyMarker = join(processTreeRoot, 'descendant-ready')
  const marker = join(processTreeRoot, 'descendant-survived')
  const descendant = [
    "import { writeFileSync } from 'node:fs'",
    `writeFileSync(${JSON.stringify(readyMarker)}, 'ready')`,
    `setTimeout(() => writeFileSync(${JSON.stringify(marker)}, 'survived'), 4_500)`,
    'setTimeout(() => {}, 30_000)',
  ].join('\n')
  const parent = [
    "import { spawn } from 'node:child_process'",
    `spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(descendant)}], { stdio: 'ignore' })`,
    'setTimeout(() => {}, 30_000)',
  ].join('\n')
  const timedOut = await runBoundedCommand(
    process.execPath,
    ['--input-type=module', '-e', parent],
    { timeoutMs: 3_000 },
  )
  await new Promise(resolveDelay => setTimeout(resolveDelay, 2_000))
  let descendantReady = false
  try {
    await access(readyMarker)
    descendantReady = true
  } catch {}
  let descendantSurvived = true
  try {
    await access(marker)
  } catch {
    descendantSurvived = false
  }
  assertContract(
    'timeout terminates the descendant process tree before retry',
    timedOut.error?.code === 'ETIMEDOUT'
      && timedOut.cleanupError === undefined
      && descendantReady
      && !descendantSurvived,
  )
} finally {
  await rm(processTreeRoot, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`DSH next checker contract failed (${failures.length}/${assertionCount}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`DSH next checker contract: ${assertionCount}/${assertionCount} assertions passed`)
