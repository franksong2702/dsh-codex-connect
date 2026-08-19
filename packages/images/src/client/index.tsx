/** Browser entrypoint; the tool phase deliberately registers no UI contribution. */

/** Stable browser-plugin name. */
export const name = 'dsh-codex-connect-images-client'

/** Client service dependencies arrive with the actual tool view. */
export const inject: string[] = []

/** Gallery and lightbox registration arrive in their separately reviewed phase. */
export function apply(): void {}
