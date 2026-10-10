# Installation Runbook for CLI Agents

Published `0.2.0-alpha.3` is installation/runtime-regression verified with exact DSH `0.1.7-rc.1`, `0.1.7-rc.2`, `0.2.0-rc.1`, `0.2.0-rc.2` or `0.2.1-alpha.1`, using a consistent host package set and plugin-owned pi-ai `0.85.1`. It adds official Desktop sign-in compatibility without changing the declared host set. Earlier DSH pairings retain their separately published plugin versions below.

The exact DSH `0.2.1-alpha.1` adaptation is published in `0.2.0-alpha.2`. The earlier `0.2.0-alpha.1` artifact remains unchanged and rejects this host. See the [release notes](docs/release-notes/0.2.0-alpha.2.md) for scope and verification limits; keyless compatibility does not establish live-account acceptance.

Install `dsh-codex-connect` into one requested DeepSeek Harness profile without changing its current default model, search route, global configuration, or OAuth state.

Channel snapshot on 2026-10-10: npm `alpha` points to `0.2.0-alpha.3`; `latest` remains `0.2.0-alpha.1`. Default installation still selects the earlier Alpha, not a stable release. Use the exact-version command for the installed DSH version; moving npm tags are not compatibility guarantees.

## Safety requirements

- Never read, print, copy, move, or modify `~/.codex/auth.json`.
- Never print or inspect `$DSH_HOME/.openai-codex-auth.json`; `doctor` may inspect pathname metadata only.
- Never add OAuth URLs, codes, tokens, account identifiers, or generated profile state to Git.
- Preserve every unrelated profile dependency and patch row.
- Do not start login unless the user explicitly asks to authenticate.

## Install and validate

### Select an exact version before installation

Check `dsh --version` before changing the requested profile. Use `dsh --help` to locate the CLI if needed; from a Harness checkout use `pnpm dsh --version`. The CLI string alone does not identify every installed model-runtime package: a CLI reporting `0.1.5-rc.1` can resolve `0.1.5-rc.2` packages. When the plugin is already installed, also run `dsh plugin --profile web exec dsh-codex-connect doctor --json` and inspect the installed `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-llm-pi-ai`, and pi-ai versions. Substitute the requested profile. Select an exact pair from [verified-compatibility.json](verified-compatibility.json):

| Installed DSH version | Codex Connect version to pin |
| --- | --- |
| `0.1.0-rc.7` | `0.1.0-alpha.4.14` |
| `0.1.1-rc.2` | `0.1.0-alpha.4.21` |
| `0.1.2-alpha.2` | `0.1.0-alpha.4.23` |
| `0.1.2-rc.1` | `0.1.0-alpha.4.41` |
| `0.1.2-alpha.5` | `0.1.0-alpha.4.25` |
| `0.1.5-alpha.1` | `0.1.0-alpha.4.41` |
| `0.1.5-rc.1` | `0.1.0-alpha.4.41` |
| `0.1.5-rc.2` | `0.1.0-alpha.4.41` |
| `0.1.7-rc.1` | `0.2.0-alpha.3` |
| `0.1.7-rc.2` | `0.2.0-alpha.3` |
| `0.2.0-rc.1` | `0.2.0-alpha.3` |
| `0.2.0-rc.2` | `0.2.0-alpha.3` |
| `0.2.1-alpha.1` | `0.2.0-alpha.3` |

If your exact DSH version is unknown or not listed, preserve the installed host, report that the combination is unverified, and verify it before making installation changes. A missing record does not prove incompatibility, and the catalog's latest verified DSH version is not the latest upstream release. Do not recommend upgrading or downgrading DSH merely to match a row. Investigate any specific failure and seek verification of the installed combination. Do not blindly install `dsh-codex-connect@alpha`: `alpha` is a moving tag, not a compatibility guarantee. Do not infer support for newer DSH versions from these rows.

