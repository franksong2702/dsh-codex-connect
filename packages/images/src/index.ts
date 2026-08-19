/**
 * Optional Codex image generation for DeepSeek Harness.
 * PR-1 exposes configuration only: no tools, transport, or network calls.
 * @module dsh-codex-connect-images
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/** Stable Host plugin id. */
export const name = 'llm-openai-codex-images'

/** Tool name reserved for the later Host and browser contributions. */
export const IMAGE_GENERATE_TOOL_NAME = 'codex_connect_image_generate'

/** Optional image capability configuration. */
export interface Config {
  /** Register the image generation tool for new calls once the capability ships. */
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
})

/** PR-1 deliberately registers no services, tools, routes, or effects. */
export function apply(_ctx: Context, _config: Config): void {}
