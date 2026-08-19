import { readFileSync } from 'node:fs'
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-codex-connect-images'
const PACKAGE_VERSION = (JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }).version

export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    clean: true,
    define: {
      __CODEX_CONNECT_IMAGES_VERSION__: JSON.stringify(PACKAGE_VERSION),
    },
    deps: {
      neverBundle: [
        'dsh-codex-connect',
        '@deepseek-ai/cordis',
        '@deepseek-ai/schemastery',
        '@deepseek-ai/dsh-attachment',
        '@deepseek-ai/dsh-invariants',
        '@deepseek-ai/dsh-tools',
      ],
    },
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    clean: false,
    deps: {
      neverBundle: [
        'react',
        'react/jsx-runtime',
      ],
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      __CODEX_CONNECT_IMAGES_VERSION__: JSON.stringify(PACKAGE_VERSION),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
] satisfies UserConfig[]
