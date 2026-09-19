# Remember: authorized real-provider persistence attempt — 2026-09-18

**Result: failed acceptance, no retry.** The original job `wc_job_TeKLgEANdeW4M6J-` completed with exit 1 and `RECALL_MISMATCH_NO_RETRY`. Its [sanitized report](native-compaction-durable-m15-2026-09-18-1317.json) records exactly three real requests to plain `gpt-5.6-luna`. This does not close #196 or #65.

## Exact scope and identity

The user explicitly authorized one new bounded attempt after the offline preflight: the previously specified M15 Codex login, at most three Luna requests, no credential refresh/write, account/model switching, automatic retry, publication, deployment, environment upgrade or live project sessions. The earlier reported blocked attempt was not reinterpreted as successful or recovered; this run has its own execution receipt.

Machine identity was verified as `XUEFU-MacBook-Air-15`. The local preserved branch remained at `3de1b6934ae0d71d0a39d9ff6d77145c711d966a`. Seventy-one relevant source/probe/manifest/lockfile blobs were matched to merged-main reference `574d55f2f990053c64fabd3fb8867318875183a4` before the attempt. Node was `22.22.3`, the probe's direct DSH packages `0.1.2-rc.1`, pi-ai `0.84.4`, and Cordis `4.0.2`. Full hashes and actual versions are in the report. This is not a claim that the entire local checkout was at main.

The unchanged command was run once through the normal WebCodex process tool:

```sh
node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/native-compaction-durable-smoke.mjs --live --codex-login
```

## What was observed

- All three requests returned HTTP 200, terminal `completed`, and server model `gpt-5.6-luna`.
- The write phase explicitly reported a real DSH compaction transaction, a committed native checkpoint, an actual JSONL checkpoint, and removal of the original label-bearing user item from visible retained input.
- The separate resume process reached its actual continuation request, which completed at the provider, but the extracted response text did not exactly equal the expected random label. The probe trims outer whitespace before comparison; the remaining mismatch is not explained by this report.
- By inspection of the unchanged script's control flow, reaching the resume request means the different-process and restored-checkpoint digest checks passed, and the dispatch guard found exactly one compaction item and no literal target label in non-compaction input. These are control-flow implications, not additional independently emitted success flags.
- `fresh_processes_completed: 1` counts completed successful phases, not the number of launched processes. The writer phase succeeded; the separately launched resume phase failed its final recall assertion, so it is not appended to the successful `phases` array.
- Reported provider usage totals 1,282 input + 117 output = 1,399 tokens. The 35 reported reasoning tokens are included in output, not added again. These are backend-reported counts, not a price, savings or long-task-quality result.
- The probe reported zero retry, fallback or blocked extra dispatches, unchanged credential-file bytes, and removal of temporary session/checkpoint storage. No live request was issued after the terminal result.

## What remains unknown

The existing probe deliberately does not retain the random target label or returned answer. Therefore this evidence cannot distinguish an incorrect or forgotten label from added wording, casing, punctuation, or another answer-format mismatch. It cannot establish whether the underlying defect is provider recall, the selected compaction content, or the test's exact-match expectation. HTTP success and checkpoint persistence do not establish semantic recall success.

Next engineering work should inspect the test and compaction payload construction offline, and design privacy-preserving mismatch diagnostics (for example exact-match, case-only, target-contained and answer-length indicators) before proposing any separately authorized real rerun. Do not loosen the passing criterion merely to obtain a green result. This attempt's three-request authorization is exhausted.

## Evidence recording

The new handoff task was created, but its binding call returned `handoff_binding_not_saved_or_conflicting`; a readback showed the task exists unbound. The real execution still has the original Runner job receipt above, recorded through the existing Workflow Session. The JSON file copies that job's final sanitized stdout under `probe_report` and separately labels contextual metadata; it does not manufacture missing provider text or a successful resume phase.

Only local evidence and handoff records were added. No product code, installed service, credential, release, support declaration or default feature flag was changed by this attempt.
