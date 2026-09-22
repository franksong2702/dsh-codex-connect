# Phase 2: task-scoped read-only delegation

Status: isolated A–E local candidate, 2026-09-23. Tracking: #198; umbrella: #195. [Slice A's implementation contract](adaptive-task-phase2-ledger.md) is authoritative for schema/bounds; [the execution contract](adaptive-task-phase2-execution.md) and [recovery contract](adaptive-task-phase2-recovery.md) record B/C; [explicit consent and transition contract](adaptive-task-phase2-consent.md) records D; [exact-host and installed Session acceptance](adaptive-task-phase2-acceptance.md) records E and its vendor qualification. The local product now constructs one default-off v1/v2 composition; existing grants do not gain child permission. This does not authorize push, merge, release or deployment.

## Authority and working contract

The user approved designing Phase 2 while preparing Phase 1 acceptance, beginning with bounded read-only investigation/independent review rather than concurrent file mutations. This document proposes technical defaults within that scope; it does not silently enable delegation or certify real usefulness.

Historical planning snapshot: main `1748bec2d7cfd6ec72ef64ed6bf341bb47be0424`; then-Phase 1 candidate #236 `0a09e04d09de60930e85f9e87b9a6c97b43f1647` (runtime `7bb8e28`). The later local development baseline is `76c3c0c` plus ledger commit `6d21243`, as recorded below. Mutable GitHub disposition is not reverified by local execution work. No stacked PR ancestry is an implementation prerequisite.

This document supplies requirements, code map, architecture, decision rationale and implementation checklist in one place. Existing README, `docs/design.md`, Phase 1 contract, this proposal, acceptance note and dated runtime checkpoint cover the necessary document roles. A separate seven-file project-management skeleton is deliberately deferred: it would duplicate the same authority without adding a needed decision surface.

The original design-only slice was followed by Phase 1 installed-page acceptance and UI corrections. #236 head `76c3c0c` subsequently passed all eight exact-head checks. The user then approved plugin-owned root-ledger persistence after an eight-process baseline-host probe showed unknown required Session events cannot be cold-loaded. Slice A is isolated from #236 at that exact baseline and does not change defaults or dependencies. Live credentials/models, daily profiles/services, push and publishing remain outside this slice; merge remains separately authorized.

## Phase 1 baseline and required changes (historical planning map)

| Surface | Existing behavior | Required Phase 2 change |
| --- | --- | --- |
| `src/adaptive-task-contract.ts` | Exact main-model/effort grant, no child permission | Explicit optional delegation extension; legacy grants stay disabled |
| `src/adaptive-task-runtime.ts`, `stream` / `reserveAuxiliary` | Reject task children with `TASK_DELEGATION_NOT_INCLUDED` | Admit only host-owned child bindings, not arbitrary parent IDs |
| `src/adaptive-task-runtime.ts`, `reserve` | Lock and debit the root task immediately before backend fetch | Same transaction checks child identity/epoch/route and child cap |
| `src/adaptive-task-store.ts` | Strict version-1 parser, 64 KiB root document, atomic synced counter | Versioned root-owned child metadata, compatibility and size bounds |
| `src/adaptive-task-scope.ts`, `src/backend-request.ts` | Exact scoped route, no automatic retry, existing governor | Reuse for child transport with one debit, no second request governor |
| Host `dsh-agent` baseline types | Factory `create` with unpublished `setup`, publication `commit`, owned `AgentHandle.dispose()` | Use owned handle; creation signal is not a lifetime signal |
| Old #200 `83f6a02`, `src/split-worker.ts` | Fixed worker, one pre-staged offer, rejects persistence-enabled hosts | Reference only; cannot become the new runtime by removing its guard |
| `src/client/AdaptiveTaskControl.tsx` | One task model-choice surface | Optional delegation consent/status inside it, not a Split setting |

Host evidence above is the installed baseline API, not a claim all four host versions have identical signatures. Exact-host create/setup/ownership and cleanup tests are implementation gates. The previous matrix already showed newer hosts need explicit parent ownership; capability adapters must preserve that distinction.

## First product slice

