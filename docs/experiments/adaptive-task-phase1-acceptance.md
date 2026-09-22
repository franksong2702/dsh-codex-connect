# Phase 1 installed Session-page acceptance — 2026-09-22

The full installed Session-page **synthetic** gate passes on local commit `2b1bd5d5de9952b4dd9f83434afd9d16af0dafa6`, Node 24.13.0 and exact baseline DSH `0.1.2-rc.1`. This is not daily-profile, real-account, model-quality or economic-benefit acceptance.

At completion of the local run, draft #236 still pointed to `0a09e04d09de60930e85f9e87b9a6c97b43f1647`; its eight green checks belonged to that old head. Main was `1748bec2d7cfd6ec72ef64ed6bf341bb47be0424`. The maintainer subsequently authorized pushing these fixes and acceptance records to #236 and checking new-head CI. This document records local acceptance, not a prediction of that CI result. No merge, release, publish or deployment occurred; Phase 2 remains a design proposal.

## Actual installed surface and identity

`scripts/check-adaptive-task-session.mjs` installs an immutable `git archive HEAD` package with the exact host dependency closure in a new disposable DSH home. It launches stock `dsh web` on a random loopback port and drives the real shell/client registration, native workspace/Session creation, Composer, model picker and Stop. No replacement page or fixture message API is involved. All installed `lib/` filenames/hashes are compared with the archived source; installed host package paths/versions are recorded.

Artifact SHA-256: `40284d656cc32834eab1515cbba6859769440ea6d8125809c58a401a9ba1cb9b`. The successful run recorded two distinct host PIDs, seven synthetic wire requests and zero real provider calls. The preloader provides synthetic OAuth/SSE; runtime and browser networking reject unexpected destinations. Public npm downloads are allowed during preparation: this is not an air-gapped installation claim. Daily 3080/3081, existing profiles and real credentials were not used.

## Nine passing journeys

1. Real empty Session: control present, default off, no request before consent.
2. Narrow Sol/Medium and Luna/Max consent, limit 6; drop committed start response, show uncertainty, reconcile by reading, never duplicate the command.
3. Native Composer → Sol/Medium → routing tool → Luna/Max; original requirement retained; one ledger at 2/6.
4. New Session remains off/0; switching back and reloading preserve the grant/count without dispatch.
5. Same browser/authority, fresh host process: interrupted at 2/6, no unsolicited work; explicit resume and a new message reach 3/6.
6. Native Stop generating aborts the held request, leaves stopped/4 and no queued continuation.
7. Manual takeover, native Terra/High then Terra/Default: actual wire honors both, routing tool absent, retired automatic counter stays 4/6.
8. Separate one-request task attempts handoff; second dispatch is denied, mode limit/reserved 1. Handoff does not grant another budget.
9. No uncaught browser errors/unexpected network attempts; browser/hosts close, listener refuses connections, successful disposable fixture removed.

## Defects found and corrected

The shell can render the plugin slot before restoration publishes the live root. Old-head cold reads returned HTTP 409 `TASK_LIVE_ROOT_REQUIRED`; the panel remained unavailable and misleadingly labelled unknown state as automation off. Waiting merely for an editable Composer did not reliably remove the race.

The fix retries **only this read-only 409**, at most three attempts with 250/500ms delays under the existing deadline. Other errors fail closed. Commands and model requests never retry automatically. Unknown state has an explicit English/Chinese label. Panel ownership is bound to Session ID; closing/switching cancels reads and delays. The final installed report records the cold-restore 409 followed by 200 and the expected interrupted state.

Screenshot review also found that a manual request with Default effort has no explicit model/effort pair, but the panel incorrectly called this “No model request yet.” The fallback now distinguishes absence of an explicit pair from an untouched task; counters and execution were already correct. A focused browser regression and the installed-page assertion cover this case.

Independent read-only review covered the actual UI/transport boundary, authority/cancellation semantics and final fallback copy. No blocking finding remained; its suggested Close-specific cancellation regression was added and passed.

## Verification

