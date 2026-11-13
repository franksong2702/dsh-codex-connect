# Codex Connect 0.2.0-alpha.14

Unreleased candidate. Local verification is complete; remote candidate CI, protected merge and publication are separate pending steps.

## Changes

- Improve input-area control stability (#426).
- Add exact DSH 0.2.2-rc.2 compatibility, using the official Host ownership contract instead of removed legacy APIs (#433).
- Close a retained Task recovery gap across providers: managed descendants cannot bypass the recovery fence through an adapter outside the Codex stream wrapper. Keep authorized safety exits, existing state, cancellation and accounting intact (#433).
- Include the jsdom/Undici and fast-uri dependency maintenance from #414 and #413, the development-dependency batch from #429, pinned workflow action maintenance from #430, and documentation cleanup from #431.

## Scope and safety

Public Task and automatic delegation remain frozen. This release does not reopen Computer Use or the stopped #402 effort, and does not include #391's Cordis/Schemastery migration or #394.

The candidate declares 17 exact DSH Host versions, including 0.2.2-rc.2. Its new same-artifact installation matrix passed all 17 declared targets; full check, 101 browser tests and package validation passed. Automated synthetic evidence is not Desktop installation, OAuth or live-model acceptance. Optional native/HMR acceptance is not expanded.

No deployment, daily-service restart, automatic Host upgrade or promotion of npm latest is included. The existing published recommendation remains unchanged until publication is independently confirmed.

## Publication identity (fill only after verification)

- Version: 0.2.0-alpha.14
- npm channel: alpha only
- Source: final merged main `7ffb6b7bb080206b88be3032b0bfc48b0d3ef79d` plus the version-only candidate `46db846a935a501543145a99db24444e09b19db5`
- Packed SHA-256: `706a31168ecf1981fb49844dc6df71d61d0fe89e54cb1120135840c58ff25c47`
- Exact Host verification: 17/17, identical Alpha14 bytes; see `alpha14-install-matrix.json`
- Production dependency audit: zero vulnerabilities in the fresh candidate audit
- Full dependency audit: one existing moderate minimatch advisory in the development toolchain; no unrelated major override

After confirmed publication, the exact package is `dsh-codex-connect@0.2.0-alpha.14`. Do not recommend installing an unpublished version.

## Candidate verification record

- Frozen offline dependency installation succeeded; the dependency lockfile was not changed.
- `pnpm run check`: 175 files, 2505 tests passed, 2 existing skips; build, typecheck, lint, import checks and package validation passed. The initial run failed only because the CLI snapshot retained Alpha13; updating that exact version line made the full rerun pass.
- `pnpm run test:browser`: 15 files, 101 tests passed.
- `node scripts/check-dsh-matrix.mjs`: all 17 exact Hosts passed with npm 10.9.3 and Node 22.22.3. No peer-check exemptions or real account/model calls.
- `npm pack --dry-run --ignore-scripts`: 74 files. The added agent notes and root compatibility catalog are excluded from the npm package; the final packed SHA is checked against the matrix after adding them.
- Base identity: pre-merge PR #429 `2aa756fc309bb9e257ea35dfde0422e2ee0f308d` and final main have the same full tree `4b8cd1795ac4104e8edf0a07f0551a99a72a0803`. Normal merging of final main into the candidate preserved candidate tree `3ab21c39874fd5c5372a918fd706d54d3edd797f`.
- Registry readback on 2026-11-13: DSH `latest` remains `0.2.2-rc.1`; `next` is `0.2.2-rc.2`. Plugin Alpha14 was absent before preparation, `alpha` was Alpha13 and `latest` was Alpha10. No dist-tags were changed.
- Full audit retains one moderate development-only minimatch advisory; the fresh production audit has zero vulnerabilities.

These automated fixtures do not establish Desktop installation, OAuth, live-model, native-keyring or HMR acceptance. Public Task remains frozen. Existing recovery, cancellation, accounting and provider-neutral protection are preserved. Neither publication nor deployment is claimed.
