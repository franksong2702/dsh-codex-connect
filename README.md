# Codex Connect

[![npm version](https://img.shields.io/npm/v/dsh-codex-connect/alpha?label=npm%20alpha&color=cb3837)](https://www.npmjs.com/package/dsh-codex-connect)

English | [中文](docs/README.zh.md)

Connect your ChatGPT subscription to DeepSeek Harness with OAuth, optional GPT Image generation, user-controlled defaults, Harness-native approvals, diagnostics, and reliable session recovery.

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/en/hero.jpg" alt="Codex Connect — ChatGPT OAuth for DeepSeek Harness" width="100%">
</p>

Codex Connect adds ChatGPT OAuth and the `openai-codex` model provider to DeepSeek Harness. The selected model still runs inside the normal Harness agent loop, so Harness continues to own tools, permissions, approval prompts, attachments, session persistence, compaction, and recovery.

The plugin is additive: installing it does not replace the default model or global search provider. Search, `view_image`, GPT Image generation, and Auto-review are all opt-in. It does not turn a ChatGPT subscription into an OpenAI Platform API key.

## Highlights

- Sign in with ChatGPT from **Settings → Models**, manage up to 16 locally stored accounts, and choose the account used by subsequent requests.
- Discover the installed upstream Codex catalog. If that catalog does not yet include `gpt-6-astra`, Codex Connect supplies compatible metadata; the upstream definition wins as soon as it exists.
- Show conversation-scoped Fast Mode and server-reported `5h` and `7d` quota windows for GPT Codex conversations.
- Compare the installed DSH/plugin pair with the public compatibility record and show update guidance without running an upgrade.
- Optionally add Codex search, secure local or public-image viewing, GPT Image generation, and Codex Auto-review.
- Diagnose the installation without printing credentials or starting OAuth.

Model discovery is not an entitlement check. OpenAI evaluates the selected account on every request; an unavailable model fails explicitly and Codex Connect does not silently switch models or accounts.

## Quick start

The command below is the verified public pairing for DSH `0.1.2-rc.1`. Check `dsh --version` and use [INSTALL.md](INSTALL.md) if you run another DSH version. `alpha` is a moving npm tag, not a compatibility guarantee. This README describes current `main`; changes merged after the displayed package version remain source-only until the next Alpha release.

### 1. Install one exact version

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.27
```

Replace `web` with your existing profile name. From a DeepSeek Harness source checkout, prefix commands with `pnpm`. Installation must leave the profile's default model and search route unchanged.

### 2. Start Harness and authorize

```sh
dsh web
```

Open **Settings → Models → Openai-Codex** and select **Authorize**. Complete the approval yourself in the browser. If an embedded window is blocked, use **Open ChatGPT sign-in page** to continue in the system browser.

Never paste an authorization URL, code, token, or account identifier into an issue, log, chat, or configuration file.

### 3. Select a model

Choose an `openai-codex` model in the normal Harness model picker. Model names remain canonical in every UI language. To shorten the catalog, use **More settings → Models**; hiding a model affects discovery only and does not disable exact-id routing.

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/en/model-selector.jpg" alt="OpenAI Codex models in the DeepSeek Harness model picker" width="360">
</p>

### 4. Verify the installation

```sh
dsh --profile web --dump-config
dsh plugin --profile web exec dsh-codex-connect status --json
dsh plugin --profile web exec dsh-codex-connect doctor --json
```

The effective configuration should contain exactly one `llm-openai-codex` row. A signed-in `status --json` exits `0`; a signed-out status exits `1` without starting OAuth. `doctor --json` prints one secret-free diagnostic document.

## Accounts, models, and quota

The Models card and the Plugin configuration page share the same account state. **Manage accounts** can add, select, or remove accounts. Browser responses expose only plugin-generated account keys and masked labels, never OAuth tokens or raw OpenAI account ids.

- Adding an account leaves the current account usable while authorization is pending.
- Cancelling or timing out a new authorization preserves every existing account. Pending authorization expires after 10 minutes by default; `oauthTimeoutMs` accepts 1,000–1,800,000 milliseconds and is applied when the plugin loads.
- Switching accounts affects subsequent requests. A request captures its account before resolving authentication, so a concurrent switch cannot mix credentials.
- Removing the active account requires selecting a replacement when another account remains. Removing the last account signs out; **Sign out all accounts** deletes all locally stored Codex credentials.
- Codex Connect does not rotate accounts automatically or fail over when a request is rejected.

For GPT Codex conversations, the Composer shows two session controls:

- **Fast Mode** requests the faster `1.5×` mode for that conversation only. It is off by default and does not change the model.
- **Quota bars** show only the `5h` and `7d` windows returned by the server, with the exact remaining percentage and reset time. `gpt-5.3-codex-spark` uses its separate Spark bucket. Codex Connect never invents missing windows or suppresses returned windows based on a plan name.

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/composer-capabilities.jpg" alt="Fast Mode and quota controls in the DeepSeek Harness Composer" width="820">
</p>

## Optional capabilities

Fresh installations register the model provider and leave every additional capability disabled:

```yaml
- id: llm-openai-codex
  config:
    enableProxy: false
    enableSearch: false
    enableImageTool: false
    enableImageGeneration: false
    enableAutoReview: false
```

Edit these options under **Settings → Plugins → Plugin configuration → Codex Connect** or **Settings → Models → Openai-Codex → More settings**. Changes are staged until **Save changes**. Most settings affect only this plugin; enabling Codex Search also selects it as the active profile-wide search route.

### Proxy

Direct connection is the default. An enabled credential-free HTTP(S) proxy applies only to this plugin's model, OAuth, refresh, quota, search, image, and Auto-review traffic. Detection checks standard proxy environment variables and documented loopback candidates without making a model call, consuming quota, or saving settings. A failed proxy request never silently retries through a direct connection. Loading Codex Connect does not replace Node's environment-proxy dispatcher, so unrelated Harness requests continue using the process's existing proxy policy.

### Search and image tools

- `enableSearch: true` registers Codex as an available search provider and selects it for profile-wide searches. Disabling it unregisters the provider and restores the route that was active before Codex Search was enabled.
- `enableImageTool: true` registers `view_image` on vision-capable models. Remote reads accept credential-free public HTTP(S) only and revalidate DNS and redirects.
- `enableImageGeneration: true` registers prompt-only GPT Image generation. Use the image generation capability included with your current GPT subscription. Availability, dimensions, and quota remain account- and service-controlled.

Generated originals are stored under `$DSH_HOME/dsh-codex-connect/images/v1`; the conversation receives a separate DSH attachment preview. The result card reports dimensions and file sizes and can download either representation. Originals are owner-only, integrity-checked, and available only to the creating session and forks that inherited the result. Disabling or uninstalling the plugin does not delete those files automatically.

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/en/image-generation.png" alt="GPT Image result with prompt, download actions, and image details" width="780">
</p>

### Auto-review

`enableAutoReview: true` lets the Codex reviewer assess eligible Harness approval requests after DSH policy has determined that approval is required. First enablement requires confirmation because bounded recent approval context, tool arguments, working directory, and the planned action are sent to `chatgpt.com`. Hidden reasoning and stored credentials are excluded. Only a complete structured allow result authorizes one execution; ambiguity, malformed output, transport failure, and timeout return to human approval. See [Auto-review](docs/auto-review.md) for the full decision and retry rules.

## Routing and configuration

Installing Codex Connect does not select a default model or search provider. Enabling Codex Search selects it while the capability remains enabled; select a default model separately only when intended. The equivalent configuration is:

```yaml
- id: agent-default-model
  config:
    provider: openai-codex
    model: gpt-5.6-sol

- id: llm-openai-codex
  config:
    enableSearch: true
    searchMode: live
    searchContextSize: medium

```

The main plugin options are:

| Field | Default | Meaning |
|---|---:|---|
| `models` | full catalog | Visible Codex model ids; an empty array hides all entries |
| `enableProxy` | `false` | Use `proxyUrl` for Codex Connect traffic |
| `proxyUrl` | `http://127.0.0.1:7890` | Credential-free HTTP(S) proxy origin; inactive until enabled |
| `contextWindowOverrides` | none | Per-model client context-budget overrides |
| `enableSearch` | `false` | Register Codex search and select it when the setting is saved |
| `enableImageTool` | `false` | Register `view_image` |
| `enableImageGeneration` | `false` | Register GPT Image generation |
| `enableAutoReview` | `false` | Review eligible approval requests with Codex |
| `searchModel` | `gpt-5.6-sol` | Model used by standalone search |
| `searchMode` | `cached` | `cached`, `indexed`, or `live` |
| `searchContextSize` | `medium` | `low`, `medium`, or `high` |
| `searchMaxOutputTokens` | `10000` | Positive integer output budget for search |

`contextWindowOverrides` changes the client budget, not OpenAI's server capacity. Unknown model ids and values above the plugin's documented configuration ceiling fail explicitly. Use `null` for the whole field to mask inherited overrides, or `null` for one model to restore its catalog default while preserving other entries. Leave room for output and protocol overhead, and treat larger values as deployment-specific experiments rather than entitlement evidence. [Alpha design](docs/design.md) documents the ownership and persistence rules.

## Diagnostics and recovery

### Capability probes

The local report performs no network request. Adding `--probe` sends one fixed short request and may consume quota:

```sh
dsh plugin --profile web exec dsh-codex-connect capabilities --model gpt-5.6-sol --json
dsh plugin --profile web exec dsh-codex-connect capabilities --model gpt-5.6-sol --probe --json
dsh plugin --profile web exec dsh-codex-connect auto-review-probe --json
```

Probes use a direct connection unless `--proxy <http(s)-origin>` is supplied. `--timeout-ms <1..60000>` overrides the 30-second deadline. They do not follow redirects or retry, cap responses at 64 KiB, and do not refresh credentials. Results label each check `supported`, `rejected`, or `unknown`; a catalog entry alone never proves entitlement. Exit `0` means the command's required checks were supported, `1` means at least one was rejected, and `2` means evidence was unknown or the invocation was invalid. Reports omit credentials, account ids, paths, proxy origins, response ids, headers, and generated text.

### Remote browser authorization

OAuth routes accept loopback browsers by default. If DSH runs on another device in a trusted network, add the exact origin from the browser address bar on the DSH host:

```sh
dsh plugin --profile web exec dsh-codex-connect trust-origin http://192.168.1.20:3080
dsh plugin --profile web exec dsh-codex-connect trusted-origins
dsh plugin --profile web exec dsh-codex-connect untrust-origin http://192.168.1.20:3080
```

Include the scheme and port, never a path, query, or fragment. Do not expose the OAuth route to the public Internet; use an SSH tunnel when the network is not trusted. The Web client displays these commands but never edits the allowlist.

### Migration and conflicts

If startup reports an `openai-codex` collision, inspect the effective configuration and remove only the confirmed legacy `dsh-codex` bundle or manual provider row. Do not delete credentials or unrelated providers. See [MIGRATION.md](MIGRATION.md) for package migration and repair of Alpha 4.10 search histories.

OAuth is stored separately at `$DSH_HOME/.openai-codex-auth.json` (`~/.dsh` by default); `~/.codex/auth.json` is never copied or modified. Removing the package does not remove OAuth state. Run `logout` only when deleting credentials is intentional.

## Compatibility and security

- [verified-compatibility.json](verified-compatibility.json) is the authority for exact DSH/plugin pairs. Follow [INSTALL.md](INSTALL.md); do not infer future compatibility from a current row.
- A missing compatibility record means the pair is unverified, not known to be broken. Update notices explain the recorded path but never install anything automatically.
- ChatGPT plan eligibility, model access, quotas, backend context capacity, and service behavior are controlled by OpenAI and may change.
- Harness remains responsible for shell, filesystem, skills, MCP, subagents, approvals, permissions, attachments, session persistence, compaction, and recovery.
- Install, build, tests, `doctor`, and package validation require no real OAuth operation.
- This is a community Alpha. It is not affiliated with or endorsed by OpenAI, ChatGPT, Codex, DeepSeek, or DeepSeek Harness.

## Project documentation

- [Installation and upgrades](INSTALL.md)
- [Migration from `dsh-codex`](MIGRATION.md)
- [Architecture and security details](docs/design.md)
- [Auto-review behavior](docs/auto-review.md)
- [Alpha release runbook](RELEASING.md)

## Development

```sh
pnpm install --frozen-lockfile
pnpm run check
```

## License and acknowledgements

Copyright 2026 Frank Song for Codex Connect modifications and additional work. This project contains software derived from [Yan-Zero/dsh-codex](https://github.com/Yan-Zero/dsh-codex); Copyright 2026 Yan-Zero is retained for upstream material. Both are distributed under Apache-2.0; see [NOTICE](NOTICE).