| Actually executed check | Result |
| --- | --- |
| `PATH=/usr/local/bin:$PATH pnpm run check` | Exit 0; 108 files / 1,094 tests plus lint/type/build and existing contract/pack checks. |
| `PATH=/usr/local/bin:$PATH pnpm run test:browser` | Final exit 0; 9 files / 43 tests, five new restoration/cancellation/Default cases. |
| `pnpm run lint:source`, `pnpm run typecheck`, `pnpm run build` under Node 24 PATH | Final rerun exit 0 after the UI changes. Backend built bytes unchanged; client rebuilt. |
| `PATH=/usr/local/bin:$PATH pnpm run pack:check` (also included in final `check`) | Final exit 0; 95 files, 1,306,216 packed / 2,298,760 unpacked bytes. Initial restricted attempt could not write npm cache; approved same-command rerun passed. |
| `/usr/local/bin/node scripts/check-adaptive-task-session.mjs /var/folders/ny/p6hzzr7178j3xwj5lzyr03x00000gn/T/codex-task-session-fZRa9w/fixture.json` | Exit 0; 9 journeys, seven synthetic requests, zero real provider calls, cleanup/fixtureRemoved true, checked 2026-09-22T10:49:34.500Z. |
| `node --check` on the three scripts; `git diff --check` | Exit 0. |

Earlier attempts remain failures, not credited as passing: harness fixes addressed model-list order, native Session-transition timing, unbounded CDP body reads and cleanup after early browser exit. The new regression caught hidden reads on Session change, fixed by Session-bound panel state. The old candidate's cold-restore defect passed only after the product fix was installed.

The final-head preparation/run initially exited 1 at the 15-second host readiness deadline, before browser scenarios or provider calls; cleanup was reported false and its recorded process was subsequently verified absent. The unchanged, still-unused installation then passed all nine journeys using its manifest. The startup cause is unresolved, not attributed to a product defect or claimed fixed. Its failed report/events were retained separately before the successful rerun overwrote the fixture output; the successful report's events also retain the first preload marker.

Run `node scripts/check-adaptive-task-session.mjs` with Node 24, compatible npm, project dependencies and Playwright Chromium. It needs registry access for setup and local listen/browser permissions. It tests **committed HEAD**, not unstaged product changes. `prepare-adaptive-task-session.mjs` can prepare a separate unused fixture whose manifest is passed to the checker; used workspaces are rejected.

Generated evidence: `output/playwright/task-session/<fixture-id>/report.json`, redacted `events.json`, handoff/manual screenshots and failure artifacts. Success removes disposable home/browser/dependencies after evidence export. Failures retain fixtures for diagnosis; remove only exact owned directories after checking recorded processes have exited. This turn removed six prior diagnostic fixtures after saving redacted events; no user data was removed.

Portable checked-in evidence: [successful report](../../.github/phase1-session/report.json), [synthetic transport events](../../.github/phase1-session/events.json), and [initial startup failure](../../.github/phase1-session/startup-failure.json). Local fixture paths are replaced with a placeholder; they are historical identity records, not locations of a running service.

Remaining: synchronize the local fix to #236 and run exact-head remote CI; other supported hosts do not yet have this full-page evidence; real-account/usefulness/human acceptance and cross-device/new-cookie takeover remain separate. Live testing needs an explicitly chosen profile/account and request budget. No Phase 2 runtime is included.

<details>
<summary>Historical acceptance preparation, before the installed-page run</summary>

Candidate: #236 `0a09e04d09de60930e85f9e87b9a6c97b43f1647`; runtime `7bb8e28`. Main `1748bec` is unchanged. This working slice modifies documentation only; existing candidate runtime/build/dependencies remain intact.

## Evidence boundary

Remote status was freshly checked: all eight checks pass on the exact candidate. Earlier CI logs recorded 108 files / 1,094 tests on each Node target, 38 browser regressions, authenticated isolated controls, four fresh persistence processes and same-artifact four-host installation/task matrices. Those facts are not full installed Session-page or real-account acceptance.

This turn reran:

