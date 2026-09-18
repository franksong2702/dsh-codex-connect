# Remember recall mismatch: offline investigation — 2026-09-18

## Status and scope

The [original three-request live attempt](../experiments/native-compaction-durable-m15-2026-09-18-1317.md) remains a failed acceptance with `RECALL_MISMATCH_NO_RETRY`. Its JSON and narrative are preserved byte-for-byte; the exact returned answer was not retained and cannot be reconstructed from token counts. No new live attempt is authorized or executed by this investigation. #196 and #65 remain unaccepted for their outstanding scopes.

This work starts from merged main `574d55f2f990053c64fabd3fb8867318875183a4` on local branch `franksong2702/remember-offline-diagnostics-20260918`. It changes the probe, its diagnostics and tests, not the shipped compaction engine, model settings, dependencies or default feature flags. The previous combined branch and live evidence are preserved.

## Findings established offline

1. The existing probe puts the only target label in a user message containing 65,000 spaces and asks the first assistant to reply only ACK. It deliberately exceeds the plugin's 64,000 **serialized UTF-8 byte** retention limit. `retainedNativeCompactionInput` consequently skips that whole user item. This is a user-retention stress condition, not just a persistence check.
2. New observations through the real adapter/AgentLoop with synthetic responses show the native wire input contains the target in a user item, not an assistant item. The retained projection contains zero user items. The restored outgoing request contains exactly one unchanged opaque item, but no plaintext target. These new observations are offline evidence, not retroactively captured wire bodies from the earlier live run.
3. The earlier successful bridge-only live smoke used an assistant-generated target, absent from retained user input. Its information source and persistence scope differ. That success does not validate dropping the padded user item, and the later failure does not by itself prove JSONL corruption.
4. The synthetic responder reads the target from the private fixture state and returns it directly. It does not interpret encrypted model state. Its success can establish plumbing and diagnostic behavior, never semantic preservation by the provider.
5. Previously a resume-phase recall assertion failed before appending that phase to the success-only `phases` array. That made `fresh_processes_completed: 1` ambiguous to a reader. New `restore_observation` records successful different-process/checkpoint checks before evaluating recall, without changing the meaning of the historical success counter.

## Protocol reference and limits

The OpenAI Codex source was inspected at immutable commit `7498521d288b9b3b96ffba4eedf089d8d6e06a84`, file [`codex-rs/core/src/compact_remote_v2.rs`](https://github.com/openai/codex/blob/7498521d288b9b3b96ffba4eedf089d8d6e06a84/codex-rs/core/src/compact_remote_v2.rs): line 75 defines a 64,000-token retained-message budget; lines 501–527 build the next history from retained items plus the compaction output; lines 552–595 select retained user and certain other messages. The downstream byte-limited projection is deliberately not that full policy. This code is reference evidence, not an execution of the official Codex retention algorithm in our fixture.

The [public compaction guide](https://developers.openai.com/api/docs/guides/compaction), read on September 18, also distinguishes server-side and standalone output handling. Standalone output is a complete compacted window and must not be pruned. Our probe uses the Codex `compaction_trigger` flow, not the public standalone endpoint; those different APIs must not be treated as interchangeable contracts.

These sources make the retention difference important to investigate. They do **not** reveal the encrypted item's contents or establish that the provider never preserves user information. The exact cause of the historical mismatch remains unresolved: formatting, model recall and retention assumptions cannot be separated from that old report alone.

## Diagnostic corrections

`scripts/native-compaction-recall-diagnostics.mjs` is IO-free. It emits only fixed classifications, booleans and byte/item counts, never the target, answer, fragments, encodings, paths or opaque contents.

- Recall classes distinguish exact match, case-only match, a target with extra text, case plus extra text, a different 12-character label, empty output, and other unmatched output. Substring presence is only a hint and is **not** certified semantic recall or format-only failure.
- The passing condition is still exactly `reply.trim() === label`. No case conversion, substring matching or punctuation removal grants a pass.
- Each actual request records target presence by role, outside the compaction item, and in the selected retained projection. Native dispatch rejects a missing target in the user input; resume rejects target leakage outside opaque input or a changed compaction item. These gates only become stricter.
- Provider final-message text, when present in a completed output item, is compared with the adapter-extracted answer in memory. Only classification and equality indicators persist. Missing provider text is unknown, not a fabricated matching result.
- Successful restore evidence and recall diagnostics are written to the existing private ledger before a mismatch is thrown. Parent cleanup copies only the content-free report, then removes the temporary session as before.
- Four explicit `--offline-recall=...` fault cases require `--offline`. They cannot be combined with live mode, rejection mode, duplicate cases or unknown values. Live random-label generation, model, account source, three-dispatch ceiling, no-refresh policy, stopping behavior and prompts are unchanged.

## Executed evidence

The initial focused run passed 28 tests: 15 pure diagnostics/retention checks and 13 probe tests. Four deliberately mismatching replies still exit 1 after three **simulated** dispatches, retain successful restore evidence, report the expected difference class, and clean up. The normal offline control still exits 0. Invalid live/fixture combinations terminate at argument validation before credentials or transport.

Final local `pnpm run check` passed on the completed probe/helper/test changes: **97 files / 934 tests**, typecheck, lint, build, CLI and package checks; Node `22.22.3`, job `wc_job_iQMv6emB_AKoWxK_`. The package check included 78 files. This paragraph is a documentation-only addition after that run. No new browser run, installed-host matrix, remote CI or live model validation is claimed. All original live outcome bytes remain unchanged.

[Machine-readable offline observations](../experiments/remember-recall-offline-diagnostics-2026-09-18.json) are separately labelled new fixtures. They do not relabel the original live attempt. That file records exact probe/helper digests and the unchanged historical report digest `c8884b6b7fbeedb44f67615b0bfca9c96d4600203929da6627755e27d448aa91`.

## Next acceptance design

Do not repeat the old padded-user test unchanged and interpret a pass/fail as a pure persistence conclusion. First separate a normal retained-user continuation control from a test whose target occurs only in an assistant/tool item that is actually inside the compacted prefix. Verify the latter is not simply the host-retained newest message; appending another turn may require a different, explicitly approved request budget. Keep the original padded-user case as a separate retention-boundary stress test.

A future real run needs a new explicit budget and the normal execution approval. The earlier three-request budget is exhausted. Any such run must retain these diagnostics and original strict assertions; this offline work supplies no new permission, provider success, savings estimate, Astra acceptance or long-task-quality claim.
