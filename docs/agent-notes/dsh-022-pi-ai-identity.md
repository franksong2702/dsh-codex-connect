# pi-ai identity on DSH 0.2.2

In the four verified DSH 0.2.2 pairings, the host adapter and Codex Connect resolve separate pi-ai packages. The difference is intentional. The installed Alpha 15 diagnostic reported the correct version for each dependency it checks. [#445, Step 3](https://github.com/franksong2702/dsh-codex-connect/issues/445)

| Exact DSH and host adapter | Host adapter declaration | Host adapter resolved | Codex Connect resolved |
| --- | --- | --- | --- |
| `0.2.2-alpha.3` | `^1.3.0` | `1.5.2` | `0.85.1` |
| `0.2.2-rc.1` | `^1.3.0` | `1.5.2` | `0.85.1` |
| `0.2.2-rc.2` | `^1.3.0` | `1.5.2` | `0.85.1` |
| `0.2.2-rc.3` | `^1.3.0` | `1.5.2` | `0.85.1` |

The DSH CLI package has no direct pi-ai dependency in these releases. Its `@deepseek-ai/dsh-llm-pi-ai` adapter uses the host installation's copy for Harness message conversion and adapter behavior. `^1.3.0` is a dependency range, so another installation may resolve a different compatible version or use its lockfile. On 2026-11-17, the observed installs resolved the version shown above. [Published host adapter packages](https://www.npmjs.com/package/@deepseek-ai/dsh-llm-pi-ai?activeTab=versions)

Codex Connect subclasses the host's public adapter and supplies its own provider and request handling from direct dependency `@earendil-works/pi-ai@0.85.1`. Its patched OAuth login and refresh implementation has separate provenance from `0.84.4`. The `piAi` entry in the compatibility declaration describes the direct dependency. `doctor --json --install-anchor` reads the selected DSH peer versions and the plugin's own pi-ai version. Its `compatible` status describes that version tuple. [Adapter](../../src/adapter.ts) · [OAuth source and patches](../../vendor/pi-ai-oauth/README.md) · [Compatibility declaration](../../compatibility.json) · [Diagnostic scope](../runtime-identity.md)

## Verification on 2026-11-17

- Downloaded all four exact adapter archives from the public npm registry and verified their SHA-512 integrity. In each stock fixture, the installed adapter manifest and entry point matched its public archive. Node's ESM resolver selected different pi-ai package paths from the host adapter and plugin entry points.
- Used the stock DSH CLI and normal requirements checks to install the published `dsh-codex-connect@0.2.0-alpha.15` in four new Web profiles on macOS arm64 with Node 24.13.0. All 75 installed plugin files per profile matched the published package (SHA-256 `87ea5a79461922fdf989246c5754b329a4fd37157bec83a81f3792f011039e20`).
- All four direct doctor checks exited 0 with the expected three exact DSH peer versions, plugin pi-ai `0.85.1` and missing credentials. With a nonexistent DSH anchor each exited 1 with unknown DSH metadata, while retaining the observed plugin-owned pi-ai. Each isolated runtime registered and prepared the model catalog, dispatched two synthetic ordinary requests, checked six retry cases, and removed the provider on disposal. The runtime sandbox recorded zero external network attempts.
- Five local suites for installation metadata, compatibility, doctor, update routes and runtime identity passed all 131 tests. The installed probes are limited to these four pairings and synthetic requests. Real OAuth, account entitlement, model calls and Desktop acceptance remain outside this evidence.

The probe found no pi-ai identity mismatch that calls for a code change. These results describe the published exact pairings. An in-range future host still needs its own compatibility and recovery checks under the Step 4 proposal.
