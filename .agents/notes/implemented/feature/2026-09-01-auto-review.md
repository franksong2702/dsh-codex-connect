# Agent Note: Host-owned Auto-review answerer

Status: implemented

## Problem

[Issue #84](https://github.com/franksong2702/dsh-codex-connect/issues/84) asks for Codex Auto-review behavior inside Codex Connect. The earlier [PR #88](https://github.com/franksong2702/dsh-codex-connect/pull/88) established only that the hidden reviewer route could return the expected structured fields. A capability probe cannot authorize a real Harness action or preserve approval, retry, denial, and audit semantics.

## Decision

Codex Connect installs a default-off answerer on the existing `approval/request` waterfall. The Harness approval policy still runs first. While disabled, the listener delegates without network access or state mutation. While enabled, it first requires the active request provider to be `openai-codex`, resolves the request to exactly one retained `tool/call`, constructs a bounded trust-labeled context, and calls the hidden reviewer with the stored ChatGPT OAuth route. Sessions using another provider always delegate.

Only a complete strict allow result returns `allowed-once`. Every local ambiguity and backend failure delegates to the next answerer. A denial returns `rejected`, injects its rationale and no-circumvention guidance, and contributes to the turn-local breaker. Timeout and cancellation remain distinct. The breaker matches the official three-consecutive and ten-of-fifty thresholds.

The one-shot human override is an optional `/approve` command. It retains a SHA-256 fingerprint of tool name, canonical JSON arguments, and working directory across the follow-up turn. The next approval request consumes the override whether it matches or not; only a match returns `allowed-once`. Recent denial metadata remains in memory and is bounded to ten records.

Harness already persists approval asks/outcomes and command lifecycle events. This plugin therefore does not introduce a second raw-argument audit event. Logs contain only the action fingerprint and structured assessment labels.

## Consequences

Enabling the setting is explicit authorization to send bounded approval context, tool arguments, working directory, and the planned action to `chatgpt.com`. Hidden reasoning and stored credentials are excluded. OpenAI does not promise the hidden route as a stable public API, so unavailability preserves human approval instead of stopping all work or allowing execution.

The command integration is optional because a profile can compose approval without `dsh-commands`. In that profile automatic allow/deny still works, while exact human retry remains available through the existing human approval path rather than `/approve`.
