/** Mock-only ownership and lifecycle experiment. No DSH, model, CUA or network imports. */
import { performance } from 'node:perf_hooks';
import { initialState, observation, transition, verify } from './fixture-state.mjs';

export const workerRoute = Object.freeze({ provider: 'openai-codex', model: 'gpt-6.1-terra', effort: 'medium' });
const shapes = new Map([
  ['getState', []], ['click', ['target']], ['setValue', ['target', 'value']], ['scroll', ['target', 'direction']],
]);
const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

async function abortable(promise, signal) {
  let abort;
  const stopped = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try { return await Promise.race([promise, stopped]); }
  finally { signal.removeEventListener('abort', abort); }
}

/** Fixture projection, deliberately NOT the native CUA wire protocol. */
export function validateOperation(operation) {
  if (!exact(operation, ['method', 'params']) || !shapes.has(operation.method)) throw new Error('OPERATION_DENIED');
  const keys = shapes.get(operation.method);
  if (!exact(operation.params, keys) || keys.some(key => typeof operation.params[key] !== 'string')) throw new Error('ARGUMENT_DENIED');
  if (Object.values(operation.params).some(value => value.length === 0 || value.length > 200)) throw new Error('ARGUMENT_DENIED');
  if (operation.method === 'scroll' && (operation.params.target !== 'list' || operation.params.direction !== 'down')) throw new Error('ARGUMENT_DENIED');
}

/** Single-process mock lease. A production adapter requires cross-process fencing. */
export class MockLease {
  #owner;
  acquire(owner) {
    if (this.#owner !== undefined) throw new Error('DESKTOP_BUSY');
    const token = Symbol(owner); this.#owner = token;
    return { check: () => { if (this.#owner !== token) throw new Error('LEASE_LOST'); },
      release: () => { if (this.#owner === token) this.#owner = undefined; } };
  }
  get busy() { return this.#owner !== undefined; }
  invalidate() { this.#owner = undefined; }
}

export class MockHost {
  kind = 'mock-only';
  #state;
  #grant;
  #created = false;
  #calls = new Set();
  #disposed = false;
  events = [];
  constructor(taskId, { authorized = false, delayMs = 0 } = {}) {
    this.#state = initialState(taskId); this.#grant = authorized; this.delayMs = delayMs;
  }
  authorized() { return this.#grant; }
  get taskId() { return this.#state.taskId; }
  revoke() { this.#grant = false; }
  createChild({ parentId, route }) {
    if (this.#created || this.#disposed || !parentId || JSON.stringify(route) !== JSON.stringify(workerRoute)) throw new Error('HOST_CONTRACT');
    this.#created = true;
    this.events.push('child-created');
    return Object.freeze({ id: 'synthetic-worker', parentId, route: { ...route } });
  }
  async execute(operation, signal, guard) {
    validateOperation(operation); guard();
    if (!this.#created || this.#disposed) throw new Error('CHILD_NOT_LIVE');
    const pending = (async () => {
      // Simulates a dispatched operation; cancellation still joins this work.
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
      signal.throwIfAborted(); guard();
      this.#state = transition(this.#state, operation); this.events.push(operation.method);
      return observation(this.#state);
    })();
    this.#calls.add(pending);
    try { return await pending; } finally { this.#calls.delete(pending); }
  }
  cancel() { this.events.push('cancel'); }
  async dispose() {
    await Promise.allSettled([...this.#calls]); this.#disposed = true; this.events.push('disposed');
  }
  result() { return { success: verify(this.#state), wrongActions: this.#state.wrongActions }; }
}

/** There is intentionally no live adapter, feature switch, credential resolver or driver loader. */
export function createLiveHost() { throw new Error('LIVE_DRIVER_NOT_IMPLEMENTED'); }

/** Host protocol sketch: create owned child; dispatch guarded CUA; cancel; join; dispose. */
export async function runMockTask({ parent, taskId, host, lease, plan, signal, timeoutMs = 1000 }) {
  if (!(host instanceof MockHost) || !(lease instanceof MockLease)) throw new Error('MOCK_ADAPTER_REQUIRED');
  if (typeof parent?.id !== 'string' || !parent.id || taskId !== host.taskId || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error('INVALID_REQUEST');
  const parentRoute = JSON.stringify(parent.route);
  const started = performance.now();
  const lifetime = new AbortController();
  let timedOut = false, acquired, child, violation, code = null, status = 'failed', accepting = true;
  const cancel = () => lifetime.abort(signal?.reason ?? new Error('CANCELLED'));
  const timer = setTimeout(() => { timedOut = true; lifetime.abort(new Error('TIMEOUT')); }, timeoutMs);
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const guard = () => {
    lifetime.signal.throwIfAborted();
    if (!accepting) throw new Error('TASK_CLOSED');
    acquired?.check();
    if (!host.authorized()) throw new Error('AUTHORIZATION_MISSING');
  };
  try {
    guard(); acquired = lease.acquire(parent.id); guard();
    child = host.createChild({ parentId: parent.id, route: workerRoute });
    // The callback represents a synthetic planner only, not a model sandbox.
    await abortable(Promise.resolve().then(() => plan({ child, signal: lifetime.signal,
      call: async operation => {
        if (violation) throw violation;
        try { return await host.execute(operation, lifetime.signal, guard); }
        catch (error) { violation = error; throw error; }
      } })), lifetime.signal);
    if (violation) throw violation;
    guard(); status = host.result().success ? 'completed' : 'failed';
    if (status === 'failed') code = 'OBJECTIVE_NOT_MET';
  } catch (error) {
    code = error.message;
    status = timedOut ? 'timed_out' : lifetime.signal.aborted ? 'cancelled'
      : ['AUTHORIZATION_MISSING', 'DESKTOP_BUSY'].includes(code) ? 'blocked' : 'failed';
  } finally {
    accepting = false; lifetime.abort(); host.cancel();
    clearTimeout(timer); signal?.removeEventListener('abort', cancel);
    try { await host.dispose(); acquired?.release(); }
    catch { status = 'uncertain'; code = 'CLEANUP_UNCONFIRMED'; }
  }
  if (JSON.stringify(parent.route) !== parentRoute) throw new Error('PARENT_ROUTE_MUTATED');
  return { schemaVersion: 1, evidence: 'synthetic', arm: 'mock', taskId, status, code, timeoutMs,
    parentRoute: JSON.parse(parentRoute), workerRoute: child?.route ?? null,
    elapsedMs: performance.now() - started, ...host.result(), success: status === 'completed' && host.result().success,
    usage: { modelCalls: 0, inputTokens: null, outputTokens: null, visibleCost: null }, humanInterventions: 0 };
}

export function pilotPlan(taskId) {
  const click = target => ({ method: 'click', params: { target } });
  const operations = {
    locate: [click('Cobalt')],
    form: [{ method: 'setValue', params: { target: 'Name', value: 'Ada Test' } },
      { method: 'setValue', params: { target: 'Code', value: 'LAB-204' } }, click('Submit')],
    scroll: [...Array.from({ length: 3 }, () => ({ method: 'scroll', params: { target: 'list', direction: 'down' } })), click('Item 24')],
    steps: [click('Start review'), click('Confirm review')], recover: [click('Retry'), click('Confirm recovery')],
  }[taskId];
  if (!operations) throw new Error('UNKNOWN_TASK');
  return async ({ call }) => {
    await call({ method: 'getState', params: {} });
    for (const operation of operations) { await call(operation); await call({ method: 'getState', params: {} }); }
  };
}
