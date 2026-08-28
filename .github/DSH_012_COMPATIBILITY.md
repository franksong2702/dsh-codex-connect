# DSH 0.1.2 compatibility preparation

This is an unreleased migration targeting DSH `0.1.2-alpha.1` (tag commit `cd5ef8148158c3a752a658978873241fdf8e2bbc`) and pi-ai `0.84.2`. It does not extend the published Alpha 4.21 compatibility record.

## Changes

- Import client contracts from Cordis, Session Controller, Settings, Store, and Renderer instead of the removed client-runtime package.
- Keep the existing settings slots and session actions. Remove the obsolete close-label prop from the headless Modal; the gallery still owns its labeled close button.
- Adapt tool-call identifiers, card fixtures, and standard UI props to the new APIs. Settings fixtures fail if an unimplemented batch mutation is called.
- Verify image preview bytes against their normalized attachment metadata while retaining exact original-byte equality. Preview codec and raster rounding belong to DSH.
- Move the development dependency pair, diagnostic hints, installation check, and scheduled declared-version check together. Preserve SSE, OAuth behavior, the verified-release catalog, and production configuration.

## Source validation

The official tag builds with `pnpm run build:lib`. A temporary plugin checkout with direct local links to those built packages passed `pnpm run check` (330 tests), `pnpm run test:browser` (3 tests), and `node scripts/check-installed-runtime.mjs package.json` (7 models, provider disposal verified). The normal checks use real module resolution, not the earlier experimental import aliases.

Local dependency overrides and their generated lockfile are deliberately excluded from this candidate commit. They are test-environment configuration, not a distributable dependency graph. The tracked registry lockfile remains the previous baseline and is not usable with this candidate manifest yet.

## Required before opening a ready PR

1. Confirm the exact DSH CLI and all required API packages exist in the official npm registry. The CLI version returned `E404` on 2026-08-28.
2. Remove local link overrides, generate the normal registry lockfile, then verify a clean checkout with `pnpm install --frozen-lockfile` and `pnpm run check`.
3. Run `pnpm run test:browser` and `pnpm run check:dsh-install` against the published DSH version. Recheck Node 22.19 and 24 in CI.
4. Validate an isolated full Web profile, OAuth/model requests, image actions and downloads, and the new network-authentication integration. A successful provider registration probe does not establish these behaviors.
5. Review the resulting diff and exact CI head. Choose and validate the plugin release version separately; do not publish or move npm tags as part of this preparation.

## Review concern

Passing checks with local links cannot prove the registry dependency graph or a real browser session. The temporary links are excluded from the commit, and normal installation plus full Web/OAuth acceptance remain explicit release gates. No dependency test is skipped or made to report success for an unavailable package.