The main model may continue alone or invoke a bounded read-only helper with a goal, expected output, permitted model/effort and a subset of user-approved evidence. This offers context separation and independent inspection, not a promised speedup.

Proposed v1 limits: one active child per root, depth one, no background fan-out, no child-created children, no child model-change tool. The main model chooses the child's route for each work unit from the grant; the route stays fixed during that unit. A later unit may use a different permitted route. This is not fixed Luna/Low policy.

The parent awaits the bounded tool result; it does not continue model execution concurrently. Phase 2 v1 is deliberately not a parallel scheduler. Different roots remain independent. Main-task model changes remain available between work units.

The child's executable tools are only `read_task_evidence` and `submit_task_findings`. No shell, code execution, arbitrary filesystem/network reads, edits, search/image/review auxiliaries, permission tools or delegation. Restrict actual execution as well as the advertised schema. Same-process plugins remain trusted host code; this is not an OS sandbox.

## Consent and source access

Fresh and migrated tasks default to delegation disabled. The existing authenticated task-control surface separately explains child model/effort scope, approved source files and bounds. The main-task model grant does not imply delegation or filesystem disclosure permission. Once explicitly granted, ordinary in-scope child calls need no per-call popup. Expanding source/model/effort scope requires a new user grant revision at an idle boundary.

For v1, the user approves an explicit manifest of ordinary text files, not arbitrary workspace discovery. The model chooses only host-issued source IDs from that manifest. The host validates canonical root containment, every path component, no symlinks/hardlinks/special files, exclusions and bounded UTF-8 reads before preparing an immutable per-run snapshot. Reject races or changed identities while reading. Child reads never reopen live paths. A changed approved file may be snapshotted for a new run, but cannot change an already prepared run. New paths require new consent.

Proposed safety ceilings (tunable downward by the user, not upward by the model): 32 approved files, 256 KiB total snapshot bytes, 64 KiB per file, 16 KiB brief, 16 KiB structured result, 10 findings and 8 observed references per finding. Reject oversize input before spawn; do not silently truncate. Source IDs/canonical manifest hashes go in the authority ledger; sensitive contents belong only in host-owned private session artifacts. Exclude credential/config secrets; a filename filter alone is not a guarantee that arbitrary text contains no secrets, so source review and explicit disclosure remain necessary.

## Proposed typed boundary

These are design shapes, not exported code. The browser supplies a revision-fenced consent command; the host, not the model, creates the grant and run identities.

```ts
interface DelegationGrant {
  enabled: boolean;
  grantRevision: number;
  allowedRoutes: Array<{ model: string; efforts: string[] }>;
  sourceManifestId: string;
  maxActiveChildren: 1;
  maxDepth: 1;
  maxRequestsPerChild: number; // user value 1..6; default 6
  timeoutMs: number; // user value 1_000..90_000; default 90_000
}
interface DelegateArguments {
  goal: string;
  expectedOutput: string;
  model: string;
  effort: string;
  sourceIds: string[];
}
interface ChildBinding {
  runId: string; // host-generated, never a model-supplied permission token
  rootSessionKey: string;
  parentToolCallId: string;
  argumentDigest: string;
  grantRevision: number;
  executionEpoch: string;
  childSessionId: string;
  childSessionKey: string;
  route: { model: string; effort: string };
  evidenceDigest: string;
  reserved: number;
  deadlineAt: number;
  state: 'prepared' | 'running' | 'settling' | 'succeeded' | 'failed' |
    'cancelled' | 'interrupted';
  cleanup: 'pending' | 'verified' | 'failed';
  resultDigest?: string;
  delivery: 'none' | 'pending' | 'recorded' | 'unknown';
}
```

JSON decoders reject unknown fields, unsafe integers, unsupported model/effort, forged IDs and extra authority. Bind duplicate calls to the original parent tool-call ID plus argument digest; equal replay returns existing status, changed arguments fail. Keep every admitted run's replay evidence in the same root ledger, never in unknown native Session events or an evicting cache. The first implementation caps admission at 32 runs and the existing 64 KiB bound, refusing before publication while reserving future completion-field space. Failure/cancellation after admission consumes a retained slot; validation failures before admission do not.

## Ownership and accounting

