# Split: one bounded read-only worker

Status: **design gate with offline boundary tests, not a shipped worker**. Tracking: [#198](https://github.com/franksong2702/dsh-codex-connect/issues/198), parent [#195](https://github.com/franksong2702/dsh-codex-connect/issues/195).

Baseline: `78c8f71e35755e90e0437371b4365c778c05f955`, the normal squash merge of #197. Remember remains default-off. Its real-provider JSONL/restart acceptance and broader quality/accounting work remain open in #196/#65; this proposal neither substitutes for nor closes them.

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

The current OpenAI hosted API documentation describes server-executed collaboration actions and encrypted inter-agent items. It also describes tool access shared by agents and different compaction/reasoning constraints. A custom DSH tool must not impersonate these hosted actions, and their availability on the public API does not establish support on our ChatGPT subscription transport. We will not turn on hosted multi-agent or interpret its items as ordinary DSH tool calls in this phase.

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

Upstream master and our supported releases differ. For example, the inspected current driver passes `parentAgent` and a setup callback that receives the child, while the installed baseline factory's public type has a one-argument setup callback. The implementation phase must use exact host packages and a capability/version check; copying master code into the baseline is not a compatibility strategy.

## 4. Proposed smallest operation

The future parent-facing operation is conceptually `inspect_with_worker(task)`. The name is provisional; no tool is registered by this PR.

1. The user explicitly enables the experiment. A parent-approved task binds the objective, permitted evidence roots and budget. A model-authored path or instruction never creates filesystem authority.
2. Resolve one known DSH spawn provider and verify its actual capabilities. Refuse missing/unsupported providers; do not substitute ACP, a Codex subprocess or hosted multi-agent.
3. Reserve one child slot for the parent. Validate the brief and limits **before** creating anything. Reject a second concurrent operation in phase one rather than inventing a queue.
4. Start a fresh one-shot child with no inherited conversation seed, maximum depth one and a fixed approved model/effort. The initial live route, when separately authorized, is ordinary `gpt-5.6-luna`, not Reserve/Sol/Astra.
5. Give the child an audited read/search capability over approved roots and structured-result capture only. Keep execution guards active for the child's entire lifetime.
6. Require a terminal completed result and schema/size-valid evidence. Treat findings and text as untrusted data, not instructions to execute.
7. Parent consumes the result as tool data and decides the next action. The owner always awaits disposal and releases the child slot in `finally`.

No automatic delegation policy is introduced yet. A task that is already answered by one small local lookup should remain with the parent.

## 5. Read-only is an execution policy, not a prompt

A DSH restriction intentionally leaves tools registered in the child's own scope visible, including machinery needed to capture structured output. Some presentation transports are also outside the ordinary filterable registry. Therefore `toolFilter: { allow: [...] }` alone is not a sufficient claim of read-only behavior.

The initial composition must use both a narrow advertised surface and an execution denial guard. The guard must consider approved capability implementations, not blindly trust a familiar name. No generic shell, write/edit, network, publication, settings mutation or delegation tool may be reachable. Explicitly audit the provider's structured-capture tool and reserved `run_code`/nested dispatch path instead of blocking all local tools and accidentally preventing results.

An audited file-read capability must bind roots outside model control, reject root escapes and symlink escapes, exclude credentials and private files, bound bytes and file counts, and return source identity with evidence. Read-only access can still leak secrets; forbidding writes is not enough. These filesystem checks are **implementation gates**, not covered by the current synthetic tools.

Trusted same-process plugins remain in the host trust domain. A filter/guard is not an operating-system sandbox against malicious plugin code. Do not claim it prevents a trusted plugin from doing arbitrary filesystem operations outside the tool pipeline. The test guard is intentionally name-based and uses known fixture definitions; same-name substitution, reserved transports and actual read-root enforcement must be tested before enabling a real worker.

## 6. Bounded execution and cancellation

Proposed initial limits, to be enforced before live evaluation: one active child per parent; maximum depth one; one immutable text brief of at most 16,000 UTF-8 bytes; structured result at most 16,000 bytes and ten findings; at most six model dispatches/steps; 90-second wall-clock budget; no automatic retry, fallback route or recursive child. These numbers are experimental starting points, not current product settings or a claim of token-cost control.

`maxTokens` limits a response, not a whole delegation's cost. A limit must have an actual enforcement point. If the exact host does not expose a usable enforcement hook, the operation must refuse or use an explicitly narrower validated contract, not merely advertise the bound.

Cancellation must cover pre-publication creation and post-publication execution. A cancellation request is not proof that a child has stopped. The owner awaits quiescence, pairs lifecycle outcomes and releases its slot even when startup, result parsing or disposal fails. Never retry an outcome-unknown start automatically.

The first implementation does not resume a child after process restart. A restart must not silently relaunch the task or grant it more work. Durable continuable children, fork anchor selection, sibling concurrency and crash recovery are separate work.

## 7. Result and evidence contract

An example schema shape is an object with `summary`, `findings[]`, and `limitations[]`. Each finding contains a category, bounded explanation, and one or more source references (approved relative path, line range, and observed revision/content identity). Empty findings are valid; a tool failure is not "no issues found".

Reject malformed objects, oversized strings, excessive findings, absolute/private paths and references outside the approved scope. A completed child without valid requested structured output is failure. Preserve aborted/error/max-token status; never promote partial output to completed success.

Operational measurements should contain only route/effort, run relationship, elapsed time, bounded counters, coarse outcome, cancellation and denial categories. Do not add credentials, raw account IDs, opaque items, prompts or source text to generic telemetry. Ordinary DSH session persistence is a separate user-data surface; it must follow host policy rather than inventing an extra unrestricted experiment log.

## 8. What this PR actually tests

`tests/split-readonly-boundary.spec.ts` uses real installed Cordis, AgentRegistry/AgentLoop, SubagentRuntime and ToolRuntime scopes. It uses deterministic fake read/write bodies, never loads account credentials, and rejects/asserts absence of global fetch. It does not run a model, invoke the concrete spawn provider, or persist/resume a worker.

The seven cases verify:

- inherited read is executable while inherited write is hidden/refused for the child; the parent's write remains available;
- filter-only composition still permits a child-local registration (an intentional host behavior, demonstrated rather than assumed safe);
- adding a monotonic execution guard denies that child-local effect;
- an already-cancelled tool call does not execute the read body;
- lineage and depth are stamped, and the same cap rejects another generation;
- unsupported tool-filter capability rejects before a synthetic provider's start callback;
- repeated child-handle disposal leaves the parent alive.

These are executable design constraints, **not** a parent -> delegate -> child model -> result -> parent integration test. The first implementation must add that integration through the real exact-version spawn provider before claiming a usable feature. Current boundary tests run on the installed baseline; the existing four-host matrix tests Remember, not these new Split boundaries.

## 9. First implementation and evaluation gates

Implementation PR: exact-version spawn-provider integration, default-off parent approval, dedicated composition, strict data and execution bounds, audited source reads, structured results and deterministic teardown. Add synthetic integration for happy path, forbidden calls, malformed results, cancellation around publication, timeout, recursion denial and concurrent admission. Extend the four-host matrix only after the integration exists; do not count the current compaction matrix as delegation evidence.

Live evaluation comes later under an explicit budget. Use matched tasks for a single parent versus parent plus one worker: cross-file call-path mapping, independent checking of a seeded regression, and a trivial one-file question where refusing to delegate is expected. Keep model/effort and evidence scopes controlled. Measure finding correctness, missed findings, duplicated reads, total reported tokens, latency, interventions and denied effects. A staged mock that always finds the answer cannot prove quality or savings.

No runtime settings, provider registrations, package dependencies or production services change in this design gate. No broad benchmark or paid inference is run. #167 remains a separate Think redesign.

## 10. Sources and reproducibility

Inspected 2026-09-12. Local baseline package source is authoritative for the executed tests; current upstream is comparison evidence only.

- Installed `node_modules/@deepseek-ai/dsh-subagent/lib/types/types.d.ts:92-148,212-274`: request, result and one-shot ownership.
- Installed `node_modules/@deepseek-ai/dsh-subagent/lib/types/child-agent.d.ts:21-138`: depth, composition and delegated policy.
- Installed `node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts:471-489,603-642`: restriction exemptions and execution guards.
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
