# Installation Runbook for CLI Agents

Alpha 4.27 is verified with DSH `0.1.2-rc.1` and its declared pi-ai range `^0.84.2`.

Install `dsh-codex-connect` into one requested DeepSeek Harness profile without changing its current default model, search route, global configuration, or OAuth state.

## Safety requirements

- Never read, print, copy, move, or modify `~/.codex/auth.json`.
- Never print or inspect `$DSH_HOME/.openai-codex-auth.json`; `doctor` may inspect pathname metadata only.
- Never add OAuth URLs, codes, tokens, account identifiers, or generated profile state to Git.
- Preserve every unrelated profile dependency and patch row.
- Do not start login unless the user explicitly asks to authenticate.

## Install and validate

### Select an exact version before installation

Check `dsh --version` before changing the requested profile. Use `dsh --help` to locate the CLI if needed; from a Harness checkout use `pnpm dsh --version`. Select an exact pair from [verified-compatibility.json](verified-compatibility.json):

| Installed DSH version | Codex Connect version to pin |
| --- | --- |
| `0.1.0-rc.7` | `0.1.0-alpha.4.14` |
| `0.1.1-rc.2` | `0.1.0-alpha.4.21` |
| `0.1.2-alpha.2` | `0.1.0-alpha.4.23` |
| `0.1.2-rc.1` | `0.1.0-alpha.4.27` |
| `0.1.2-alpha.5` | `0.1.0-alpha.4.25` |

If your exact DSH version is unknown or not listed, stop and verify the combination before installing. Do not blindly install `dsh-codex-connect@alpha`: `alpha` is a moving tag, not a compatibility guarantee. Do not infer support for newer DSH versions from these rows.

Alpha 4.27's verified contract is DSH plugin API packages `0.1.2-rc.1`, `@earendil-works/pi-ai` `^0.84.2`, and Node.js `^22.19.0 || >=24.0.0`. Alpha 4.25 remains the verified choice for DSH `0.1.2-alpha.5`, Alpha 4.23 remains the verified choice for DSH `0.1.2-alpha.2`, Alpha 4.21 remains the verified choice for DSH `0.1.1-rc.2`, and staying on DSH `0.1.0-rc.7` means selecting Alpha 4.14. Upgrading DSH is a separate decision: upgrade the DSH API packages and pi-ai together, then rerun `dsh-codex-connect doctor --json` and `pnpm --silent run check:compatibility` for the selected combination.

The Alpha 4.27 row reflects a fresh isolated installation and runtime probe. Historical rows remain the repository's existing verification record. This guidance does not change upstream DSH behavior or resolve [Issue #64](https://github.com/franksong2702/dsh-codex-connect/issues/64).

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

   For DSH `0.1.2-rc.1`, use Alpha 4.27:

   ```sh
   dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.27
   ```

   For DSH `0.1.2-alpha.5`, use Alpha 4.25:

   ```sh
   dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.25
   ```

   If npm is unavailable after the matching GitHub prerelease is created, use `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.21'` only for the DSH `0.1.1-rc.2` combination, `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.23'` only for the DSH `0.1.2-alpha.2` combination, `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.25'` only for the DSH `0.1.2-alpha.5` combination, or `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.27'` only for the DSH `0.1.2-rc.1` combination.

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

Use **Settings → Plugins → Plugin configuration → Codex Connect** for live, staged Save/Discard edits organized under Account & quota, Models, Network, and Capabilities. Switching modules preserves the draft. The same settings control `enableSearch`, `enableImageTool`, `enableImageGeneration`, and `enableAutoReview`; all four default to `false`. Enabling Auto-review permits bounded approval context, tool arguments, working directory, and the planned action to be sent to `chatgpt.com`; failures return to human approval. Enabling image generation uses the image generation capability included with the current GPT subscription and saves results as DSH attachments. Enabling search registers the provider and selects it while the capability remains enabled; disabling restores the previous provider before unregistering Codex Search. Setting `agent-default-model` to `openai-codex` remains a separate explicit change.

Apply only requested choices and preserve unrelated keys:

```yaml
- id: llm-openai-codex
  config:
    enableSearch: true
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

Before updating, repeat the exact-version selection above. Use `@alpha` only after verifying that the version it currently resolves to is compatible with the installed DSH; otherwise pin the selected version in the update command.

```sh
dsh plugin --profile web update dsh-codex-connect@alpha
dsh plugin --profile web remove dsh-codex-connect
```

Use an exact npm version when a reproducible update is required; use a GitHub tag only as the npm-unavailable fallback.

Removal of the package and removal of its separate OAuth file are different actions. Run `dsh plugin --profile web exec dsh-codex-connect logout` only with explicit credential-deletion authorization.

## Completion report

Report the profile, installed version, effective default model, effective search route, enabled optional capabilities, signed-in/signed-out state only if checked, and Web client detection. Never report OAuth URLs, codes, token timestamps, account ids, or auth-file contents.
