import type { OAuthAuth } from '@earendil-works/pi-ai'
export declare const openaiCodexOAuth: OAuthAuth
/** A structured refresh rejection with no response or credential data. */
export declare class OpenAICodexRefreshRejectedError extends Error {
  constructor()
}
