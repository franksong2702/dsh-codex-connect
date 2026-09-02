# DSH 0.1.2 compatibility

Alpha 4.22 targets DSH `0.1.2-alpha.2` (tag commit `0a53fb55bea101816fa226bb964ae2bed71c343b`) and its declared pi-ai range `^0.84.2`; the verified registry installation resolves pi-ai `0.84.4`. The public compatibility record lists this exact pair while retaining Alpha 4.21 for DSH `0.1.1-rc.2`.

After Alpha 4.22, the development compatibility baseline advances to DSH `0.1.2-alpha.5` from the public npm registry. On 2026-09-02 the npm `alpha` tag points to this version while the newest upstream GitHub release remains `dsh-v0.1.2-alpha.4`, so no upstream tag commit is recorded for alpha.5. The published Alpha 4.22 compatibility record remains unchanged: a later release must complete real Web, OAuth, model, tool, image, network, quota, context-budget, and session-restoration acceptance before it claims the alpha.5 pairing.

## Changes

- Import client contracts from Cordis, Session Controller, Settings, Store, and Renderer instead of the removed client-runtime package.
- Keep the existing settings slots and session actions. Remove the obsolete close-label prop from the headless Modal; the gallery still owns its labeled close button.
- Adapt tool-call identifiers, card fixtures, and standard UI props to the new APIs. Settings fixtures fail if an unimplemented batch mutation is called.
- Verify image preview bytes against their normalized attachment metadata while retaining exact original-byte equality. Preview codec and raster rounding belong to DSH.
- Move the development dependency pair, diagnostic hints, installation check, and scheduled declared-version check together. The alpha.5 packages require no additional plugin API source adaptation beyond the existing alpha.4 changes. Preserve SSE, OAuth behavior, the verified-release catalog, and production configuration.

## Registry validation

The public npm packages at `0.1.2-alpha.2` support a registry-only lockfile and a clean frozen installation. `pnpm run check` passes 410 tests, `pnpm run test:browser` passes 12 tests, and `pnpm run check:dsh-install` installs the published DSH CLI into an isolated environment, preserves the default model and Web configuration, registers seven Codex models, and verifies provider disposal.

The lockfile contains no local links, workspace overrides, tarball references, or Git dependencies. The installed-runtime check resolves Host packages from the isolated DSH installation and the plugin from the profile, matching the ownership split introduced by the upstream peer-dependency changes.

For the alpha.5 development baseline, the registry-only lockfile and clean frozen installation pass. `pnpm run check` passes 460 tests and validates 41 packed files, `pnpm run test:browser` passes 16 tests, and `pnpm run check:dsh-install` installs DSH `0.1.2-alpha.5`, preserves default configuration, registers seven reasoning-capable Codex models, and verifies provider disposal. These keyless checks establish the development baseline; they do not add alpha.5 to the released compatibility table or replace real profile acceptance.

## Release evidence

1. Node 22.19 and 24, browser, Windows, dependency review, and CodeQL passed for the exact PR head.
2. On 2026-08-31, the maintainer completed and accepted isolated full Web, OAuth and model requests, image actions and downloads, and network-authentication validation.
3. Alpha 4.22 is the selected plugin release version. Merge, GitHub/npm publication, and npm dist-tag changes remain separately controlled release operations.

## Review concern

Registry installation and keyless runtime checks do not replace real browser acceptance; both forms of evidence were required for Alpha 4.22. No dependency test is skipped or made to report success for an unavailable package.
