# Phase 1 comparison plan — no live model runs performed

This is the agreed first evaluation corpus specification, not benchmark evidence. Before running, select a non-secret repository snapshot, record its exact revision, provide the same original task and permitted tools to every arm, and write executable acceptance checks. Use isolated worktrees and fresh sessions. Do not use this plan to start a real account/model test without explicit task and usage authorization.

## Twelve tasks

| Id | Task | Acceptance established before execution |
| --- | --- | --- |
| S1 | Add a documented optional boolean setting to a small fixture | Off default; save/reload; malformed values rejected; no unrelated behavior changes |
| S2 | Fix an off-by-one pagination bug | First/last/empty pages; stable cursor; regression that failed before the fix |
| S3 | Add one English/Chinese label | Both locales; narrow-screen accessible label; no routing or authority change |
| R1 | Repair stale UI state after switching sessions | Delayed old response cannot overwrite new session; requests cancelled; no mutation retry |
| R2 | Add a bounded parser for a documented event | Valid/rejected schemas; chunking/oversize cases; safe failure without raw credential output |
| R3 | Refactor duplicated deterministic request metadata | Both callers preserved; no new external calls; exact headers and errors checked |
| H1 | Diagnose cancellation versus queued network work | Deterministic reproduction; correct cleanup; no leaked slot and no false success |
| H2 | Repair a race in persisted request reservations | Concurrent and separate-process attempts cannot exceed the shared cap or reset counters |
| H3 | Review a cross-session authorization boundary | Seeded flaws independently identified with source evidence; false positives recorded; scope unchanged |
| L1 | Preserve an explicit requirement across two compactions | Exact requirement survives in effective context; no fabricated history or repeat work |
| L2 | Continue a partial implementation after process replacement | Original task and changes retained; correct interrupted state; no repeated authority/action |
| L3 | Finish a staged change, then a user-requested manual exit | Successful phase acceptance plus normal manual continuation and no implicit auto-resume |

The existing synthetic host/UI/persistence tests provide mechanical examples of several criteria, not measured model performance on these twelve tasks. Do not grade “used Astra” or “handed off” as success. A correct no-handoff solution can be best.

## Arms and recording

Compare fixed Sol/Medium with Phase 1 starting Sol/Medium under the same allowed model pool and task request ceiling. On representative tasks include direct Luna/Max, Terra/Medium and Astra/Low controls so an unnecessary Sol prelude cannot masquerade as a gain. Use identical cleaned task state, environment, permissions, requirements and acceptance tests. Record the exact model/catalog/effort versions and any nondeterministic setting. Repeat each screened task at least three times in randomized arm order before drawing a tentative conclusion; this is a pilot, not a population-wide savings claim.

For each run retain independent acceptance outcomes, final diff and failed checks, whole-task elapsed time, every managed model/compaction/auxiliary request reservation, available provider token counters with absent values explicitly unknown, retry/failure/interruptions, and user interventions. Do not add reasoning tokens a second time to inclusive output fields. Keep provider pricing separate from subscription usage. Store artifacts privately with redaction and explicit retention; do not upload prompts or project sources as telemetry.

Freeze the rubric before opening outputs; review without route labels when practicable. Report all failures and timeouts, not only completed runs. A framework stop is not a correct solution. Compare quality first, then the time/resource/interruption tradeoff at comparable quality. Count the cost of context expansion, lost caching and handoff verification. Model self-confidence and the number of models used are not grading criteria.

## Go/no-go

Security/lifecycle failures block promotion regardless of average results. A candidate must not materially degrade simple-task correctness or add needless user interruptions. An observed benefit must recur on more than one task/repetition and survive comparison with a suitable fixed-model control. Publish uncertainty and per-task exceptions rather than one unsupported global percentage. Remove or narrow consistently unhelpful choices. Full live protocol acceptance and human comprehension remain distinct gates from this pilot's measurements.
