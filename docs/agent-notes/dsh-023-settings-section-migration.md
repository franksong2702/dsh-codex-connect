# Settings section migration (DSH 0.2.3-alpha.2)

## Context

DSH `0.2.3-alpha.2` no longer ships `@deepseek-ai/dsh-client-ui-settings-plugins`, so the
`settings.plugins.tab` slot is undeclared at runtime. The browser half registered the
Codex Connect settings page into that slot, which made the page disappear from Settings
and removed the Plugins-page configuration entry point.

The `@deepseek-ai/dsh-client-ui-settings` package is still present and declares
`settings.section`: a root-scoped list rendered through the `settings.section.view`
Factory, with registration options `id`, `order`, `label` and owner props
`{ close: () => void }`. Every shipped registrant nests the registration inside
`slots.inject('settings.section', ...)` because the Factory declares the slot at runtime.

## Change

- `src/client/index.tsx` registers `settings.section` (id `codex-connect`, order `40`,
  label from `settings.openai-codex` `title`) inside `slots.inject`, keeping the existing
  `configForms.whileServed([OPENAI_CODEX_SETTINGS_NAMESPACE])` gate so the section exists
  only while the Host serves `llm-openai-codex`.
- `src/client/OpenAICodexPluginCard.tsx` types its props with
  `PropsRuntime<'settings.section'>`, which adds the required `close` owner prop. The
  component keeps rendering `OpenAICodexSettings` with `embedded`, matching the shell's
  settings column, which paints navigation chrome and no section heading.
- `package.json` drops the removed client package from `dsh.client.inject` and
  `devDependencies`; `pnpm-lock.yaml` drops the matching importer, package and snapshot
  records.
- Tests, `lib/client.js` (regenerated, not hand-edited) and the user documentation follow
  the new navigation path (**Settings → Codex Connect**).

## Runtime identity and evidence

- Running host: DSH `0.2.3-alpha.2` (packaged Desktop/ASAR), profile `desktop`.
- Source: branch `fix/settings-section-migration`, commit recorded in this change's PR.
- The profile installs this package as a local `file:` directory dependency, so the
  profile holds its own copy of the tree; that copy was refreshed from this working tree
  after `pnpm run build`, and the loader reported
  `packageDir = <profile>/node_modules/dsh-codex-connect` while the client half reloaded
  from the rebuilt `lib/client.js`.
- Live client slot inspection after reload:
  - `settings.section` occupants include `dsh-codex-connect-client` / id `codex-connect` /
    order `40` / `active: true`.
  - `settings.plugins.tab` reports `available: false`, confirming the removed slot.
- `node scripts/lint.mjs` (release metadata plus `dsh.client.inject` checks): 44 cases
  passed; source lint gate rejected 6 invalid and accepted 2 valid cases.
- `pnpm install --frozen-lockfile`: exit 0.
- `pnpm run typecheck`: no diagnostics.
- `pnpm run test`: 2448 passed, 2 skipped, 25 failed. All 25 failures are in
  `native-compaction-probes` and `native-compaction-controlled-cases`, which spawn the
  durable-smoke probe scripts; those children exit with status 9 in this sandbox instead
  of the asserted status. The same 25 failures reproduce on an untouched `aa84dac`
  worktree, and neither suite imports the changed sources.
- `pnpm run build`: `lib/client.js` regenerated; the bundle now contains zero
  `settings.plugins.tab` occurrences and the `settings.section` registration.
- `check:env-proxy-import`, `check:isolated-import`, `check:capability-cli`,
  `check:request-metrics`, `check:compatibility`, `pack:check`: passed.

## Limitations

- No screenshot of the rendered page: the Web GUI requires a login token, and an
  independent browser context stops at the pairing screen. Slot state and the built bundle
  are the recorded evidence instead.
- Client-half reload needs a page refresh unless a `dev:web` watcher rebuilds bundles from
  the same checkout; the live inspection above was taken after the rebuilt bundle was in
  place.
- Because the profile install is a `file:` directory dependency, the profile keeps a copy
  of this tree. Rebuilding `lib/` here does not update the installed entry until the
  profile is reinstalled (`dsh plugin --profile <name> install`). A local `link:` install
  symlinks the tree instead and propagates rebuilds on reload, but then the package's own
  `node_modules` must stay installed, because its runtime `dependencies` resolve from
  there.
- Compatibility of the section with pre-`0.2.3` hosts was not exercised here; those hosts
  declare both slots in the pinned client contract, and `slots.inject` degrades to no
  registration rather than throwing when the declaration is absent.
