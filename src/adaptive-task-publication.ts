/** Release decision, not a user preference or a substitute for per-task authorization. */
import type { AdaptiveTaskState } from './adaptive-task-contract.ts'

// Reopening requires a reviewed source change and a new build after maintainer acceptance.
// Do not derive this from a browser request, saved grant, environment variable or model output.
export const ADAPTIVE_TASK_PUBLIC_RELEASE: boolean = false
export const ADAPTIVE_TASK_RELEASE_PAUSED = 'TASK_PUBLIC_RELEASE_PAUSED'

/** Keep authenticated safety exits available, but admit no new or resumed automation. */
export function publicTaskCommandAllowed(action: string, released = ADAPTIVE_TASK_PUBLIC_RELEASE): boolean {
  switch (action) {
    case 'manual':
    case 'stop':
    case 'delegate-disable':
    case 'downgrade':
      return true
    case 'start':
    case 'resume':
    case 'upgrade':
    case 'delegate-enable':
      return released === true
    default:
      return false
  }
}

/** Preserve historical grants, accounting and truthful lifecycle state during the pause. */
export function publicTaskState(state: AdaptiveTaskState, released = ADAPTIVE_TASK_PUBLIC_RELEASE): AdaptiveTaskState {
  return released === true ? state : {
    ...state,
    canStart: false,
    unavailable: state.unavailable ?? ADAPTIVE_TASK_RELEASE_PAUSED,
  }
}
