---
name: codex-quota-awareness
description: Use when the user asks for Codex quota, or an already authorized workflow explicitly requires a quota checkpoint.
---

Call `codex_connect_quota` with `{}` once at the requested checkpoint if the tool is available. If absent, report that quota observation is unavailable; do not enable configuration, read credential files or substitute CLI sign-in status for quota.

For `available`, use shared-window percentages only as a resource observation. They exclude separately metered model limits and are not exact task budgets or a completion guarantee. `updatedAt` is local fetch time in milliseconds; `resetAt`, when present, is in seconds. Do not merge observations across account changes.

For `unknown` or `stale`, report uncertainty. Do not infer zero/full allowance or repeatedly call to bypass cache/cooldowns. Query again only at a later authorized checkpoint or the user's request.

Preserve the user's requested outcome, quality, tests, security checks and Host permissions. If resource limits block completion, report exactly what remains and retain an appropriate resumable checkpoint. Do not claim unperformed validation. Quota does not authorize lowering requirements, skipping checks, switching models/accounts, scheduling work or activating Adaptive Task.
