/** Node-free route constants shared by the Host and browser plugin halves. */

/** Plugin-owned status endpoint consumed by its browser half. */
export const OPENAI_CODEX_AUTH_STATUS_PATH = '/plugins/dsh-openai-codex/auth/status'
/** Plugin-owned browser-login endpoint consumed by its browser half. */
export const OPENAI_CODEX_AUTH_LOGIN_PATH = '/plugins/dsh-openai-codex/auth/login'
/** Plugin-owned logout endpoint consumed by its browser half. */
export const OPENAI_CODEX_AUTH_LOGOUT_PATH = '/plugins/dsh-openai-codex/auth/logout'
/** Cancel only the pending authorization; never delete a stored credential. */
export const OPENAI_CODEX_AUTH_CANCEL_PATH = '/plugins/dsh-openai-codex/auth/cancel'
/** List, activate, and remove stored OpenAI Codex accounts. */
export const OPENAI_CODEX_AUTH_ACCOUNTS_PATH = '/plugins/dsh-openai-codex/auth/accounts'
