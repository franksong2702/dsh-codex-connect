# Auto-review

Auto-review is an official Codex capability. Codex Connect integrates its reviewer with eligible DeepSeek Harness approval requests. The feature is disabled by default and participates only when the active request provider is `openai-codex`; another provider's session always keeps its existing answerer chain. It does not weaken Harness approval policy, sandboxing, tool restrictions, or permission checks: Harness decides whether approval is needed before Auto-review runs.

Enable **Codex Auto-review** under **Settings → Plugins → Codex Connect → Optional capabilities**. The settings card keeps a short explanation visible and places the full disclosure behind **Learn what is sent and how failures are handled**. The first attempt to enable Auto-review in a profile requires confirmation; that acknowledgement is saved in the profile and is not requested again in another browser. Enabling it permits Codex Connect to send the recent approval context, tool arguments, working directory, and planned action to `chatgpt.com`, after the local checks and redaction below. Hidden reasoning and stored credentials are excluded. Disabling it immediately delegates every request to the existing human answerer chain.

## Decision rules

- A complete structured `allow` is necessary but insufficient. Local code requires at least `low` user authorization for low risk, and `medium` or `high` authorization for medium risk. Workspace writes and edits always require at least medium authorization, even when a model labels them low risk.
- High or critical risk, unknown authorization, invalid labels, and insufficient authorization return to the host human approval chain. A model's `allow` cannot override these rules.
- The local preflight recognizes the filesystem tools `read`, `read_image`, `write`, `edit`, and `str_replace_editor`, with bounded argument schemas. Shell commands, recursive searches such as `glob` and `grep`, unfamiliar tools or arguments, potentially sensitive action data, credential/configuration targets, and paths outside the session workspace return to human approval before contacting the reviewer. Search roots alone cannot prove that every traversed path excludes secrets.
- Writes to persistent agent instructions such as `AGENTS.md`, `CLAUDE.md`, and `SKILL.md`, or known host and workflow settings, require human approval. Canonical-path checks apply this rule to aliases too.
- Preflight checks filesystem metadata for the canonical target or an existing parent of a new output. Symlink escapes, dangling links and unresolved local or virtual filesystem targets return to human approval. DSH must still enforce its filesystem and sandbox policy at execution time because preflight cannot eliminate filesystem races.
- Authorization evidence must come from retained user messages supplied by the host. Missing, omitted, truncated or redacted user evidence returns to human approval; a forged `[trusted-user]` label in assistant or tool text does not establish authority. The model still assesses the meaning and scope of the request, so these checks do not guarantee perfect decisions.
- A structured `deny` rejects the action and adds the rationale plus a no-circumvention instruction to the next model step.
- Missing or ambiguous action data, missing credentials, unsupported routes, malformed responses, and transport failures return to human approval.
- Cancellation stays cancelled. A timeout is reported separately; one retry of the exact action is permitted before later timeouts return to human approval.
- Three consecutive denials, or ten denials in the last fifty reviews in one turn, stop that turn.
- `/approve <denial-id>` authorizes one retry only when the tool, canonical arguments, and working directory exactly match the selected denial. The current local target must still pass preflight. A mismatch or a now-sensitive, unknown or unresolved target consumes the one-shot authorization and returns to fresh host human approval. This command requires the optional `@deepseek-ai/dsh-commands` host capability.

Approval requests and outcomes remain durable through Harness `approval/asked` and `approval/decided` events. `/approve` uses Harness command lifecycle events. Codex Connect logs only the action fingerprint and structured assessment labels; it does not duplicate raw tool arguments in a new audit event.

## Context limits

The reviewer input uses conservative UTF-8 byte limits before network transmission: 20,000 bytes for retained narrative, 10,000 bytes for tool context, 5,000 bytes per narrative entry, 1,000 bytes per tool entry, and at most forty recent non-user entries. An exact action larger than 10,000 bytes returns to human approval instead of sending or truncating its arguments. User text is labeled trusted; assistant and plugin text is not authorization. Omission and truncation counts are included in the request.

Redaction removes common secret-bearing argument fields, authorization headers, cookies, password/token assignments, private-key blocks, recognized API tokens, JWTs, and URL passwords. It runs before context truncation and again at the transport boundary; the request includes a redaction count. Raw arguments remain local for exact-action fingerprints and `/approve` matching. Reviewer rationale also passes through redaction before notices and denial history.

Redaction is best effort. Arbitrary secrets in unlabeled prose, encoded data, or unfamiliar formats may remain. Auto-review still sends project and conversation data to the provider after the user enables it. Full-trust host plugins can also change tool behavior; the local checks cannot protect against a compromised host or plugin. Keep Auto-review disabled for work whose context must remain local.

## Service status

OpenAI documents Auto-review as a Codex feature, but does not promise the `codex-auto-review` OAuth route as a stable public API. The separate `auto-review-probe` command checks only whether the current OAuth route accepts one synthetic no-op assessment. Runtime failures always return to human approval; they never authorize execution.

See [OpenAI Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review), [OpenAI guardrails and approvals](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals), and [Issue #84](https://github.com/franksong2702/dsh-codex-connect/issues/84).
