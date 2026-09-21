# Adaptive Runtime M2: reasoning decision lifecycle

Status: unreleased M2 engineering candidate, stacked on M1 PR #232 (`2f135e7`). This is not a merged feature, an autonomous optimizer, or live Astra acceptance. The original Think and Split branches are preserved.

## Purpose and scope

Optimize useful task outcomes relative to resource use and time, not the number of agent features. M2 supplies a small internal Observe → Recommend → Admit → Apply contract and connects the existing Think tool and request stream to it. It does not make another model request to decide how to make every model request. The current agent recommends within its normal turn; the host observes current state and retains authority.

`src/adaptive-decision.ts` currently admits two action shapes: `keep` and `reasoning`. Unknown actions and extra authority-bearing fields are rejected. M3 may add a bounded read-only delegation action only with the existing worker's independently verified host ownership, source manifest, explicit permission, budget, expiry and cleanup. Neither delegation nor a model-callable compaction command is added here.

## One decision, distinct states

| Step | Actual owner and behavior |
| --- | --- |
| Observe | Think obtains the exact live root Agent and host-owned Session. It derives the original/effective effort and selection/surface revisions from M1's validated journal, not model-supplied state. The decision flow retains only these four safe fields. |
| Recommend | The existing tool submits `keep` or an effort. A same-effort request normalizes to `keep`. Recommendations alone grant no authority. |
| Admit | A change uses the existing native human question. Only its exact accepted answer can reach `admit`; the flow rechecks the captured host state before queueing. Decline, cancellation, changed selection, disable or compaction cannot be promoted into approval. |
| Apply | `queued` is not effective. The existing replay guard verifies the canonical notice and effective request header before recording local application. A subsequent provider error is recorded separately and does not retroactively revoke a valid journal entry. |

A model normally keeps the current effort by simply continuing its task; it need not call a tool to report every no-op. An explicit `keep` option is available without asking a question or appending a configuration notice. Absence of a tool call is not fabricated into a model decision record. The concise tool description allows both increases and decreases at meaningful task transitions; it does not prescribe effort by phase or promise savings.

The decision ticket is internal, immutable and bound to its issuing per-Agent flow. Copies and cross-flow tickets cannot advance. This bookkeeping is not a replacement approval service: a trusted caller must still verify the human answer before `admit` and the canonical host state before `applied`. None of these methods is exposed to a model or an HTTP endpoint.

## Authority and persistence remain with DSH

M1's append-only journal and validated prefix compaction are unchanged. No parallel effort file, new session event vocabulary, model-authored summary authority, credential change, or host patch is introduced. Disabling new proposals still preserves already-recorded changes. Manual selection remains authoritative. Session restoration uses the journal even when all M2 observations have been discarded.

M2 does not reset defaults, enable Think/Remember/Reserve/Split, alter request identity/retry rules, or replace the Alpha 4.39 backend governor. The package version stays 4.39 to identify its existing development baseline; only the PR commit identifies this unpublished candidate.

## Bounded observations, not a cost claim

Each live root Agent has at most 64 recent decision-transition records and 64 recent adapter-request samples. They exist only in memory, are isolated by the live Agent object, are removed on Agent disposal, and are neither uploaded nor persisted. The internal `adaptiveSnapshot` accessor is read-only and not a user-facing dashboard. Default-off, never-enabled conversations are not sampled.

Samples retain only purpose (`task`, `compaction`, `auxiliary`), the selected effort when known, a local ordinal, elapsed stream-iteration time, a bounded outcome vocabulary and allowlisted numeric adapter usage counters. They never copy prompts, responses, reasons, tokens, account/session identifiers, request ids, opaque checkpoints or raw errors. The existing host's normal tool arguments and human-question detail are unchanged; the content-free guarantee applies to the new observations, not to erasing the host's ordinary conversation log.

Important measurement limits:

- A request sample represents one adapter stream, not necessarily one HTTP attempt. Existing native fallback and pi-ai retries remain inside their current owners; extra attempt costs may not appear in the adapter's final usage.
- Elapsed stream time includes queue/network/consumer waiting. It is not total task duration or isolated server inference time.
- Repeated usage chunks replace the previous cumulative snapshot; they are not added together. Unavailable or malformed fields remain absent, not zero. Unknown compaction effort remains `unknown` rather than inferred from a newer selection.
- DSH's input/cache fields are disjoint; reasoning tokens must not be added to output tokens as a separate bill. M2 records counters without calculating prices, subscription quota percentages or savings.
- `stop`, `tool-calls` and `max-tokens` describe stream endings, not task correctness. Actual task success needs a separately defined acceptance test.
- Requests are retained in completion order with start-order ordinals. A memory snapshot or its loss cannot authorize, revoke or restore reasoning state.

## Verification and remaining work

Run `pnpm run check`, `pnpm run test:browser`, `node scripts/check-think-controls.mjs`, `node scripts/check-think-matrix.mjs` and `pnpm run check:dsh-matrix`. The dedicated Think matrix now requires all 38 native/decision cases and four product-setting cases plus exact runtime identity on every declared host; old 35-case evidence is insufficient. M1's real-host/native-or-fallback/plain-or-Zstandard cross-process lifecycle remains a required regression, not a replacement for live model evidence.

Exact results belong in `.github/ADAPTIVE_RUNTIME_M2_VALIDATION.md` and current-head PR checks. Synthetic model responses test plumbing only. A later authorized experiment must compare independently graded task correctness, complete task wall time, available provider counters and human interruptions against fixed-effort single-agent baselines. Full authenticated Session-page human experience, live configuration-update acceptance, recommendation calibration and real economic benefit remain unaccepted. M3 is still a subsequent bounded Split integration, not completed by this PR.
