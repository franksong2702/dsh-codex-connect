/** Exact M3 composition cases required on each declared host; not live model acceptance. */
export const ADAPTIVE_SPLIT_CASES = Object.freeze([
  'allow', 'reject', 'wrong-answer', 'custom-answer', 'missing-questions', 'disabled', 'keep',
  'think-first', 'think-pending', 'reasoning-queued', 'split-pending', 'manual-stale',
  'compaction-stale', 'runtime-dispose', 'revoke-running', 'timeout', 'request-budget',
  'forbidden-tool', 'recursive-tool', 'http-error', 'unread-result', 'altered-reference',
  'single-use', 'immutable-snapshot', 'persistent-refusal', 'native-composition',
  'fallback-composition', 'cleanup-failure', 'wrong-root', 'extra-scope', 'approval-timeout',
])
