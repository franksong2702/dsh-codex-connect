# Split: exact-provider offline worker integration

Tracking: #198; design gate: #199 and `docs/design/split-readonly-delegation.md`.

## Status and delivery boundary

This is an internal, opt-in implementation prototype, not a deployed worker. The source controller is not imported by `src/index.ts`, registered in a standard profile, exposed in the browser, or exported as a public package entry. A small request-local bounds wrapper is integrated with the existing Codex adapter and is inert outside an explicitly entered Split scope. There is no new automatic delegation policy, shell tool, OAuth flow, or model fallback.

The development fixture installs the real `@deepseek-ai/dsh-subagent-spawn-in-process` and `@deepseek-ai/dsh-subagent-in-process-driver` at exactly `0.1.2-rc.1`. They are development dependencies only, not copied implementations or a new provider running inside Codex Connect. The worker uses the real DSH subagent registry, Agent factory/loop, tool runtime, structured-output capture and existing Codex Connect adapter. All provider replies, account data and source files used for these tests are synthetic.

## Implemented operation

A trusted host calls `snapshotSplitEvidence` with an explicitly approved root, exact relative file names and previously approved SHA-256 hashes. It receives a nominal in-memory capability, not a JSON permission token. The snapshot loader performs no directory scan and never discovers credentials. It refuses path escapes, symlinks, hardlinks, special files, unsupported source names, changed bytes, invalid UTF-8, null bytes and recognizable private-key/token content. Known-private-path and secret-pattern checks are defense in depth, not an exhaustive secret detector; the host-reviewed manifest and content identities are the approval boundary.

`attachApprovedSplitWorker` requires explicit enablement, an exact live top-level parent, that snapshot, a fixed brief and the exact trusted provider object. It registers one single-use parent tool, `inspect_with_worker`, with an empty argument schema. The model cannot supply a new task, path, model or budget. The grant captures the brief and provider function identity. Reuse and concurrent admission for the same parent are refused.

The real spawn provider starts one fresh child with depth one and no inherited conversation seed. Its creation-time `toolFilter: { allow: [] }` removes inherited tools. At synchronous `agent/created`, before model work, the controller installs native tool presentation, a snapshot-read tool, identity-checking execution guards and request/step limits. The official provider's own `structured_output` implementation is checked and retained. Unknown tools, reserved `run_code`, recursive delegation and same-name implementation replacement do not gain authority. The parent remains unaffected.

This is deliberately not a claim that a custom guard ran inside the upstream provider's unpublished setup callback. The initial inherited-tool restriction does; the additional guard is installed at the synchronous publication hook, before the exercised provider starts a model request. Trusted same-process plugins remain trusted, and this is not an operating-system sandbox. A fresh child still joins its parent's deployment/preset composition; absence of a conversation seed is not proof that every deployment-specific prompt contribution is isolated.

## Bounds and results

- At most 16 explicitly named files, 32,000 UTF-8 bytes each and 128,000 bytes in total. Reads use detached memory after snapshot completion; at most 24 reads, 16,000 bytes per read and 128,000 returned bytes.
- The approved brief is at most 16,000 bytes. One child per parent, depth one, at most six steps and six provider payload reservations; overrides may only reduce these limits.
- Requests must use ordinary `gpt-5.6-luna`, low effort, configured per-response output limit 2,048, SSE and zero provider retries. Reserve, different models/providers, priority tier, auxiliary compaction/title calls and non-function hosted tools are refused. A provider failure cancels the owned operation instead of triggering another route.
- The default 90-second deadline is cooperative. Result disposal is awaited, not abandoned by a Promise.race. An unquiesced child keeps its admission slot and denial hooks; a disposal failure cannot return completed success. This does not hard-kill arbitrary trusted in-process code.
- Structured results are limited to 16,000 bytes, ten findings and bounded explanations/references. Every reference must match a range the child actually read, including its content hash. Even an empty findings array requires an actual evidence read. The result is ordinary tool data, never a command or permission grant.

The installed DSH JSON-schema subset does **not** support `maxLength`, `maxItems` or `minimum`. The first integration run correctly rejected a schema containing those keywords. The corrected schema uses supported shape constraints, while code enforces numeric, array and UTF-8 byte bounds before the capture tool body and again before returning the result. Removing unsupported schema annotations did not remove the limits.

`requestReservations` counts payloads admitted by the plugin before provider dispatch. The fixture separately counts mock fetch calls and proves zero retry on a synthetic HTTP 500. Reservations are conservative: a later local failure can consume a reservation without a network dispatch. They are not a token invoice, backend usage figure or verified cost saving. The per-response output setting is not an aggregate token-cost cap. Operation elapsed time includes awaited disposal.

## Reproducible evidence

```sh
pnpm exec vitest run tests/split-evidence.spec.ts tests/split-dispatch.spec.ts tests/split-worker.spec.ts tests/split-readonly-boundary.spec.ts
pnpm run check
pnpm run test:browser
```

The integration test drives an actual parent turn through a model-issued delegation call, real DSH spawn, model-issued approved snapshot read, official structured-result capture, parent tool-result consumption and a new parent completion. It checks that parent-only text is absent from child requests, child tools are limited, lifecycle events pair, the child disappears after disposal and the parent remains live.

Negative tests cover invalid paths/hashes/files, byte/read budgets, pre-cancellation, publication cancellation, active-parent disposal, cooperative timeout, repeated requests, overlapping admission, single-use grants, missing/invalid structured results, unread/fabricated evidence, excessive findings/output, recursive/reserved tools, implementation substitution, observer-driven route changes and asynchronous-observer cancellation. No live credentials are inspected and no real provider request is issued.

## Still required before product enablement

This source-level integration is currently verified against the exact baseline host. The ordinary four-host installation matrix continues to exercise shipped functionality and Remember; it must not be relabeled as Split cross-host acceptance. Exact-version Split integration across the other supported hosts, a public package/profile entry, the real user approval UI and deployment-composition review are separate gates.

There is no worker persistence/restart recovery, continuable child, automatic relaunch, multi-worker scheduling or live model comparison here. The controller must not be enabled in a production-like persistent profile before resume/permission reconstruction is defined and tested. No claim is made about usefulness, reasoning quality, token savings or real-backend worker behavior. Remember's outstanding real-provider JSONL/restart acceptance remains in #196/#65. No release, deployment, service restart or changes to ports 3080/3081 are part of this work.
