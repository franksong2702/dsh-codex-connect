/** Bounded same-origin JSON reads, including response-body consumption. */

/** Allow the server's 30-second authorization-URL deadline to report first. */
export const BROWSER_REQUEST_TIMEOUT_MS = 45_000

/** A timed-out mutation may already have committed on the server. */
export class BrowserRequestTimeoutError extends Error {
  constructor() { super('Request timed out; server outcome is unconfirmed') }
}

/** Read headers and JSON within one deadline; cancellation also settles uncooperative transports. */
export async function requestJson(path: string, init: RequestInit): Promise<{ response: Response; value: unknown }> {
  const controller = new AbortController()
  const parent = init.signal
  const abort = (): void => { controller.abort(parent?.reason) }
  if (parent?.aborted) abort()
  else parent?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => { controller.abort(new BrowserRequestTimeoutError()) }, BROWSER_REQUEST_TIMEOUT_MS)
  let rejectAbort: (() => void) | undefined
  try {
    if (controller.signal.aborted) throw controller.signal.reason
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => { reject(controller.signal.reason) }
      controller.signal.addEventListener('abort', rejectAbort, { once: true })
    })
    const reading = (async () => {
      const response = await fetch(path, { ...init, signal: controller.signal })
      const value: unknown = await response.json().catch(() => undefined)
      return { response, value }
    })()
    return await Promise.race([reading, cancelled])
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', abort)
    if (rejectAbort !== undefined) controller.signal.removeEventListener('abort', rejectAbort)
  }
}
