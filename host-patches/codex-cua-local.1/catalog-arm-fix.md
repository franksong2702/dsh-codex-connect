# Local.9 catalog-to-arm contract repair

Local.8's actual bounded acceptance reached the Native `arm` call and returned `CUA_INPUT_SCOPE_DENIED` with zero Terra model steps. The finite diagnostic identified the layer and stage; it did not identify a human denial. No new live request is part of this repair.

## Deterministic cause

The coordinator constructed an empty application catalog for methods outside `getApp`, `listApps`, `findApps`, `typeText` and `pressKey`. The new `authorizeTaskInput` dispatch was absent from that set. Its production worker branch simultaneously required `catalog.application(identity.pid)`. Even a valid retained target therefore failed the arm preflight. The exact reviewed local.8 production selection and worker branch reproduce that rejection together in the pure fixture.

The failing guard runs before constructing `ChromeTaskInput`, creating a foreground plan, activating the app, raising a window, or sampling the input policy's preparation baseline. Under this exact deployed path the task cannot reach those later operations. This distinguishes the concrete catalog defect from a permission denial, focus timing or HID counter change. Opening the independent test browser during authorized resource preparation is a separate setup action.

## Minimal change and unchanged authority

Local.9 adds only `authorizeTaskInput` to the existing internal catalog routing set. It obtains current metadata for the worker's already retained process; the worker still selects that exact PID and validates the current Chrome identity and pinned executable. No catalog or other application data is returned to a model or exposed as another tool. This supplies missing input to an existing check; it does not remove that check, substitute a user-supplied identity, grant application access, or expand the task's resource scope.

Retained-window binding, exact root/input/child/task identity, genuine human approval, fresh revocation generation, expiry, one-time arm, focus/HID checks, guarded dispatch, refusal locks, lease and cleanup remain unchanged. The coordinator's one-second convergence budget remains cooperative, not a hard real-time bound for an AX call.

## Evidence

`CatalogArmFixture.swift` uses exact extracted production catalog selection and the exact worker `authorizeTaskInput` branch. Only OS-facing values and the input constructor are stubbed; it proves this routing/guard contract, not actual input capability. With the verified local.8 source it fails with `CUA_INPUT_SCOPE_DENIED: Chrome input requires a retained task target`. With local.9 it passes 21 checks: valid arm plan, five previous catalog routes, seven routes that must retain an empty catalog, and eight rejected target/scope/re-arm/application/expiry cases. No AppKit, application enumeration, native driver, desktop input, model or real approval is used.

The exact-source fixture is part of `scripts/check-executable-identity.mjs` and the existing macOS CI job. Host scripted transport tests alone cannot catch this Native coordinator/worker mismatch; they remain separate evidence for consent and lifecycle behavior.

The live Host diagnostic passed through consent to Native arm only after the production code's structured allow-answer check and binding/revocation checks. The original UI answer packet and exact click timestamp were not durably exposed by the read APIs; those facts are not reconstructed from the model's summary. The raw finite terminal is kept privately. The failed test stopped, with root/child/pending/lease drained and only its own temporary resources closed.

Local.8 remains the deployed version until a separately confirmed update. Local.9 requires exact-head independent review and complete CI. Actual focus/input/HID behavior, key releases and comparable native/custom performance still require genuine bounded acceptance; the offline repair does not establish them.
