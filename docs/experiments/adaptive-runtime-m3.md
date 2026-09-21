# Adaptive Runtime M3: one bounded read-only delegation action

Status: unreleased, host-staged integration candidate on M2 #233 (`725cd93`), which is stacked on M1 #232. This is not a merged or enabled product, a live Astra/Luna evaluation, or a complete autonomous scheduler. Original Think #220–224 and Split #199/#200 branches remain intact.

## Product purpose and narrow delivery

The goal is useful task quality relative to resources, elapsed time and human interruptions, not maximal reasoning or more agents. M3 introduces `split-readonly` alongside `keep` and `reasoning` in the same per-live-root `AdaptiveDecisionFlow`. An Astra parent may invoke one host-staged investigation during its ordinary tool turn or continue alone. No preliminary model call is added to every request. The shared flow records the decision and its outcomes; it does not calculate or prove the optimal choice.

The trusted host must already have selected the exact task, workspace label, source paths and reviewed SHA-256 identities, plus the exact in-process spawn provider. The model receives only an empty-argument inspection tool. It cannot discover/select directories, set a model or budget, manufacture a grant, inherit parent permissions, or rebind an existing child. This milestone does not implement production offer creation, workspace selection or a new browser transport.

## Reuse and ownership

The source/evidence/context/worker primitives and their four regression files originate from Split #200 at `83f6a021a754e18e076a7d003d6ae98ca58dbd20`. M3 reuses `split-evidence.ts`, `split-context.ts`, `split-dispatch.ts` and the bounded `split-worker.ts`; it does not merge #200's unrelated HTTP, conversation and approval-card delivery. Worker changes add guarded admission/start observations and stream measurement, explicit rejection of nonempty arguments, and allowlisted refusal errors. The source snapshot and context validators are otherwise preserved.

`attachAdaptiveSplit` is an internal host-only composition entry. It deliberately enumerates approved fields instead of spreading caller-supplied authorization hooks. It is not exported from the public package or installed by `src/index.ts`. The normal adapter now wraps `withSplitProviderBounds`, which is inert outside an actual host-owned Split dispatch scope. Package defaults, version, public exports and runtime dependencies are unchanged; two exact development-only spawn dependencies support real-host tests.

## Decision and execution sequence

1. A live Astra root invokes the staged task; Think resolves its canonical current journal/selection and reserves the same per-Agent decision lock. A pending Think decision blocks Split and vice versa. A previously admitted Think change does not authorize delegation.
2. A separate DSH native human question shows an immutable task/source/model/limit review. Its unique question identity and exact single answer are checked. Generic text, a Think answer, extra custom instructions, Auto-review and copied approvals cannot grant this action. This is a new native-question integration, not a claim that the old #200 browser approval transport has been migrated.
3. Only after exact consent and a fresh host observation does the flow enter `queued`. It rechecks state immediately before spawn. A new manual selection or compaction while the question was open invalidates the old decision.
4. The existing host spawn provider creates a fresh, unseeded, depth-one child with its own isolated system/task context. It receives only immutable source snapshots, ordinary `gpt-5.6-luna` at `low`, a host-requested `maxTokens: 2048` setting and the two read/structured-capture tools. That setting is not a proven service-enforced output cap. The flow records `applied` only after the real child/run identity is verified; it does not relabel approval as execution.
5. Every finding must cite a source/hash/range actually read. Only a valid structured result followed by awaited successful child cleanup becomes `completed`. The parent consumes the evidence as a normal tool result and may subsequently propose a separate reasoning decrease. Findings and source text are data, never new instructions or permission.

M3 defaults each staged offer to three child requests and a 60-second approval-plus-execution deadline; the inherited hard maxima remain six requests and 90 seconds. Source limits remain 16 files, 32,000 bytes each, 128,000 bytes total, 24 reads and 16,000 bytes per read. Child HTTP requests use SSE with zero provider retries, no fallback route and the 4.39 governor's per-attempt correlation, cancellation, redirect checks and proxy lifetime. No recursive delegation, writes, shell/code execution or network tools are available.

