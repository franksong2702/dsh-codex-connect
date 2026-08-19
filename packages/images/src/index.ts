/**
 * Optional Codex image generation for DeepSeek Harness.
 * PR-1 exposes configuration only: no tools, transport, or network calls.
 * @module dsh-codex-connect-images
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { OpenAICodexTransportV1 } from 'dsh-codex-connect'

/** Stable Host plugin id. */
export const name = 'llm-openai-codex-images'

/** Tool name reserved for the later Host and browser contributions. */
export const IMAGE_GENERATE_TOOL_NAME = 'codex_connect_image_generate'

const TRANSPORT_SERVICE = 'openaiCodexTransport'
const SUPPORTED_TRANSPORT_API_VERSION = 1

/** Optional image capability configuration. */
export interface Config {
  /** Register the image generation tool for new calls once the capability ships. */
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
})

/** Wait for the core Transport without registering the PR-3 image tool. */
export function apply(ctx: Context, _config: Config): void {
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
    // PR-3 registers codex_connect_image_generate inside this lifecycle callback.
  })
}
