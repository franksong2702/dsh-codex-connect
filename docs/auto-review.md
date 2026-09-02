# Auto-review

Auto-review is an official Codex capability. Codex Connect integrates its reviewer with eligible DeepSeek Harness approval requests. The feature is disabled by default and participates only when the active request provider is `openai-codex`; another provider's session always keeps its existing answerer chain. It does not weaken Harness approval policy, sandboxing, tool restrictions, or permission checks: Harness decides whether approval is needed before Auto-review runs.

Enable **Codex Auto-review** under **Settings → Plugins → Codex Connect → Optional capabilities**. The settings card keeps a short explanation visible and places the full disclosure behind **Learn what is sent and how failures are handled**. The first attempt to enable Auto-review in a profile requires confirmation; that acknowledgement is saved in the profile and is not requested again in another browser. Enabling it permits Codex Connect to send the recent approval context, tool arguments, working directory, and planned action to `chatgpt.com`. Hidden reasoning and stored credentials are excluded. Disabling it immediately delegates every request to the existing human answerer chain.

## Decision rules

- Only a complete structured `allow` result returns `allowed-once`.
- A structured `deny` rejects the action and adds the rationale plus a no-circumvention instruction to the next model step.
- Missing or ambiguous action data, missing credentials, unsupported routes, malformed responses, and transport failures return to human approval.
- Cancellation stays cancelled. A timeout is reported separately; one retry of the exact action is permitted before later timeouts return to human approval.
- Three consecutive denials, or ten denials in the last fifty reviews in one turn, stop that turn.
- `/approve <denial-id>` authorizes one retry only when the tool, canonical arguments, and working directory exactly match the selected denial. A mismatch consumes the one-shot authorization without allowing the action. This command requires the optional `@deepseek-ai/dsh-commands` host capability.

Approval requests and outcomes remain durable through Harness `approval/asked` and `approval/decided` events. `/approve` uses Harness command lifecycle events. Codex Connect logs only the action fingerprint and structured assessment labels; it does not duplicate raw tool arguments in a new audit event.

## Context limits

The reviewer input uses conservative UTF-8 byte limits before network transmission: 20,000 bytes for retained narrative, 10,000 bytes for tool context, 5,000 bytes per narrative entry, 1,000 bytes per tool entry, and at most forty recent non-user entries. User text is labeled trusted; assistant and plugin text is not authorization. Omission and truncation counts are included in the request.

## Service status

OpenAI documents Auto-review as a Codex feature, but does not promise the `codex-auto-review` OAuth route as a stable public API. The separate `auto-review-probe` command checks only whether the current OAuth route accepts one synthetic no-op assessment. Runtime failures always return to human approval; they never authorize execution.

See [OpenAI Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review), [OpenAI guardrails and approvals](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals), and [Issue #84](https://github.com/franksong2702/dsh-codex-connect/issues/84).
