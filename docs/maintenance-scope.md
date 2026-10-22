# Core maintenance scope — 2026-09-29

This maintainer-approved scope supersedes earlier roadmap directions to complete experimental acceptance or reopen Task. Historical results remain evidence, not a backlog or authorization to resume. This document changes development priorities, not installed packages or running services.

## Product promise and admission

Maintain authorization/accounts, ordinary manual model use, installation, exact-version compatibility, Canary alert handling, diagnostics, request cancellation/resource safety and necessary recovery. Keep DSH ownership of permissions, session persistence and lifecycle. Local request metrics remains an optional diagnostic capability, not a new evaluation platform or statistics UI.

A proposal needs an identifiable user problem, repeatable supporting evidence and an acceptable maintenance/host-dependency cost before entering the next roadmap. Missing evidence is grounds to defer, not an instruction to build more experiment infrastructure. Reconsideration requires an explicit maintainer decision; green CI or a scheduled reminder cannot reopen a frozen track.

### Bounded admission — issue #384, 2026-10-22

The maintainer explicitly approved a minimal PR for model-callable, default-off, read-only quota observation and optional skill guidance. This exception admits only a projection of existing identity-bound quota data: shared-window remaining percentages, reset times, local observation time and unknown/stale states. It excludes balances, account identifiers, credentials and raw responses. It does not admit automatic model/account switching, scheduling, a general budget system or renewed Adaptive Task development. Existing defaults, permissions, cancellation, cache isolation and failure backoff remain obligations. The approval authorizes implementation/review; it is not release or live-account acceptance.

## Disposition

| Surface | Disposition | Retained obligations |
| --- | --- | --- |
| Authorization, manual models, installation, compatibility, Canary, diagnostics | Maintain | Scoped defect fixes and supported-version evidence; no automatic expansion of support |
| Backend governor, cancellation, proxy lifetime, quota cache, request metrics | Maintain | Shared safety and diagnostics; metrics does not establish task cost or savings |
| Adaptive Task model/effort changes and read-only delegation | Freeze | Public gate stays closed; preserve old-state readback, authorized Stop/manual takeover, accounting and ownership checks |
| Cross-browser Task recovery and restricted research entry | Freeze development | Preserve local work; any demonstrated safety defect becomes a separate core repair, not a reason to finish orchestration |
| Internal autonomy evaluation, container runners, grading and budget experiments | Archive research | Preserve source, unfinished changes and dated evidence outside public delivery; no new scenarios, live A/B or pilot work |
| Retired Think/Split stacks | Historical archive | Do not rebase, reopen or restore as active roadmap work |
| Native compaction / Remember | Freeze expansion | Preserve existing checkpoint decoding/replay, fallback and recovery; address concrete safety defects without a broad quality study |
| Luna Reserve | Freeze expansion | Keep default-off and existing safety checks; no manufactured exhaustion or new eligibility experiment |
| Speculative routing and unproven optimizations | Exclude from roadmap | No distinct speculative-routing implementation was located in the inspected main source/scripts/docs; no deletion target is asserted |
| Published Search, images, Auto-review and Fast Mode | Existing maintenance only | No new features or silent disablement in this scope change |

Task Phase 1/2 are merged implementations, not merely unshipped drafts. Alpha 4.52 retains the public pause. Published optional features and historical releases cannot be withdrawn by editing this document. Existing installations and saved data remain untouched.

## Dependency removal inventory

| Candidate for a later removal change | Connections that must be separated first | Required preservation/verification |
| --- | --- | --- |
| `adaptive-task-*` runtime/delegation/artifact modules | `src/index.ts` constructs the runtime, passes it to the adapter and attaches auxiliary request accounting; HTTP routes and client components consume its state | Normal model/auxiliary requests without Task; old grant readback, authorized exits, cancellation, counters and restart safety |
| Full Task controls and research recovery UI | Published recovery-only component, authenticated HTTP commands, owner binding, existing task state | Fresh sessions remain entry-free; stale clients cannot activate; do not weaken owner checks to simplify recovery |
| Research `evals/autonomy/`, restricted runner and research-only tests | Local package/test imports, docs, private evidence and reproduction metadata | Preserve snapshot first; remove only experiment-exclusive dependencies; retain core metrics/governor tests |
| Native compaction creation experiments | Checkpoint representation and adapter replay also serve existing saved sessions | Keep old checkpoint readability, fallback and recovery; separate creation policy from persisted-data support |
| Reserve routing | Shared quota cache/account identity and return-state recovery | Keep normal quota display, account isolation and safe restoration; no blanket quota-module deletion |

This is a reviewed starting inventory, not proof that the dependency graph is fully detached. Completed narrow removals are recorded below; the rest remains retained. Each removal must update references/docs together and run focused regression, required build/package checks and supported-host checks appropriate to the changed surface. Do not erase unresolved defects by closing an experiment tracker.

## Current iteration and acceptance

- [x] Record the scope decision and retirement rules, separate from historical acceptance.
- [x] Link contributor and product entry points to this scope.
- [x] Identify shared dependencies that prevent bulk removal.
- [x] Publish the documentation decision: #288 merged as `43a1c013537dd5bfc6944761018c117d197dd25b` after all ten checks passed.
- [x] Synchronize trackers: #195 and #194 closed as not planned; #65 remains open for two historical failure observations, not a broad experiment campaign. Core-defect monitoring and Canary follow-up now respect the freeze; the original October 3 closeout deadline is unchanged.
- [x] Separate implicit Task policy imports from core transport, with explicit legacy accounting retained (#289).
- [x] Remove activation-only browser forms and their exclusive tests after dependency inspection; retain recovery-only UI and regression coverage.
- [ ] Before any further server removal, replace legacy orchestration with verified recovery-only ownership, missing-state, replay, counters and child cleanup handling. Until then retain the existing server implementation; this is not a commitment to new experiments or Task reopening.

Local research preservation has a separate private archive manifest; do not commit machine paths or private experiment evidence into the public repository. A local archive is not a merged product change and does not stop another running task. Existing scheduled jobs must not be assumed updated by this document.

The [first code separation](agent-notes/core-transport-decoupling.md) removes implicit Task imports from ordinary transport. It retains explicit legacy-task wiring in the product and does not claim the entire runtime is retired.

The [activation UI retirement](agent-notes/task-activation-ui-retirement.md) removes the full experimental form and its exclusive browser tests after dependency inspection. The public contribution retains recovery only. Historical design/evidence entries describing the deleted form are archival, not current source paths or reopening work.

## Evidence baseline

Inspected main: `e26165d962102ca6c6eeba5c5d9a8cfa75ffd02a`, tree `63c1842ed9b6c2527a774ec1943ad9733933231e`. The local documentation branch starts from the identical reviewed PR #287 tree. Public release scope: [Alpha 4.52](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.52). Historical obligations: [#195](https://github.com/franksong2702/dsh-codex-connect/issues/195), [#65](https://github.com/franksong2702/dsh-codex-connect/issues/65), [#194](https://github.com/franksong2702/dsh-codex-connect/issues/194). Their earlier proposed next steps are superseded for local planning, but their GitHub bodies have not been edited by this change.
