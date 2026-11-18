/** Only authenticated safety exits remain in the published Task controls. */
import type { AdaptiveTaskState } from './adaptive-task-contract.ts'

export const ADAPTIVE_TASK_RELEASE_PAUSED = 'TASK_PUBLIC_RELEASE_PAUSED'

export function publicTaskCommandAllowed(action: string): boolean {
  switch (action) {
    case 'manual':
    case 'stop':
    case 'delegate-disable':
    case 'downgrade':
      return true
    default:
      return false
  }
}

/** Preserve historical grants, accounting and truthful lifecycle state during the pause. */
export function publicTaskState(state: AdaptiveTaskState): AdaptiveTaskState {
  return {
    ...state,
    canStart: false,
    unavailable: state.unavailable ?? ADAPTIVE_TASK_RELEASE_PAUSED,
  }
}
