export const IMAGES_SETTINGS_NAMESPACE = 'llm-openai-codex-images'

export interface ImagesSettingsConfig {
  enabled: boolean
}

export function decodeImagesSettings(value: unknown): ImagesSettingsConfig | undefined {
  if (typeof value !== 'object' || value === null || typeof (value as { enabled?: unknown }).enabled !== 'boolean') return undefined
  return { enabled: (value as { enabled: boolean }).enabled }
}
