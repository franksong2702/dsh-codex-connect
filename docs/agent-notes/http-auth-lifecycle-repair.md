# Protected HTTP authentication and route lifetime repair — 2026-10-12

## Identity and delivery state

- Base/main commit: `f1d1745e3705c7ecef30675d6857a01c1bde93ea`.
- Local branch: `fix/http-auth-lifecycle`; evidence applies to the modified working tree, not the unchanged base commit alone.
- Package version remains `0.2.0-alpha.3`. This is an unreleased local repair, not the published Alpha 3 artifact or a new compatibility certification.
- Validation: macOS arm64, independent development Node `v24.13.0`, pnpm `11.7.0`, Vitest `4.1.11`, Cordis `4.0.4`, locked DSH development SDK `0.1.7-rc.1`.
- Built Host entry SHA-256: `a7de021a71f4e733c6ce08f781314ac6358b8740d41e09ceba6be7c6109988b3`. This fingerprints the entry, not an entire published tarball.
- Implemented and locally checked for PR review; not merged, published, installed, enabled as a new build, or accepted with live accounts. The running Harness and the other checkout's existing changes were left untouched.

## Repair

1. The [Host admission helper](../../src/http-auth.ts) resolves the current Connection per request, and the Host carrier may already have authenticated the call. DSH 0.2.3-alpha.2 admits every handler route itself (`auth: 'required'` is the route default) and passes the admitted Peer as the handler's third argument; the helper trusts that Peer and does not re-authenticate. Hosts in the declared 0.2.2 range pass no Peer, so the helper keeps the original in-route admission over the `IncomingMessage`: only an admitted `{ peer }` result passes, Host 401/403 rejections are preserved, and the Host's 503 rejection, missing services, lookup/verifier errors and invalid results return redacted JSON 503. No old Connection or credentials are cached. (2026-11-23 addenda: DSH 0.2.3-alpha.2 removed the `requestRejection` primitive, and its Connection resolves `connection.authentication` through the calling context, which cordis 4.2 refuses without an `inject` declaration older Hosts do not provide — calling `admit` from a plugin route therefore fails closed on that Host, and the route-level Peer is the supported admission surface. Fail-closed outcomes are unchanged.)
2. [Account/OAuth/Fast Mode controls](../../src/auth-routes.ts), [proxy detection/probing](../../src/proxy-routes.ts) and [private original downloads](../../src/image-asset-routes.ts) require Host admission **and** the existing plugin origin policy before body parsing or private operations. Trusted origins alone do not grant identity.
3. [Product composition](../../src/index.ts) binds protected routes to WebServer + Connection. Their removal/reprovision removes/remounts the child routes. Read-only catalog/runtime/update metadata remains WebServer-only with its existing origin restrictions.
4. The [Task HTTP helper](../../src/adaptive-task-http.ts) owns registration with `ctx.effect`; authentication is inside its controlled error boundary. Cookie-hash owner, public activation pause, old-state recovery, Stop/manual safety exits and request accounting are unchanged.
5. Account, proxy and [update metadata registration](../../src/update-routes.ts) collect each disposer immediately through a generator effect. A later collision/failure rolls back earlier registrations without deleting unrelated routes. Account cleanup is registered first so routes are removed before OAuth disposal.
6. OAuth-body/account-snapshot fixtures now use real Cordis effects and an explicitly synthetic admission. They do not substitute for real Host cookie tests. The [built image fixture](../../scripts/check-installed-images.mjs) uses real Connection minting/verifying cookies backed by in-memory synthetic credential records.

## Verification

Commands were run with the Harness-provided pnpm launcher and the user-approved independent Node on the development script PATH. The initially selected embedded Node `v24.21.0` could not load Rolldown because macOS rejected different signing Team IDs. That attempt ran no tests; no re-signing or security-policy change was made. The independent runtime was used only after explicit user confirmation.

A subsequent audit found unexpected build/test copies and incomplete checks in a directory containing macOS `dataless` files. Copies were preserved outside the delivery tree. Final verification used a byte-matched nonsynced local snapshot and offline locked dependencies, without install scripts or changes to system security/synchronization policies. Earlier interrupted checks were not counted as passes.

```sh
pnpm run check
pnpm run test
pnpm run test:browser
```

| Check | Result |
| --- | --- |
| Complete check: workflow contracts, metadata/source lint, Host/Client types, tests, build, import isolation, CLI fixtures, compatibility gate and pack validation | exit 0 |
| Final complete non-browser tests | 138 files / 1,679 tests passed, exit 0 |
| Chromium client suite | 12 files / 58 tests passed, exit 0 |
| Built image smoke using the changed fixture and built Host entry | generated 2, edited 2, code runs 2; original authentication/history/edit checks passed; real provider requests 0; exit 0 |
| Pack inventory regressions | 26 passed; six stable entries and three explicit chunk families, no unexpected copies or stale extra chunks |
| Actual npm manifest with an injected old Host copy in the disposable tree | correctly rejected with expected exit 1; clean tree and original working tree pack checks pass |
| Final diff whitespace check | exit 0 |

The [real WebServer/Connection HTTP regression](../../tests/protected-http.integration.spec.ts) covers unauthenticated requests to every protected operation, signed-cookie account activation/removal and Fast Mode, private bytes, tampered/expired/wrong-authority cookies, the separate origin allowlist, and Connection removal/reprovision on the surviving server. Private spies and network remain untouched when admission fails.

The [actual Product regression](../../tests/adaptive-task-http.spec.ts) verifies protected account/Task routes disappear and remount on Connection replacement, while unauthenticated public catalog/runtime/update metadata remains available. It also verifies Task child/Product reloads, exactly one active Task registration, retained accounting and the public activation pause. Metadata network is synthetic. Real Cordis registration-failure/collision tests assert rollback **before** final fiber disposal.

An additional independent read-only review found no confirmed P0/P1 authority or cleanup defect in the repair. Its suggested signed-cookie and actual-Product composition coverage was added and included in the final passing checks.

## Limits and next step

- All evidence is local and synthetic. Chromium Desktop-shell fixtures mock the shell; they are not Electron protocol or live OAuth acceptance.
- The complete check's Canary fixtures are contract tests, not fresh installation/boot certification for every declared Host. No new five-version installed-artifact matrix, current rc.2 application reload, Windows/Linux runtime, or live account/provider acceptance was performed.
- Existing published compatibility records remain historical evidence and were not changed to certify this working tree.
- No remote permission-policy bypass, broad Remote migration, new principal system, automatic update/install, version exemption, data migration, or reopening of frozen Task work is included.
- Before release/installation, separately authorize and run the same-artifact supported-Host matrix and actual Desktop/browser admission and reload acceptance. Later maintenance rounds can address remaining UI deadlines/cancellation, catalog-failure configuration recovery and version diagnostics.
