# Remember controlled probes: local implementation and offline evidence

## Status

Implemented after `263bfcd866fc028798e39d588939ca899d564ba1`, whose parent is merged-main reference `574d55f2f990053c64fabd3fb8867318875183a4`. This delivery is local engineering preparation, not provider acceptance. The [original September 18 live failure](../experiments/native-compaction-durable-m15-2026-09-18-1317.md) remains failed; its three-request grant is exhausted. No new live requests or credential reads were performed.

The native execution channel recovered and actually returned Node `22.22.3`. This does not explain the earlier missing tunnel or the earlier live recall mismatch.

## Implementation

The [controlled acceptance specification](../experiments/remember-controlled-acceptance-plan.md) is now implemented in the existing `scripts/native-compaction-durable-smoke.mjs`, with a shared helper `scripts/native-compaction-controlled-cases.mjs`. There is one credential/transport/persistence implementation, not a second copied runner.

- `--case=retained-user`: a short user message carries the target. The normal retained-user projection survives the real checkpoint and JSONL restore. The synthetic continuation reads the target from the actual retained request item; this is a persistence control, not opaque-state recall.
- `--case=assistant-origin`: the target is extracted from the actual baseline assistant answer. A real anchor turn moves it into the older prefix. The native request must contain it only in an assistant item; the restored request must contain no plaintext target. The synthetic native response derives a clearly marked fixture envelope from that assistant input, and the fresh-process responder reads the answer only from the replayed envelope. No comparator/expected-target parameter is supplied to this responder. This is not real encryption or evidence of provider semantics.
- Default/`--case=oversized-user`: the old 65,000-space user-message boundary, prompt, three-dispatch ceiling and strict recall criterion remain separate and tested. Its earlier failure is not erased or explained retrospectively.

A/B each follow baseline, anchor, native compaction, process exit/restore, continuation: four dispatches maximum, with no retry or fallback dispatch. The real DSH range selector is configured with `retainTokens: 0` only inside this isolated fixture. It still retains the newest item and rejects non-shrinking replacements. No host method or production retention code is overridden. The first prompt requests 600-750 words of neutral library prose; accepted material is bounded to 400-1100 words / 12,000 UTF-8 bytes, with Agent maxTokens 2048 and compaction maxTokens 1024. These settings are not a claim about actual live token usage.

The actual JSONL is parsed to locate a checkpoint structurally identical to the committed in-memory checkpoint; merely finding a marker string no longer proves A/B persistence. New-process restore checks the full checkpoint digest. Before dispatch, the retained prefix and opaque item must match their persisted identities. The target must not survive in another active message or request metadata. New assistant events are required after the continuation start; historical correct answers do not satisfy the gate. Recall still requires `reply.trim() === target`, with no case folding or substring acceptance.

Controlled live invocations require an explicit case, Codex-login selection, and run id. An owner-only exclusive claim survives temporary cleanup in ignored `.remember-acceptance-runs/`; a reused id, including reuse for another case, is refused before credentials. This is same-id duplicate prevention, not permission to mint another id after failure. Fault-injection flags are offline-only. Neither the wrapper nor this document authorizes live execution. The historical oversized live path is unchanged and still needs separate authorization before any invocation.

## Validation obtained

The first focused run passed 59 tests over three files, including 31 new controlled-case tests. On the final code, `pnpm run check` completed with **98 test files / 965 passing tests**, plus metadata/source lint, host/client typechecking, build, CLI checks, compatibility check and package check. Original WebCodex job: `wc_job_z9tnGGA5qqaK_EVS`, exit 0. Node: `22.22.3`. This note is a later documentation addition; package/link checks are repeated at closeout. No new Node 24, browser, installed-host matrix or remote CI result is claimed.

[New machine-readable offline observations](../experiments/remember-controlled-offline-evidence.json) summarize 11 actual fixture runs on the final probe/helper hashes:

- Two positive controls finish four simulated dispatches and two distinct successful processes, with exact recall and physical checkpoint equality.
- Five negative wire fixtures omit the selected target, leak it in plaintext, lose retained-user input, alter the replayed opaque item, or remove it. They stop before the affected synthetic transport, after only two or three simulated dispatches. `guard_failure` records the precise cause even when the host wraps it as an agent/compaction failure.
- Four case-only/wrapped/wrong/empty answers still fail after four simulated dispatches with `RECALL_MISMATCH_NO_RETRY`. Restore success remains independently recorded.

Additional unit tests reject ambiguous assistant-generated labels, a correct historical answer without a new turn, marker-only physical-file checks, invalid/duplicate flags, unsafe run-ledger symlinks and reused run ids. These unit checks are not mislabeled as actual crash/disk-fault injections.

Original live JSON evidence remains SHA-256 `c8884b6b7fbeedb44f67615b0bfca9c96d4600203929da6627755e27d448aa91`. New offline evidence is SHA-256 `e5af6ff65cf3df5e3121c2e6533caec95be1321a5315a05e9c16ead36522a40f`. Public observations contain classifications, booleans, counts and source identities, not targets, answers, opaque contents or credential paths.

## Next gate and limits

A proposed new live sequence is A first, then B only if A passes, using the previously designated M15 Codex login, plain Luna/low, at most four requests per case (eight total), stopping on any failure or platform denial. It requires fresh user authorization and the platform's normal approval; no unused budget from an old attempt is carried forward. There is no automatic multi-case runner. No manual user product acceptance is required at this engineering stage.

A/B live success would establish bounded same-account/same-model text behavior, not Astra, tools, images, UI forks, crash recovery, repeated compaction, savings or long-task quality. C remains a separately authorized retention-boundary test. This delivery does not push, open a PR, merge, publish, deploy or upgrade daily services, and does not enable experimental defaults.