One root document remains authoritative for mode, grant revision, revocation generation, total reservations and all admitted run metadata. Do not create a second grant/budget store. Normal transcripts/tool results remain with the host; immutable evidence/result artifacts need an explicit plugin-owned private artifact boundary in B/C and cannot grant authority. No authority record is an ordinary message or marked ignorable. Keep all replay receipts within the root bound, failing closed on capacity, missing or corrupt linkage. UI revision, grant revision, revocation generation and runtime epoch are distinct.

Every child attempt uses the existing backend governor and task dispatch scope. In one root-lock transaction: validate live exact child and owning root, binding, revision/epoch, deadline, fixed route and unrevoked permission; check global and per-child caps; increment both counters; sync before fetch. Main/compaction/attributable auxiliary requests retain the existing root debit. Scoped child requests must not also enter `reserveAuxiliary` and double-count. Child unauthorized auxiliary routes fail before transport.

The child cap is a slice of remaining task requests, not a new allowance. Proposed admission/dispatch rule: retain at least one unused root request for parent continuation; a child request requires `remainingRoot >= 2`. The parent is paused, but other already-authorized auxiliary work can still consume resources, so recheck under the same lock before every child fetch. The floor is not a guarantee that one request finishes the task. Do not refund uncertain/failed dispatches or silently retry. The existing defaults of 40 total requests / hard maximum 200 do not increase.

## Lifecycle and recovery

```text
user task grant -> parent chooses work unit -> validate/snapshot + persist prepared
    -> create unpublished owned child -> recheck at publication -> running
    -> validate result / failure -> settling -> owned dispose + verify cleanup
    -> persist terminal outcome -> deliver correlated result to parent
```

1. Create only after durable preparation. Register restricted tools and request binding during unpublished setup. Recheck cancellation, mode, grant revision and epoch at publication. A session's `parentSession` field or `currentInitiator()` alone is attribution, not authority.
2. Lifetime cancellation combines task revocation, parent tool signal, absolute child deadline and plugin disposal. Keep it alive after the host's creation-only signal is detached.
3. Stop/manual takeover increments root revocation generation and aborts child work immediately. No queued fetch is admitted after the revocation linearization point. Already dispatched work may settle and retains its debit. Stop reports `stopping` until the owned handle and live registries are reconciled; cleanup failure remains visible and blocks new child creation.
4. A result is untrusted content. Validate size/schema and references against actually observed snapshot ranges/hashes; success requires exactly one valid final submission and no extra tool actions. Parent review, not the child, determines final claims or actions.
5. Persist result digest/status in the root ledger and correlate with the host's normal original tool call/result before release. After a lost reply, reconcile those records; never rerun the child merely to obtain the reply. If delivery cannot be proved, show `delivery: unknown`, not exactly-once delivery. Ledger acknowledgment methods are internal trusted primitives, not model/browser APIs.
6. Recovery atomically compares the previous revision/epoch, adopts a fresh epoch, interrupts nonterminal runs and marks pending delivery unknown without provider calls. Same-target recovery is idempotent; stale competing epochs fail. Reservation lookup proves a debit, not network dispatch. Completed valid outcomes may be explicitly retrieved, not blindly reinjected. The same owner must resume the root; a new child attempt needs a new operation identity and remaining budget, never rewinding the old run.
7. Cross-device/new-cookie transfer and resuming an interrupted child's internal reasoning are not v1. Safe persisted interruption plus explicit restart is the v1 recovery contract, not continuous child execution across a restart.

## Schema compatibility and rollback

Do not weaken the version-1 parser to accept arbitrary future fields. A proposed version-2 root schema adds delegation-disabled by default and preserves owner, original session identity, total counters, manual/stopped state and route. Migration is atomic under the existing root lock and cannot widen permission. Old Phase 1 binaries must fail closed on a v2 record, never reset it as a fresh task.

Before enabling v2 in a real profile, implement and test an explicit quiescent downgrade: zero live/pending children; retain total reservations and provenance; save a versioned recovery artifact; convert only representable disabled/manual state. Missing or ambiguous child/delivery evidence blocks downgrade. No automatic rollback by deleting grants or restoring an old lower counter. Until this migration/recovery gate passes, use disposable test records only.

