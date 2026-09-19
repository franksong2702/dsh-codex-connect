# Split: one bounded read-only worker

Status: **design gate with offline boundary tests, not a shipped worker**. Tracking: [#198](https://github.com/franksong2702/dsh-codex-connect/issues/198), parent [#195](https://github.com/franksong2702/dsh-codex-connect/issues/195).

Refreshed baseline (2026-09-19): `085d1d618a01bba6f28ed002f7d5af088a85d4d0`, including merged #212/#213/#214. The original design started at #197's merge `78c8f71e35755e90e0437371b4365c778c05f955`. Remember remains default-off; its two bounded live Luna JSONL/restart controls have passed, while broader quality/accounting and other acceptance remain open in #196/#65. This design does not retest or certify Remember, and does not incorporate #216's user-preview changes.

Review result: retain the fresh, one-shot, read-only approach. Tighten task authorization, implementation identity, and cleanup ownership before the worker can be promoted. This PR still changes only this design and its baseline-host tests; it does not expose or enable Split. The separate #200 prototype already has synthetic Gateway/Session Controller/Conversation approval flows at observed head `694b58e`. Do not recreate that entry from an outdated assumption that no UI exists. Git ancestry confirms the local worker branch `d9dbaa8` is one commit behind that remote, with no local-only commits; preserve its working tree while preparing the next task.

## 1. The first question

Can the parent hand one well-bounded inspection task to a DSH-owned child, give it less conversation context and less execution authority, receive verifiable findings, and terminate it reliably?

First prove that mechanism. Then compare it with a single-agent baseline. Do not build an autonomous scheduler before discovering a task class where delegation helps.

The first worker maps a code path or independently checks a specified change. It does not edit, approve a merge, run arbitrary shell, browse the network, create grandchildren or choose an expensive model. The parent decides what to do with the returned evidence.

## 2. Three different execution paths

| Path | Lifecycle owner | Relevance to this experiment |
| --- | --- | --- |
| DSH in-process spawn/fork | DSH subagent seam and Agent factory | Preferred: fresh one-shot spawn, not full-history fork. The existing Codex Connect adapter remains the model transport. |
| DSH `subagent-codex` / external ACP | Separate Codex app-server or external process plus its provider | A different transport with separate permissions, environment, cleanup and capability contracts. Do not select it silently. |
| OpenAI hosted Responses Multi-agent | Provider-hosted orchestration with agent-attributed items | Separate protocol research, not implied by a local DSH child or by native compaction working. |

The September 12 reconnaissance of OpenAI hosted API documentation described server-executed collaboration actions and encrypted inter-agent items, shared tool access, and different compaction/reasoning constraints. This is historical comparison evidence, not a current endpoint-availability claim. A custom DSH tool must not impersonate hosted actions, and public API availability would not establish support on our ChatGPT subscription transport. We will not turn on hosted multi-agent or interpret its items as ordinary DSH tool calls in this phase.

Official Codex subagent configuration is useful as a comparison, not an authorization mechanism for DSH. A persona or a role called "read-only" is not itself an execution boundary.

## 3. What the inspected DSH code provides

Installed baseline: `@deepseek-ai/dsh-subagent`, `dsh-agent`, `dsh-agent-loop`, and `dsh-tools` at `0.1.2-rc.1`. The repository currently has the abstract subagent seam installed; it does **not** have the concrete spawn provider installed as a top-level dependency. No new dependency is added by this design gate.

| Existing seam | Contract relevant to the first worker |
| --- | --- |
| `ctx.subagents.start(name, request)` | Checks requested capabilities before handing off to the named provider. Unsupported tool filtering must reject, not silently degrade. |
| `SubagentStartRequest` | Carries the actual parent Agent, a caller-owned AbortSignal, optional route options, tool filter, depth limit and output schema. |
| `SubagentRun` | Publishes a child identity, a terminal-result promise and an idempotent disposer. A resolved result can still report error, abort or truncation. |
| `AgentRegistry.create(... setup)` | Composes a child scope before publication; the holder owns teardown through AgentHandle. |
| `applyChildComposition` | Applies inherited composition and child-specific filtering/persona in the creation window. |
| `resolveChildDepth` / `childSessionMeta` | Preserve parent lineage and a monotone depth count; restarting must not reset recursive authority to zero. |
| `tools.restrict` / `tools.guard` | Restriction controls inherited visibility and dispatch. Guards deny at the execution boundary and cannot force-allow another guard's denial. |

Upstream reconnaissance was pinned to DSH `c291e7961a515f6d7af9304e7fd1d257929aef26`. Its spawn provider uses the shared in-process driver with no parent-history seed and advertises the five relevant start capabilities. Its separate Codex provider advertises no such start capabilities and starts an official Codex app-server wrapper. These are not interchangeable merely because both use the word "Codex".

The pinned upstream source and our supported releases differ. For example, that driver's setup contract passes `parentAgent` and a callback that receives the child, while the installed baseline factory's public type has a one-argument setup callback. The implementation phase must use exact host packages and a capability/version check; copying unpinned master code into the baseline is not a compatibility strategy.

## 4. Proposed smallest operation

The future parent-facing operation is conceptually `inspect_with_worker(task)`. The name is provisional; no tool is registered by this PR.

1. The user explicitly enables the experiment. In this first phase, each bounded task also needs an authenticated user decision binding the objective, approved source manifest, parent/session owner, fixed route/effort, budget and expiry. A parent-model proposal, model-authored path, opening the UI or installing/logging into the plugin is not consent. Approval covers the bounded task's internal steps, not a new confirmation for every permitted read.
2. Resolve one known DSH spawn provider and verify its actual capabilities. Refuse missing/unsupported providers; do not substitute ACP, a Codex subprocess or hosted multi-agent.
3. Reserve one child slot for the parent. Validate the brief and limits **before** creating anything. Reject a second concurrent operation in phase one rather than inventing a queue.
4. Start a fresh one-shot child with no inherited conversation seed, maximum depth one and a fixed approved model/effort. The initial live route, when separately authorized, is ordinary `gpt-5.6-luna`, not Reserve/Sol/Astra.
5. Give the child an audited read/search capability over approved roots and structured-result capture only. Keep execution guards active for the child's entire lifetime.
6. Require a terminal completed result and schema/size-valid evidence. Treat findings and text as untrusted data, not instructions to execute.
7. Parent consumes the result as tool data and decides the next action. The owner always attempts disposal in `finally`, but releases its admission slot only after confirmed quiescence. Cleanup failure or an unknown outcome blocks further admission; it must not free a slot merely because the cleanup promise settled or threw.

No automatic delegation policy is introduced yet. A task that is already answered by one small local lookup should remain with the parent.

Permission is bound to the exact reviewed operation, not just a reusable boolean or a visible card. A changed source revision, route, owner or budget requires a new review; reject stale, mismatched or expired decisions before dispatch. Repeated clicks, reconnect and lost-response recovery must observe one operation, not create another child or replenish its budget. A deny, revoke, disabled feature, owner disposal or expired deadline cannot be turned into permission by later model output. Already-approved internal work remains subject to the host's existing tool policy; approval never overrides a host denial. Turning the feature off blocks new admissions and revokes outstanding work through the same cleanup contract.

## 5. Read-only is an execution policy, not a prompt

A DSH restriction intentionally leaves tools registered in the child's own scope visible, including machinery needed to capture structured output. Some presentation transports are also outside the ordinary filterable registry. Therefore `toolFilter: { allow: [...] }` alone is not a sufficient claim of read-only behavior.

The initial composition must use both a narrow advertised surface and an execution denial guard. The guard must consider approved capability implementations, not blindly trust a familiar name. No generic shell, write/edit, network, publication, settings mutation or delegation tool may be reachable. Explicitly audit the provider's structured-capture tool and reserved `run_code`/nested dispatch path instead of blocking all local tools and accidentally preventing results.

An audited file-read capability must bind roots outside model control, reject root escapes and symlink escapes, exclude credentials and private files, bound bytes and file counts, and return source identity with evidence. Read-only access can still leak secrets; forbidding writes is not enough. These filesystem checks are **implementation gates**, not covered by the current synthetic tools.

Trusted same-process plugins remain in the host trust domain. A filter/guard is not an operating-system sandbox against malicious plugin code. Do not claim it prevents a trusted plugin from doing arbitrary filesystem operations outside the tool pipeline. The original fixture's name-based guard is deliberately insufficient: a new negative control demonstrates same-name child-local substitution, and a companion fixture rejects that substitution by pinning the approved definition. This small registry check is not a shipped guard: the worker must separately seal/audit executable implementations and dispatch wrappers, structured capture, reserved transports and actual read-root enforcement before enablement.

## 6. Bounded execution and cancellation

Proposed initial limits, to be enforced before live evaluation: one active child per parent; maximum depth one; one immutable text brief of at most 16,000 UTF-8 bytes; structured result at most 16,000 bytes and ten findings; at most six model dispatches/steps; 90-second wall-clock budget; no automatic retry, fallback route or recursive child. These numbers are experimental starting points, not current product settings or a claim of token-cost control.

`maxTokens` limits a response, not a whole delegation's cost. A limit must have an actual enforcement point. If the exact host does not expose a usable enforcement hook, the operation must refuse or use an explicitly narrower validated contract, not merely advertise the bound.

Cancellation must cover pre-publication creation and post-publication execution. The inspected baseline `SubagentRuntime.start` checks capabilities and request shape but delegates startup cancellation to the provider; merely supplying an AbortSignal is not proof of enforcement. Check revocation/deadline before admission and immediately before dispatch, and verify the provider cleans any unpublished partial resources. A cancellation request is not proof that a child has stopped. Pair lifecycle outcomes and await quiescence after startup or result failure. If disposal fails or termination is unknown, retain a blocked admission record and report cleanup failure; do not admit a replacement, erase the record, or retry an outcome-unknown start automatically. A later explicit reconciliation may release the record only with evidence that the owned child is stopped.

The first implementation does not resume a child after process restart. Until permission, owner, absolute deadline and consumed budget can be reconstructed safely, refuse a durable worker composition before child creation/model dispatch, including when persistence is introduced after task approval. Do not disable the user's persistence to make the experiment run. A restart/reload must not silently relaunch a task or grant more work. Process-local UI status recovery is not cross-process worker recovery. Durable continuable children, fork anchor selection, sibling concurrency and crash recovery are separate work.

## 7. Result and evidence contract

An example schema shape is an object with `summary`, `findings[]`, and `limitations[]`. Each finding contains a category, bounded explanation, and one or more source references (approved relative path, line range, and observed revision/content identity). Empty findings are valid; a tool failure is not "no issues found".

Reject malformed objects, oversized strings, excessive findings, absolute/private paths and references outside the approved scope. Validate source revision and line bounds against the approved captured evidence, not merely a plausible filename. A completed child without valid requested structured output is failure. Preserve aborted/error/max-token status; never promote partial output to completed success. Failed or uncertain cleanup remains a failure even if valid findings arrived first; those findings must not automatically authorize parent effects.

Operational measurements should contain only route/effort, run relationship, elapsed time, bounded counters, coarse outcome, cancellation and denial categories. Do not add credentials, raw account IDs, opaque items, prompts or source text to generic telemetry. Ordinary DSH session persistence is a separate user-data surface; it must follow host policy rather than inventing an extra unrestricted experiment log.

## 8. What this PR actually tests

`tests/split-readonly-boundary.spec.ts` uses real installed Cordis, AgentRegistry/AgentLoop, SubagentRuntime and ToolRuntime scopes. It uses deterministic fake read/write bodies, never loads account credentials, and rejects/asserts absence of global fetch. It does not run a model, invoke the concrete spawn provider, or persist/resume a worker.

The 19 cases verify:

- inherited read is executable while inherited write is hidden/refused for the child; the parent's write remains available;
- filter-only composition still permits a child-local registration (an intentional host behavior, demonstrated rather than assumed safe);
- adding a monotonic execution guard denies that child-local effect;
- a name-only guard still accepts a same-name child-local substitution, while an approved-definition guard rejects that specific substitution without affecting parent execution;
- a non-denying guard cannot undo another guard's denial, in either registration order;
- an already-cancelled tool call does not execute the read body;
- lineage and depth are stamped, and the same cap rejects another generation;
- each missing requested capability (route options, output schema, depth, tool filtering and persona) rejects before a synthetic provider's start callback;
- a missing provider does not fall back to another registered provider, and negative/fractional/unsafe depth values reject before provider start;
- repeated child-handle disposal leaves the parent alive.

These are executable design constraints, **not** a parent -> delegate -> child model -> result -> parent integration test. Authenticated consent, expiry, cleanup-failure admission, actual source reads and persistence rejection remain worker implementation gates, not tests implemented here. The #200 integration and its dedicated matrix must be reviewed on their own exact source rather than inferred from these tests. Current boundary tests run on the installed baseline; this PR's existing four-host matrix tests installation/Remember, not these new Split boundaries.

## 9. First implementation and evaluation gates

Implementation PR #200: reconcile its preserved local work, update to this reviewed design/main baseline, and review the existing exact-version spawn integration, default-off authenticated approval, dedicated composition, strict bounds, audited source reads, structured results and teardown. Retain synthetic coverage for happy path, forbidden calls, malformed results, cancellation around publication, timeout, recursion denial and concurrent admission; explicitly verify cleanup-failure quarantine, stale approval and late-added persistence against this contract. Require current-head CodeQL and fresh CI. Its existing worker matrix and separate Gateway/Conversation browser gate are distinct evidence; do not count this design PR's ordinary compaction matrix as delegation evidence. No #216/3081 mutation is needed to review or test Split.

Live evaluation comes later under an explicit budget. Use matched tasks for a single parent versus parent plus one worker: cross-file call-path mapping, independent checking of a seeded regression, and a trivial one-file question where refusing to delegate is expected. Keep model/effort and evidence scopes controlled. Measure finding correctness, missed findings, duplicated reads, total reported tokens, latency, interventions and denied effects. A staged mock that always finds the answer cannot prove quality or savings.

No runtime settings, provider registrations, package dependencies or production services change in this design gate. No broad benchmark or paid inference is run. #167 remains a separate Think redesign.

## 10. Sources and reproducibility

Original reconnaissance: 2026-09-12. The baseline-host source and tests were re-inspected on 2026-09-19 after merging main `085d1d6` without changing dependency versions. Local baseline package source is authoritative for executed tests; the pinned upstream and documentation links below are historical comparison references, not a fresh certification of upstream master or provider endpoint support.

- Installed `node_modules/@deepseek-ai/dsh-subagent/lib/types/types.d.ts:92-148,212-274`: request, result and one-shot ownership.
- Installed `node_modules/@deepseek-ai/dsh-subagent/lib/types/child-agent.d.ts:21-138`: depth, composition and delegated policy.
- Installed `node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts:471-489,603-642`: restriction exemptions and execution guards.
- Installed `node_modules/@deepseek-ai/dsh-subagent/lib/index.js:2982-3061`: capability validation and provider-owned startup cancellation.
- [DSH spawn provider at pinned upstream commit](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent-spawn-in-process/src/index.ts).
- [DSH in-process driver at the same commit](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent-in-process-driver/src/index.ts).
- [DSH separate Codex subprocess provider](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent-codex/src/index.ts).
- [Official Codex subagents documentation](https://developers.openai.com/codex/subagents).
- [Official hosted Responses Multi-agent documentation](https://developers.openai.com/api/docs/guides/responses-multi-agent).

```sh
pnpm exec vitest run tests/split-readonly-boundary.spec.ts
pnpm run typecheck
pnpm run check
```

No live flag, credentials or running DSH profile is required for these checks.

## 11. September 19 review and delivery evidence

The design was refreshed by merging exact main `085d1d6` into a separate worktree based on the original PR head `8b52da6`; original history is retained and no force-push is required. The final diff against main remains exactly this design and `tests/split-readonly-boundary.spec.ts`. Product source, built runtime, dependency lockfile, feature defaults and release configuration are unchanged by this PR.

On Node `22.22.3`, all **19** focused authority tests passed. `pnpm run check` passed **99 files / 984 tests**, typecheck, lint, build, CLI, compatibility and package checks (original execution `wc_job_8Em5vMzPl2Tcg9Du`). Final-commit remote CI is tracked on #199; do not substitute these local results for it. Its four-host installation/Remember matrix remains distinct from baseline-only Split design tests.

Review findings resolved in the contract: approval must bind the authenticated user/parent and reviewed operation; names alone do not bind implementation authority; non-denying guards cannot undo denial; failed/unknown cleanup must retain an admission block; and unsupported durable compositions must reject rather than silently reset permission or budget. Only the registry/capability/depth aspects are executable in this PR. The rest must be checked against #200's real worker before product acceptance.

The #216 branch and the user's 3081 preview are not updated, restarted or used by these tests. No real credentials or model requests are used. #199 is not the Split feature's user acceptance, does not authorize a live comparison, and does not close #198, #196 or #65.