`0.2.0-alpha.3` requires one consistent DSH plugin API version from the five modern rows above; its direct runtime imports include `@deepseek-ai/schemastery` `3.18.4` and plugin-owned `@earendil-works/pi-ai` `0.85.1` so an isolated profile need not already provide them. The host adapter can own a different nested pi-ai version, as verified on DSH 0.2.0-rc.2. Node.js remains `^22.19.0 || >=24.0.0`. `0.2.0-alpha.3` does not support the older DSH rows. Alpha 4.41 remains the choice for DSH `0.1.2-rc.1` with pi-ai `^0.84.2`, or `0.1.5-alpha.1`, `0.1.5-rc.1`, and `0.1.5-rc.2` with pi-ai `0.85.1`. Mixed host versions and other DSH/pi-ai combinations remain unverified. Alpha 4.25 remains the verified choice for DSH `0.1.2-alpha.5`, Alpha 4.23 for DSH `0.1.2-alpha.2`, Alpha 4.21 for DSH `0.1.1-rc.2`, and Alpha 4.14 for DSH `0.1.0-rc.7`. Changing DSH is a separate operation requiring the user's explicit request; a plugin update request does not authorize it. The repository's `pnpm --silent run check:compatibility` remains a strict development/release dependency gate, not a recommendation to change a user's host.

### 0.2.0-alpha.3 Desktop published delivery