## Implementation slices and acceptance

| Slice | Ownership / proposed files | Required observable proof |
| --- | --- | --- |
| A. Authority + ledger | extend contract/store; new `adaptive-task-delegation-contract.ts` | v1 disabled compatibility; v2 atomic migration; exact owner/scope; duplicate operations; concurrency-safe shared debit; no reset after restart |
| B. Restricted host lifecycle | new `adaptive-task-delegation.ts`, `adaptive-task-evidence.ts`; narrow runtime/scope hooks | own handle/create rollback; only approved snapshot tools executable; all stop/publication/timeout/disposal races; zero post-revocation dispatch |
| C. Durable result + recovery | same root ledger, private artifacts and normal host tool-result correlation | crash at each preparation/spawn/reserve/result/delivery boundary; no blind replay; terminal counters preserved; cleanup failure prevents new work |
| D. Consent + status | existing `AdaptiveTaskControl.tsx` and HTTP contract | explicit optional permission; precise model/effort/source scope; no parallel Split switch; lost response reconciled; root stop/manual visibly covers child |
| E. Exact-host acceptance | new focused delegation tests and dedicated matrix | identical cases/artifact on four hosts, all failures counted, authenticated full Session journey, two Node targets; real usefulness separate |

Order A -> B -> C -> D -> E reflects dependency, not five stacked product PRs. Build/review one bounded candidate from the eventual approved Phase 1 baseline. Do not create a new chain on the closed experiments or merge #236 merely to unblock development. Before baseline selection, a throwaway synthetic spike may test a host seam without becoming the product integration branch.

Minimum behavior matrix (each scenario needs an explicit assertion; counts are proposed coverage, not existing tests):

1. Legacy/off grant exposes no child tool and performs no child request.
2. Two distinct authorized model/effort choices produce those exact wire routes; neither is hard-coded as the worker.
3. Outside-scope route/source, forged child/parent and nested delegation fail before fetch.
4. Secret/excluded path, symlink, changed inode/content, oversize bytes and unobserved result citation fail closed.
5. Duplicate call/lost reply does not spawn twice or debit twice; altered duplicate fails.
6. Root plus child counts equal actual managed attempts, including compaction/failure; shared cap and parent floor hold under simultaneous admission.
7. Stop/manual/dispose before prepare, during setup, at publication, queued transport and running transport prevent later unauthorized requests.
8. Deadline or malformed result yields a bounded failure; cleanup failure is not reported as success.
9. Every crash boundary preserves spent budget, refuses automatic spawn and reconciles result delivery without replay.
10. Exact-root isolation: another root continues unaffected; another credential cannot inspect/control the child grant.
11. All four declared hosts verify actual resolved ownership/runtime packages, not just CLI versions.
12. The real Session UI shows scope and child status, stops actual child execution and restores ordinary manual selection; fixture-only controls cannot satisfy this gate.

Initial parameter ceilings, migration encoding, journal correlation and host-version adaptations require focused implementation review. No latency/cost target is claimed before measurement; the existing twelve-task comparison plan is the starting evaluation corpus, adding independent-review and trivial-no-delegation cases. Record quality, elapsed time, actual requests/usage, duplicate investigation and correction work separately.

## Next gate

Phase 1 #236 previously passed exact-head CI at `76c3c0c`. The user approved the plugin-ledger alternative after the required-event cold-load seam failed. A–E now have local ledger, restricted execution, recovery, safe transitions, authenticated consent, all eight exact-host/Node combinations and a baseline installed full Session journey. Integration followed the passing pre-integration matrix and remains default-off; explicit v2 upgrade and separate source/model consent are required. The full-page result uses pinned published-baseline Cordis vendor versions, not the independently failing newer stock loader closure. Legacy v1 intentionally refuses a v2 record; downgrade is explicit and provenance-preserving. Next is a separately reviewable Phase 2 candidate and exact-head remote CI after push/GitHub authorization, followed separately by bounded real-provider usefulness and human acceptance. No stacked PR or main merge is needed for isolated development; the eventual candidate must state its approved integration baseline explicitly.
