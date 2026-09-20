# Unified Codex backend request layer

Baseline: main after Alpha 4.38 publication. This refactor follows the client-side findings from #219, but it does not assume that request identity or traffic shape caused the reporter's persistent upstream condition.

## Goal

Make every `chatgpt.com/backend-api` call use one lifecycle policy instead of maintaining independent request mechanics in Model, Search, Quota, Image, Auto-review, Native Compaction, and diagnostic probes.

The common policy owns:

- exact backend-origin validation before credentials can be dispatched;
- one unique client request id for every network attempt;
- one explicit table for honest route identity;
- bounded HTTP/SSE diagnostic metadata;
- an abort-aware per-plugin open-response ceiling;
- reusable deadline and retry/backoff primitives;
- proxy scope composition and cancellation propagation.

It intentionally does **not** make all routes retry in the same way. A search or image request must not become replayable merely because native compaction has bounded retries. The model path keeps pi-ai's retry contract, quota keeps its cache/backoff contract, and native compaction keeps its bounded retry contract.

## Identity policy

| Route | User-Agent policy | Originator policy |
| --- | --- | --- |
| Model | Preserve pi-ai | Preserve pi-ai |
| Search | `dsh-codex-connect` | existing `deepseek-harness` |
| Quota | `dsh-codex-connect` | none invented |
| Image | `dsh-codex-connect` | none invented |
| Auto-review | `dsh-codex-connect` | existing `deepseek-harness` |
| Native compaction | `dsh-codex-connect` | existing `deepseek-harness` |
| Capability / Auto-review probes | `dsh-codex-connect` | existing `deepseek-harness` |
| Proxy reachability probe | `dsh-codex-connect` | none invented |

This is centralization, not first-party impersonation. No official-client name, installation id, or unverified header is fabricated.

## Traffic boundary

The plugin instance allows at most eight simultaneously open backend responses. The gate spans response-body consumption, not just receipt of headers. Requests waiting for a slot remain cancellable. Standalone CLI probes own short-lived request layers because they own their own dispatcher and are not part of a running plugin instance.

The ceiling is deliberately conservative and local. It is not described as an OpenAI limit and is not used as evidence for risk-control behavior.

## Verification contract

Offline tests must cover:

- identity preservation for model and plugin-owned routes;
- unique attempt ids;
- one shared gate across different runtime routes;
- queued cancellation without a later dispatch;
- slot release at body cancellation/EOF;
- fake-timer-compatible deadlines and caller-vs-timeout classification;
- bounded SSE metadata while forwarding response bytes unchanged;
- rejection of non-`chatgpt.com/backend-api` destinations;
- unchanged route-specific retry behavior;
- existing proxy, quota, search, image, Auto-review, and native-compaction regressions.

No automated test in this repository constitutes live-account acceptance or proves how the upstream service evaluates third-party request identity.
