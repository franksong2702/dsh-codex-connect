/** Synthetic bearer fixture only; never a usable account credential. */
export function codexTestToken(account = 'fixture-account', user = 'fixture-user', extra: Record<string, unknown> = {}): string {
  const claims = { chatgpt_account_id: account, chatgpt_user_id: user, ...extra }
  return `e30.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': claims })).toString('base64url')}.fixture`
}

