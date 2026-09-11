# Alpha 4.34 compatibility release readiness

## Scope and identity

The candidate version is `0.1.0-alpha.4.34`; this document does not by itself prove publication. PR #185 was merged as `0b605c588a8c463676a101cfb79c96c13f00ba21` after independent review and successful required checks. The compatibility catalog and its regression fixture now include the exact DSH `0.1.5-rc.2` pair, preserving all historical records.

The candidate also includes the already-merged #179 model-profile `modelErrors` fix, #180 configurable image route model hint, and #175 development-dependency refresh. The separate Reserve fallback (#184) and Astra reasoning-change (#167) PRs are not included. No OAuth, credential-storage, default-setting, or user-service changes are introduced by this release-record update.

On 2026-09-11, npm reported DSH `latest=0.1.5-rc.1`, `next=0.1.5-rc.2`, and `alpha=0.1.5-alpha.2`. The catalog therefore keeps `latestDshVersion` at `0.1.5-rc.1`; adding a verified rc.2 pair does not redefine the upstream latest channel. Alpha.2 remains unverified.

## Observed validation evidence

PR #185 head: `004626be29d8fc546316801c7fbe2044cd0f5421`.

- [CI run 34500483800, attempt 2](https://github.com/franksong2702/dsh-codex-connect/actions/runs/34500483800): success. Node `22.19.0` and `24.20.0` each passed 747 tests in 85 files, lint, typechecks, build, capability CLI, package checks, committed-build verification, and the complete declared installation matrix.
- [Dependency Review run 34500483818](https://github.com/franksong2702/dsh-codex-connect/actions/runs/34500483818): success.
- Chromium browser regression: 27 tests in 8 files passed. Windows canary subprocess contracts passed; this is not full Windows application acceptance.
- On both Node versions the exact DSH targets `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, and `0.1.5-rc.2` installed successfully. All eight models resolved and prepared, all five optional capabilities remained disabled, defaults were unchanged, and provider disposal succeeded.
- Every installation report used artifact SHA-256 `d9ac135f1a77b9b8e882c25b145624597c1213d6dcde970630818cbd2c405f65`, matching the [contributor's structured reports](validation/dsh-0.1.5-rc.2-install-reports.json).
- Independent compatibility evaluation and old/new comparison each covered 4,500 combinations. Only the intended matching rc.2/pi-ai `0.85.1` cases changed from unverified to compatible; no unexpected classification changes were found.

These are account-free compatibility checks. The contributor's [separately attributed live smoke and limitations](validation/dsh-0.1.5-rc.2.md) are not a new maintainer live-account acceptance run. No full new OAuth, live search/image, deployed browser, or existing-user upgrade acceptance is claimed.

## Required publication and readback gates

Follow [RELEASING.md](../RELEASING.md). Merge this metadata update through the normal PR checks, then require successful CI for the exact final main SHA. Use only the existing `Publish alpha release` workflow and its `npm-release` environment approval; do not bypass checks or publish from a local dirty checkout.

After publication, independently verify npm version and alpha dist-tag, unchanged latest dist-tag, matching Git tag and prerelease, package integrity and extracted contents, and isolated installed-model resolution. Only then update the four public installation recommendation files together and resolve #186 with the exact published installation command and verification scope. The old npm package's embedded README is immutable and must not be republished just to refresh documentation.

Merge, npm publication, documentation updates, and issue closure are separate observable steps. No local DSH deployment, service restart, npm latest promotion, or unrelated feature merge is included.
