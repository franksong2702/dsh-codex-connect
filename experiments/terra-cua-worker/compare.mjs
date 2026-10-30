/** Paired local trial reporting. Operator labels are not evidence attestation. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const discussionThresholds = Object.freeze({ approved: false, successLoss: 0.05,
  elapsedRatio: 1.2, p95ElapsedRatio: 1.2, elapsedPerSuccessRatio: 1.2, visibleCostRatio: 1.2, costPerSuccessRatio: 1.2 });
const percentile = (values, q) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
const sum = values => values.reduce((total, value) => total + value, 0);
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const text = value => typeof value === 'string' && value.length > 0;
const ratio = (numerator, denominator) => denominator > 0 && Number.isFinite(numerator / denominator) ? numerator / denominator : null;
const environmentStrings = ['hardware', 'os', 'applicationVersion', 'toolRuntimeVersion', 'model', 'effort', 'serviceTier',
  'requestedModel', 'requestedEffort', 'requestedServiceTier', 'toolRoute', 'measurementStratum', 'promptHash', 'fixtureHash', 'initialStateHash'];
const scales = ['width', 'height', 'dpr', 'zoom'];
const sameEnvironment = ['hardware', 'os', 'model', 'effort', 'serviceTier', 'requestedModel', 'requestedEffort',
  'requestedServiceTier', 'measurementStratum', 'promptHash', 'fixtureHash', 'initialStateHash'];

export function validateRecord(record) {
  if (record.schemaVersion !== 1 || !['synthetic', 'live'].includes(record.evidence)
    || !['mock', 'native_desktop', 'customized_live', 'api_demo'].includes(record.arm)
    || !text(record.taskId) || !text(record.pairId) || !Number.isInteger(record.repeat) || record.repeat < 1
    || !['completed', 'blocked', 'cancelled', 'timed_out', 'failed', 'uncertain'].includes(record.status)
    || typeof record.success !== 'boolean' || (record.success && record.status !== 'completed')
    || !numeric(record.elapsedMs) || !Number.isInteger(record.timeoutMs) || record.timeoutMs < 1
    || !Number.isInteger(record.wrongActions) || record.wrongActions < 0
    || !Number.isInteger(record.humanInterventions) || record.humanInterventions < 0) throw new Error('INVALID_TRIAL');
  const usage = record.usage;
  if (!usage || ['modelCalls', 'inputTokens', 'outputTokens'].some(key => usage[key] !== null
    && (!Number.isInteger(usage[key]) || usage[key] < 0))) throw new Error('INVALID_USAGE');
  if (usage.visibleCost !== null && (!numeric(usage.visibleCost?.amount)
    || !['currency', 'scope', 'source'].every(key => text(usage.visibleCost[key])))) throw new Error('INVALID_COST');
  const env = record.environment;
  if (!env || !env.screen || !environmentStrings.every(key => env[key] === null || text(env[key]))
    || !scales.every(key => env.screen[key] === null || (numeric(env.screen[key]) && env.screen[key] > 0))) throw new Error('INVALID_ENVIRONMENT');
  return record;
}

/** Every attempt contributes; failures consume at least the pre-registered time budget. */
function metrics(records, includeCost) {
  return Object.fromEntries(['native_desktop', 'customized_live'].map(arm => {
    const rows = records.filter(row => row.arm === arm), elapsed = rows.map(row => row.elapsedMs);
    const successes = rows.filter(row => row.success).length;
    const penalized = rows.map(row => row.success ? row.elapsedMs : Math.max(row.elapsedMs, row.timeoutMs));
    const totalVisibleCost = includeCost ? sum(rows.map(row => row.usage.visibleCost.amount)) : null;
    const penalizedElapsedMs = sum(penalized);
    return [arm, { trials: rows.length, successes, failures: rows.length - successes,
      timeouts: rows.filter(row => row.status === 'timed_out').length,
      wrongActions: sum(rows.map(row => row.wrongActions)), humanInterventions: sum(rows.map(row => row.humanInterventions)),
      totalElapsedMs: sum(elapsed), penalizedElapsedMs, medianElapsedMs: percentile(elapsed, 0.5),
      p95ElapsedMs: percentile(elapsed, 0.95), p95PenalizedElapsedMs: percentile(penalized, 0.95),
      elapsedPerSuccessMs: ratio(penalizedElapsedMs, successes), totalVisibleCost,
      costPerSuccess: totalVisibleCost === null ? null : ratio(totalVisibleCost, successes),
      modelCalls: rows.some(row => row.usage.modelCalls === null) ? null : sum(rows.map(row => row.usage.modelCalls)) }];
  }));
}
function estimatesFrom(values) {
  const native = values.native_desktop, custom = values.customized_live;
  return { successLoss: native.successes / native.trials - custom.successes / custom.trials,
    elapsedRatio: ratio(custom.penalizedElapsedMs, native.penalizedElapsedMs),
    p95ElapsedRatio: ratio(custom.p95PenalizedElapsedMs, native.p95PenalizedElapsedMs),
    elapsedPerSuccessRatio: custom.elapsedPerSuccessMs === null ? null : ratio(custom.elapsedPerSuccessMs, native.elapsedPerSuccessMs),
    visibleCostRatio: custom.totalVisibleCost === null ? null : ratio(custom.totalVisibleCost, native.totalVisibleCost),
    costPerSuccessRatio: custom.costPerSuccess === null ? null : ratio(custom.costPerSuccess, native.costPerSuccess) };
}

