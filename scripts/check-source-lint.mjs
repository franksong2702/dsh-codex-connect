import assert from 'node:assert/strict'
import { ESLint } from 'eslint'

// Use existing host and browser file identities so the same typed configuration is exercised.
// lintText replaces file contents repeatedly; CI's immutable-program optimization reads disk instead.
const eslint = new ESLint({
  overrideConfig: {
    languageOptions: { parserOptions: { disallowAutomaticSingleRunInference: true } },
  },
})
for (const filePath of ['src/version.ts', 'src/client/account-store.ts']) {
  for (const [code, rule] of [
    ['export function broken(): void { Promise.resolve(1) }', '@typescript-eslint/no-floating-promises'],
    ['export function broken(): void { if (Promise.resolve(true)) { console.log(1) } }', '@typescript-eslint/no-misused-promises'],
    ['export async function broken(): Promise<void> { await 1 }', '@typescript-eslint/await-thenable'],
  ]) {
    const [result] = await eslint.lintText(code, { filePath })
    assert.ok(result.messages.some(message => message.ruleId === rule), `${filePath} must reject ${rule}`)
  }
  const [valid] = await eslint.lintText('export async function handled(): Promise<void> { await Promise.resolve(1) }', { filePath })
  assert.equal(valid.errorCount, 0, `${filePath} must accept handled promises`)
}
console.log('Source lint gate: 6 invalid cases rejected; 2 valid cases accepted')
