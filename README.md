# Codex Connect

[![npm version](https://img.shields.io/npm/v/dsh-codex-connect/alpha?label=npm%20alpha&color=cb3837)](https://www.npmjs.com/package/dsh-codex-connect)

English | [中文](docs/README.zh.md)

Connect your ChatGPT subscription to DeepSeek Harness with OAuth, optional GPT Image generation, user-controlled defaults, Harness-native approvals, diagnostics, and reliable session recovery.

Community Alpha — not affiliated with or endorsed by OpenAI, ChatGPT, Codex, DeepSeek, or DeepSeek Harness.

Codex Connect adds the `openai-codex` model provider to the normal Harness agent loop. Harness continues to manage tools, permissions, approvals, attachments, session persistence, compaction, and recovery. Installing the plugin does not change your default model or search route, and it does not turn a ChatGPT subscription into an OpenAI Platform API key.

## Quick start

This guide describes the published pairing below. Check `dsh --version` first and use `doctor --json` for local diagnostics; the CLI version alone does not prove which model-runtime packages are installed, and missing metadata is reported as unknown. For other versions, use [Installation and upgrades](INSTALL.md). A moving npm tag such as `alpha` is not a compatibility guarantee.

| Requirement | Verified pairing |
|---|---|
| Codex Connect | `0.1.0-alpha.4.46` |
| DeepSeek Harness | `0.1.7-rc.1` |
| Node.js | `^22.19.0 \|\| >=24.0.0` |
| Account | ChatGPT OAuth with access to the requested Codex model; availability is decided by OpenAI |

As of 2026-09-24, npm `alpha` points to 4.46 while `latest` remains on 4.45. Use the exact version below for this DSH pairing; publishing an Alpha and changing the default installation channel are separate actions.

On stock DSH `0.1.7-rc.1`, ordinary Composer works, but Task controls remain paused: activation is rejected and fresh Sessions do not show them. Migration of earlier Task grants across a Harness upgrade is not verified. Older supported pairings and their task behavior are documented in [Installation and upgrades](INSTALL.md).

### 1. Install

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.46
dsh web
```

Replace `web` with your existing profile name; use that same profile when starting Harness. From a DSH source checkout, prefix commands with `pnpm`. See [INSTALL.md](INSTALL.md) for other profiles and installation checks.

### 2. Authorize and select a model

Open **Settings → Models → Openai-Codex → Authorize**, then complete approval yourself in the browser. If an embedded window is blocked, select **Open ChatGPT sign-in page**. Choose an `openai-codex` model in the normal Harness model picker.

Never paste an authorization URL, code, token, or account identifier into an issue, log, chat, or configuration file. For a browser on another device, the optional manual callback form can complete the pending login without forwarding the localhost callback port; follow [Remote browser authorization](docs/reference.md#remote-browser-authorization).

### 3. Check the installation

```sh
dsh plugin --profile web exec dsh-codex-connect status --json
dsh plugin --profile web exec dsh-codex-connect doctor --json
```

`status --json` exits `0` when signed in and `1` when signed out, without starting OAuth. `doctor --json` reports local installation diagnostics without a network request or raw credentials. A passing diagnostic is not proof of model access; verify that with an actual request.

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/en/hero.jpg" alt="Codex Connect — ChatGPT OAuth for DeepSeek Harness" width="100%">
</p>

## Core capabilities

- **Accounts:** save up to 16 accounts on the DSH host and manually select the active account for subsequent requests. Account selection is not a per-session binding. Requests keep their captured account; the plugin does not rotate accounts or silently fail over.
- **Models and Astra support:** the currently verified DSH and plugin combination supports `gpt-6-astra`. The plugin supplies its missing model definition with Low, Medium, High, Xhigh, and Max reasoning levels; Default preserves the provider default. Saved Off/Minimal selections require an [explicit update](MIGRATION.md#astra-reasoning-selections). When the installed dependency catalog includes Astra, the plugin preserves its native metadata while retaining these five calibrated reasoning choices. A model appearing in the list does not mean the current account has permission to use it; overall compatibility with new dependency versions still requires separate verification.
- **Fast Mode:** request priority service for one conversation, off by default. Optional, separate profile settings can enable it for newly started top-level or subagent conversations without changing existing conversations. Actual speed and quota consumption depend on the service; no fixed speed multiplier is guaranteed.
- **Quota:** show the server-returned `5h` and `7d` windows and reset times, normally refreshed every 60 seconds while signed in and the tab is visible; failures back off. Missing windows are not invented; Spark uses its separate quota bucket.
- **Plugin updates:** check for newer Codex Connect releases without installing anything or recommending changes to DSH. Host compatibility is available through explicit local diagnostics.

<p align="center">
  <img src="https://raw.githubusercontent.com/franksong2702/dsh-codex-connect/main/docs/assets/composer-capabilities.jpg" alt="Fast Mode and quota controls in the DeepSeek Harness Composer" width="820">
</p>

## Optional capabilities

**Earlier Alpha 4.40/4.41 pairings:** task-level model control is off by default. After explicit task authorization, GPT-5.6 Sol/Medium starts the task, and the active model may continue, change effort, or hand off the main task within the granted scope. The task shares one request ledger and budget; stopping, manual takeover, and restart recovery retain the grant boundary. Phase 2 read-only delegation requires separate consent and does not grant workers write access. Stock DSH `0.1.7-rc.1` with Alpha 4.43 keeps these Task controls paused; do not infer they are available from an older pairing. See [Phase 1](docs/experiments/adaptive-task-phase1.md) and [Phase 2 consent](docs/experiments/adaptive-task-phase2-consent.md).

Alpha 4.40 also supplies `gpt-6-sol` and `gpt-6-luna` when older provider catalogs omit them, retaining native metadata when present. Both expose Low through Max (including Xhigh); Default omits an explicit effort. Codex Sol's Ultra orchestration mode is not implemented. New task grants can explicitly include these models, but existing grants, GPT-5.6 Sol/Medium startup and Luna Reserve remain unchanged. A catalog entry is not proof of account access. See [compatibility scope and validation](docs/experiments/gpt6-sol-luna-compatibility.md).

All options below are off on a fresh installation. Edit them in **Settings → Plugins → Plugin configuration → Codex Connect** or **Settings → Models → Openai-Codex → More settings**, then select **Save changes**. A conflict or failed save preserves your draft.

| Capability | Enable with | Important behavior |
|---|---|---|
| Proxy | `enableProxy` | Credential-free HTTP(S), scoped to this plugin's traffic, including compressed OAuth and quota responses. Unrelated Fetch calls retain the host's original transport. A failed proxy request does not silently retry directly. |
| Codex Search | `enableSearch` | Selects Codex for the entire profile's search route; disabling restores the previously active route. |
| Luna Reserve | `enableReserveFallback` | Uses the hidden Reserve route only when the backend explicitly authorizes it for the captured account; never changes global defaults or retries a generic `429`. |
| Image viewing | `enableImageTool` | Adds `view_image` to vision-capable models for local files and validated public HTTP(S) images. |
| GPT Image generation | `enableImageGeneration` | Prompt-only generation; availability, dimensions, and quota remain account- and service-controlled. |
| Auto-review | `enableAutoReview` | Sends bounded approval context, tool arguments, working directory, and the planned action to `chatgpt.com`, with confirmation on first enablement. Failures return to human approval. |

**Published experiment:** Alpha 4.35 includes Luna Reserve fallback, disabled by default. Real-account Reserve entry and recovery remain unverified; Alpha 4.34 does not include this feature.

With `enableReserveFallback: true`, the account UI and agent routing share one identity-bound quota state. Background refresh follows the returned quota windows while recently in use; fresh state is reused across agent steps. Ordinary quota reads also share the cache, even with Reserve disabled. The plugin enters `gpt-reserve` only with complete, non-FedRAMP account/user identity and backend Luna Reserve authorization, then restores the session's previous model and reasoning effort after confirmed ordinary-usage recovery. Reserve has its own allowance, is hidden from the model picker, and is not unlimited. The backend decides eligibility; reset times alone do not authorize a switch. This version supports known `gpt-5.6-luna` metadata only. See [Luna Reserve fallback](docs/reference.md#luna-reserve-fallback) for refresh, identity, and verification limits.

Use the image generation capability included with your current GPT subscription. Successful images appear below the conversation answer without opening its processing details; the original tool card remains available there. Generated originals are stored separately from attachment previews; disabling the capability or uninstalling the plugin does not delete them. See [Configuration and recovery](docs/reference.md#search-and-image-tools) for storage and access rules.

Auto-review operates after Harness policy requires approval; it does not bypass that policy. See [Auto-review behavior](docs/auto-review.md) before enabling it.

## FAQ and important limits

### Where are my credentials stored?

OAuth credentials are stored on the host running DSH and used there to authenticate and send requests to OpenAI. Normal browser account responses return account summaries, not raw tokens. A remote browser device is not necessarily the DSH host.

### Does uninstalling sign me out?

No. OAuth state is stored separately at `$DSH_HOME/.openai-codex-auth.json` (`~/.dsh` by default). The plugin does not copy or modify `~/.codex/auth.json`. Use **Sign out all accounts**, or `logout` before uninstalling, only when deleting credentials is intentional.

### Can I switch accounts for different conversations?

Subsequent Codex requests use the selected active account; conversations do not bind their own accounts. Fast Mode is conversation-scoped. Cancelling a new authorization preserves existing accounts; an explicit revoked-refresh response asks for reauthorization, while temporary failures preserve the account for retry. See [Account behavior](docs/reference.md#accounts-models-and-quota).

### Why does a listed model fail?

Model HTTP/SSE failures include bounded, request-local diagnostic metadata after the existing error message. An `overloaded` message alone does not establish an account block. See [persistent-error diagnostics](docs/experiments/issue-219-diagnostics.md) for scope and reproduction.

Account permissions, plugin/host compatibility, and network conditions all affect availability. Access on another client does not guarantee this integration will work. OpenAI controls model access, quota, context capacity, and service behavior; catalog entries are not proof of entitlement.

### Does changing client headers prevent persistent authorization failures?

No such guarantee is established. Codex Connect is a third-party integration; it does not impersonate Codex Desktop or fabricate installation/attestation headers. The pi-ai model/OAuth route and auxiliary routes currently identify themselves differently. OpenAI's [App Server documentation](https://developers.openai.com/codex/app-server/) asks integrations to identify their own client with `clientInfo`; it does not establish acceptance rules for this plugin's direct backend calls. An `overloaded` message is not proof of a block. Capture the bounded error metadata and compare successful and failed windows before attributing the cause; share request IDs privately, never tokens or full session archives.

### Can I keep the original `dsh-codex` plugin installed?

Not in the same effective configuration: both register `openai-codex`. Follow [MIGRATION.md](MIGRATION.md); remove only the confirmed conflicting entry, not credentials or unrelated providers.

### What do diagnostics prove?

`doctor` is local. Capability and reviewer probes may make network requests and consume quota when their preconditions are met. `auto-review-probe` checks only the reviewer route and structured response, not the full Harness approval integration or execution of the reviewed action. Commands, limits, and exit codes are in the [diagnostics reference](docs/reference.md#capability-probes).

A missing entry in [verified-compatibility.json](verified-compatibility.json) means a DSH/plugin combination is unverified, not known to be broken. Do not infer support for newer hosts from an older pairing.

## Documentation and development

- [Installation and upgrades](INSTALL.md)
- [Configuration, diagnostics, and recovery](docs/reference.md)
- [Migration from `dsh-codex`](MIGRATION.md)
- [Architecture and security details](docs/design.md)
- [Auto-review behavior](docs/auto-review.md)
- [Release runbook](RELEASING.md), [Contributing](CONTRIBUTING.md), and [Security policy](SECURITY.md)

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:browser
pnpm run check:dsh-install
```

`check` covers static checks, unit tests, build, compatibility, and packaging. `lint:metadata` checks package and release rules; `lint:source` checks host and browser TypeScript for unhandled or misused promises, invalid awaits, duplicate cases, and unreachable code. Browser regression and isolated DSH installation are separate commands. These checks use no real OAuth authorization and do not replace real-account acceptance.

## License and acknowledgements

Copyright 2026 Frank Song for Codex Connect modifications and additional work. This project contains software derived from [Yan-Zero/dsh-codex](https://github.com/Yan-Zero/dsh-codex); Copyright 2026 Yan-Zero is retained for upstream material. Both are distributed under Apache-2.0; see [NOTICE](NOTICE).
