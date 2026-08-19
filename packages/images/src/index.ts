/**
 * Optional Codex image generation for DeepSeek Harness.
 * Registers the optional prompt-only image tool through the core transport.
 * @module dsh-codex-connect-images
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { OpenAICodexTransportV1 } from 'dsh-codex-connect'
import { imageGenerateTool, IMAGE_GENERATE_TOOL_NAME } from './tool.ts'

/** Stable Host plugin id. */
export const name = 'llm-openai-codex-images'

export { IMAGE_GENERATE_TOOL_NAME }

const TRANSPORT_SERVICE = 'openaiCodexTransport'
const SUPPORTED_TRANSPORT_API_VERSION = 1

/** Optional image capability configuration. */
export interface Config {
  /** Register the image generation tool for new calls. */
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
})

/** Register the image tool only for one enabled, compatible service lifecycle. */
export function apply(ctx: Context, config: Config): void {
  if (config.enabled !== true) return
  if (ctx.reflect.get(TRANSPORT_SERVICE) === undefined) {
    ctx.logger.warn(
      'dsh-codex-connect-images: waiting for the Codex Connect core transport; install it with '
      + '"dsh plugin --profile web add dsh-codex-connect@alpha"',
    )
  }
  ctx.inject([TRANSPORT_SERVICE], transportCtx => {
    const transport = transportCtx.reflect.get(TRANSPORT_SERVICE) as OpenAICodexTransportV1 | undefined
    if (transport?.apiVersion !== SUPPORTED_TRANSPORT_API_VERSION) {
      transportCtx.logger.error(
        'dsh-codex-connect-images: the installed Codex Connect core exposes an unsupported transport API version; '
        + 'update both packages to matching alpha releases',
      )
      return
    }
    transportCtx.inject(['tools', 'attachments'], toolCtx =>
      toolCtx.tools.register(imageGenerateTool(toolCtx)))
  })
}
