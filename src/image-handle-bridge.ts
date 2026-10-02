/**
 * Persist Codex Connect image selection handles onto tool results for
 * non-Codex routes. The request-time projection in `adapter.ts` only runs on
 * the `openai-codex` route, so on other routes the model cannot see the
 * `attachmentId` needed to build a legal edit target even though image blocks
 * from tools such as `view_image` are already in the session log.
 *
 * This bridge appends the same handle lines on the `tools/post-execute`
 * waterfall. Unlike the adapter's request-time projection, the lines are
 * intentionally durable: replayed or forked sessions still contain what the
 * model saw when the result was produced.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { decodeImageInputAttachment, imageSelectionHandleText } from './image-input-contract.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'

/** Prefix shared with the adapter projection for idempotency checks. */
export const IMAGE_HANDLE_LINE_PREFIX = '[Codex Connect image '

/** Runtime gates read per event so volatile config changes apply immediately. */
export interface ImageHandleBridgeOptions {
  /** Master switch; the bridge stays dormant while false. */
  enabled: () => boolean
  /** Restrict injection to these tool names; undefined processes every tool. */
  tools?: () => readonly string[] | undefined
}

/** Structural view of the route fields the bridge reads; any mismatch is inert. */
interface RouteScopedExecution {
  readonly name: string
  readonly agent?: {
    session?: { requestHeader?: () => { config?: { provider?: string } } | undefined }
    options?: { provider?: string }
  }
}

function routeProvider(exec: RouteScopedExecution): string | undefined {
  try {
    return exec.agent?.session?.requestHeader?.()?.config?.provider ?? exec.agent?.options?.provider
  } catch {
    return undefined
  }
}

/**
 * Insert one handle line after each image block. Returns undefined when
 * nothing changed so callers keep the original decision by identity.
 */
export function appendImageSelectionHandles(content: readonly ContentBlock[]): ContentBlock[] | undefined {
  let imageIndex = 0
  let changed = false
  const replaced: ContentBlock[] = []
  for (const [index, block] of content.entries()) {
    replaced.push(block)
    if (block?.type !== 'image') continue
    imageIndex += 1
    // Only project attachments that decode to a complete canonical reference;
    // a bare unaddressable id would not help the model build an edit target.
    if (decodeImageInputAttachment(block.attachment) === undefined) continue
    // Idempotent: a handle line directly after the image means one is already there.
    const handle = imageSelectionHandleText(imageIndex, block.attachment)
    const following = content[index + 1]
    if (following?.type === 'text' && following.text === handle) continue
    replaced.push({ type: 'text', text: handle })
    changed = true
  }
  return changed ? replaced : undefined
}

/**
 * Register the persistent handle bridge. The `openai-codex` route is always
 * skipped because its adapter already injects the same lines per request;
 * injecting there would duplicate them in the durable log.
 */
export function registerImageHandleBridge(ctx: Context, options: ImageHandleBridgeOptions): void {
  ctx.on('tools/post-execute', async (exec, result, next) => {
    // Let downstream listeners settle first, then append above their decision.
    const decision = await next()
    try {
      if (!options.enabled()) return decision
      if (decision.kind !== 'accept' || Object.hasOwn(decision, 'value')) return decision
      if (result.isError) return decision
      const provider = routeProvider(exec)
      if (typeof provider !== 'string' || provider.trim() === '' || provider === OPENAI_CODEX_PROVIDER) return decision
      const toolNames = options.tools?.()
      if (toolNames !== undefined && toolNames.length > 0 && !toolNames.includes(exec.name)) return decision
      const content = decision.content ?? result.content
      const replaced = appendImageSelectionHandles(content)
      if (replaced === undefined) return decision
      return {
        kind: 'accept',
        content: replaced,
        ...decision.additionalContexts === undefined ? {} : { additionalContexts: decision.additionalContexts },
      }
    } catch (error) {
      ctx.logger.warn('dsh-codex-connect: could not append image selection handles; keeping the original result')
      ctx.logger.warn(error)
      return decision
    }
  })
}
