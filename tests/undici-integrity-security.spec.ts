import { createHash } from 'node:crypto'
import { MockAgent } from 'undici'
import { expect, it } from 'vitest'
import { fetch } from '../src/undici-runtime.ts'

// Exercise npm Undici used by the provider path, not Node's separate bundled fetch.
// Synthetic dispatcher only: no credentials, sockets, or real provider requests.
it.each(['\t', '\n', '\r', '\f'])('checks SRI rather than ignoring ASCII whitespace %j', async whitespace => {
  const dispatcher = new MockAgent()
  dispatcher.disableNetConnect()
  const origin = 'https://integrity-fixture.invalid'
  const body = 'synthetic integrity fixture'
  const digest = (value: string) => 'sha256-' + createHash('sha256').update(value).digest('base64')
  dispatcher.get(origin).intercept({ path: '/valid' }).reply(200, body)
  dispatcher.get(origin).intercept({ path: '/invalid' }).reply(200, body)
  try {
    const response = await fetch(origin + '/valid', { dispatcher, integrity: whitespace + digest(body) + whitespace })
    expect(await response.text()).toBe(body)
    await expect(fetch(origin + '/invalid', {
      dispatcher, integrity: whitespace + digest('different content') + whitespace,
    })).rejects.toThrow()
    dispatcher.assertNoPendingInterceptors()
  } finally {
    await dispatcher.close()
  }
})
