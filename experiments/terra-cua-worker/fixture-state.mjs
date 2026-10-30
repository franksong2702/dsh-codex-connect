/** Pure synthetic UI state shared by the offline driver and the generated page. */
export const tasks = Object.freeze([
  { id: 'locate', goal: 'Click Cobalt in the target grid.' },
  { id: 'form', goal: 'Enter Ada Test and LAB-204, then submit the form.' },
  { id: 'scroll', goal: 'Scroll the list and select Item 24.' },
  { id: 'steps', goal: 'Start review, then confirm the review.' },
  { id: 'recover', goal: 'Recover from the displayed error using Retry, then confirm recovery.' },
]);

export function initialState(taskId) {
  if (!tasks.some(task => task.id === taskId)) throw new Error('UNKNOWN_TASK');
  return { taskId, selected: null, name: '', code: '', submitted: false, offset: 0,
    stage: 0, retry: false, recovered: false, wrongActions: 0 };
}

export function observation(state) {
  const targets = {
    locate: ['Amber', 'Birch', 'Cobalt', 'Dune', 'Elm', 'Flint'],
    form: ['Name', 'Code', 'Submit'],
    scroll: Array.from({ length: 6 }, (_, index) => `Item ${state.offset + index + 1}`),
    steps: [state.stage === 0 ? 'Start review' : state.stage === 1 ? 'Confirm review' : 'Review complete'],
    recover: [state.retry ? 'Confirm recovery' : 'Retry'],
  }[state.taskId];
  return { ...state, targets, error: state.taskId === 'recover' && !state.retry ? 'Synthetic validation error' : null };
}

/** Return a new state; invalid UI actions are counted rather than silently accepted. */
export function transition(state, operation) {
  const next = { ...state };
  const { method, params } = operation;
  let accepted = false;
  if (method === 'getState') return next;
  if (method === 'click') {
    const target = params.target;
    if (state.taskId === 'locate' && observation(state).targets.includes(target)) {
      next.selected = target; accepted = target === 'Cobalt';
    }
    if (state.taskId === 'form' && target === 'Submit') {
      accepted = state.name === 'Ada Test' && state.code === 'LAB-204'; next.submitted = accepted;
    }
    if (state.taskId === 'scroll' && observation(state).targets.includes(target)) {
      next.selected = target; accepted = target === 'Item 24';
    }
    if (state.taskId === 'steps' && ((state.stage === 0 && target === 'Start review')
      || (state.stage === 1 && target === 'Confirm review'))) { next.stage++; accepted = true; }
    if (state.taskId === 'recover' && target === 'Retry' && !state.retry) { next.retry = true; accepted = true; }
    if (state.taskId === 'recover' && target === 'Confirm recovery' && state.retry) { next.recovered = true; accepted = true; }
  }
  if (method === 'setValue' && state.taskId === 'form' && ['Name', 'Code'].includes(params.target)) {
    next[params.target.toLowerCase()] = params.value; next.submitted = false; accepted = true;
  }
  if (method === 'scroll' && state.taskId === 'scroll' && params.target === 'list' && params.direction === 'down') {
    next.offset = Math.min(18, state.offset + 6); accepted = true;
  }
  if (!accepted) next.wrongActions++;
  return next;
}

export function verify(state) {
  return state.wrongActions === 0 && ({ locate: state.selected === 'Cobalt', form: state.submitted && state.name === 'Ada Test' && state.code === 'LAB-204',
    scroll: state.selected === 'Item 24', steps: state.stage === 2, recover: state.recovered })[state.taskId];
}
