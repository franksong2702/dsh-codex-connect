# Task-level model selection: consolidated Phase 1

Unreleased candidate built directly from main `1748bec2d7cfd6ec72ef64ed6bf341bb47be0424`. The delivery boundary is a reviewable PR; merging, publishing, deployment, live models and closing previous PRs are outside this change.

## Product and ownership

An empty ordinary conversation offers **Model choice / 模型选择**. Nothing activates until its user explicitly accepts a per-conversation grant. The first main request uses **Sol / Medium**. The user selects allowed main models and individual effort levels plus a shared request limit (default 40, maximum 200). The exact displayed effort subset is persisted; catalog changes cannot expand it. Another conversation and the profile defaults are unaffected.

The current model may continue directly, change effort, or hand subsequent main requests to an allowed model through `codex_connect_change_work_model`. Each successor has the same optional tool. There is no mandatory planning call, permanent Sol coordinator, reasoning-first decision pipeline or fixed worker strategy. Phase 1 does not introduce subagents. Host-owned tool, filesystem, command and publishing permissions are unchanged.

The runtime owns one task grant, route, operation receipts and durable request counter. The host owns the actual main Agent, session journal, model selection, cancellation, compaction and tool permissions. The adapter supplies a request-local dispatch wrapper. Each managed backend attempt reserves through the existing backend governor immediately before transport; failed or uncertain dispatches are not refunded. Main requests, compaction and attributable auxiliary Codex requests share the limit. Queued/cooldown work remains cancellable before reservation.

The selected model/effort scope governs the **main task route**. Existing search, image and review tools retain their separately configured specialized models and permissions; this feature neither enables them nor expands their authority. Their attributable managed Codex attempts count against the same task. Unattributed background operations and arbitrary third-party traffic are not guessed into the ledger. Reservations are not tokens, money, subscription quota or proof of saved cost. Account eligibility is not inferred from the installed catalog.

## Source consolidation and supersede mapping

The following immutable revisions were compared, including their incremental source, adapter, registration, settings, tests and CI changes:

| Source PR | Inspected head / base | Result in this candidate |
| --- | --- | --- |
| #232 M1 | `2f135e7` / main `1748bec` | Extract model-independent journal checks (host surface folding, start/summary/end correlation, exact replaced source range and checkpoint content) into `adaptive-task-checkpoint.ts`. Do not import Astra reasoning state, `configuration_update`, native per-change questions or the Think setting. |
| #233 M2 | `725cd93` / `2f135e7` | No runtime code imported. `Observe → Recommend → Admit → Apply`, Astra effort assumptions and its separate telemetry remain experiment references. Task requests use the task grant directly. |
| #234 M3 | `535b8f5` / `725cd93` | No Split runtime, source snapshot worker, fixed Luna/Low provider bounds or shared Think action lease imported. Phase 2 must design delegation against task-owned authorization and accounting. |
| #235 Phase 1 | `3da8ce2` / `535b8f5` | Retain task contract/store/runtime/HTTP/context, minimal conversation control and relevant tests. Rebuild the adapter and plugin registration directly on main, remove legacy Think gating, add explicit effort subsets and strengthen lifecycle/provenance tests. |

The backend governor, native compaction codec and host persistence already on main remain the reliability foundation. No additional runtime dependency or old Think question/CSS dependency is needed. The new CI matrix exercises only Phase 1 cases plus exact host identity; it cannot obtain credit from old Think/M2/M3 tests. Previous validation counts and artifacts are historical evidence, not this candidate's acceptance.

This PR supersedes #232–#235 as the proposed Phase 1 integration route. On 2026-09-22 the maintainer separately authorized closing those PRs, the historical Think chain (#167/#220/#221/#222/#224), and Split #199/#200. All eleven source branches and commits were retained. Closure retires the old integration paths; it does not claim that their remaining acceptance passed. This is a source consolidation, not a merge of their stacked commits. #195 remains the umbrella roadmap; #198 now tracks dynamic Phase 2 delegation.

## Context and lifecycle

Handoff uses ordinary model/effort selection on the same main Agent. Visible requirements, conclusions, tool calls/results and supported images come from the original host journal. Private assistant reasoning and model-specific replay metadata are omitted. Foreign or pre-handoff compacted spans expand from the exact host-validated source range; new target-model checkpoints remain useful until another handoff. Summary text never grants authority. Missing/corrupt correlation, unknown replacement history and transfers above 512,000 bytes fail rather than silently truncating requirements.

Task documents live in the private `codex-connect-tasks` directory beside the plugin's configured credential store. They contain hashes, grants, counters and bounded operation receipts, not prompts, OAuth tokens or model rationale. Updates use the host file lock, atomic replacement and sync before dispatch; reads reject unsafe links, permissions, size and schema. A journal marker proves that a grant existed but is never itself a grant.

Activation stays interrupted until the marker is flushed successfully. Start/resume reserves the host's idle maintenance boundary; interruption or a failed flush cannot expose a new executable grant. A new runtime epoch requires explicit same-browser resume and retains counts. An ordinary Session stop or the task Stop action revokes automatic work. Manual takeover cancels active work, withdraws the model-change tool and permits normal later model/Default selection; the prior task counter remains historical and is not a lifetime cap on manual use. Manual takeover cannot be reversed by a model.

Controls use actual DSH Connection Host/Origin and signed-cookie validation. Cookie audience canonicalization matches the host. A principal is the hash of the exact signed browser credential and canonical authority, not a named-person ACL. New cookies/devices cannot take over someone else's existing grant. Cross-device recovery remains a separate product decision. Missing Connection service supplies no unauthenticated endpoint.

## Migration

Published Alpha 4.39 users retain all existing defaults. No task grant is created by upgrade, page load, old prose, or enabling native compaction. Begin a new conversation and explicitly start Model choice to use the candidate.

Do not migrate old Astra-only Think histories or carry an old experimental profile's `enableReasoningUpdates` into this candidate. That setting and its product control are absent. Preserve those experimental sessions and branches for reference; use a clean conversation for Phase 1. The existing native-compaction setting remains a technical compatibility opt-in and is not presented as a peer Think/Split/Remember product mode. Phase 1 can operate with ordinary host compaction when native creation is disabled.

The task POST contract now requires the exact `efforts` map for selected `models`; an old #235 browser bundle cannot silently grant every newly available effort. Reload the candidate's matching client bundle. No automatic budget reset, old-state deletion or browser-owner migration is performed.

## Verification boundary

Run `pnpm run check`, `pnpm run test:browser`, `node scripts/check-adaptive-task-ui.mjs`, `node scripts/check-adaptive-task-persistence.mjs`, `node scripts/check-adaptive-task-matrix.mjs`, and `pnpm run check:dsh-matrix` on the candidate.

Tests use actual host AgentLoop, persistence, authentication, plugin endpoint and adapter with synthetic responses/credentials. The local `2b1bd5d` follow-up additionally passes the stock installed Session shell, native Composer/model picker/Stop and cold restart on baseline DSH `0.1.2-rc.1`; see [the acceptance record](adaptive-task-phase1-acceptance.md). This is still an isolated synthetic profile, not the daily profile or a real account. Earlier four-host backend checks are not four-host full-page evidence; none establishes live account eligibility, model quality, economic benefit or human acceptance. The twelve-task evaluation plan remains unexecuted in `adaptive-task-evaluation.md`.
