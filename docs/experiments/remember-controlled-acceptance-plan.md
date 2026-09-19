# Remember: separate persistence controls from opaque-state recall

Status: **implemented locally; controlled synthetic restart checks pass; no new live result**. Prepared after local diagnostic commit `263bfcd866fc028798e39d588939ca899d564ba1`. The original [live attempt](native-compaction-durable-m15-2026-09-18-1317.md) remains failed and its three-request authorization is exhausted. The [offline investigation](../agent-notes/remember-recall-investigation-2026-09-18.md) is historical evidence, not a live result for these new cases. See [the controlled-probe delivery note](../agent-notes/remember-controlled-probes-delivery.md) for implementation and final validation.

## Purpose

Separate two questions: whether a normal compacted session survives an actual process restart, and whether information available only through the opaque compaction item remains usable. Keep the oversized-user case as a third, explicitly labelled retention-boundary test. Do not weaken exact recall matching, remove the old failure, or change shipped retention policy to make a test pass.

Historical preparation: this specification was first saved while file reads/writes worked but native execution returned `tunnel_client_not_connected`. That attempt ran no tests. On continuation an actual Node process returned `v22.22.3`; the implementation now has new offline execution evidence. The earlier connection failure and earlier live recall failure are distinct observations.

## Shared experiment shape

Prefer one reviewed probe with explicit case selection and common execution/diagnostic guards, rather than copying the credential, transport and persistence code into multiple scripts. Preserve the existing oversized-user invocation as a separately identified case; any new scenario must be named explicitly, never silently substituted for a historical command.

The implemented sequence for each new case is:

1. One baseline model turn establishes the information and enough ordinary conversation content for a useful compaction.
2. One short anchor turn advances the conversation without repeating the target. This is a normal model turn, not a manually injected assistant event.
3. One native compaction through the real DSH AgentLoop/compaction transaction and JSONL writer.
4. Exit the writer process, restore in a different process with new compaction creation disabled, and issue one continuation turn.

That is a **proposed ceiling of four provider dispatches per case**, not an approved live budget. The extra anchor costs one request but prevents the target-bearing assistant response from simply being the newest uncompressed reply. A successful anchor is not proof of selection: the actual native payload and restored surface must prove the target's location. No fallback, repeated attempt, extra shrink attempt or substitute model is permitted within a case.

The installed `@deepseek-ai/dsh-compaction-basic@0.1.2-rc.1` was inspected: `lib/index.js:381-402` selects the prefix while retaining at least the newest item even with `retainTokens: 0`; lines 558-559 reject a framed replacement not smaller than the selected source. The controlled fixture explicitly configures `retainTokens: 0`, `auto: false`, `compactionRetries: 0`, `maxOverflowRetries: 0`, and compaction `maxTokens: 1024`. It uses the real engine without overriding methods, editing history, faking events, or bypassing shrink rejection. A failed commit stops before resume and is not successful recall.

Both baseline prompts request 600-750 words about organizing a community library. The probe permits 400-1100 words and at most 12,000 UTF-8 bytes, with Agent `maxTokens: 2048`; noncompliance stops without retry. Exact prompts, anchor and continuation are in `scripts/native-compaction-controlled-cases.mjs`. No whitespace padding is used for A/B. Actual native-payload and restored-request observations prove target placement offline; useful shrinkage with real model responses remains unverified until an authorized live run.

## Case A — normal retained-user persistence control

The target is supplied in a short user message, comfortably inside the existing retained-user byte budget. The assistant is asked to acknowledge or discuss neutral test material without echoing the target. The anchor also contains no target.

Required observations, checked rather than inferred:

- The baseline request contains the target only in the intended user item, not in system instructions, metadata or a test-only injected message.
- The real native-compaction request includes that user item in the selected prefix. The target is absent from assistant items.
- The existing retained-input projection includes the complete target-bearing user item within its byte limit.
- The committed checkpoint decodes to the expected retained user item(s) plus exactly one native compaction item. Do not reuse the old assertion that the decoded checkpoint contains only a compaction item.
- Verify the actual persisted checkpoint and its retained-user content before process exit. Record only equality indicators and counts in public evidence.
- The fresh process restores the identical checkpoint. Its outgoing continuation expands the same native item and the expected retained user item. Plaintext target presence is **required in that retained user item** for this control and must not be reported as a leakage failure.
- The new continuation answer, not a historical assistant event, must satisfy the unchanged `reply.trim() === target` criterion.

Interpretation: this control checks the normal retained-user plus opaque-item persistence/replay path. A correct answer does **not** prove opaque-state recall, because the retained user text itself carries the answer.

## Case B — assistant-origin opaque-state recall

The baseline user prompt asks the model to generate a new 12-character uppercase hexadecimal identifier using a strictly defined answer format, plus bounded neutral content where needed for a useful prefix. The expected identifier is learned from that actual assistant response, never inserted into the user prompt. Invalid, missing or ambiguous identifiers stop the case before compaction; there is no retry to obtain a better baseline.

