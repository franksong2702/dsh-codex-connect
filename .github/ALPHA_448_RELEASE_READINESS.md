# Alpha 4.48 delivery checkpoint — 2026-09-25

Status: PR #272 is submitted; release candidate prepared. Independent reviewer completion and final exact-head CI remain mandatory before merge or publication.

## Identity

- Repository: franksong2702/dsh-codex-connect.
- PR: https://github.com/franksong2702/dsh-codex-connect/pull/272.
- Implementation reviewed by prior acceptance: 2b727a200e664b9eb6b28b8969837a2fa889cfc0, based on b1b6efcd93be434bc4b7dd8b9da692803102844e.
- Version-only preparation: a9dbae23d7227e31805bf61bfcda0e94ba72669c, candidate 0.1.0-alpha.4.48.
- Intended channel: alpha only; latest promotion and daily 3080/3081 deployment are not included.

## Fresh verification

Frozen pnpm installation succeeded without dependency or lockfile changes. The candidate passed the complete check (124 files / 1,405 tests), 13 Chromium files / 70 tests, and the exact DSH 0.1.7-rc.1 installation matrix. The matrix verified identical package bytes, disabled defaults, synthetic generation/editing, provenance, inherited originals and invalid-input refusal. Its tested archive SHA-256 is ec781023d2bc14caf8115cd72b89072100591caa7e0a9a078805ee8297f02a5f. This identifies the archive before subsequent documentation changes, not a future release archive.

The successful complete check includes scripts/check-pack.mjs, which actually executes npm pack --dry-run --json --ignore-scripts and checks the required files and forbidden package paths. An additional compound package-inspection tool call returned a platform safety-check receipt; its intended output file was absent on read-only reconciliation. That extra call is not represented as successful and was not replayed through another channel. The already-completed canonical pack check is the package-gate evidence.

Remote CI run 36152452312 at a9dbae2 passed Node 22 validation, both Phase 2 jobs, browser UI, Windows, dependency review and CodeQL, but Node 24 exposed a gallery test timing race: it waited for the loader to be called, not for the thumbnail image to render. The test now waits for actual image readiness and includes a deferred-load regression. Product gallery code was not changed. The refreshed full local check passed 124 files / 1,406 tests, plus lint, types, build, import/compatibility checks and packing.

Alpha 4.48 / DSH 0.1.7-rc.1 was added to the verified-pair catalog only after the installation matrix passed. Bilingual operational references now describe editing and preserve the existing published-version recommendation. The corresponding exact catalog fixture and bilingual hashes were updated. The earlier expected version/catalog snapshot mismatches are retained as development failures, not hidden by skipping assertions.

## Independent review execution

Separate read-only Codex CLI reviewer processes were attempted for GPT-6 Sol and the configured GPT-6 Luna; both received HTTP 400 invalid_request_error, model not supported for that CLI ChatGPT account. Neither produced a review. The existing credentials were not modified or rotated.

A separate restricted Claude Code reviewer of an immutable source archive timed out after 900 seconds without a final report. The subsequent no-tools source-bundle review also timed out after 240 seconds with no final report. Both attempts remain unaccepted; no independent verdict is available. A proposed one-call DSH review received a platform safety-check receipt and was not retried. These attempts do not constitute an independent approval.

Do not merge or publish until an actual review verdict is available and blockers, if any, are resolved. The successful historical GPT-6 Sol image-selection acceptance remains separate from these review attempts.

## Publication procedure

After review and successful final PR CI, merge with an exact head fence. Wait for successful main CI at the merge SHA, then dispatch release.yml on main with version 0.1.0-alpha.4.48 and confirmation PUBLISH. Independently verify npm version/alpha, Git tag and GitHub prerelease. If npm publication succeeds but readback/release creation fails, use the original run's recovery procedure; never republish the immutable npm version. Update README recommendations only after actual publication.

This checkpoint does not authorize bypassing a failed check, platform restriction, approval requirement, or publication gate.
