# Remember: bounded remaining acceptance

## Controlled-case preparation completed locally

The [two controlled cases](remember-controlled-acceptance-plan.md) are now implemented and passed synthetic two-process replay tests. They separate retained-user persistence from assistant-origin opaque-only recall, preserve the historical oversized-user case, and add request-derived fixtures and strict negative gates. See [implementation and current local validation](../agent-notes/remember-controlled-probes-delivery.md). This is not new live acceptance; the previous three-request failure below remains failed. A proposed A-then-B live sequence has a new maximum of eight requests and requires separate authorization.

## Latest local observation — 2026-09-18

A separately authorized M15 attempt completed its three real Luna requests but failed exact recall after persistence/restore: see [the immutable live outcome](native-compaction-durable-m15-2026-09-18-1317.md). Its request budget is exhausted. The later [offline investigation and diagnostic corrections](../agent-notes/remember-recall-investigation-2026-09-18.md) identify a padded-user retention confound and add content-free mismatch/restore observations without relaxing exact-match acceptance. No later live run is authorized or implied. The previous blocked attempt and preparatory state below are historical and remain distinct from this new failed result.

Tracking: #196 is the concrete lifecycle-acceptance gate; #65 owns broader context-quality/value research; #195 is the roadmap. Baseline and release facts are maintained in [the dated runtime checkpoint](../agent-notes/adaptive-runtime-status.md).

## State, not a new compaction implementation

The #197 mechanism is merged and appears in the 4.36 release record. Native creation remains disabled by default. The implementation in `src/native-compaction.ts` is unchanged by this follow-up.

Historical evidence has two distinct scopes: real DSH lifecycle with synthetic provider responses, and the September 12 three-request live Luna bridge/codec test. Their combination must not be represented as a completed real-provider restart test. See [the lifecycle guide](native-compaction-lifecycle.md) for the exact historical scopes.

## Narrow gate for #196

| Required observation | Evidence needed to mark the gate accepted |
| --- | --- |
| Identity and preflight | Record exact plugin source/artifact and actual host/provider versions. Use only an explicitly authorized account source in an isolated host. A platform denial stops the operation. |
| Creation | Complete one bounded native compaction through the real DSH AgentLoop and compaction transaction. Record successful terminal status and a valid committed checkpoint, not just HTTP 200. |
| Persistence | Verify the host's actual JSONL checkpoint after flushing. Do not publish prompts, opaque checkpoint bytes, tokens, account identifiers or local credential paths. |
| Process exit and restore | End the writer process, start a distinct process, restore the same session/checkpoint with new native creation disabled. A recreated in-process context is insufficient. |
| Continuation | Complete a new turn with the restored checkpoint. Verify the recall target is absent from visible non-compaction input; historical assistant output is not a new continuation. |
| Closeout | Record outcomes, actual usage when available, fallback/cancellation status, dispatch counts, cleanup and credential immutability. A missing or uncertain result remains unaccepted, not retried automatically. |

The existing bounded live probe covers text recall in two processes and at most three Luna dispatches. It does **not** cover a live tool round trip, UI fork, repeated/automatic real compaction, crash/disk failure, archive migration, cross-account/model transitions, images or Think/Split composition. Those cases remain separately named; passing the narrow gate cannot close #65 or certify them.

## Current execution boundary

The previous real durable attempt was reported blocked without a recovered original platform trace. Do not infer account failure, repeat the attempt, switch execution routes or use the earlier three-dispatch run as a reusable budget. No live attempt is authorized by this document. Any future authorized test must satisfy the platform's normal execution and approval requirements, not merely a new script or flag.

## Follow-up implemented locally

The durable probe previously labelled its host `0.1.2-rc.1` without reading it. `scripts/native-compaction-runtime.mjs` now resolves the ESM entries actually imported from this development fixture, reads package names/versions and requires the probe's exact direct dependency set: DSH `0.1.2-rc.1`, pi-ai `0.84.4`, Cordis `4.0.2`. Parent and both child processes verify the same set **before** accessing a live credential or dispatching. Reports contain versions, not module paths.

This pin is deliberately narrower than the plugin's four-host support set. It prevents an unvalidated host from being mislabeled; it does not expand the probe to newer hosts, prove every transitive dependency identity or change installed-host matrix coverage. Regression tests reject missing, extra and mixed-version metadata. Offline success/rejection, checkpoint persistence and fresh-process continuation remain executable without credentials.

## Reproduce the permitted offline scope

```sh
pnpm exec vitest run tests/native-compaction.spec.ts tests/native-compaction-lifecycle.spec.ts tests/native-compaction-automatic.spec.ts tests/native-compaction-probes.spec.ts tests/native-compaction-runtime.spec.ts
```

The suite's invalid `--live` argument test exits before credentials or transport. It is not a live probe. Current local results are recorded in [the delivery record](../agent-notes/adaptive-runtime-validation-2026-09-18.md); older four-host/Node matrices remain historical unless explicitly rerun on the final source.
