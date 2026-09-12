# Split: exact-provider offline worker integration

Tracking: #198; design gate: #199 and `docs/design/split-readonly-delegation.md`.

## Status and delivery boundary

This is an internal, opt-in implementation prototype, not a deployed worker. The source controller is not imported by `src/index.ts`, registered in a standard profile, exposed in the browser, or exported as a public package entry. A small request-local bounds wrapper is integrated with the existing Codex adapter and is inert outside an explicitly entered Split scope. There is no new automatic delegation policy, shell tool, OAuth flow, or model fallback.

The development fixture installs the real `@deepseek-ai/dsh-subagent-spawn-in-process` and `@deepseek-ai/dsh-subagent-in-process-driver` at exactly `0.1.2-rc.1`. They are development dependencies only, not copied implementations or a new provider running inside Codex Connect. The worker uses the real DSH subagent registry, Agent factory/loop, tool runtime, structured-output capture and existing Codex Connect adapter. All provider replies, account data and source files used for these tests are synthetic.

## Implemented operation

A trusted host calls `snapshotSplitEvidence` with an explicitly approved root, exact relative file names and previously approved SHA-256 hashes. It receives a nominal in-memory capability, not a JSON permission token. The snapshot loader performs no directory scan and never discovers credentials. It refuses path escapes, symlinks, hardlinks, special files, unsupported source names, changed bytes, invalid UTF-8, null bytes and recognizable private-key/token content. Known-private-path and secret-pattern checks are defense in depth, not an exhaustive secret detector; the host-reviewed manifest and content identities are the approval boundary.

`attachApprovedSplitWorker` requires explicit enablement, an exact live top-level parent, that snapshot, a fixed brief and the exact trusted provider object. It registers one single-use parent tool, `inspect_with_worker`, with an empty argument schema. The model cannot supply a new task, path, model or budget. The grant captures the brief and provider function identity. Reuse and concurrent admission for the same parent are refused.

The real spawn provider starts one fresh child with depth one and no inherited conversation seed. Its creation-time `toolFilter: { allow: [] }` removes inherited tools. At synchronous `agent/created`, before model work, the controller installs native tool presentation, a snapshot-read tool, identity-checking execution guards and request/step limits. The official provider's own `structured_output` implementation is checked and retained. Unknown tools, reserved `run_code`, recursive delegation and same-name implementation replacement do not gain authority. The parent remains unaffected.

