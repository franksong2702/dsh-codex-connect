# Remember: authorized live A/B restart controls — 2026-09-18

**Both bounded cases passed.** A used four real plain Luna requests and was checked before B was started; B used four more. No retries, fallback, model/account switches or further model requests occurred. This is not whole-product acceptance and does not erase the earlier oversized-user failure.

[Original sanitized reports and execution receipts](remember-controlled-live-m15-2026-09-18-9n7e.json) contain the full copied terminal JSON from both original jobs, separately labelled with task context. Source: local commit `ad7c93481096b4750ede77dc93a19b241b7f11e0`, probe `b21896d2c9379acd4e04848600a1c52c2bea2d60cc829d5b8201f50af3a9d72b`, helper `165c517838660734c45b823500cbf8dd8b53766af3104494e2a5a7cb31d71877`; Node 22.22.3, direct DSH 0.1.2-rc.1, pi-ai 0.84.4, Cordis 4.0.2 on the verified M15. These probe changes remain local; no remote merge or release is implied.

## Results

| Case | Requests | What the actual payload proves | Recall |
| --- | --- | --- | --- |
| A retained-user | 4 | The user target was in the compacted input, remained in the normal retained-user projection, survived physical JSONL and fresh-process restore, and was present in the replayed user item. | Exact |
| B assistant-origin | 4 | The actual assistant-generated target was in the older assistant prefix, absent from retained-user content and all non-compaction replay fields; the restored opaque item matched the persisted item. | Exact |

Both cases used the real AgentLoop, compaction transaction and JSONL persistence. Each writer process ended and a distinct resume process produced a new answer. Both service-side final text and the adapter-extracted answer matched the target exactly, without whitespace/case/substring relaxation. All eight responses returned HTTP 200, terminal completed and server model gpt-5.6-luna.

A completed under job `wc_job_FZF_DA7AHE-nnA72`; B under `wc_job_-7Ty8MUk_-MS7nF7`. The success reports independently record physical checkpoint equality, fresh-process identity, restored checkpoint equality, and continued exact recall. A's plaintext answer source is intended and cannot prove opaque semantics; B's absent plaintext target supplies the bounded opaque-recall check.

## Reported usage

| Case | Input | Output | Total | Cached | Reasoning (included in output) |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 2301 | 1076 | 3377 | 0 | 144 |
| B | 2355 | 1005 | 3360 | 0 | 121 |

Combined backend-reported total: **6737 tokens**. This is usage evidence, not billing/pricing or savings proof; cached counts were zero.

## Scope and cleanup

The isolated controlled probes used retainTokens 0, one manual compaction and bounded neutral library prose. Existing exact-match conditions, payload guards, no-refresh policy, run claims and source code were unchanged. Both reports confirm unchanged credential-file bytes and removal of their private temporary sessions; owner-only one-shot claims remain in ignored .remember-acceptance-runs to prevent duplicate execution. Only these local sanitized evidence files and the handoff checkpoint were written outside the disposable tests. No credentials, real project sessions, service configuration, release metadata or daily installation were changed.

The [earlier three-request oversized-user failure](native-compaction-durable-m15-2026-09-18-1317.md) remains byte-identical and unresolved. These two successes do not establish the cause of that failure, the safety of deleting arbitrary user text, automatic/repeated compaction, tool/image/fork behavior, crashes/disk faults, Astra behavior, cost savings, or long-task quality. No GitHub issue was closed and no push, release, deployment or environment upgrade was performed.

The authorized A/B sequence is complete. Any additional live experiment needs a separate scope and authorization; unused old budgets are not reusable.
