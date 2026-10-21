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
    include: ['tests/**/*.spec.{ts,tsx}'],
    exclude: ['tests/browser/**'],
    testTimeout: 30_000,
    // Client specs exercise the host's shared Menu primitive in jsdom; inline
    // the package so its CSS modules load instead of reaching Node's loader.
    server: { deps: { inline: ['@deepseek-ai/dsh-client-ui-primitives'] } },
    css: { include: [/@deepseek-ai[/\\]dsh-client-ui-primitives[/\\].*\.module\.css$/u] },
  },
})
