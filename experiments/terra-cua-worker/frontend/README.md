# Isolated frontend event regression

This checker composes the **actual installed local-candidate browser bundles** with the actual Host/browser Gateway WebSocket multiplexer and HTTP result protocol. It has a synthetic event source and peer, two synthetic sessions, and no application authorization implementation, model provider, native helper, account or real session history. It never connects to the daily instance. A temporary server binds only `127.0.0.1` on an allocated port; a fresh headless Chromium context is closed in `finally`.

Run against an already prepared, installed candidate (the `packages/` and `runtime/` siblings produced by `prepare-local-host.mjs`):

```sh
node --test experiments/terra-cua-worker/frontend/diagnostics.test.mjs
node scripts/check-cua-frontend.mjs /path/to/isolated/candidate /tmp/frontend-result.json
```

Use the matching Playwright browser installed for this repository. An existing task-local browser cache can be selected with `PLAYWRIGHT_BROWSERS_PATH`. The checker does not install a browser, use an existing Chrome profile or launch a visible desktop window. Missing prerequisites and platform restrictions fail explicitly.

CI runs the same checker through:

```sh
node scripts/check-cua-host.mjs --with-local-patch --with-frontend
```

The existing source-provenance preparation remains mandatory. The checker additionally verifies that its imported Host Gateway bytes equal the candidate source used for the report. It records SHA-256 for Host, browser and frontend asset inputs. Three private classes/components are exported in an in-memory copy solely for composition; their implementation is unchanged. The shipped main asset is cut immediately before application bootstrap, preserving its bundled React, Cordis, stores, slots and primitives. No copied third-party bundle is committed.

## What actually runs

- Production Connection controller, browser network watcher and reconnect generation loop.
- Production Gateway Host event queue, WebSocket mux, client parser/dispatcher and HTTP result validation.
- Production session controller scope retention, UiSession pending registry, question plugin lifecycle, draft store and renderer slot chain.
- Production `ConversationContent`, including its overlay composer seat and CSS, with unrelated history/workspace views replaced by empty synthetic views. Assertions require the question to be visible, singular and intersect the viewport.
- Two real browser clients for the cross-client selection-answer/cancel/immediate-consent sequence.

Only a normal synthetic **window-selection** answer is clicked. Approval questions are never answered with permission. Their synthetic Host signals are cancelled; a missing-listener control may produce `next`. The checker asserts no approval result was submitted, no event remains pending, and all owned resources are closed.

## Regression and detector controls

| Case | Required observation |
| --- | --- |
| Fresh consent | Parsed receive → registered listener → pending state → mounted card |
| Selection then consent | First question submits through real HTTP; immediately following consent is visible |
| Reconnect while pending | Old generation drains; Host replays pending event; exactly one card appears |
| Switch sessions and return | No card in unrelated synthetic session; returning reveals pending card |
| Remount renderer | Pending card survives view teardown |
| Second client answers selection | First client receives cancellation; subsequent consent renders in both clients |
| Freeze/resume Chromium | Pending event renders after real CDP lifecycle resume |
| Missing renderer control | Receive/listener/pending exist, but no DOM card; restoring renderer reveals it |
| Missing question-listener control | Receive increments, listener does not, Host observes `next`, no card |
| No-client control | Host retains pending event with zero clients, then delivers on new client connection |

`diagnostics.mjs` is an opt-in, memory-only probe used by the isolated fixture. It retains at most 256 records and only enumerated stages, bounded counts and visibility booleans/states. It drops question text, answers, identifiers, target titles and credentials. Dedicated tests check this projection and bounded, detached snapshots. It does not create a permission, acknowledge an approval, persist data or send diagnostics anywhere. It is **not installed into the daily frontend**.

## Evidence and limits

The initial macOS run using the local.9 candidate passed all ten cases and both diagnostic privacy tests. It did **not reproduce** the reported missing card. See `validation.json` for exact input hashes, browser identity and test result. This is synthetic frontend composition evidence, not a live CUA acceptance result.

Headless Chromium freeze/resume did not report a real `hidden` visibility state. `hiddenObserved: false` is retained; do not report hidden-tab behavior as passed. Full production plugin-graph bootstrap, layout/navigation shell, installed third-party client contributions, authentication, user browser extensions and the historical user tab's connection state are not recreated here. No conclusion about Terra startup, actions, success rate or performance follows.

## Evidence needed before another real task

Do not send another short-lived permission card merely to see whether it appears. The next diagnostic candidate should correlate, for the selected test conversation only:

1. Host delivery queued to a client and its connection generation.
2. That same frontend's parsed receive and resolved live scope.
3. Entry into the actual question listener and publication into its pending registry.
4. Card mount, current-session match, viewport intersection and page visibility.
5. Cancellation/expiry and disposal, without treating a mount receipt as consent.

Use bounded local counters/opaque correlation; never question text, candidate titles, typed values, account data or credentials. A passive observer receiving a Host event is insufficient proof of user-visible rendering. First reproduce this receipt chain under the complete isolated production boot graph (including its client-plugin ordering), using the no-authority backend. If a gap only exists in the real browser, collect the scoped read-only receive/mount evidence before requesting another live task. Keep genuine human task consent and all Native guards unchanged. The historical cause remains unconfirmed until that evidence exists.
