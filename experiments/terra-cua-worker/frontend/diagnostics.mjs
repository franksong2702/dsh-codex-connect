// In-memory, opt-in test probes. No storage, transport, authority or content collection.
const stages = new Set(['before-questions', 'after-questions', 'fixture-ready', 'ready',
  'receive', 'dispatch', 'listener', 'delivery-abort', 'delivery-drained', 'pending', 'mount', 'visibility'])
export function createFrontendTrace({ limit = 128 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) throw new RangeError('Invalid trace bound')
  const rows = []
  let sequence = 0
  return {
    record(stage, detail = {}) {
      if (!stages.has(stage)) return false
      const row = { sequence: ++sequence, stage }
      if ((stage === 'pending' || stage === 'mount') && Number.isSafeInteger(detail.count) && detail.count >= 0 && detail.count <= 100) row.count = detail.count
      for (const key of ['event', 'generation']) if (Number.isSafeInteger(detail[key]) && detail[key] > 0 && detail[key] <= 10000) row[key] = detail[key]
      if (stage === 'mount' && typeof detail.visible === 'boolean') row.visible = detail.visible
      if (stage === 'mount' && typeof detail.inViewport === 'boolean') row.inViewport = detail.inViewport
      if (stage === 'visibility' && ['hidden', 'visible'].includes(detail.state)) row.state = detail.state
      rows.push(row)
      if (rows.length > limit) rows.shift()
      return true
    },
    snapshot: () => rows.map(row => ({ ...row })),
  }
}
