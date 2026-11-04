/** Parameters supported by the ChatGPT Codex Responses route, not the general OpenAI API. */
import type { Provider, SimpleStreamOptions } from '@earendil-works/pi-ai'

export function codexRequestOptions(provider: string, model: Parameters<Provider['streamSimple']>[0], options?: SimpleStreamOptions): SimpleStreamOptions | undefined {
  if (provider !== 'openai-codex' || model.provider !== 'openai-codex' || model.api !== 'openai-codex-responses') return options
  const previous = options?.onPayload
  return {
    ...options,
    async onPayload(payload, payloadModel) {
      const replacement = await previous?.(payload, payloadModel)
      const body = replacement === undefined ? payload : replacement
      if (body === null || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, 'temperature')) return body
      // Host presets may set temperature (including zero). This endpoint rejects it.
      // Project after the caller hook; preserve every other field and caller-owned object.
      const projected = { ...body } as Record<string, unknown>
      delete projected['temperature']
      return projected
    },
  }
}
