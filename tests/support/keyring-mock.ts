/** Every test uses synthetic memory entries, never the host's native keyring. */
import { vi } from 'vitest'
vi.mock('@napi-rs/keyring', () => {
  const entries = new Map<string, Uint8Array>()
  return {
    AsyncEntry: class {
      private readonly id: string
      constructor(service: string, account: string, options: { linux: { store: string } }) {
        if (options.linux.store !== 'secret-service') throw new Error('Tests require explicit durable Linux storage')
        this.id = `${service}:${account}`
      }
      async getSecret(): Promise<Uint8Array | undefined> { return entries.get(this.id)?.slice() }
      async setSecret(key: Uint8Array): Promise<void> { entries.set(this.id, key.slice()) }
      async deleteCredential(): Promise<boolean> { return entries.delete(this.id) }
    },
  }
})
