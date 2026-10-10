import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const packageVersion = (JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }).version

export default defineConfig({
  define: {
    __CODEX_CONNECT_VERSION__: JSON.stringify(packageVersion),
  },
  test: {
    setupFiles: ['tests/support/keyring-mock.ts'],
    include: ['tests/**/*.spec.{ts,tsx}'],
    exclude: ['tests/browser/**'],
    testTimeout: 30_000,
  },
})
