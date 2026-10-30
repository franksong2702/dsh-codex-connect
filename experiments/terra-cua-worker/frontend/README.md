# Isolated frontend event regression

These checkers use the actual candidate Host and browser bundles, real WebSocket/HTTP transport, and synthetic data only. They cannot grant application access or invoke a model or Native helper. They never connect to the daily instance. Each owned server binds `127.0.0.1` on an allocated port; fresh headless Chromium contexts and temporary Hosts are closed in `finally`.

```sh
node --test experiments/terra-cua-worker/frontend/diagnostics.test.mjs experiments/terra-cua-worker/frontend/browser-probe.test.mjs
node scripts/check-cua-frontend.mjs /path/to/isolated/candidate /tmp/frontend-result.json
node scripts/check-cua-frontend-boot.mjs /path/to/isolated/candidate /tmp/frontend-boot-result.json
```

The candidate has `packages/` and installed `runtime/` siblings from `prepare-local-host.mjs`. Use the repository's matching Playwright browser, optionally via `PLAYWRIGHT_BROWSERS_PATH`. Neither checker installs a browser or uses an existing Chrome profile. CI runs both through `check-cua-host.mjs --with-local-patch --with-frontend`; missing prerequisites fail explicitly.

## Two complementary fixtures

The component checker covers thirteen cases. Its event originates in production `UserQuestions.ask`, with an exact synthetic live root, and the real `dsh-api-remotes` bridge forwards it to the real Gateway. The production Connection admission uses synthetic credentials but distinct browser, non-answering controller, and other-answerer Peers. HTTP answers are admitted as the actual request Peer. Two browser contexts do not share local storage.

This fixture still hand-composes the frontend: a synthetic session catalog, custom scope resolver, retained root, readiness latch, allowed remote-access projection and empty unrelated views. It uses the production Connection/reconnect loop, Gateway dispatcher, Session Controller, UiSession, question plugin, `ConversationContent`, React, renderer slots and CSS. These substitutions are **not** evidence for production bootstrap; the second checker covers that path.

| Component case | Required evidence |
| --- | --- |
| Fresh consent / independent controller | Real `ask` → bridge → receive → listener → visible card |
| Cross-peer answer / non-answering controller | Real Gateway forbids answer, question stays pending |
| Selection then consent | Normal selection answer through HTTP, immediate next consent visible |
| Reconnect pending | Same opaque event ordinal, old generation abort and drain, new generation receive/listener/mount, new DOM question key |
| Session switch / renderer remount | No unrelated-session card; pending card returns |
| Second client selection | Other client's selection cancels first delivery; next consent renders in both |
| Freeze/resume | Headless Chromium lifecycle resume delivers pending event |
| Missing mount/listener/client controls | Detector distinguishes receive, listener, DOM and queued replay failures |

The production-boot checker runs the real `runProfile('web')`, Host loader, Web frontend shell, full browser loader graph, real RemoteAccess, real Session Controller resolver and normal question plugin registration. It has **no manual boot-ready latch or retained root**. The root is created by the real Host Session Controller with only synthetic saved history; no Agent turn is driven. The independent controller authenticates using the actual `/connect` protocol with `interactions=none`; the browser uses the ordinary browser authentication path. Test credentials exist only inside the temporary fixture and are never reported.

The graph includes the unchanged Connect and CUA browser bundles, registered through the production module registry in its normal dependency order. Their Host halves are deliberately inert temporary fixtures, so no account or application-access backend exists. The companion has no browser contribution. Unrelated title-model, native-opener, workspace-Git and HMR behavior is disabled in the temporary profile; a no-data workspace summary replaces Git capture. This is not the daily profile or an enabled Computer Use service.

| Production-boot case | Required evidence |
| --- | --- |
| Pending before frontend startup | Real `ask` occurs before page load, ordinary boot subscribes and renders |
| Control-client selection then consent | Separate control/browser authentication, real selection result, immediate consent |
| Reconnect while pending | Old delivery abort **and** drain, same Host event replayed through receive/listener, new visible DOM key |
| Navigation away and back | Real New session button releases main view; pending stays associated with original root and renders on return |

Session opening invokes the same `UiWorkspace.openSession` controller used by the sidebar, not a fixture `retainScope`. New-session navigation uses the actual UI button. Visibility assertions require one card with a positive bounding box intersecting the viewport; document visibility is recorded separately. These checks do not establish unobstructed human visibility in a historical tab.

Only normal synthetic **window-selection** answers are clicked. Consent questions use the production `cua-task-access` shape and are cancelled from their synthetic Host signals, never approved or rejected by the test. Counters must remain zero for consent answers, model calls, subprocess attempts, outbound sockets and fetch attempts. The no-authority Host has no CUA service. Cleanup requires a confirmed child exit and no pending requests.

## Passive diagnostics and source identity

`diagnostics.mjs` retains at most 256 memory-only records with enumerated stages, bounded counts, local numeric event/generation ordinals, and visibility booleans. Wire identifiers remain only transient Map keys; they are not exported. `browser-probe.mjs` wraps existing pump, answer, dispatch and listener methods without registering a new answerer. Known question frames alone are correlated; non-question and incomplete frames are forwarded unchanged. Tests verify original promise identity, receiver, return values, cancellation, synchronous errors, missing fields and abort-listener cleanup. Both checkers share this same probe. A mount receipt is never consent.

For the full boot, the HTTP-served bundle is changed only in memory to expose the real WebBoot instance and install this passive probe immediately after creation of the real ClientRemoteService. No method bodies or dependency order are replaced. Input SHA-256 values are recorded before instrumentation. Host source files are compared against the prepared candidate. Temporary Connect/CUA Host entry points are explicitly inert, while browser bundle bytes are unchanged. No third-party bundle is committed.

Neither runner logs raw browser console/error messages, request URLs, stack traces, question text, answers, window titles or credentials. Raw Host output is drained and counted without printing or saving it. Failure output contains bounded stage facts. **Both runners are synthetic-only tests, not probes to attach to a user's browser.** The privacy helper alone does not make arbitrary instrumentation safe.

## Results and remaining evidence

The macOS source-verified run passes thirteen component cases, four production-boot cases with 73 active browser plugins, and six probe unit tests. `validation.json` binds the test source and candidate inputs. Linux execution belongs to the new exact-head CI, not this macOS result. The earlier 0603e CI success cannot substitute for the new head.

The historical missing card remains **not reproduced or identified**. In particular, these results do not prove the user's historical browser received the event, retained the intended session, mounted the card or displayed it. Headless freeze/resume did not establish a real hidden-tab state (`hiddenObserved: false`). No real permission, Terra call, startup/GUI action or native performance is accepted by these tests.

Before another real task, correlate the selected test conversation's actual Host delivery and client generation with that same browser's parsed receive, resolved scope, existing listener, pending registry and card mount/viewport/visibility. Use bounded local opaque correlation only; observe existing handlers without adding an answering subscriber. Keep the original exception/cancellation semantics. If a gap exists only in the user's browser, first obtain scoped read-only receive/mount evidence there; do not send another short-lived permission card just to see whether it appears. No diagnostic instrumentation from this commit is deployed to 3081.
