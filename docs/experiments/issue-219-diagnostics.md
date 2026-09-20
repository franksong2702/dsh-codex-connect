# Issue 219: persistent SSE failures and quota traffic

Implementation baseline: main commit e5772cd8a5c47f30b5ab14fe73d2901914348463 (alpha 4.37), 2026-09-20.
These changes are diagnostic and traffic-management fixes, not evidence that the reported authorization session was blocked or that an account-side problem has been resolved.

## Model request diagnostics

The adapter uses the provider's request-local fetch extension, not a global fetch patch or a modified pi-ai installation. It observes bounded complete SSE frames while forwarding the original bytes, response metadata, backpressure and cancellation. It does not retry or replay failed model turns.

Each HTTP attempt receives a fresh x-client-request-id. Session affinity and originator/User-Agent are unchanged. The final Harness error message receives a compact JSON diagnostic suffix only after Harness has classified the original error, so numeric request ids cannot change PI_AI_ERROR into AUTH/RATE_LIMIT. Concurrent turns do not share diagnostic state.

Fields are limited to HTTP status, locally generated attempt id, bounded server request ids, first SSE error event type, schema-shaped error code/type, and a finite HTTP Retry-After delay. Missing fields remain missing. Arbitrary event fields, full headers, tokens, account ids, generated content and raw payloads are not added to the suffix. A maximum 16 KiB decoded frame is observed; larger or malformed frames stop further SSE attribution for that response, preserving HTTP metadata without guessing at later frames; incomplete frames are not inferred. The original bytes sent to pi-ai are unchanged. Existing provider error text remains unchanged.

Coverage is the model adapter's HTTP/SSE route through a pi-ai version honoring the fetch extension. It does not add persisted history to doctor, infer blocked-vs-capacity from a message, change standalone Search/Image/Auto-review diagnostics, or instrument native compaction's separate direct fetch. WebSocket diagnostics are not claimed; the plugin's model profile uses SSE.

## Quota traffic

Ordinary quota reads now coalesce and cache even when Reserve is off. Cache keys bind the account and a hash of the exact access credential; no raw token is retained as a key. Renewed credentials do not inherit an old session's rejected snapshot. Configuration/account mutations and disposal still invalidate authority.

Successful ordinary snapshots last 60 seconds. Reserve retains its existing adaptive freshness requirements while in use, but its timer cannot renew its own activity lease. After two minutes without a foreground consumer it stops fetching. Expiry still revokes stale routing permits without a network request. Enabling Reserve remains explicit; none of these changes infer server authorization from elapsed time or a generic error.

Transient errors use 60/120/240/480/900-second backoff, positive jitter bounded to 10% (and a 900-second local ceiling), and any longer valid server Retry-After. A successful refresh resets the failure count. Authentication rejection and non-retryable 4xx failures latch for the current credential/state. Retry hints outside the timer range cannot become immediate timers.

The browser does not poll while hidden, does not overlap slow requests, and respects its existing cooldown when refocused. Both local network failures and server quotaError responses cause browser backoff. Foreground retry requests cannot bypass the backend's cached failure deadline. These caches are per plugin instance, not a cross-process rate limiter.

## Offline verification

Run from the working checkout:

~~~sh
pnpm exec vitest run tests/issue-219-diagnostics.spec.ts tests/issue-219-quota.client.spec.tsx tests/quota-state.spec.ts tests/openai-codex-quota-indicator.client.spec.tsx tests/usage.spec.ts tests/adapter.spec.ts tests/adapter-auth-boundary.spec.ts
pnpm run check
~~~

The targeted fixtures use synthetic credentials and mocked HTTP/SSE, including an actual pi-ai -> Harness adapter pass. They cover flat/nested/response.failed errors, request-id isolation, host classification, hooks, malformed/large/split frames, cancellation, visibility, ordinary-mode cache sharing, repeated errors, retry hints, reauthorization and idle expiry. They do not reproduce the reporter's 23-hour account condition or constitute Windows/live-account acceptance.

A follow-up review reproduced an expiry/foreground-refresh race introduced in 420ce42: when a foreground refresh starts at the old snapshot deadline before its already-queued timer fires, the timer could abort the replacement request using the old deadline. The timer now skips entries with a pending refresh; starting that refresh has already revoked the old snapshot. The regression test queues both operations at the same deadline and verifies that the old permit expires, the new request survives, and concurrent readers reuse its result. The test fails before the fix and passes after it; account invalidation and disposal still cancel pending work.

A second review reproduced incorrect attribution of an unread later error after malformed JSON, an oversized earlier error, or a completed empty response in one network chunk. Three real-adapter regressions fail on 0bc83ee and pass after stopping observation at an ambiguous or terminal boundary. HTTP request metadata remains available when SSE attribution stops.

When collecting future evidence, compare a failed request's timestamp, HTTP status, SSE code/type and server request id with its successful window. Share request ids privately with the service operator; never publish OAuth tokens, credential files, account ids or a complete session archive.

## Issue closure criteria

The release candidate is 0.1.0-alpha.4.38. Its client-side acceptance covers hidden-page suspension, ordinary cache/coalescing, failure backoff, renewed-credential isolation, bounded diagnostics and the expiry/attribution regressions. CI and synthetic fixtures cannot establish the cause or recovery of a 23-hour upstream failure. Do not auto-close #219 merely because this PR merges or the package publishes.

The reporter should confirm the exact installed plugin/DSH/pi-ai versions and whether normal use remains healthy through a comparable observation window. If it recurs, retain the timestamp, HTTP status, error code/type and request IDs from the new suffix; send request IDs privately to the service operator. Compare ordinary single-turn use with optional Search/Image/Reserve/Auto-review disabled, then re-enable only the needed routes one at a time. This is controlled diagnosis, not a high-volume stress test or a guarantee of recovery. Do not revoke all devices, delete credentials, rotate accounts, or rewrite the client identity automatically.

On 2026-09-20 a repository-scoped issue search for `overloaded` found #219 only. This is not a claim that no similar upstream report exists. Header classification, backend eligibility and account/session-level restrictions require evidence from the service operator; official-client binary strings are not a published backend contract.
