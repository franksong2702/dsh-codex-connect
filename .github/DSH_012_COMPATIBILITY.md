# DSH 0.1.2 compatibility preparation

This is an unreleased migration targeting DSH `0.1.2-alpha.2` (tag commit `0a53fb55bea101816fa226bb964ae2bed71c343b`) and its declared pi-ai range `^0.84.2`; the current registry installation resolves pi-ai `0.84.4`. It does not extend the published Alpha 4.21 compatibility record.

## Changes

- Import client contracts from Cordis, Session Controller, Settings, Store, and Renderer instead of the removed client-runtime package.
- Keep the existing settings slots and session actions. Remove the obsolete close-label prop from the headless Modal; the gallery still owns its labeled close button.
- Adapt tool-call identifiers, card fixtures, and standard UI props to the new APIs. Settings fixtures fail if an unimplemented batch mutation is called.
- Verify image preview bytes against their normalized attachment metadata while retaining exact original-byte equality. Preview codec and raster rounding belong to DSH.
- Move the development dependency pair, diagnostic hints, installation check, and scheduled declared-version check together. Preserve SSE, OAuth behavior, the verified-release catalog, and production configuration.

## Registry validation

The public npm packages at `0.1.2-alpha.2` support a registry-only lockfile and a clean frozen installation. `pnpm run check` passes 405 tests, `pnpm run test:browser` passes 12 tests, and `pnpm run check:dsh-install` installs the published DSH CLI into an isolated environment, preserves the default model and Web configuration, registers seven Codex models, and verifies provider disposal.

The lockfile contains no local links, workspace overrides, tarball references, or Git dependencies. The installed-runtime check resolves Host packages from the isolated DSH installation and the plugin from the profile, matching the ownership split introduced by the upstream peer-dependency changes.

## Required before marking the PR ready

1. Recheck Node 22.19 and 24, browser, Windows, dependency review, and CodeQL for the exact PR head in CI.
2. Validate an isolated full Web profile, OAuth/model requests, image actions and downloads, and the new network-authentication integration. A successful provider registration probe does not establish these behaviors.
3. Review the resulting diff and exact CI head. Choose and validate the plugin release version separately; do not publish or move npm tags as part of this preparation.

## Review concern

Registry installation and keyless runtime checks cannot prove a real browser session. Full Web/OAuth acceptance remains an explicit release gate. No dependency test is skipped or made to report success for an unavailable package.
