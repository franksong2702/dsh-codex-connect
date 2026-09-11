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

## Publication and independent readback — 2026-09-11

Release preparation #187 merged as `d3ab2fbc8b297feeb4930a33e75b5b7aace14d8a`. Its tree is identical to the reviewed PR head `71b173f3455fb32f5c28082cf4ca4870d746c561`. [Final main CI 34552166038](https://github.com/franksong2702/dsh-codex-connect/actions/runs/34552166038) passed both configured Node jobs, Chromium regression, Windows canary contracts, and all four exact-host installation matrices. Every matrix still identified artifact `d9ac135f1a77b9b8e882c25b145624597c1213d6dcde970630818cbd2c405f65`.

The earlier [release run 34451145561](https://github.com/franksong2702/dsh-codex-connect/actions/runs/34451145561), started on 2026-09-10 from `06383d29467d9649abc5ee671a9d453e7f0d47a8`, was waiting for its `npm-release` environment approval and occupied the release concurrency group. Its publish job had not executed any steps. It was cancelled as a superseded, unpublished candidate before the new release proceeded.

[Release run 34552519354](https://github.com/franksong2702/dsh-codex-connect/actions/runs/34552519354) verified and published `0.1.0-alpha.4.34` from `d3ab2fbc8b297feeb4930a33e75b5b7aace14d8a` through the existing OIDC workflow and authorized environment approval. Its immediate npm version/alpha readback exhausted six attempts, so the overall workflow remains **failed** and GitHub prerelease creation was skipped. The logs do not establish the exact cache or registry-propagation cause.

Independent registry and npm CLI readback then confirmed:

- `version=0.1.0-alpha.4.34`, `alpha=0.1.0-alpha.4.34`, and unchanged `latest=0.1.0-alpha.4.30`.
- npm SHA-512 integrity and SHA-1 `2af70739e199afc068582c116a0887d8ad7499bd` verified against the downloaded archive.
- The npm archive and the workflow's verified artifact are byte-identical, both with SHA-256 `d9ac135f1a77b9b8e882c25b145624597c1213d6dcde970630818cbd2c405f65`. All 62 extracted files are also byte-identical; the packaged runtime contains `modelErrors` and declares all four exact DSH targets.
- Following RELEASING.md's partial-publication recovery, the [GitHub prerelease](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.34) was created at `2026-09-11T02:05:12Z`. Its Git tag resolves to the original published commit above. npm was not republished, the existing version was not overwritten, and no tag was moved.

## Published-package upgrade regression

An isolated, credential-free macOS fixture installed DSH CLI `0.1.5-rc.1`; the actual model runtime resolved `@deepseek-ai/dsh-llm=0.1.5-rc.2`, `@deepseek-ai/dsh-llm-pi-ai=0.1.5-rc.2`, and pi-ai `0.85.1`. These versions were observed independently, not inferred from the CLI string.

Published Alpha 4.33 reproduced `Cannot read properties of undefined (reading 'get')`. The documented exact-version command then upgraded the existing fixture profile:

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.34
```

A fresh doctor process reported version 4.34 and compatible runtime dependencies. A fresh installed-runtime process resolved and prepared all eight models and verified provider disposal. Actual model-runtime dependencies, default model, and search route stayed unchanged; all five optional capabilities stayed disabled. Credentials were absent before and after, no live model requests were made, and the temporary fixture was removed. This verifies the published exact-version installation path, not a deployed interactive browser or real-account upgrade.

Earlier fixture attempts were not passes: two incorrectly assumed the runtime version equalled the CLI version, and a moving-alpha update attempt failed in pnpm. The final exact-version test above passed. Those failures do not establish a general defect in `update ...@alpha`, nor is that moving-tag upgrade path claimed as verified by this test. Public recommendations therefore use the verified exact-version command.

The post-publication documentation change updates README.md, docs/README.zh.md, INSTALL.md, and README.i18n.yaml together. It does not republish the immutable npm package to refresh its embedded README. Issue #186 can be resolved for the now-published installation fix; tracker #183 retains its separately outstanding full live-acceptance scope.
