# Installation Runbook for CLI Agents

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

If your exact DSH version is unknown or not listed, stop and verify the combination before installing. Do not blindly install `dsh-codex-connect@alpha`: `alpha` is a moving tag, not a compatibility guarantee. Do not infer support for newer DSH versions from these rows.

Alpha 4.21's verified contract is DSH plugin API packages `0.1.1-rc.2`, `@earendil-works/pi-ai` `0.82.1`, and Node.js `^22.19.0 || >=24.0.0`. It uses the rc.2 keyed Plugin configuration slot. Staying on DSH `0.1.0-rc.7` means selecting Alpha 4.14, not installing Alpha 4.21 into that older API. Upgrading DSH is a separate decision: upgrade the DSH API packages and pi-ai together, then rerun `dsh-codex-connect doctor --json` and `pnpm --silent run check:compatibility` for the selected combination.

These choices reflect the repository's existing verification record, not a new installation or runtime probe. This guidance does not fix upstream DSH compatibility or resolve [Issue #64](https://github.com/franksong2702/dsh-codex-connect/issues/64).

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

   If npm is unavailable after its matching GitHub prerelease is created, use `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.21'` only for the DSH `0.1.1-rc.2` combination.

3. Run `dsh --profile web --dump-config` and require exactly one `llm-openai-codex` row loading `dsh-codex-connect`.
4. Confirm the effective `agent-default-model` and `web.searchProvider` values are unchanged from before installation.
5. Run secret-free diagnostics:

   ```sh
   dsh plugin --profile web exec dsh-codex-connect doctor
   ```

6. If the user explicitly requests login, open **Settings → Plugins → Plugin configuration → Codex Connect**, or check `status` and then use `login` or `login --device-code`. OAuth approval belongs to the user.

### Remote browser access

The default Web OAuth boundary is loopback-only. When DSH runs on one device and you open it from another device on a trusted network through an IP address or domain, run the following on the device that runs DSH with the exact origin from the browser address bar:

```sh
dsh plugin --profile web exec dsh-codex-connect trust-origin http://192.168.1.20:3080
dsh plugin --profile web exec dsh-codex-connect trusted-origins
```

The value is a full `http://` or `https://` origin including its port, not a bare device IP and not a path/query/fragment. Use `untrust-origin <origin>` to remove it. Restrict this to a trusted network and never expose the route publicly; use an SSH tunnel when that is safer. The Web client does not edit this list.

## Optional configuration

Use **Settings → Plugins → Plugin configuration → Codex Connect** for live, staged Save/Discard edits. The same card controls `enableSearch`, `enableImageTool`, and `enableImageGeneration`; all three default to `false`. Enabling image generation uses the image generation capability included with the current GPT subscription and saves results as DSH attachments. Enabling search registers a provider but does not select it; selecting `web.searchProvider: openai-codex` is a second explicit profile change. Setting `agent-default-model` to `openai-codex` is also a separate explicit change.

Apply only requested choices and preserve unrelated keys:

```yaml
- id: llm-openai-codex
  config:
    enableSearch: true
    enableImageTool: false
    enableImageGeneration: false
    searchMode: live

- id: web
  config:
    searchProvider: openai-codex

- id: agent-default-model
  config:
    provider: openai-codex
    model: gpt-5.6-sol
```

Do not add the last two rows unless the user separately requested those routing changes.

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