This is deliberately not a claim that a custom guard ran inside the upstream provider's unpublished setup callback. The initial inherited-tool restriction does; the additional guard is installed at the synchronous publication hook, before the exercised provider starts a model request. Trusted same-process plugins remain trusted, and this is not an operating-system sandbox. A fresh child still joins its parent's deployment/preset composition, but the consent follow-up now installs a child-local complete system prompt and suppresses runtime context through the host APIs. The request boundary rejects unexpected messages instead of silently stripping them. This restricts model-visible context, not the powers of trusted same-process plugins.

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
node scripts/check-split-matrix.mjs
```

The matrix checker resolves pi-ai under Node's ESM `import` condition from the isolated experiment and adapter locations, not `require.resolve`. pi-ai's root and package manifest are not CommonJS exports. The first actual isolated run exposed this checker defect before any scenario ran; that failed attempt is not acceptance evidence. The corrected fresh checker process uses `--experimental-import-meta-resolve`, verifies both resolutions are identical and inside the temporary host, and reads the package manifest as local metadata. Four subprocess regressions cover import-only exports, same-version duplicate providers, an out-of-root symlink and wrong package identity. This test-only Node flag does not change the production runtime.

The integration test drives an actual parent turn through a model-issued delegation call, real DSH spawn, model-issued approved snapshot read, official structured-result capture, parent tool-result consumption and a new parent completion. It checks that parent-only text is absent from child requests, child tools are limited, lifecycle events pair, the child disappears after disposal and the parent remains live.

Negative tests cover invalid paths/hashes/files, byte/read budgets, pre-cancellation, publication cancellation, active-parent disposal, cooperative timeout, repeated requests, overlapping admission, single-use grants, missing/invalid structured results, unread/fabricated evidence, excessive findings/output, recursive/reserved tools, implementation substitution, observer-driven route changes and asynchronous-observer cancellation. No live credentials are inspected and no real provider request is issued.

## Historical baseline source regression — 2026-09-12, before consent follow-up

On M15 / Node 22.22.3, the complete `pnpm run check` passed 100 test files / 974 tests, including typecheck, lint, build and package checks. Chromium regression passed eight files / 28 tests. These totals include the four ESM-resolution regressions and the stronger post-seal replacement assertions. The production `lib/` tree remained byte-for-byte unchanged from the preceding worker commit. Matrix execution is a separate gate; neither these counts nor the old Remember installation matrix substitute for its exact-host results.

## Historical baseline exact-host matrix — 2026-09-12, before consent follow-up

The corrected M15 matrix passed all four hosts on Node 22.22.3: DSH `0.1.2-rc.1` with pi-ai `0.84.4`, and `0.1.5-alpha.1`, `0.1.5-rc.1`, `0.1.5-rc.2` with pi-ai `0.85.1`. The checker verified respectively 214, 229, 231 and 231 exact-version DSH packages. Each host executed all 23 scenarios in its own fresh process: **92 scenario executions / four processes**, not 92 child processes. All hosts used internal bundle SHA-256 `3f15465a68eb39455eb6c206253f9c8ac1b43e6a2e001c49d122f082b605977b`.

The full non-sensitive report is `docs/experiments/split-host-matrix-m15-2026-09-12.json`. Every scenario passed, all exercised forbidden effects remained zero, and the controller remained inaccessible through the production entry. Real provider dispatches were zero. This establishes the internal synthetic Split integration across the exact hosts; it is not a published-package, real-provider, persistent-profile or restart/resume acceptance result. GitHub exact-head CI results are tracked on #200 separately rather than inferred from this local run.

## Deployment-composition review

The initial controller cannot reconstruct a process-local evidence grant, execution guard or budget after cold resume. It now rejects a mounted `sessionPersistence` service both when attaching a grant and when executing it, and rechecks at child publication. The fixture tests a real JSONL backend present at attachment and introduced after grant attachment. Both paths reject before a child request. This is a supported-composition gate, not a security sandbox against arbitrary trusted plugins changing the host during execution.

The additional tool identity seal runs at `agent/created`. A mutation before that point is part of trusted host composition, not an attack this seal authenticates. The older read-replacement test used that same event and could fail because the worker read tool did not exist yet. It now replaces the installed capability at `agent/session-start`, verifies the tool exists and that the child actually issues its tool call, and checks that the substituted body never executes. The matrix also checks post-seal structured-capture substitution and child-local tool additions. No claim is made that shape checking proves the original identity of an already-replaced trusted capture implementation.

The consent follow-up seals the model-visible system prompt with the host's `complete` section contract and suppresses child runtime-context snapshots. A fixture puts deployment-only text into both a global system section and runtime context: the parent retains it, the child request does not. Plugin-injected conversation context is rejected before adapter dispatch. The request validator allows exactly the fixed initial brief/catalog followed by model messages and tool results. Conflicting complete sections or unsupported composition fail closed. This does not authenticate or sandbox arbitrary same-process plugins, and custom profile/preset and persistent-profile acceptance remain separate gates.

## Explicit approval and revocation follow-up

`attachSplitApprovalRequest` stages a fixed, immutable review: workspace display label, task brief, exact source paths/SHA-256/line counts, ordinary Luna/low route, request/deadline limits, and the exact isolated system prompt. A fresh offer ID plus review digest correlates a decision; neither is a credential or a bearer authorization token. A model cannot call the decision/revocation methods. The low-level `attachApprovedSplitWorker` remains an explicitly host-approved internal fixture API; the consent entry never calls it with an omitted admission hook.

A model-issued parent tool call now waits for the real DSH `ApprovalService.request` inside the parent's open turn. Its `approval/asked` and `approval/decided` events form the normal host audit pair. This bridge only claims its own exact request object, and success requires both the service's `allowed-once` and the matching explicit decision received through this offer's controller. Missing service, `never` policy, unavailable/intercepting answerer, rejection, timeout, stale ID/digest, duplicate decision, or cancellation creates no child. An unrelated answerer's allowed-once is not promoted into a user decision. The service audit records that answerer's outcome faithfully even when our additional receipt check denies the operation.

The review reason is user data on this in-memory session/approval surface, not generic telemetry. Snapshots were locally prepared under the trusted host's explicit file/hash approval; consent here authorizes their use by the child provider. The 90-second cooperative budget currently includes waiting for approval and executing the child, and excludes no hidden retries. It is not an invoice or an aggregate token guarantee.

The worker handle's synchronous call now withdraws future use **and** aborts any owned work. `revoke()` additionally awaits operation settlement and verifies cleanup. Pending approvals are cancelled, late allow decisions cannot resurrect them, and running requests receive the abort signal. The UI stays `revoking` until quiescence; if disposal fails, even after registry removal, it reports failure rather than clean revocation. Parent disposal also withdraws the offer. Revocation cannot undo data already sent or tokens already consumed. Repeated revocations share one promise and never launch replacement work.

`src/client/SplitApprovalCard.tsx` is an isolated English/Chinese view with explicit Approve once / Reject / Revoke and stop controls. It renders task text as text, displays file identities and limits, disables duplicate decisions, separates unknown transport outcomes from confirmed decisions, and does not claim stopped until the authoritative view says so. Six Chromium tests exercise these controls, narrow-screen layout, inert HTML-looking text, and replacement-offer isolation. Those tests use mocked callbacks, not a deployed RPC or a browser-to-real-host end-to-end connection.

Seventeen additional shared host scenarios extend the previous 23 to 40: explicit allow/reject, absent/unavailable/never/intercepted approval, stale/double decisions and frozen review, revocation before/start/during work, owner disposal, approval timeout, post-approval provider change, disposal failure, isolated deployment prompt and rejected injected context. All use synthetic provider replies and accounts. Prior saved matrix JSON remains historical 23-scenario evidence; exact-head CI must freshly validate all 40 before treating this follow-up as cross-host accepted.

The next product gate is an authenticated, session-owned browser/controller connection for the consent view, including reconnect/status recovery, permission checks between clients and stale sessions, and reviewed profile composition. No HTTP route, client registration, new public export, production default, live credential access or real provider request is introduced here. Existing persistence refusal remains in force.

## Still required before product enablement

The new, separate `check-split-matrix.mjs` gate builds a private experiment artifact with every npm dependency external, then installs each declared exact DSH dependency closure into a disposable directory. Each host imports the same artifact bytes and its own actual AgentLoop, ToolRuntime, SubagentRuntime, spawn provider and in-process driver. It verifies all pinned DSH package versions and the adapter/provider pi-ai resolution identity before exercising the current `SPLIT_HOST_SCENARIOS` list (40 scenarios after the consent follow-up). One fresh process per host runs the scenarios; this is not a worker restart/resume test. The experiment artifact is not the public npm package. Ordinary `check:dsh-matrix` remains a distinct shipped-functionality/Remember regression gate.

Both Node validation jobs run the Split gate independently. A missing host/scenario, failed scenario, changed artifact, reused host process, mixed runtime or enabled production entry rejects the report. Passing the internal matrix does not expose a package entry, install a profile, or approve production deployment composition. The separately tested consent card is not yet mounted through an authenticated browser-to-host transport.

There is no worker persistence/restart recovery, continuable child, automatic relaunch, multi-worker scheduling or live model comparison here. The controller must not be enabled in a production-like persistent profile before resume/permission reconstruction is defined and tested. No claim is made about usefulness, reasoning quality, token savings or real-backend worker behavior. Remember's outstanding real-provider JSONL/restart acceptance remains in #196/#65. No release, deployment, service restart or changes to ports 3080/3081 are part of this work.
