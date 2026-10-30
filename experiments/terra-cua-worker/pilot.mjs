/** Run scripted fixture actions only. Timings are mock timings, never performance acceptance. */
import { tasks } from './fixture-state.mjs';
import { MockHost, MockLease, runMockTask, pilotPlan } from './worker.mjs';
import { validateRecord } from './compare.mjs';
const lease = new MockLease();
const parent = Object.freeze({ id: 'synthetic-parent', route: Object.freeze({ provider: 'synthetic-deepseek', model: 'flash' }) });
for (const task of tasks) {
  const result = await runMockTask({ parent, taskId: task.id, host: new MockHost(task.id, { authorized: true }), lease, plan: pilotPlan(task.id) });
  console.log(JSON.stringify(validateRecord({ ...result, pairId: `mock-${task.id}`, repeat: 1,
    environment: { hardware: null, os: null, applicationVersion: null, toolRuntimeVersion: null,
      model: null, effort: null, serviceTier: null, requestedModel: null, requestedEffort: null, requestedServiceTier: null,
      toolRoute: null, measurementStratum: null, promptHash: null, fixtureHash: null, initialStateHash: null,
      screen: { width: null, height: null, dpr: null, zoom: null } } })));
  if (!result.success) process.exitCode = 1;
}
