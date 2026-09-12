# Native compaction session handoff — 2026-09-12

## Scope and exact base

Repository: `franksong2702/dsh-codex-connect`.
Branch: `franksong2702/native-compaction-bridge`.
Base HEAD: `a1337f74c6edbf244b4752233fb068706769842e` (PR #197).
WebCodex Workflow Session: `wc_sess_b92fd78c85ac4d209f1b61983f3aa866`.

This session verified and fixed the two previously unconfirmed boundary findings. This file preserves historical evidence; see the delivery continuation below and PR #197 for current commit/CI status. A subsequent user-authorized M15 Luna-only smoke completed real provider bridge/codec acceptance in three dispatches (details below). This is not a release or full live DSH lifecycle acceptance.

## Confirmed findings and fixes

1. `retainedNativeCompactionInput` omitted JSON array brackets and separators. Its budget now starts at two bytes and includes one separator byte for each additional retained item.
2. `standardStream` returned an external observer's `undefined`, causing pi-ai to reuse its original, unexpanded payload. It now returns the transformed payload when the observer returns `undefined`, while preserving explicit replacements and in-place observer changes.

The installed pi-ai 0.84.4 contract was read directly: `dist/types.d.ts:69–73` documents undefined as unchanged; `dist/api/openai-codex-responses.js:171–175` implements that behavior.

Seven regression cases were added to `tests/native-compaction.spec.ts`. Before the fix, six failed: three exact byte-boundary cases and three observer cases. The explicit replacement case already passed. After the fix all cases passed. The callback tests use the actual installed pi-ai implementation but synthetic credentials and responses; there are no real Sol/Astra/Reserve requests.

Current native source SHA-256:
`f4909020c17a1ecb3003d349bc9009a555903146c7a1b6d51d53e12943edc392`.

## Historical validation before automatic-trigger expansion

- Focused native and lifecycle tests: 2 files, 27 tests passed.
- Typecheck: passed.
- Full `pnpm run check`: 91 files, 869 tests passed; build and package checks passed.
- Browser: 8 files, 28 tests passed.
- Local Node: `v22.22.3`.
- Four exact DSH hosts: `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, `0.1.5-rc.2` all passed.
- The four-host run used the same package bytes: SHA-256 `114fa3b7a61c883ef187a05134b4933b2a45517b7fd0575591711a66c8f41e83`.
- Eight independent lifecycle processes per host, 32 total, using none/zstd and write/resume-fork/verify-child/failure-paths.
- Compiled bundle changes were independently checked to be confined to the two reviewed functions.

Do not substitute the previous HEAD's GitHub Node 22/24 matrix or 64-process result for new CI evidence. At this historical checkpoint no changes had been pushed.

Evidence jobs: focused `6c15cdbc-2159-4cf3-98fb-e3fa4e52adae`; typecheck `c875aef1-9b16-4fca-bbee-c1572e0779bd`; full check `0c1c80f9-5405-498f-afd4-fb021af84068`; browser `dc23e008-f60d-450a-9e07-eaed75602606`; four-host matrix `34ce66fb-77da-4bbe-b80e-1a24ade419d0`.

## Luna smoke: preflight stopped, zero real dispatches

Probe: `scripts/native-compaction-luna-smoke.mjs`.
The default mode is offline; `--live` explicitly requests the bounded live attempt.
It pins `gpt-5.6-luna`, SSE, zero retries, at most one dispatch per stage and three total. It blocks summary fallback before the network. The proposed recall test uses a label generated only in the assistant response, not duplicated in the retained user projection.

Offline rehearsal passed all three scenarios: success (3 simulated dispatches), native HTTP rejection (2), and missing native item (2). Both failure scenarios blocked the subsequent fallback dispatch.

After all required gates passed, one `--live` invocation stopped at:

```json
{
  "request_model": "gpt-5.6-luna",
  "real_provider_dispatches": 0,
  "stop_reason": "ACTIVE_OAUTH_CREDENTIAL_MISSING"
}
```

This means the configured/default DSH credential store did not supply an active OAuth credential to the probe. It does not establish that the machine is logged out everywhere, that credentials expired, or that Luna does not support native compaction.

No baseline, native compaction, or replay request reached the real backend. Server model, usage, cached/reasoning tokens and provider latency are unavailable, not zero-valued measurements. No alternate credential source was searched, no refresh or credential write was attempted, and no real encrypted state was produced or persisted.

The probe exercises provider bridge/codec acceptance, not a new full DSH lifecycle. Existing lifecycle evidence remains synthetic. Future consumers must inspect the JSON outcome: a successfully executed probe command is not itself provider acceptance.

## M15 live acceptance — completed, exactly three real dispatches

The user explicitly authorized the already logged-in account on M15. The Runner was verified to be M15. Read-only preflight confirmed the explicitly selected Codex login (`~/.codex/auth.json`) is an owner-only regular file, its account claim matches, and the access token is usable without refresh. No credential was exported, copied into DSH, migrated, refreshed, or modified.

The probe now supports explicit `--live --codex-login`; it reads only that source and never searches for alternatives. Offline assertions check login parsing and account mismatch rejection, and the three offline transport scenarios still pass. The validated plugin source SHA above is unchanged.

Real result: **native checkpoint accepted, replay accepted, exact label recalled**. All three requests and returned server model fields were `gpt-5.6-luna`, reasoning effort `low`, HTTP 200 and terminal status `completed`.

| Stage | Input tokens | Output tokens | Total tokens | Cached tokens | Reasoning tokens | Latency ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 57 | 87 | 144 | 0 | 70 | 3655 |
| Native compaction | 164 | 72 | 236 | 0 | 0 | 2489 |
| Replay | 157 | 15 | 172 | 0 | 0 | 1324 |

Totals: 378 input, 174 output, 552 reported total tokens. Reasoning tokens are a separate detail, not added again to the total. The native response contained exactly one compaction item. There were no retries, fallback attempts, fallback dispatches or model/account switches.

The baseline assistant generated a 12-character label. That literal label was absent from retained user text and from the non-compaction part of the replay request. The replay excluded the original assistant reply, expanded the trusted native checkpoint with creation disabled, and returned the exact label. This is stronger evidence than merely receiving HTTP 200, but remains one short same-account/same-model text test.

This live probe exercised the real provider plus plugin scope/expansion/codec, not AgentLoop/JSONL/restart/fork with a real account. Real opaque content remained in process memory and was not persisted. The existing durable lifecycle gate is still synthetic. Usage here is the backend's reported usage; it establishes neither pricing accuracy nor token savings/cache benefit/long-task quality.

Sanitized durable evidence: `docs/experiments/native-compaction-luna-smoke-m15-2026-09-12.json`.
Evidence SHA-256: `30c24047deb6357a6d9fdfaca17550422889b3747eab72f8dff6eb5f9dbc60b6`.
WebCodex Job: `cd28f35f-892f-4e4a-aa45-e7d8ebdcdc1d`; command exit code 0; no stderr; credential file bytes unchanged. A create-exclusive invocation ledger prevents accidental reuse of the same recorded acceptance run after an uncertain tool outcome.

## Delivery continuation — 2026-09-12

The user authorized delivery closeout and expanded acceptance, then asked to stop investigating the reported single-call blocker and continue. The current delivery scope is review, offline validation, commit/push to existing PR #197 and checking current CI. Do not retry the reported blocked live durable probe or use another execution route. No additional live model requests are part of this closeout.

Nine automatic scenarios now exercise the real host event hooks, token meter and JSONL writer with synthetic provider responses. The installed matrix requires five phases per encoding, ten fresh processes per host and forty across the four exact hosts. The latest fixture review additionally requires a new continuation turn rather than accepting a historical assistant reply as success, correlates start/end identities and preserves original surface nodes on no-progress paths.

The durable probe's offline rehearsal covers real DSH write, process exit, fresh restore and replay; rejection blocks fallback and further dispatch. Its live acceptance remains unverified. A reported tool safety block has no recovered original platform trace, so do not invent a rule, claim account failure, or mark the real durable case passed.

Before this closeout review, expanded source checks passed 93 files / 882 tests; native-focused 40 tests and Chromium 28 tests passed. Fresh final-source and installed-matrix results must be taken from the current execution/PR, not those historical runs. The zero-dispatch preflight and the successful three-dispatch live smoke above remain distinct evidence.

The newest-message retention/no-shrink boundary is documented in `docs/experiments/native-compaction-lifecycle.md`. This bridge does not modify DSH range-selection policy. Real-provider automatic/repeated compaction, real-provider full restart/fork, Web UI/controller anchors, crash/disk faults, archive migration, cross-account/provider/model transitions, images, #167 composition, pricing/cache benefits and long-task quality remain unaccepted.

### Final local delivery gates

The reviewed fixture and package passed fresh validation on Node `v22.22.3`: focused native tests **40/40** (Job `97fcd4ed-3d24-4210-8683-72fa75507462`), full `pnpm run check` **93 files / 882 tests** (Job `53d31d75-5b76-4b8d-b280-f62aa94c95ca`), and Chromium **8 files / 28 tests**. The final four-host matrix passed all four exact hosts with **40 distinct lifecycle processes**, including **8 automatic-phase processes / 72 scenario executions** (Job `8ed20824-91c8-4627-bbfa-0f4fcb7dc9da`). All four hosts used artifact SHA-256 `6631bd9ef6cd3959ecaac6a8101f31fa673cb7dbb3e9ae2e09c054d17512971d` and preserved all optional defaults as false.

The native mechanism source digest remains the same as the successful Luna smoke. Compiled-bundle differences were checked to be confined to the two reviewed functions; sanitized live evidence contains no secret-bearing fields. The staged whitespace check passed. This closeout added **zero real provider dispatches**. GitHub CI for the submitted commit must be checked independently; previous-head CI is not a substitute. This handoff-only record is not part of the npm package and does not change the tested package bytes.

Do not merge #197, publish npm, bump latest, deploy, restart 3080/3081, change production-like DSH, switch to Sol/Astra/Reserve, or start a broad benchmark.
