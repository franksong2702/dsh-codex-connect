import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const packageVersion = (JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }).version

// These source integration fixtures use the pinned compilation SDK.
const developmentSdkFixtures = [
  'tests/adaptive-task-consent.spec.ts',
  'tests/adaptive-task-delegation-host.spec.ts',
  'tests/adaptive-task-delegation.spec.ts',
  'tests/adaptive-task-host.spec.ts',
  'tests/adaptive-task-http.spec.ts',
  'tests/adaptive-task-recovery-runtime.spec.ts',
  'tests/image-edit-session.spec.ts',
  'tests/native-compaction-automatic.spec.ts',
  'tests/native-compaction-lifecycle.spec.ts',
  'tests/native-context-settings.spec.ts',
  'tests/speed-defaults-wire.spec.ts',
]

export default defineConfig({
  define: {
    __CODEX_CONNECT_VERSION__: JSON.stringify(packageVersion),
  },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/**/*.spec.{ts,tsx}'], exclude: ['tests/browser/**', ...developmentSdkFixtures] } },
      { extends: true, test: { name: 'source-fixtures', include: developmentSdkFixtures, setupFiles: ['tests/adaptive-task-dev-sdk.setup.ts'] } },
    ],
    testTimeout: 30_000,
    // Client specs exercise the host's shared Menu primitive in jsdom; inline
    // the package so its CSS modules load instead of reaching Node's loader.
    server: { deps: { inline: ['@deepseek-ai/dsh-client-ui-primitives'] } },
    css: { include: [/@deepseek-ai[/\\]dsh-client-ui-primitives[/\\].*\.module\.css$/u] },
  },
})