/** Resample whole task clusters, retaining every repetition and its slow/expensive tail. */
function uncertainty(clusters, includeCost) {
  let seed = 7319;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  const samples = Array.from({ length: 2000 }, () => estimatesFrom(metrics(
    clusters.flatMap(() => clusters[Math.floor(random() * clusters.length)]), includeCost)));
  return Object.fromEntries(Object.keys(samples[0]).map(key => {
    const values = samples.map(row => row[key]);
    return [key, values.some(value => value === null) ? [null, null] : [percentile(values, 0.025), percentile(values, 0.975)]];
  }));
}

export function compare(records, protocol = null) {
  const stop = reason => ({ decision: 'not_comparable', reason, thresholds: discussionThresholds });
  if (!Array.isArray(records) || records.length === 0) return stop('NO_TRIALS');
  records.forEach(validateRecord);
  if (records.some(row => row.evidence !== 'live' || !['native_desktop', 'customized_live'].includes(row.arm))) return stop('NATIVE_LIVE_BASELINE_REQUIRED');
  if (!text(protocol?.id) || !protocol?.routes) return stop('MEASUREMENT_PROTOCOL_REQUIRED');
  const pairs = new Map(), stable = new Map(), groups = new Map();
  let baselineSignature, costSignature, costStatus = 'comparable';
  for (const row of records) {
    const pair = pairs.get(row.pairId) ?? {};
    if (pair[row.arm]) return stop('DUPLICATE_ARM');
    pair[row.arm] = row; pairs.set(row.pairId, pair);
  }
  for (const pair of pairs.values()) {
    const native = pair.native_desktop, custom = pair.customized_live;
    if (!native || !custom || native.taskId !== custom.taskId || native.repeat !== custom.repeat) return stop('UNPAIRED_TRIAL');
    if (groups.get(native.taskId)?.some(row => row.arm === 'native_desktop' && row.repeat === native.repeat)) return stop('DUPLICATE_TASK_REPEAT');
    const previousTask = groups.get(native.taskId)?.[0];
    if (previousTask && ['promptHash', 'initialStateHash'].some(key => previousTask.environment[key] !== native.environment[key])) return stop('TASK_INPUT_CHANGED');
    for (const row of [native, custom]) {
      if (environmentStrings.some(key => row.environment[key] === null) || scales.some(key => row.environment.screen[key] === null)) return stop('UNKNOWN_BASELINE_METADATA');
      const declaredRoute = protocol.routes[row.environment.measurementStratum]?.[row.arm];
      if (!text(declaredRoute) || declaredRoute !== row.environment.toolRoute) return stop('UNDECLARED_TOOL_ROUTE');
      const version = JSON.stringify(['applicationVersion', 'toolRuntimeVersion', 'toolRoute'].map(key => row.environment[key]));
      if (stable.has(row.arm) && stable.get(row.arm) !== version) return stop('VERSION_OR_ROUTE_CHANGED');
      stable.set(row.arm, version);
      if (row.usage.visibleCost === null) costStatus = 'unknown';
      else {
        const signature = JSON.stringify(['currency', 'scope', 'source'].map(key => row.usage.visibleCost[key]));
        if (costSignature !== undefined && signature !== costSignature) costStatus = 'incommensurate';
        costSignature = signature;
      }
    }
    for (const key of sameEnvironment) if (native.environment[key] !== custom.environment[key]) return stop(`MISMATCH_${key}`);
    if (scales.some(key => native.environment.screen[key] !== custom.environment.screen[key])) return stop('MISMATCH_screen');
    if (native.timeoutMs !== custom.timeoutMs) return stop('MISMATCH_timeoutMs');
    if (native.environment.model !== 'gpt-6.1-terra' || native.environment.requestedModel !== 'gpt-6.1-terra') return stop('TERRA_BASELINE_REQUIRED');
    const signature = JSON.stringify([...sameEnvironment.filter(key => !['initialStateHash', 'promptHash'].includes(key)).map(key => native.environment[key]),
      ...scales.map(key => native.environment.screen[key]), native.timeoutMs]);
    if (baselineSignature !== undefined && baselineSignature !== signature) return stop('BASELINE_CHANGED');
    baselineSignature = signature;
    groups.set(native.taskId, [...groups.get(native.taskId) ?? [], native, custom]);
  }
  let values = metrics(records, costStatus === 'comparable');
  if (costStatus === 'comparable' && values.native_desktop.totalVisibleCost === 0) { costStatus = 'zero_baseline'; values = metrics(records, false); }
  const estimates = estimatesFrom(values), intervals95 = uncertainty([...groups.values()], costStatus === 'comparable');
  const unsafe = records.some(row => row.wrongActions > 0 || row.humanInterventions > 0 || ['uncertain', 'blocked'].includes(row.status));
  const breached = Object.entries(estimates).some(([key, value]) => value !== null && value > discussionThresholds[key]);
  const enough = groups.size >= 30 && [...groups.values()].every(rows => rows.length >= 6);
  const pilotClean = groups.size >= 5 && records.every(row => row.success);
  const unknownTime = ['elapsedRatio', 'p95ElapsedRatio', 'elapsedPerSuccessRatio'].some(key => estimates[key] === null);
  const inconclusive = Object.entries(intervals95).some(([key, bounds]) => bounds[1] === null || bounds[1] > discussionThresholds[key]);
  const decision = unsafe || breached || values.customized_live.successes === 0 ? 'pause_productization'
    : values.native_desktop.successes === 0 || unknownTime ? 'not_comparable'
      : costStatus !== 'comparable' ? 'incomplete_cost'
        : !enough ? (pilotClean ? 'pilot_only' : 'insufficient_evidence')
          : inconclusive ? 'inconclusive' : 'discussion_gate_met_requires_review';
  return { decision, protocolId: protocol.id, costStatus, distinctTasks: groups.size, pairs: pairs.size,
    metrics: values, estimates, intervals95, thresholds: discussionThresholds,
    limitation: 'Operator-supplied labels are not attested. All repetitions retained; task-cluster percentile bootstrap. Coverage and threshold approval require review. Never declares equivalence.' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node compare.mjs trials.jsonl [protocol.json]');
  const records = (await readFile(process.argv[2], 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const protocol = process.argv[3] ? JSON.parse(await readFile(process.argv[3], 'utf8')) : null;
  console.log(JSON.stringify(compare(records, protocol), null, 2));
}
