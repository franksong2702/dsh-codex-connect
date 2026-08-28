# Models account entry

This enhancement depends on the DSH 0.1.2 compatibility migration. It adds an optional `settings.models.footer` contribution, not a configurable-provider directory entry or a provider-card replacement. OAuth readiness is read from Codex Connect's account endpoint, never inferred from DSH's API-key credential indicator.

One `OpenAICodexAccountStore` is owned and disposed by the browser plugin. Models and Plugin settings reuse the same account component and store. Subscribers share one status request and polling timer; the final unsubscribe aborts status observation. A pending login survives page navigation, and no second login can start while it is active. A logout invalidates older status reads. Plugin disposal stops polling and closes a pending blank popup without signing the server account out. The store never writes browser storage or handles bearer/refresh tokens.

The Models card omits advanced settings and update controls. Those remain in Plugin settings. The existing popup-blocked fallback, remote-origin warning, reauthorization and quota rendering are retained. No default model, search route, credential file or network trust policy is changed.

Validation includes existing account UI tests, shared-view synchronization and lifecycle tests, registration checks, and a Chromium page-switch regression. These do not replace real user OAuth and model/image acceptance. The base compatibility PR's registry installation and lockfile gates remain outstanding; do not merge or publish this stack until they pass.
