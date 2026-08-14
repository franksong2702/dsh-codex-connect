# Codex Connect

[![npm version](https://img.shields.io/npm/v/dsh-codex-connect?label=npm&color=cb3837)](https://www.npmjs.com/package/dsh-codex-connect)

English | [中文](docs/README.zh.md)

Connect your ChatGPT subscription to DeepSeek Harness with OAuth, user-controlled defaults, Harness-native approvals, diagnostics, and reliable session recovery.

`dsh-codex-connect` adds the `openai-codex` model catalog and a separate ChatGPT OAuth login. Models run through Harness's normal LLM service, so streaming, tool calls, reasoning replay, compaction, filesystem controls, permission gates, and approval prompts remain Harness-owned. It does not turn a ChatGPT subscription into an OpenAI Platform API credential.

Installation is additive. The bundle does not replace the current default model or search route, and its standalone search provider and `view_image` tool are disabled until explicitly enabled.

## Install

```sh
dsh plugin --profile web add dsh-codex-connect@alpha
dsh web
```

To pin this release exactly, use `dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.4`. If npm is unavailable, use the GitHub tag fallback: `dsh plugin --profile web add 'github:franksong2702/dsh-codex-connect#v0.1.0-alpha.4.4'`. From a DeepSeek Harness source checkout, prefix commands with `pnpm`. For a local checkout, install `link:/absolute/path/to/dsh-codex-connect`.

Sign in from **Settings → Plugins → Plugin configuration → Codex Connect → Sign in with ChatGPT**, or use the CLI:

```sh
dsh plugin --profile web exec dsh-codex-connect login
dsh plugin --profile web exec dsh-codex-connect status
dsh plugin --profile web exec dsh-codex-connect doctor
```

The doctor command reads process and filesystem metadata only. It never opens the OAuth document or prints a token, authorization URL, authorization code, account id, or auth-file content.

## Explicit configuration

Open **Settings → Plugins → Plugin configuration → Codex Connect** to manage the ChatGPT account and optional capabilities in one card. Changes use Harness's revision-fenced settings store and apply live. **Save changes** affects only this plugin's capability section; it never selects a default model or global search route.

The installed bundle row remains the composition base and is intentionally inert beyond model-provider registration:

```yaml
- id: llm-openai-codex
  config:
    enableSearch: false
    enableImageTool: false
```

To make a Codex model the default for new agents, add or update the separate Harness row yourself:

```yaml
- id: agent-default-model
  config:
    provider: openai-codex
    model: gpt-5.6-sol
```

The card can enable Codex standalone search. Selecting it as the profile's global search provider remains a separate explicit choice:

```yaml
- id: llm-openai-codex
  config:
    enableSearch: true
    searchMode: live
    searchContextSize: medium

- id: web
  config:
    searchProvider: openai-codex
```

To add the image-loading tool, set `enableImageTool: true` on `llm-openai-codex`. Browser paste/drop remains a Harness attachment feature and does not depend on this tool.

| Field | Default | Values |
|---|---:|---|
| `enableSearch` | `false` | boolean |
| `enableImageTool` | `false` | boolean |
| `searchModel` | `gpt-5.6-sol` | Codex model id |
| `searchMode` | `cached` | `cached`, `indexed`, `live` |
| `searchContextSize` | `medium` | `low`, `medium`, `high` |
| `searchMaxOutputTokens` | `10000` | positive integer |

## Credentials, diagnostics, and conflicts

- OAuth is stored separately at `$DSH_HOME/.openai-codex-auth.json` (`~/.dsh` by default); `~/.codex/auth.json` is never copied or modified.
- The parent directory and file are created with owner-only permissions where supported. Writes are atomic, and refresh writes use a cross-process file lock.
- Status and diagnostics return only non-sensitive state. OAuth flow output is confined to an explicit `login` operation.
- Browser OAuth routes accept only loopback clients and loopback Host/Origin values; sign-in fails closed when no valid HTTPS authorization URL arrives within 30 seconds.
- A second adapter cannot own `openai-codex`. Startup fails with a focused hint when the legacy `dsh-codex` bundle or a manual provider row conflicts.
- Removing the package does not delete OAuth state. Run `logout` only when credential removal is intended.

## Compatibility and security boundary

- Alpha compatibility targets the current Harness `0.1.0-rc.5` main-line composition and compatible `0.1.0-rc.6` plugin APIs, Node.js `^22.19.0 || >=24.0.0`, and the pinned `@earendil-works/pi-ai` Codex provider.
- ChatGPT plan eligibility, model access, quotas, and backend behavior are controlled by OpenAI and may change.
- The Codex endpoint does not enforce the ordinary Responses `max_output_tokens` field. Harness compaction still works, but that summary cap cannot be imposed server-side on this route.
- Shell, filesystem, skills, MCP, subagents, approvals, permissions, attachments, session persistence, compaction, and recovery continue to come from the active Harness profile.
- Remote `view_image` URLs are limited to public HTTP(S) destinations. Every DNS result and redirect is checked, and the connection is pinned to the validated address so localhost, private networks, link-local services, and cloud metadata endpoints remain unreachable.
- No real OAuth operation is required for installation, build, tests, doctor, or package validation.

See [INSTALL.md](INSTALL.md) for the idempotent agent runbook, [RELEASING.md](RELEASING.md) for the Alpha release checklist, [MIGRATION.md](MIGRATION.md) for migration from `dsh-codex`, and [docs/design.md](docs/design.md) for architecture details.

## Development

```sh
pnpm install --frozen-lockfile
pnpm run check
```

## Legal / Acknowledgements

Copyright 2026 Frank Song for the modifications and additional work in Codex Connect. This project includes software derived from [Yan-Zero/dsh-codex](https://github.com/Yan-Zero/dsh-codex); Copyright 2026 Yan-Zero is retained for the upstream material. Both are distributed under Apache-2.0, with details in [NOTICE](NOTICE). This project is not affiliated with or endorsed by OpenAI, ChatGPT, Codex, DeepSeek, or DeepSeek Harness.

## License

Apache-2.0
