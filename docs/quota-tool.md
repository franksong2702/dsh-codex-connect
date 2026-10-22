# Model quota observation

`codex_connect_quota` lets a model inspect the shared Codex allowance without issuing a model request. It is disabled by default. This source capability requires a package containing it; older installed releases do not gain it automatically.

## Enable explicitly

Add the following inside the existing Codex Connect plugin row's `config` in your profile composition, then reload the plugin through the Host:

```yaml
enableQuotaTool: true
```

Omit the key or set it to `false` and reload to remove the tool. There is no custom settings-card toggle. Installation does not rewrite existing profiles or install a skill. Normal Host permission and cancellation rules still apply. The tool accepts only `{}`; it cannot select accounts/models or force a refresh.

## Read the result

An illustrative successful result is:

```json
{"status":"available","updatedAt":1792674000000,"windows":[{"remainingPercent":25,"windowSeconds":18000,"resetAt":1792680000}]}
```

| Field | Meaning |
| --- | --- |
| `status` | `available`: common windows were observed; `unknown`: no usable observation; `stale`: an observation expired or was invalidated. |
| `updatedAt` | Local successful-response observation time, Unix **milliseconds**, preserved on cache hits. Omitted when no reliable time is available. This is not the upstream data-generation time. |
| `windows` | Shared `codex` windows only. Empty for `unknown` and `stale`; an empty list is not zero or unlimited allowance. |
| `remainingPercent` | Observed percentage remaining, including a real `0` when reported. Not a token count, precise task budget or guarantee that a task can finish. |
| `windowSeconds` | Server-reported window duration in seconds. |
| `resetAt` | Optional server-reported reset time, Unix **seconds**. Omitted when unavailable. A reset time does not guarantee restored access. |

Separately metered models/features, spend limits, prepaid balances, account identifiers, labels, credentials, raw upstream responses and error details are excluded. Shared quota can coexist with a separate model limit or service restriction, so `available` does not establish model entitlement or sufficient capacity.

## Freshness, isolation and failure

Each call uses the account captured by existing authentication at call start. A concurrent account switch affects later calls; an in-flight result still describes the captured account. Conversations are not account-bound. Calls expose no account selector or identifier, so do not compare results across account changes as if they were one history.

The tool shares the existing bounded cache keyed by account and credential fingerprint, coalesces concurrent reads, and preserves its failure cooldowns. With Reserve disabled, successful observations are cached for 60 seconds with no background poller. An observation at least 60 seconds old, a window whose supplied reset time has passed, or revoked snapshot authority produces `stale` with no percentages. A failed refresh removes the old usable snapshot and returns `unknown`; it does not relabel old quota as fresh. When the separate Reserve option is already enabled, its existing adaptive cache/polling policy still applies; this tool does not enable it.

Quota GETs use the existing proxy, bounded response parsing, 15-second request deadline and shared backend governor. Transient errors retain the existing jittered exponential cooldown (starting at 60 seconds, capped at 15 minutes); a longer `Retry-After` takes precedence. Reauthorization and non-retryable client failures require existing cache invalidation or renewed credentials. Repeated calls cannot bypass those cooldowns. Caller cancellation detaches the tool wait without cancelling a shared surviving consumer; plugin disposal cancels shared work.

Call at a resource checkpoint requested by the user or required by an already authorized workflow, rather than before every step. On `unknown`/`stale`, do not assume sufficient or exhausted quota or loop to force freshness. If quota actually blocks required work, preserve the user's goal and quality bar, report the blocker and incomplete validation, and leave a resumable checkpoint where appropriate. Do not skip tests, security checks or required work, silently lower quality, switch models/accounts or create schedules because of a percentage. Any such action needs its own authority.

An optional [quota-awareness skill example](skills/codex-quota-awareness/SKILL.md) can be copied deliberately into the user's Host-supported skills location or adapted into an authorized automation's instructions. It is documentation, not automatically registered repository guidance. No scheduler, automatic recovery or frozen Adaptive Task activation is included.

Verification uses temporary synthetic accounts and mocked upstream responses. It does not establish live-account behavior, Desktop native acceptance or quota accuracy at the service.
