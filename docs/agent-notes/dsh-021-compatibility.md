# DSH 0.2.1-alpha.1 compatibility candidate

Canary tracker [#303](https://github.com/franksong2702/dsh-codex-connect/issues/303) failed twice at `isolated-install` on plugin main `ce79394dfdfe25c53d2632548f169dc96d2644d8`, which already contains #300 and #302. The ordinary stock CLI rejects its exact DSH peer ranges before running the plugin. This is reproduced without a version exemption or relaxed peer checks.

## Upstream change and repair

The [upstream Alpha release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.1), commit `5badb15009ae1756c3afe0ae0cef1faafc290ccc`, removes runtime invariant plugins and their companion discovery. Its published DSH closure no longer contains `@deepseek-ai/dsh-invariants`. The compatibility preflight checks every DSH peer range, including optional peers; making the old range optional would still reject this host.

Codex Connect's invariant companion has only a type import from that package. Its built JavaScript does not import it. Remove the obsolete runtime peer and mandatory API entry, while retaining the baseline development dependency and `./invariant` export for older hosts. No old companion behavior or host-owned validation is removed.

Add only exact `0.2.1-alpha.1` to the remaining peer and diagnostic ranges. Keep the four previous exact hosts, the development baseline, plugin-owned pi-ai `0.85.1`, Schemastery `3.18.4`, OAuth code and feature defaults. Newer Alpha or stable versions remain unverified. The upstream composer `stats` split does not affect this plugin, which registers its quota and Fast Mode entries under `conversation.input.right`.

Before declaring this host, a peer-only local probe uses the stock profile resolver to exercise the unchanged packed runtime. Its doctor remains explicitly `unverified` during that probe. The normal assembled request includes system instructions, a tool definition and a user message, so a successful empty request cannot hide an adapter mismatch.

The installed image check now also exercises #302 through the actual host `tools/post-execute` waterfall: a synthetic non-Codex route receives one canonical image edit handle, an existing handle is preserved without duplication, and Codex or unknown routes receive none. These route identities are fixtures, not real non-Codex model calls.

## Verification and delivery boundary

The required gates are `pnpm run check`, `pnpm run test:browser`, and `pnpm --silent run check:dsh-matrix`. The five-host installed matrix requires identical packed bytes, default preservation, diagnostics, model registration/preparation, provider disposal, assembled synthetic requests, image generation/edit contracts and selection handles, and retained recovery/lifecycle checks. The existing source-host and delegation/crash matrices remain regression obligations; they do not reopen Task or other frozen work.

All profiles, credentials and HTTP responses used by these gates are synthetic and disposable. Browser unit regressions use development dependencies; they do not establish an authenticated browser session on the new host. Live OAuth, provider access, paid quota, a real Codex-to-non-Codex image edit, physical Windows/mobile acceptance and daily-service upgrades remain outside this check.

This source candidate still carries `0.2.0-alpha.1` as its development version label. It is not the immutable published artifact with that version. A distinct version and separate release authorization are required before publication. `verified-compatibility.json` continues to describe the existing published pairings; this change does not widen those historical records or npm tags.