Revocation requests cancellation immediately but does not claim successful cleanup until awaited disposal completes. Runtime disposal cancels an outstanding delegation. Failure to clean up quarantines the shared adaptive-action lock rather than admitting another action. Rejection is surfaced with a distinct allowlisted error, not disguised as a temporary model failure that should be retried. A consumed offer cannot be automatically reused.

Final review found that the inspected pi-ai 0.84.4 Codex `buildRequestBody` does not serialize `maxTokens` into `max_output_tokens`. The native consent review therefore labels 2,048 as requested and explicitly sets `serverOutputTokenLimitVerified: false`; it must not promise a token or subscription-spending ceiling. Actual local bounds are the request/step count, deadline with cooperative cancellation, 512,000-byte payload guard, 128,000-byte streamed response guard and bounded source/result sizes. Cancellation cannot prove that upstream computation stops instantly. This limitation is retained rather than inventing an undocumented backend field or claiming economic savings.

## Think and Remember composition

Tests exercise an Astra parent that admits higher reasoning, completes a real host native or ordinary-fallback prefix compaction, delegates a fresh isolated task, consumes its result, and admits a later decrease. The child never receives the parent's reasoning notices, native checkpoint or complete context. The original journal remains the authority for the parent; no Split ticket becomes a portable or durable grant.

The inherited worker still refuses any mounted `sessionPersistence` service. This intentionally does **not** establish worker cold resume, durable permission/budget reconstruction or operation in an installed persistent daily profile. M1's separate durable Think/Remember writer/restore regression remains mandatory; it is not relabeled as M3 worker persistence. These are cooperating mechanisms under a bounded ephemeral composition, not three universally composable production switches.

## Measurements and evaluation limits

Existing M2 memory observations now include `purpose: delegation` for the actual child adapter streams in the parent's flow, separate from parent task and compaction samples. They retain only the latest available usage counters, elapsed stream time, a local ordinal, selected effort and bounded outcome. No prompt, reply, task/source identity, review digest, account, credential or approval text is copied into these observations. DSH's ordinary tool/question/session logs remain unchanged.

Local application is not remote model success; completed structured inspection is not independently graded correctness. Counters do not establish subscription cost, total HTTP-attempt expenditure, task-wall-time savings or the value of delegation. No cost/quality claim is made from synthetic responses. A later explicitly authorized comparison must grade complete tasks against fixed-effort single-agent baselines and count all main/child/compaction calls, missing usage, retries, errors and human interruptions.

## Candidate checks

Run `pnpm run check`, `pnpm run test:browser`, `node scripts/check-think-controls.mjs`, `node scripts/check-think-matrix.mjs` and `pnpm run check:dsh-matrix`. The Think matrix is extended with all 31 named M3 host cases in `scripts/adaptive-split-cases.mjs`, in addition to the existing 42 Think/M2 cases and exact imported-runtime identity. Old 42-case reports do not satisfy it. The same synthetic tests execute against each of the four declared DSH releases; no test makes a real model request.

The M3 cases cover consent/refusal/forged answers, wrong owner/extra scope, no-op and default-off behavior, single use, immutable source snapshots, competing Think/Split decisions, stale selection/compaction, approval and execution timeouts, cancellation/disposal, child budgets/forbidden tools, bad evidence/results, native/fallback parent composition and cleanup failure. Browser regressions retain existing Think/native control coverage; they are **not** full authenticated M3 Session-page acceptance.

Exact source, artifact identity, command outcomes and remaining gaps belong in `.github/ADAPTIVE_RUNTIME_M3_VALIDATION.md`, the associated bounded matrix records and exact-head PR checks. Independent code review, authenticated production staging/UI, persistent worker lifecycle, real model protocol acceptance and measured recommendation/economic quality remain separate gates. No release or daily-service update is included.
