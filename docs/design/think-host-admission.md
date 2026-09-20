# Think T2a: native host admission and lifecycle

Date: 2026-09-20. Tracking: #195 / #167. Stacked on T1 #220 at `4cf94eab9da5f3ed16e140b3921e669ae7913294`, whose main baseline is `e5772cd8a5c47f30b5ab14fe73d2901914348463`.

## Delivered slice

This is an internally activated host integration, not a shipped capability or a new settings page. `registerThinkHostIntegration` starts disabled. The production plugin and client entries do not call it or pass its replay adapter into normal registration. `createOpenAICodexAdapter` gains an optional generic replay seam; omitting it preserves normal request behavior. The native question service is added only as an exact development dependency. Generated adapter output is rebuilt, while product defaults, runtime dependencies, supported hosts and release version remain unchanged.

T1 remains the strict canonical-history/wire replay layer. T2a joins that layer to the real host Agent loop, native tools and human-question service. It separates proposal, approval, durable admission and request configuration rather than treating a successful tool response as an effective model change.

## Lifecycle contract

- Only the exact live root Agent and its actual Session may propose a change. A matching id on a different object, an owned child, a missing native question service or provider Default is insufficient.
- The native question names the exact target effort and current conversation. Only one exact answer is accepted. Ordinary text, custom answers and automatic tool reviewers do not substitute for that answer. No automatic recommendation policy is injected.
- Approval is pending until the next host pre-step admits its canonical notice. Before that point, disabling the experiment, cancellation or a newer manual selection discards it. A pending question is revalidated after the answer, including the selection revision.
- The host writes the request/header. The integration returns its planned effective configuration but does not call selectModel, save profile defaults or mutate another conversation. A queued approval alone changes neither the recorded header nor the visible configured effort. A recorded configuration is not proof of successful remote execution.
- Once legitimately admitted, updates continue to replay when new proposals are disabled. Subsequent explicit manual effort selections take priority, including returning to the original level. Canonical selection ordinals prevent old choices from overriding a later decision.
- Request plans remain isolated during direct and prepared adapter calls. Both routes verify live root ownership and disposal; using a prepared adapter does not bypass the LLM guard. Disposing the integration aborts outstanding native questions and drains its tracked operations.

## Admission fault boundary

A new fault injection removed the first approved notice after pre-step planning. The initial T2a implementation still sent a synthetic model request because no Think marker remained in its durable history. The corrected stream gate checks an independent copy of the exact pre-step notices before dispatch, including original ids, structured provenance and content. Missing or altered notices fail rather than silently using the effective configuration. The test covers both removal and a retargeted canonical notice.

An integrity failure quarantines that live Session and prevents subsequent requests in that runtime. The original log is preserved, not repaired automatically. This is not a hostile-plugin sandbox: the Session store, event writers and host composition remain trusted. Restoring an integrity-failed session in another process, migrating legacy data or preserving that quarantine across restart are not accepted recovery paths; preserve the failed session for inspection and use a new conversation. A later durable recovery design must address them explicitly.

## Evidence and limits

`tests/think-host-admission.spec.ts` composes the real DSH `0.1.2-rc.1` AgentLoop, native ToolRuntime, UserQuestions, Session store/projections, model-selection hook and actual Codex adapter. Network fetch is replaced before calls with synthetic SSE. Temporary credentials and all prompts/answers are synthetic. The tests exercise approval/refusal, pending vs effective state, disable/cancel/dispose/manual races, idempotent activation, duplicate decisions, missing service, exact consent, cross-root isolation, owned-child rejection, direct prepared-call guards, upgrades/downgrades and dropped/changed first notices.

JSON restoration uses a new root and Context in the same test process. It is not disk persistence, an OS-process restart or a browser click. The native question service is real, but its answerer is a test callback, not a human or deployed authentication proof. Existing browser and four-host installation CI remain product non-regression checks, not full four-host Think acceptance. Supplemental exact-head CodeQL for this stacked PR reuses the independently reviewed Split CI checker without changing GitHub default-setup security configuration.

Reproduce the internal slice:

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run tests/think-host-admission.spec.ts tests/think-replay-mechanism.spec.ts tests/think-request-scope.spec.ts tests/reasoning-update-provider.spec.ts
pnpm run check
```

Final source test counts and remote outcomes belong to the delivery checkpoint and exact PR head. Earlier passing checks are not evidence for later mutations.

## Remaining before a user preview

T2b must add and verify the explicit product setting, stage/save/discard behavior, clear user-facing wording and actual browser question/selector flow. The new host integration also needs its own newer-host lifecycle matrix; the implementation handles the known admitted-versus-proposed pre-step split, but baseline success does not establish that compatibility.

T3 must prove native compaction and child composition without losing authority or effective effort. Until then Think rejects auxiliary, replaced-surface and native collaboration paths for Think-bearing histories; ordinary non-Think requests retain their original behavior. T4 is separately authorized live task usefulness/latency/quota evaluation. This slice performs none of those live calls and does not change the Split preview on 3081 or the daily service on 3080.
