# Remember delivery preparation — 2026-09-19

## Resumed delivery review — 2026-09-19

After the user's explicit continuation, the normal WebCodex issue-read and evidence-review operations completed. The earlier safety-blocked call remains a historical event; it is not reclassified as a successful execution. Current issue reads found #196, #65 and #195 open, and no existing PR for this delivery branch. Main was still `574d55f`.

The review verified all four new JSON evidence files for raw target/answer, opaque-content, credential and private-path fields; no such payloads were found. Original A/B and failed-run digests remain unchanged. A/B report assertions, distinct process identities, usage sums and probe/helper source hashes match the historical `ad7c934` execution. Product code, built output, dependencies, compatibility metadata and workflows remain identical to the main baseline.

The outstanding local notes below describe the prior interrupted preparation. The resumed task will commit the reviewed evidence and navigation updates, publish one PR and prepend bounded status notes to the three trackers without closing them. PR creation is not a release. Final remote CI must be checked against the PR's exact head; the prior local checks are not remote evidence. See the PR and its read-back status notes for actual submission/check results.

## Historical observed state and publication blocker

The current task is authorized to consolidate the local Remember diagnostics/controlled probes and their existing live evidence into one PR, synchronize the relevant issue status, and prepare a limited user experience plan. It does not authorize another live experiment, merge, release, deployment or daily environment upgrade.

The successful initial observation found local branch `franksong2702/remember-offline-diagnostics-20260918` at `ad7c93481096b4750ede77dc93a19b241b7f11e0`, with preceding diagnostic commit `263bfcd866fc028798e39d588939ca899d564ba1`. Remote main was `574d55f2f990053c64fabd3fb8867318875183a4`. The open-PR read returned #167, #199 and #200; no duplicate Remember delivery PR was observed. Uncommitted changes included the prior live A/B reports, their acceptance entry and existing local handoff records.

A subsequent combined `run_script` request to read issues #196/#65/#195, inspect the live-report structure/hash and review part of the local diff was blocked because OpenAI could not determine the request's safety. It returned no command result. Those reads were not retried, subdivided or moved to another execution route. Their dependent issue writes and public delivery confirmation remain stopped. The blocker is not evidence that GitHub denied write permissions, that the local Runner disconnected, or that the acceptance tests failed. No PR, push, remote CI run or issue update was completed by this preparation.

## Fresh local validation

The independent `pnpm run check` completed successfully under original job `wc_job_xfGLXCEKw2ikT4Qr`, exit 0: **98 test files / 965 tests**, plus the command's lint, typecheck, build, workflow-contract, CLI, compatibility and package checks. The reported package check at that point counted 83 files. This note is a documentation addition after that command. This is fresh local validation of the current code, not remote CI and not additional live-provider acceptance.

The existing A/B evidence narrative and controlled-case tests were read directly. They distinguish normal retained-user replay from assistant-origin opaque-only recall; the oversized-user failure remains separately recorded. Live test source identity is `ad7c934`, not a future delivery commit. No current claim is made that the blocked publication/privacy audit completed.

## Proposed PR text — not submitted

**Title:** `test: deliver bounded Remember restart controls and live acceptance evidence`

**Scope:** Consolidate the prior two local test-tool commits, the original failed oversized-user record, request-derived synthetic controls, content-free recall diagnostics, and the separately recorded successful live A/B controls. Include a clear current-state entry and the [limited user acceptance plan](../experiments/remember-user-acceptance-plan.md). Related to #196, #65 and #195; no automatic closing keywords.

**What is established:** At source `ad7c934`, ordinary Luna on direct DSH `0.1.2-rc.1` / pi-ai `0.84.4` / Cordis `4.0.2` passed one retained-user persistence control and one assistant-origin opaque-only recall control. Each used four requests and distinct writer/resume processes. Physical checkpoint equality, replay identity and a newly generated exact answer were recorded. A intentionally carries the answer in retained user input; B's replay contains no plaintext target outside its opaque item. Eight requests total and 6,737 backend-reported tokens belong to that historical run, not to this PR task.

**What is not established:** The oversized-user failure remains unexplained. These cases do not certify Astra, arbitrary user-message deletion, repeated/automatic compaction, tools, images, UI forks, crashes/disk failure, long-task quality, pricing or savings. The native compaction engine, model choices, credential logic, supported-host declaration and default-off behavior are not intended to change in this delivery.

**Validation:** Cite the fresh local check above as local evidence only. Before publication, complete the outstanding evidence/privacy and final-diff review. After creating the PR, require its exact final commit's normal Linux Node 22/24 tests and four-host matrices, browser regression, Windows contract, dependency review and CodeQL; do not substitute historical checks. No remote checks were run by this task.

**Boundaries:** No additional credential reads or live requests. Preserve one-shot run claims and old outcome records. Do not include `handoff/`, `.remember-acceptance-runs/`, local repair archives or actual session material in the public patch. Do not merge, publish, deploy, upgrade or enable experiments by virtue of opening the PR.

## Proposed issue updates — not submitted

For **#196**, record the bounded Luna A/B persistence and opaque-recall gate as supported by the original execution evidence after publication review, while keeping broader unchecked acceptance items explicit. Do not close the issue in this task or mark untested checklist entries complete.

For **#65**, link the same bounded result as a feasibility/lifecycle data point; retain oversized-user semantics, repeated compaction, long-task quality and accounting/value questions as open research.

For **#195**, advance only the Remember status to reflect its limited A/B evidence and delivery-PR stage. Do not imply Think/Split composition is supported or any new default is enabled. Read the actual current issue text before applying an update; that read is still blocked in this task.

## Next user experience gate

The [experience plan](../experiments/remember-user-acceptance-plan.md) is saved, but no UI entry is provisioned. The intended user task is a short disposable planning conversation with three ordinary constraints, one rejected alternative and one pending action. The engineer verifies actual compaction and shutdown/reopen; the user judges whether the assistant still respects those constraints and continues the pending work. No user installation or shell commands are part of that plan. Serving the UI and spending further model requests require separately scoped authorization.