The expected identifier may be kept in a private test-control record for assertions, but must never be injected into system instructions, tools, subsequent user messages, synthetic replay messages, cache keys or session identifiers. No real user project data is used.

Required observations:

- The baseline user prompt does not contain the extracted target, including case-insensitive forms.
- After the short anchor turn, the native-compaction wire payload contains the target in an assistant item of the selected older prefix. It is absent from user items, instructions and other request metadata.
- The anchor reply does not contain the target. A native request lacking the target-bearing assistant item must fail before transport, not proceed and later blame model recall.
- The retained-user projection contains no target. Ordinary user instructions may remain, but they must not supply the answer.
- After the real compaction transaction commits, no target-bearing assistant message remains on the active surface outside the checkpoint. The original historical file may retain source events; the actual outgoing replay request, not the mere presence of old bytes on disk, determines what the model can see.
- Flush and verify the actual JSONL checkpoint, exit the writer, and restore in a separate process with native creation disabled.
- The outgoing continuation must include exactly the persisted native item and contain no target anywhere outside the opaque item. Verify checkpoint identity and target absence before transport.
- The newly completed continuation must exactly match the identifier. Record service-side and adapter-extracted answer diagnostics separately where available.

Interpretation: a live pass supports one short, same-account, same-model assistant-origin recall after persistence/restart. It does not prove arbitrary user-message deletion is safe, repeated compaction works, tools/images/forks are correct, Astra is accepted, or tokens/costs are saved.

## Case C — existing oversized-user boundary

Preserve the old 65,000-space user-message test and its strict criterion. Keep its source identity, target location and retention-boundary label distinct from Cases A and B. The September 18 live failure is neither replaced by a passing control nor explained retroactively by new diagnostics.

A future repeat of Case C needs its own explicit authorization. It is not included in the proposed two-control budget.

## Offline fixture validity

The current synthetic responder can return a target read directly from private fixture state. This is sufficient for response-classification tests, but cannot establish that the request contains the information needed to answer.

For the new controlled fixtures, avoid that independent answer source:

- In Case A, the synthetic continuation responder derives its answer from the actual restored request's retained user item.
- In Case B, a clearly labelled **synthetic-only** compaction envelope is derived from the target-bearing assistant input at the native stage. The responder in the new process derives the answer from the replayed synthetic envelope, not from the comparator's expected-target field.
- Do not call the synthetic envelope real encryption or treat its decoding as evidence about the provider's opaque-state semantics. The production encoder/decoder, real DSH transaction, file persistence and restart still execute normally; only the provider response is a fixture.
- Keep the expected target available to the assertion code but do not pass it as a ready-made answer to the transport stub.

Required negative fixtures include: target omitted from the compacted assistant prefix; target accidentally surviving in a plain retained assistant/user item; retained user content lost in Case A; altered/missing persisted opaque item; a correct historical answer without a newly completed continuation; and wrong/case-only/wrapped/empty new responses. Each must fail its intended gate without a live request or an automatic retry. Assertion and protocol failures must remain distinguishable from semantic recall mismatches.

## Safety and evidence gates

- Default execution remains offline. Case names, unsupported combinations, duplicate flags and live/offline fault-injection combinations are rejected before credential access.
- Do not search for credentials, refresh credentials, choose another account/model, start daily DSH services, modify experimental defaults, or use another execution route after a platform denial.
- Reset per-request output observations; record successful restore separately from final recall, so a later failure does not erase persistence evidence.
- Continue recording only fixed classifications, booleans, counts, versions, source identity and reported usage. Do not persist target/answer text or reversible target encodings in public reports. Temporary private sessions and test-control state must be cleaned up.
- Observe one execution receipt after an uncertain result; do not restart the experiment to recover missing evidence. A future live invocation needs durable duplicate prevention and an unambiguous case/run identity.
- Validate focused fixtures, full local checks, scope and unchanged historical evidence before local commit. Do not attribute previous 934-test success to newly edited code.

## Future authorization boundary

Any future live run uses plain `gpt-5.6-luna`, effort `low`, the previously selected M15 Codex login only, no refresh or switching, and at most four dispatches for A plus four for B. This is a **proposed new maximum of eight requests**, not reuse of the exhausted three-request grant. Each controlled live case requires `--live --codex-login --case=... --run-id=...`; the run id is claimed exclusively in a private ignored local directory before credential access and cannot be reused across cases. This prevents accidental same-id duplication, not a substitute for user/platform authorization. Stop on failure; there is no automatic multi-case runner or retry. No live run is authorized by this specification or by the present request to continue engineering preparation.

Current follow-up is local preparation only. Push, PR creation, merge, release, deployment and upgrading the daily environment remain separate decisions.
