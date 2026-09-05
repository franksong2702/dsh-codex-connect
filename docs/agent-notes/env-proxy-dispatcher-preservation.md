# Preserve Node's environment-proxy dispatcher

Node initializes its built-in `fetch` dispatcher before plugins load. npm Undici 8 uses a newer global symbol and creates a direct `Agent` when that symbol is absent; on Node 24 this initialization also replaces the legacy dispatcher used by built-in `fetch`. Importing Codex Connect could therefore disable `NODE_USE_ENV_PROXY` for unrelated requests even when the plugin proxy was disabled.

Codex Connect now aliases an existing legacy dispatcher into Undici 8's current slot before requiring the package. Undici then adopts the process-owned dispatcher instead of creating a direct replacement. The compatibility loader is the only runtime entry for Undici values used by the plugin; type-only imports remain safe. Codex-scoped proxy operations continue to install the existing `AsyncLocalStorage` dispatcher wrapper and delegate unrelated requests to the inherited dispatcher.

The built-package check starts a fresh Node process with environment-proxy support, imports `lib/index.js`, and requires the legacy dispatcher object to remain identical. Running the check after the build also guards against bundlers hoisting an Undici import ahead of the compatibility loader.
