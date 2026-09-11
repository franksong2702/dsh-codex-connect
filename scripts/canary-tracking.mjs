const TRACKABLE_CLASSIFICATIONS = new Set(['candidate-compatible', 'compatibility', 'infrastructure'])

function reportIdentifiesCandidate(report) {
  return report !== undefined
    && report !== null
    && typeof report === 'object'
    && typeof report.channel === 'string'
    && typeof report.candidateVersion === 'string'
    && typeof report.supportedVersion === 'string'
}

function boundedSummary(report) {
  return String(report.summary ?? 'No bounded summary was available.')
    .replaceAll('```', '---')
    .slice(0, 1600)
}

function trackingState(first, second) {
  const final = second ?? first
  if (final.status === 'pass' && final.classification === 'candidate-compatible') {
    return 'passed-needs-full-validation'
  }
  const confirmedCompatibilityFailure = second !== undefined
    && first.status === 'fail'
    && second.status === 'fail'
    && first.classification === 'compatibility'
    && second.classification === 'compatibility'
  return confirmedCompatibilityFailure
    ? (final.declaredSupport === true ? 'declared-regression' : 'compatibility-failed')
    : 'infrastructure-blocked'
}

function stateExplanation(state, channel, version) {
  if (state === 'declared-regression') {
    return `The bounded regression failed twice for already-declared DSH ${version} on ${channel}. Investigate the regression without treating this host as a new support request. Full user acceptance remains a separate record.`
  }
  if (state === 'passed-needs-full-validation') {
    return `The bounded Codex Connect check passed against \`@deepseek-ai/dsh@${channel}\` version \`${version}\`. Full Web, OAuth, model, tool, image, network, quota, settings, and session validation is still required before compatibility can be declared.`
  }
  if (state === 'compatibility-failed') {
    return `The bounded Codex Connect check failed twice with a compatibility classification against \`@deepseek-ai/dsh@${channel}\` version \`${version}\`. A focused adaptation or compatibility investigation is required.`
  }
  return `The bounded Codex Connect check could not establish compatibility with \`@deepseek-ai/dsh@${channel}\` version \`${version}\` because the final attempt was classified as infrastructure failure.`
}

/** Build the canonical public tracking issue for one newer DSH candidate. */
export function buildCanaryTrackingIssue(first, second, metadata) {
  if (!reportIdentifiesCandidate(first) || !TRACKABLE_CLASSIFICATIONS.has(first.classification)) return undefined
  if (second !== undefined) {
    if (!reportIdentifiesCandidate(second)
      || first.channel !== second.channel
      || first.candidateVersion !== second.candidateVersion) {
      throw new Error('canary retry reports do not identify the same DSH candidate')
    }
  }
  const final = second ?? first
  // A successful declared regression, including a recovered retry, must not
  // reopen a candidate/full-acceptance issue or falsely certify acceptance.
  if (final.status === 'pass' && final.classification === 'declared-compatible') return undefined
  const state = trackingState(first, second)
  const version = first.candidateVersion
  const channel = first.channel
  const marker = final.declaredSupport === true
    ? `<!-- dsh-canary-regression:${version} -->`
    : `<!-- dsh-canary:${version} -->`
  const stateMarker = `<!-- dsh-canary-state:${state}:${channel} -->`
  const label = ['compatibility-failed', 'declared-regression'].includes(state) ? 'bug' : 'enhancement'
  const pluginCommit = final.pluginCommit ?? metadata.pluginCommit
  const body = [
    marker,
    stateMarker,
    '## Upstream DSH compatibility tracker',
    '',
    `**State:** \`${state}\``,
    '',
    stateExplanation(state, channel, version),
    '',
    `- Candidate DSH version: \`${version}\``,
    `- Current owning channel: \`${channel}\``,
    `- Declared DSH baseline: \`${final.supportedVersion}\``,
    `- Declared supported DSH versions: ${(final.supportedVersions ?? [final.supportedVersion]).map(value => `\`${value}\``).join(', ')}`,
    `- Candidate declared support: ${final.declaredSupport === true ? 'yes' : 'not declared'}`,
    '- Full user acceptance: not assessed by this automated check',
    `- Candidate stage: \`${final.stage ?? 'unknown'}\``,
    `- Plugin commit: \`${pluginCommit}\``,
    `- Node.js: \`${final.nodeVersion ?? 'unknown'}\``,
    `- Workflow run: ${metadata.runUrl}`,
    '',
    'Bounded, path-redacted summary from the final attempt:',
    '',
    '```text',
    boundedSummary(final),
    '```',
    '',
    'This tracker is preliminary evidence only. It does not widen the supported version range, edit `verified-compatibility.json`, deploy a profile, merge code, publish a release, or replace the separate full user-acceptance record.',
    '',
    'Umbrella: #108',
    '',
  ].join('\n')
  return {
    version,
    state,
    marker,
    stateMarker,
    title: final.declaredSupport === true ? `compatibility: regression on declared DSH ${version}` : `compatibility: track DSH ${version}`,
    body,
    label,
  }
}
