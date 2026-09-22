# Phase 2 A — root-owned ledger implementation contract

Authority: user approved plugin-owned persistence on 2026-09-22 after the baseline host journal probe refused unknown required events on cold load. Development baseline is Phase 1 `76c3c0c898ef888ad75b37846c044967faba54c9`, not a merge into main. The isolated branch does not modify #236.

## Scope and completion

Implement a dormant v2 root ledger and strict contract, reusing the existing private atomic task-file transaction. Keep the ordinary v1 runtime unchanged and fail closed on v2 until a later runtime integration explicitly owns it. No automatic migration, UI, child agents, transport hooks, real credentials, push, merge, release or deployment in this slice.

Plan: (1) separate reusable atomic storage from the strict v1 codec, (2) add strict v2 authority/run parsing, (3) add explicit migration/consent/revocation and bounded child lifecycle/accounting operations, (4) test concurrency, replay, corruption and fresh-process recovery, (5) independent review and full project checks, (6) record evidence and remaining integration gates here.

Verification: focused v1/v2 store tests, `pnpm run check`, fresh-process write/recover tests and `git diff --check`. Browser/host integration are not credited by this store-only slice. Existing README/design/Phase 2 proposal plus this contract cover document roles; no duplicate seven-file skeleton is required.

## Decisions adopted for A

- The same root document owns main and child counters, consent, revocation and operation receipts. There is no second authority store and no custom Session event. The later host boundary must bind real live handles and normal tool-call correlation; ledger IDs alone never authorize tools or requests.
- Keep UI/state `revision`, `grantRevision`, `revocationGeneration` and process `runtime` epoch distinct. A child captures grant revision, revocation generation and epoch at preparation.
- v1 migration is explicit, under the existing lock, requires exact authenticated owner/session key and expected revision, preserves counters and scope, disables delegation and converts only auto mode to interrupted. Missing state never creates a fresh grant. v1 code refuses v2.
- Retain every admitted run's replay evidence inside the 64 KiB root record. Cap the initial task at 32 admitted child units and refuse new admission when count/byte capacity is exhausted. Never evict old child receipts. This is a conservative storage ceiling, not an additional request allowance; no per-run request is refunded.
- Parent tool-call IDs are scoped by the exact root/session identity. Duplicates require the same argument digest, route, source-ID set and snapshot digest; any changed execution input conflicts. Equal repeats return existing status, never a new execution permit. Every attempted transport reservation has a unique ID; repeats reject rather than yielding a second permit. `lookupReservation` returns the old debit/run/epoch and explicitly unknown dispatch status, without retry authority.
- One active child, depth one; route fixed per unit; each unit needs at least one source ID from the user-approved manifest. Routes are a subset of the root's selected routes. v2 parsing validates structure, bounds, correlations and lifecycle consistency, not file contents or host handle ownership.
- Each child debit atomically increments root and child counters and retains one root request for parent continuation. Root auxiliary debits use the same lock. This slice exposes primitives only; the existing backend governor is not bypassed or wired yet.
- Revocation immediately fences further reservations, and moves live records to settling/cancelled. Terminal success requires cleanup verified; failed cleanup blocks new work. `recover(identity, expectedRevision, oldEpoch, newEpoch)` atomically compares/adopts the epoch, interrupts nonterminal records, preserves counts and marks pending delivery unknown. Same-target repeats are idempotent; competing stale recoveries and old-epoch writes fail. It never spawns or dispatches. Cleanup/delivery verification must be supplied by later host integration, not inferred from a ledger state.
- No v2-to-v1 downgrade is offered yet: retained child receipts cannot be represented in v1 without losing replay protection. Real-profile enablement remains blocked until an explicit quiescent migration/recovery procedure exists.

## State transition constraints

`prepared -> running -> settling -> succeeded/failed/cancelled`; preparation may fail/cancel directly into settling. Cleanup is pending/failed while settling and verified before terminal completion. Restart moves prepared/running/settling to interrupted without assuming cleanup. Delivery advances pending -> recorded/unknown, or unknown -> recorded only after host reconciliation; no backward transition or automatic replay. Duplicate reads remain possible after revocation, but never grant execution authority.

## Evidence and next gate

Slice A is implemented and locally verified on Node v24.13.0. The strict codec is in `src/adaptive-task-delegation-contract.ts`; lifecycle/accounting primitives are in `src/adaptive-task-delegation-ledger.ts`; the v1 store now supplies its unchanged strict codec to the shared atomic storage class. No new ledger primitive is wired to the current runtime or exported as a model/browser API.

- Final `PATH=/usr/local/bin:$PATH pnpm run check`: exit 0, 109 test files / 1,135 tests passed, including 41 new ledger tests; lint, server/client type checks, contract checks, build, import/CLI and package checks passed.
- Final `PATH=/usr/local/bin:$PATH node scripts/check-adaptive-task-delegation-ledger.mjs`: exit 0; two distinct processes (44542, 44543) wrote/recovered the same synthetic root with reserved count 3. Recovery preserved the debit, fenced the old epoch and refused replay. Fixture bundle SHA-256: `a93980b6872de264ac250fe0fbc349787e5b95ca5be134c0726b8725643776b1`. Real provider requests: 0. This is fresh-process replacement, not power-loss or fault injection at every lifecycle boundary.
- `git diff --check`: exit 0. Independent review found two boundaries to tighten: reject empty source sets and compare route/source/snapshot inputs as well as argument digest on duplicate calls. Both were fixed and covered before the final full check; the reviewer reported no remaining Slice A blocker.
- Earlier failures are not omitted: a test helper's invalid awaited default argument was corrected; the initial sandboxed full run had 17 existing socket-fixture failures (`listen EPERM 127.0.0.1`). The authorized rerun with local fixture sockets passed, followed by the final 1,135-test run after review fixes.

The new cold-recovery check is added to CI configuration but has not run remotely in this slice. No browser, four-host matrix, installed-profile or live-model acceptance is claimed. No push or PR mutation occurred.

B/C must still implement live owned handles, restricted evidence snapshots/tools, runtime cancellation, actual dispatch, durable result artifacts and normal tool-result correlation. D/E must cover consent UI and installed-host acceptance. None is implied by A's ledger tests. In particular, cleanup/delivery acknowledgments here are trusted internal primitives; later host integration must supply actual ownership and completion proof.