[PR #317](https://github.com/franksong2702/dsh-codex-connect/pull/317) adds official Desktop OAuth browser-launch compatibility and Desktop-specific account diagnostics without changing Web behavior, host support or default models. [Exact-main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/38035495747) and the [protected publication](https://github.com/franksong2702/dsh-codex-connect/actions/runs/38036148904) succeeded for `174811c27ae151536f671069a0087be71bb72891`; the matching [prerelease](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.2.0-alpha.3) is available.

Independent read-only verification returned `already-complete` and matched the public npm archive byte-for-byte to the workflow artifact and all five strict installed-host checks. SHA-256: `05b873f251802ff794facd9ccab0b3f22289f13625bcc4379fbd87aece40f903`. Package identity, registry SHA-512/SHA-1, exact tag commit and prerelease passed. npm `alpha` is `0.2.0-alpha.3`; `latest` remains `0.2.0-alpha.1`. The immutable archive keeps the pre-publication README recommendation; use this repository's exact commands. See [the release notes](docs/release-notes/0.2.0-alpha.3.md) and the separate [Desktop local-build acceptance](#official-desktop). No daily installation upgrade, service restart, dependency refresh, new live-account npm acceptance or experimental activation is included.

### 0.2.0-alpha.2 published delivery

[PR #305](https://github.com/franksong2702/dsh-codex-connect/pull/305) prepares the exact DSH `0.2.1-alpha.1` compatibility repair from #304 and cross-route image selection handle repair from #302. [Exact-main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/37164650566) and the [protected publication](https://github.com/franksong2702/dsh-codex-connect/actions/runs/37165294347) succeeded for `0c186e73ebe7495d2fe16dc8c8cb38021293251d`; the matching [prerelease](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.2.0-alpha.2) is available.

Independent post-publication verification matched the public npm archive byte-for-byte to the protected workflow artifact and the five-host installation matrix. SHA-256: `95a4599300eef03badcbe51452751f72c0295695876128805897c6fd9b0153d1`. Registry SHA-512 integrity, SHA-1, package identity, exact new-host peer and removal of the retired invariant peer also passed. npm `alpha` is `0.2.0-alpha.2`; `latest` remains `0.2.0-alpha.1`. The immutable package retains the previous pre-publication README recommendation; use this repository's updated exact installation command. No daily-service upgrade, real OAuth/model/image request, new-host authenticated browser acceptance or physical Windows/mobile acceptance is included. Task remains paused and experimental defaults remain off.

### 0.2.0-alpha.1 published delivery

[PR #299](https://github.com/franksong2702/dsh-codex-connect/pull/299) adds the `gpt-6.1-sol` catalog fallback and simplifies independent plugin numbering. It retains the four exact host targets, Alpha status and existing maintenance scope; no host upgrade or stored-data migration is required. The full pi-ai/OAuth dependency upgrade remains outside this release.

[Exact-main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36727783111) passed for `ba75aa66579bdb22f179c949628e9593b60bf469`. The [original publication](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36728803256) uploaded npm but failed bounded public readback. The [protected recovery](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36730584814) verified the published archive against the original artifact and created only the missing tag/[prerelease](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.2.0-alpha.1). SHA-256: `afe0c5e9cb08d10912ddf215c8b7f601b9a6d51adfa5cb0cb34e2e7ae8c7258a`. npm `latest` was subsequently promoted with explicit maintainer approval; no package was republished. These release checks are synthetic, not full live-account acceptance or a daily-service deployment.

### Historical Alpha 4.54 DSH 0.2.0 compatibility delivery

[Alpha 4.54](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.54) delivers the normal-request and dependency-ownership diagnostic repairs from [#294](https://github.com/franksong2702/dsh-codex-connect/pull/294), prepared by [#296](https://github.com/franksong2702/dsh-codex-connect/pull/296). It preserves initial system instructions and tool definitions for the pinned provider on DSH 0.2.0-rc.2 and strengthens the Canary request probe. Dynamic system/tool changes remain explicitly unsupported; frozen experimental features remain off.

[Exact-release main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36657684473) and the [publication workflow](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36658367825) passed for `bf4fe177decb06b1b224fa642a6233594f66e40b`. Local verification passed 1,548 tests, 53 browser tests and all four same-artifact installations. Independent read-only verification matched the public npm archive to the workflow artifact (SHA-256 `3fe58fabf0aa16ab41d0d54e5d787779245bcfac45b6fe25e75573dc76e338ad`) and confirmed the release tag. These are keyless checks, not live OAuth or full user acceptance. No daily-service deployment or latest promotion is included.

### Alpha 4.53 core maintenance delivery

[Alpha 4.53](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.53) delivers the maintenance scope, explicit Task policy wiring and frozen activation-form retirement from #288–#290, prepared by #292. Existing-task recovery and safety remain. Exact-main CI passed at `d15638b614cbc0b9388768aefd30c417afa79c5a`; local checks passed 1,537 unit tests, 53 browser tests and both same-artifact host installations. These are keyless checks, not real-account acceptance.

The [original publication run](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36558018123) uploaded npm but failed public readback. Recovery verified the npm archive against the original artifact (SHA-256 `1c83247e5c29fe3e9706960ad38beff2612c3a91be011b29c7ee20e70288a487`) and created only missing tag/prerelease records. No npm republish, old-tag movement or latest promotion occurred. Installation recommendations were updated only after version, alpha, tag and prerelease readback agreed.

### Historical Alpha 4.52 request-metrics delivery

[PR #284](https://github.com/franksong2702/dsh-codex-connect/pull/284) adds optional local request evidence and the offline report CLI, without the internal evaluation runner or a metrics panel. Upgrading alone does not enable collection. Configure a private directory only in the intended profile and restart that profile explicitly; [English](docs/request-metrics.md) and [Chinese](docs/request-metrics.zh.md) guides cover configuration, unknown usage, retention and disabling. Task remains paused.

Fresh independent static source review found no blocker. Local checks passed 132 files / 1,533 tests, Chromium 73 tests, and both stock rc.1/rc.2 same-artifact installation/runtime checks including metrics startup/CLI tests. The final PR-head checks and [exact-main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36366815118) passed. These are synthetic engineering checks, not new real-model/image/Reserve acceptance or evidence of savings.

The original workflow uploaded npm but failed afterward. It was not rerun; recovery verified the original artifact byte-for-byte and created only missing tag/release records. [Original release run](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36367211049); release commit `21504f83f0bed1d5737cb2b1972bcd3246b8d3a1`. Final independent read-only verification returned `already-complete`; the public npm archive exactly matched the original verified artifact (SHA-256 `5cab311ed632fb2156188a13633d0bf5ca4c569dad8415da4c95ad4d5063e4a4`). Version, alpha, tag and [prerelease](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.52) agree. latest remains 4.50. No duplicate upload, old-tag movement or daily-service upgrade occurred. [Publication record](docs/experiments/evidence/alpha-452-publication.json).

### Historical Alpha 4.51 maintenance delivery

The historical Alpha 4.51 recommendation followed [PR #283](https://github.com/franksong2702/dsh-codex-connect/pull/283), successful [exact-main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36362680011), and independent final source review of the diagnostic type/lifecycle repair. Frozen local checks passed 127 files / 1,466 tests, Chromium 73 tests, and stock rc.1/rc.2 same-artifact installation/runtime checks. Experimental defaults and Task pause remain unchanged; no draft metrics/evaluation feature is included.

The [original protected publication](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36363043413) uploaded npm successfully but failed public readback. It was not rerun. Recovery-only verification matched the public package byte-for-byte to the original artifact (SHA-256 `6d8ffe3b9335e0f874592f6d5f67d2fe872e809a24a4ae4e2c1d8f14e29857e6`), then created only the missing tag and [prerelease](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.51). Final independent verification returned `already-complete`: version, alpha, tag and release match commit `2ac612385ea3c3fcfc1078dc18619d7b1dc49b9a`; latest remains 4.50. See [the publication record](docs/experiments/evidence/alpha-451-publication.json). No duplicate npm upload, old-tag movement, daily-service upgrade or new real-model/image acceptance occurred.

### Historical Alpha 4.50 delivery evidence

The Alpha 4.50 recommendation follows [PR #275](https://github.com/franksong2702/dsh-codex-connect/pull/275), [exact-release main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36222707376) and a successful [protected publication run](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36222974006) at `6baa422b7b9cd513340948f659b51b0b9d76a724`. The same candidate passed unmodified rc.1 and rc.2 isolated installations without exemptions; Chromium passed 73 tests on each host. The rc.1 frozen full check passed 1,452 tests; rc.2 source types and focused image/auth/transport/compaction suites passed. An independent source reviewer found a mandatory UI-peer consistency gap; five red/green controls covered the correction before the final source review passed. See [the exact scope and evidence](docs/experiments/dsh-017rc2-compatibility.md).

Independent post-publication verification returned `already-complete`, matching the npm archive byte-for-byte to the original verified release artifact (SHA-256 `e974ef71d77b3153c8a41fa454d6e53de41227cf1ee96cee99db42f73a43b58d`). The version, `alpha`, Git tag and [prerelease](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.50) agree. This release's publication workflow succeeded; no recovery mutation or duplicate publication was needed. `latest` remains 4.47. This is not new live-account/image/Reserve or physical Windows/mobile acceptance. All mandatory host peers, including UI peers, are checked by the full capability/strict compatibility checks; the compact doctor report alone is not a full peer audit. Optional commands-service behavior is not certified by the mandatory-peer check. Task controls remain paused and defaults are unchanged.

Historical Alpha 4.49 evidence:

The Alpha 4.49 recommendation follows [exact-release main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36212638824) on Node 22/24, browser and keyless Windows checks, plus the stock DSH `0.1.7-rc.1` same-artifact installation matrix. It fixes both independently reproduced Alpha 4.48 image-editing defects: reuploaded copies could select historical originals, and safe actionable input errors were hidden. The three original reproduction tests pass; a separate ephemeral GPT-6 Astra process reviewed the correction's source without implementation history and found no blockers in that scope.

The [original 4.49 publish run](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36212860716) successfully published npm but failed its bounded public-readback step. It was not rerun. The [recovery-only run](https://github.com/franksong2702/dsh-codex-connect/actions/runs/36213209903) verified npm metadata and exact archive bytes against the original verified artifact, then created the [matching tag and prerelease](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.49). npm exact version and `alpha` were independently read back as 4.49; `latest` remains 4.47. These checks do not claim new real-account image/selection acceptance, physical Windows/mobile behavior or pixel-perfect edits. Stock rc.1 keeps Task controls paused. The 4.48 package and tag remain unchanged and affected; select 4.49 for the corrected behavior.

Historical Alpha 4.47 evidence:

The Alpha 4.47 recommendation follows [exact-release main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35994106350) on Node 22/24, browser and keyless Windows checks, plus the stock DSH `0.1.7-rc.1` same-artifact installation matrix. The [original publish run](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35994578156) uploaded the verified package but failed during npm public readback; do not rerun publication. Recovery-only local verification matched the public npm archive byte-for-byte to the original artifact and created the [Git tag and prerelease](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.47) without republishing. npm `alpha` and `latest` were independently read back as 4.47. These checks are not fresh real Chrome OAuth, live model/tool/image requests, or Windows application acceptance. Stock rc.1 keeps Task controls paused; migration of old Task grants across a Harness upgrade remains unverified.

Historical Alpha 4.46 evidence:

The Alpha 4.46 recommendation follows [exact-release main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35982530538) on Node 22/24, browser and keyless Windows checks, plus the stock DSH `0.1.7-rc.1` same-artifact installation matrix. The [original publish run](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35983101557) uploaded the verified package but timed out waiting for npm's public readback; it must not be rerun. After the exact version and `alpha` tag appeared, the [recovery-only run](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35984180679) matched the public npm archive byte-for-byte to the original artifact and created the Git tag and prerelease without republishing. The fix's real Chrome OAuth and quota refresh on the original Windows PC remain unverified; these checks did not promote npm `latest` or establish real-account acceptance. Stock rc.1 keeps Task controls paused; migration of old Task grants across a Harness upgrade remains unverified.

The historical Alpha 4.43 recommendation followed [exact-release main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35887810404) on Node 22/24, Chromium and Windows checks, plus the stock DSH `0.1.7-rc.1` same-artifact installation matrix. The [original publish run](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35888766215) uploaded the verified npm package but timed out waiting for public registry readback; do not rerun publication. Once npm exposed the exact version and `alpha` tag, the [recovery-only run](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35889959811) verified the archive against that original artifact and created the matching Git tag and prerelease without republishing. These checks used synthetic providers, not a real ChatGPT account. Stock rc.1 keeps Task controls paused; migration of old Task grants across a Harness upgrade remains unverified.

The Alpha 4.41 recommendation follows successful [exact-release main CI](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35817909046) on Node 22 and 24 (1,282 unit tests each), 52 Chromium tests, and a four-host same-artifact installation matrix. After npm processing completed, the [recovery verification](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35819017165) matched the public npm archive byte-for-byte to the original verified release artifact, then created the matching Git tag and GitHub prerelease. The [original release run](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35818489220) remains failed because npm's public readback was not available within its bounded retry period; do not rerun publication. These are synthetic-provider installation/lifecycle checks, not new real-account acceptance or a newly exercised published-package upgrade. Task-level model control remains opt-in; a new grant preselects only GPT-5.6 Sol / Medium and displays its scope and request limit before Start. Existing grants are not silently narrowed. Stock DSH 0.1.6-alpha.1 and alpha.2 remain undeclared; their separate compatibility trackers are not broadened by this release.

Historical Alpha 4.35 evidence (not relabeled as 4.37):

The Alpha 4.35 rows reflect successful release-commit CI on Node 22.19.0 and 24.20.0 (840 tests each), 28 Chromium tests, Windows canary contracts, and the four-host installation/Reserve matrix. Independent post-publication checks installed the exact npm version on all four hosts, matched all 63 installed plugin files to the verified published archive, and exercised a 4.34-to-4.35 upgrade on rc.2. All eight advertised models resolved and prepared, defaults were unchanged, all optional capabilities remained disabled, and provider disposal and synthetic Reserve transitions passed. These checks are not fresh real OAuth, live Reserve/model/tool/image, or full Windows application acceptance. See [.github/ALPHA_435_RELEASE_READINESS.md](.github/ALPHA_435_RELEASE_READINESS.md) for publication, installation evidence, and limitations. Historical rows remain the repository's existing verification record. This guidance does not change upstream DSH behavior or resolve [Issue #64](https://github.com/franksong2702/dsh-codex-connect/issues/64).

Alpha 4.33 omits the `modelErrors` profile field required by RC model packages, producing `Cannot read properties of undefined (reading 'get')`. Alpha 4.34 contains the fix, retained in 4.35. Reauthorization or repeated model-list retries do not add a missing profile field. Pin the corrected plugin version for a verified host combination; do not delete credentials or change DSH merely to work around this failure. DSH `0.1.5-alpha.2` remains unverified.

### Install the selected version and validate

1. Complete the version selection above. The commands below use `web`; substitute only the requested profile.
2. Install the selected exact version. For DSH `0.1.0-rc.7`:

   ```sh
   dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.14
   ```

   For DSH `0.1.1-rc.2`, use Alpha 4.21:

   ```sh
   dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.21
   ```

   For DSH `0.1.2-alpha.2`, use Alpha 4.23:

   ```sh
   dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.23
   ```

   For DSH `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, or `0.1.5-rc.2`, use Alpha 4.41:

   ```sh
   dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.41
   ```

   For exact DSH `0.1.7-rc.1`, `0.1.7-rc.2`, `0.2.0-rc.1`, `0.2.0-rc.2` or `0.2.1-alpha.1`, use `0.2.0-alpha.3`:

   ```sh
   dsh plugin --profile web add dsh-codex-connect@0.2.0-alpha.3
   ```

   For DSH `0.1.2-alpha.5`, use Alpha 4.25:

   ```sh
   dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.25
   ```

   If npm is unavailable after the matching GitHub prerelease is created, use `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.21'` only for the DSH `0.1.1-rc.2` combination, `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.23'` only for the DSH `0.1.2-alpha.2` combination, `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.25'` only for the DSH `0.1.2-alpha.5` combination, `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.41'` only for the DSH `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, and `0.1.5-rc.2` combinations, or `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.46'` only for DSH `0.1.7-rc.1`.

   For current DSH `0.1.7-rc.1`, `0.1.7-rc.2`, `0.2.0-rc.1`, `0.2.0-rc.2` or `0.2.1-alpha.1`, if npm is unavailable after the matching GitHub prerelease is created, use `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.2.0-alpha.3'`.

3. Run `dsh web --help` once to compose the installed profile without starting the server. DSH `0.1.2-rc.1` prepares profile plugin dependency fallback during this step.
4. Run `dsh --profile web --dump-config` and require exactly one `llm-openai-codex` row loading `dsh-codex-connect`.
5. Confirm the effective `agent-default-model` and `web.searchProvider` values are unchanged from before installation.
6. Run secret-free diagnostics:

   ```sh
   dsh plugin --profile web exec dsh-codex-connect doctor
   ```

7. If the user explicitly requests login, open **Settings → Plugins → Plugin configuration → Codex Connect**, or check `status` and then use `login` or `login --device-code`. OAuth approval belongs to the user.

   Alpha 4.25 offers the same account actions in **Settings → Models → Openai-Codex**, plus a shared **More settings** dialog for model visibility, proxy, search, image, context-budget, and Auto-review controls. The original Plugin settings entry remains available; neither entry automatically starts login or changes model/search defaults.

   When signed out, select **Authorize**. When signed in, use **Sign out** or **View quota**; use **More settings** for plugin options. If authorization is abandoned, use **Reopen authorization** or **Cancel sign-in** and retry; cancellation does not delete an existing account. Pending authorization expires after 10 minutes by default (`oauthTimeoutMs` in plugin configuration, applied on load).

### Official Desktop

Desktop uses the same plugin package, but owns a separate `desktop` profile and its bundled runtime. Check the installed Desktop version against the exact host table above; a Web installation does not enable the plugin in Desktop. Do not replace Desktop's runtime or copy a Web profile over it.

Install the exact published version using Desktop's own **Plugins** page or its bundled CLI. On macOS the bundled CLI is:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --version
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-codex-connect@0.2.0-alpha.3
```

Start Desktop once to initialize its profile and fully quit it before CLI package operations. Use the intended `DSH_HOME`; do not inherit an unrelated Web instance's home. Preserve profile patches, default models, optional capabilities and OAuth state. Reopen Desktop after installing. Its Plugins page can enable an installed but inactive bundle; a dependency entry alone is not proof of activation.

For a local build, build and pack its exact source, then replace the package spec in the command with an absolute archive path. A local archive is not the immutable npm package even if its version is unchanged; retain its source commit and SHA-256 separately.

On Desktop with pnpm 11, `ERR_PNPM_IGNORED_BUILDS` may leave the package installed but inactive. In the requested Desktop profile's `pnpm-workspace.yaml`, explicitly decline the two observed optional dependency build scripts, preserving other settings:

```yaml
allowBuilds:
  '@google/genai': false
  protobufjs: false
```

Then repeat the selected package installation and verify activation. Do not blanket-enable dependency scripts or bypass peer compatibility checks. This is a scoped installation workaround, not a claim that all Desktop package operations are certified.

The Desktop adaptation detects only the official `dsh-app://app` document for OAuth launch behavior: it opens the validated HTTPS authorization link directly through the desktop shell, rather than preopening a blank window. A null window handle is expected when Electron opens an external browser; it is not proof that the browser successfully opened. **Open login in browser**, cancellation and manual callback remain available. Never add `dsh-app://app` to the HTTP trusted-origin list. A Desktop-specific rejected-origin error calls for restart/version diagnostics, not a `--profile web trust-origin` command.

On 2026-10-10 the maintainer reported successful login and normal use on DSH Desktop `0.2.0-rc.2` with the local adaptation archive (SHA-256 `9ac6fd1ea1def6bfaa6440c4727e5ea3587c2c9f3fd1c2cb9bb4377dcf001d41`). This is user-reported acceptance of that exact local build, not independent live-account verification of a later npm artifact. Synthetic UI/browser tests and isolated Desktop Host startup cover separate checks; image generation/editing and full Windows/mobile acceptance are not established by this report.

### Remote browser access

The default Web OAuth boundary is loopback-only. When DSH runs on one device and you open it from another device on a trusted network through an IP address or domain, run the following on the device that runs DSH with the exact origin from the browser address bar:

```sh
dsh plugin --profile web exec dsh-codex-connect trust-origin http://192.168.1.20:3080
dsh plugin --profile web exec dsh-codex-connect trusted-origins
```

The value is a full `http://` or `https://` origin including its port, not a bare device IP and not a path/query/fragment. Use `untrust-origin <origin>` to remove it. Restrict this to a trusted network and never expose the route publicly; use an SSH tunnel when that is safer. The Web client does not edit this list.

## Optional configuration

Use **Settings → Plugins → Plugin configuration → Codex Connect** for live, staged Save/Discard edits organized under Account & quota, Models, Network, and Capabilities. Switching modules preserves the draft. The same settings control `enableSearch`, `enableReserveFallback`, `enableImageTool`, `enableImageGeneration`, and `enableAutoReview`; all five default to `false`. Luna Reserve is a published experiment in Alpha 4.35: enable it only when explicitly requested, never as an automatic installation step. Real-account Reserve entry and recovery remain unverified; authorization must come from the identity-matched backend response, not a generic `429` or quota percentage. Enabling Auto-review permits bounded approval context, tool arguments, working directory, and the planned action to be sent to `chatgpt.com`; failures return to human approval. Enabling image generation uses the image generation capability included with the current GPT subscription and saves results as DSH attachments. Enabling search registers the provider and selects it while the capability remains enabled; disabling restores the previous provider before unregistering Codex Search. Setting `agent-default-model` to `openai-codex` remains a separate explicit change.

Apply only requested choices and preserve unrelated keys:

```yaml
- id: llm-openai-codex
  config:
    enableSearch: true
    enableReserveFallback: false
    enableImageTool: false
    enableImageGeneration: false
    enableAutoReview: false
    searchMode: live

- id: agent-default-model
  config:
    provider: openai-codex
    model: gpt-5.6-sol
```

Do not add a separate `web` row for this UI action. Do not add the `agent-default-model` row unless the user separately requested that default.

## Conflict handling

`openai-codex` can have only one adapter. If startup reports a collision, inspect the effective config and remove only the old `dsh-codex` bundle or manual `openai-codex` provider row after confirming it is the conflicting owner. Do not delete auth files or unrelated providers.

## Update and removal

The update card checks Codex Connect releases only. It does not assess the installed host or recommend a DSH upgrade or downgrade. Run `doctor --json` explicitly for local dependency diagnostics; an `unverified` result (and its nonzero exit code) means the installed combination is outside the declared support set, not that it is known to fail. See the [diagnostic statuses](docs/reference.md#local-installation-diagnostics).

Before updating, repeat the exact-version selection above. Use `@alpha` only after verifying that the version it currently resolves to is compatible with the installed DSH; otherwise pin the selected version in the update command.

```sh
dsh plugin --profile web update dsh-codex-connect@alpha
dsh plugin --profile web remove dsh-codex-connect
```

Use an exact npm version when a reproducible update is required; use a GitHub tag only as the npm-unavailable fallback.

A separate [published-package lifecycle check](docs/agent-notes/alpha1-install-lifecycle.md) verified removal and reinstallation on isolated DSH `0.2.0-rc.2`. Removal unselects the bundle and removes its profile dependency; user patch rows and data remain. Reinstallation of the same version can therefore restore retained configuration. Package-manager caches are not a credential or data cleanup mechanism.

Removal of the package and removal of its separate OAuth file are different actions. Run `dsh plugin --profile web exec dsh-codex-connect logout` only with explicit credential-deletion authorization.

## Completion report

Report the profile, installed version, effective default model, effective search route, enabled optional capabilities, signed-in/signed-out state only if checked, and Web client detection. Never report OAuth URLs, codes, token timestamps, account ids, or auth-file contents.