| Check | Result |
| --- | --- |
| `PATH=/usr/local/bin:$PATH pnpm exec vitest run tests/adaptive-task-host.spec.ts tests/adaptive-task-store.spec.ts tests/adaptive-task-matrix-contract.spec.ts` | Exit 0; 3 files / 52 tests. |
| `PATH=/usr/local/bin:$PATH node scripts/check-adaptive-task-persistence.mjs` | Exit 0; four distinct processes, plain/zstd, original requirement retained, reservations 2 -> 3, zero real provider calls. Bundle SHA-256 `bcea5079ab2f046792efa0a687031bc72687d32121b06cc8b68c71b445a659aa`. |
| `PATH=/usr/local/bin:$PATH node scripts/check-adaptive-task-ui.mjs` | Initial sandbox attempt failed before HTTP scenarios: localhost `listen EPERM`. Authorized localhost rerun exited 0; all 6 cases passed, real host auth/product endpoint/control, synthetic responses, zero real provider requests. `fullDailyProfileAcceptance: false` remains explicit. |

Node used: 24.13.0. The diagnostic verbose rerun identified the permission failure (five cases failed to bind, one canonical-authority case passed). Do not label this a product regression or omit the failed attempt. No test expectation or product code was changed to work around it.

## Why the full-page gate remains open

`tests/adaptive-task-http.spec.ts` really registers the product, host WebServer/Connection, signed-cookie authorization and actual adapter. However, `scripts/adaptive-task-browser-entry.tsx` directly mounts `AdaptiveTaskControl` on a synthetic page and posts messages through `/fixture/task`. This bypasses real shell slot composition, Session-controller transport and the normal Composer send/model-picker flow. Repeating that test cannot close the full-page gap.

The actual product control is registered in `src/client/index.tsx` under `conversation.input.right`, using host session identity. The next full-page fixture must load the unmodified installed shell/client entry and drive those real controls; it may substitute provider responses/credentials, not the application route or Composer transport.

## Next isolated full-page acceptance unit

This is a test-harness implementation task, not a production deployment or a finished check. Use an independently identified throwaway DSH home and ephemeral localhost port, never 3080/3081 or an existing user profile. Install the exact candidate package and exact host runtime closure, verify hashes and actual module identities, and instrument a synthetic provider with a deny-by-default external-network tripwire. Block automatic quota/update/OAuth outbound calls as well; no copying of real credentials or conversation data.

Required journeys:

1. Load the actual signed-in shell with synthetic host authentication; confirm model-choice control appears in the normal empty Session Composer and remains off.
2. Explicitly grant selected models/efforts; submit through the real Composer, observe Sol/Medium then permitted handoff; keep the original requirement visible.
3. Switch conversations and reload; neither grants nor status may leak to another Session.
4. Use the ordinary Session Stop button during a pending synthetic response; no queued continuation may dispatch.
5. Take manual control, choose a different model and Default through the real picker, then continue normally without an automatic override.
6. Restart only the owned temporary host, reload the saved Session, see interrupted state and retained count; only explicit same-owner resume may dispatch.
7. Drop a mutation response, reconnect and reconcile state without re-sending the command.
8. End the fixture: stop only its processes, prove no live listeners/children remain and retain non-sensitive reports. Credential/login links must not appear in logs.

Evidence must record installed plugin/host identity, exercised actual routes/components, wire selections/counts, persistence identities, errors and cleanup result. A screenshot or HTTP 200 alone is insufficient. First validate the baseline host; only then expand relevant cross-host UI checks. Existing four-host server tests are not four-host full-page evidence.

## Real-account / human acceptance

Not authorized or executed by this design slice. Once isolated full-page behavior passes, request a specific test-account/profile choice and a bounded request budget before any live inference. Include a model-led task where handoff is useful and a trivial task where continuing without delegation/routing is correct. The user assesses understandable consent, stop and manual takeover on the real UI. Never claim saved cost, better quality or account eligibility from simulated responses.

Cross-device/new-cookie recovery is a separate design decision, not a hidden prerequisite fulfilled by refreshing this browser. Merge/release/deployment require separate approval. Phase 2 design can proceed in parallel; Phase 2 runtime must not be used to mask an unaccepted Phase 1 lifecycle.

</details>
