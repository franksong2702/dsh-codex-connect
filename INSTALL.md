# Installation Runbook for CLI Agents

Published Alpha 4.47 is verified with the exact DSH `0.1.7-rc.1` model-runtime pairing and pi-ai `0.85.1`. Earlier DSH pairings retain their separately published plugin versions below.

Install `dsh-codex-connect` into one requested DeepSeek Harness profile without changing its current default model, search route, global configuration, or OAuth state.

Channel snapshot on 2026-09-24: npm `alpha` and `latest` both point to `0.1.0-alpha.4.47`. Use the exact-version command for the installed DSH version; moving npm tags are not compatibility guarantees.

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
| `0.1.7-rc.1` | `0.1.0-alpha.4.47` |

If your exact DSH version is unknown or not listed, preserve the installed host, report that the combination is unverified, and verify it before making installation changes. A missing record does not prove incompatibility, and the catalog's latest verified DSH version is not the latest upstream release. Do not recommend upgrading or downgrading DSH merely to match a row. Investigate any specific failure and seek verification of the installed combination. Do not blindly install `dsh-codex-connect@alpha`: `alpha` is a moving tag, not a compatibility guarantee. Do not infer support for newer DSH versions from these rows.

Alpha 4.47 requires one consistent DSH `0.1.7-rc.1` plugin API and pi-ai `0.85.1`; its direct runtime imports include `@deepseek-ai/schemastery` `3.18.4` and `@earendil-works/pi-ai` `0.85.1` so an isolated profile need not already provide them. Node.js remains `^22.19.0 || >=24.0.0`. It does not support the older DSH rows. Alpha 4.41 remains the choice for DSH `0.1.2-rc.1` with pi-ai `^0.84.2`, or `0.1.5-alpha.1`, `0.1.5-rc.1`, and `0.1.5-rc.2` with pi-ai `0.85.1`. Mixed host versions and other DSH/pi-ai combinations remain unverified. Alpha 4.25 remains the verified choice for DSH `0.1.2-alpha.5`, Alpha 4.23 for DSH `0.1.2-alpha.2`, Alpha 4.21 for DSH `0.1.1-rc.2`, and Alpha 4.14 for DSH `0.1.0-rc.7`. Changing DSH is a separate operation requiring the user's explicit request; a plugin update request does not authorize it. The repository's `pnpm --silent run check:compatibility` remains a strict development/release dependency gate, not a recommendation to change a user's host.

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

   For the exact DSH `0.1.7-rc.1` pairing, use Alpha 4.47:

   ```sh
   dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.47
   ```

   For DSH `0.1.2-alpha.5`, use Alpha 4.25:

   ```sh
   dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.25
   ```

   If npm is unavailable after the matching GitHub prerelease is created, use `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.21'` only for the DSH `0.1.1-rc.2` combination, `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.23'` only for the DSH `0.1.2-alpha.2` combination, `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.25'` only for the DSH `0.1.2-alpha.5` combination, `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.41'` only for the DSH `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, and `0.1.5-rc.2` combinations, or `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.46'` only for DSH `0.1.7-rc.1`.

   For the current DSH `0.1.7-rc.1` pairing, if npm is unavailable after the matching GitHub prerelease is created, use `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.47'`.

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

Removal of the package and removal of its separate OAuth file are different actions. Run `dsh plugin --profile web exec dsh-codex-connect logout` only with explicit credential-deletion authorization.

## Completion report

Report the profile, installed version, effective default model, effective search route, enabled optional capabilities, signed-in/signed-out state only if checked, and Web client detection. Never report OAuth URLs, codes, token timestamps, account ids, or auth-file contents.
