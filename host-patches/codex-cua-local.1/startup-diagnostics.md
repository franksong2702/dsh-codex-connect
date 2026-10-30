# Local.8 startup diagnostics and initial focus

A local acceptance attempt stopped before the first Terra request. The terminal reason was `chrome_input_closed`; the no-model child persisted only its header, so the underlying Native error could not be recovered. This candidate repairs diagnostic loss. It does not identify that historical cause or establish desktop acceptance.

## Finite diagnostics

The existing task-approval v3 capability optionally exposes `diagnostics(receipt)`. Only the exact receipt object registered by this Host can read the bounded snapshot, including after closure. A cloned/foreign receipt is rejected. Reading diagnostics cannot authorize, renew, resume or dispatch input. Older capabilities without this method retain their execution behavior and return a null host diagnostic.

Each terminal result adds `diagnostics.host` and `diagnostics.worker`: enumerated stages, sources, codes, derived reasons and nonnegative relative milliseconds. Stages distinguish preflight, consent, Native arm, arm receipt, later receipt check, monitor, operation, pre-model check and cleanup. Focus loss, hardware-counter change, scope mismatch, expiry and already-closed input remain distinct. Unknown codes stay unknown. Error messages are not parsed as evidence of a Native cause.

Original exceptions are rethrown unchanged. Bounded code chains retain wrapper and recognized cause; the first informative cause from the first failure remains primary when later closed/cleanup errors occur. Cleanup rejection still rejects and prevents clean completion. Normal successful closure does not manufacture a failure. Repeated errors are deduplicated and capped at eight code records; progress is capped at sixteen records.

Messages, stacks, targets, window/application titles, paths, page contents, typed values, credentials and arbitrary properties are excluded. Host and worker use the identical shared projection. There is no new model tool, permission, persistent grant or general logging service.

## Reproducible focus defects

The former coordinator dispatched activation/AXRaise and immediately armed input. An asynchronous focus change could still be converging when the final guard ran. Its initial plan also had unknown main/minimized fields, causing AXRaise even when all observed foreground identities matched.

Local.8 issues activation/raise at most once, skipping both if the retained window is already foreground. Otherwise it allows a monotonic one-second observation budget for convergence, rechecking cancellation and existing preparation identity/window/hardware guards every time. It never repeats activation/raise. It arms exactly once after readiness, retaining final independent focused-window and process checks. Timeout closes the policy. A last-moment mismatch is rejected without returning to the loop. Single AX calls and quiescence remain subject to existing cooperative cancellation/timeouts; this is not a hard real-time guarantee.

No HID baseline, takeover detection, ownership, executable lifetime, expiry, receipt or dispatch guard is relaxed. Hardware changes during preparation still close the task. These reproduce possible mechanisms, not the cause of the historical failure or proof that synthetic events affect physical HID counters.

## Verification and remaining work

The focus harness extracts the exact production functions into a fake foreground environment using the production input policy. Reviewed local.7 functions fail delayed-focus and already-front scenarios. The new functions pass six scenarios: delayed convergence, already foreground, takeover, cancellation, timeout and a final-check race. No AppKit, event source, driver or OS action is instantiated by that harness.

Exact-Host scripted tests inject distinct Native focus/HID errors. Local.7 collapses both into the same terminal reason; local.8 retains code and arm stage. Additional cases cover preflight, arm receipt, subsequent receipt checks, exact diagnostic receipt access, actual Host cleanup rejection and privacy filtering. Providers and native channels are scripted.

See [build evidence](build-evidence-local.8.json). Exact-head independent review and complete CI remain gates. Local.8 has not replaced the deployed local.7 service. Another deployment/live test requires the separately confirmed scope and genuine task card. Physical HID behavior, real focus timing, key cleanup, backend identity and native/custom performance remain unverified.
