# PR #327 main synchronization and native acceptance — 2026-10-20

PR: https://github.com/franksong2702/dsh-codex-connect/pull/327

## Source and merge scope

The incoming PR head was
`293959257df85eb1ad7a779a0086f590d5221dc1`.
Main `e5579b71339ba932dec7dfba497fc97df8fbf124` was integrated in a new isolated
worktree using a merge, preserving the PR's authorship and history. No force
push is used. The original worktree and existing tasks were left intact.

Four conflicts were resolved:

- README and reference translation metadata hashes were regenerated from the
  merged bilingual documents.
- The dependency lock retains main's updated dependency versions plus the
  pinned `@napi-rs/keyring` 2.1.0 dependency. Frozen installation passed.
- Installed runtime acceptance retains both the secure synthetic-keyring
  assertions and main's search-route lifecycle checks.

Main's source version `0.2.0-alpha.9`, eleven declared Host versions, speed/model
defaults, retry/search routes and other merged features remain. OS-keyring-backed
AES-256-GCM, explicit offline migration, local authorization gates, sensitive-file
classification and fail-closed behavior remain.

## Concrete native defect repaired

Native macOS acceptance found that `@napi-rs/keyring` 2.1.0's async
`getSecret()` returns **null for absence and a plain number array for bytes**,
despite declaring `Uint8Array | undefined`.

The original draft could not create/use a first key. Normalizing absence alone
then exposed write-readback failure because an Array has no `byteLength`.
A separately addressed test-owned native entry confirmed a 32-element Array
matching the random test bytes. It was deleted and verified absent.

The production boundary now treats null/undefined as absence, validates every
array element as an integer byte before conversion, and preserves failure for
malformed or wrong-length keys. It never replaces a missing decryption key or
falls back to plaintext. Both fixture implementations now model the observed
native returns, and preload tests assert the Array representation across a
fresh process.

Negative controls reproduced the null and Array failures before their fixes.
Tests also reject short, out-of-range, fractional, NaN, string, sparse and
object-shaped key values without overwriting the entry.

## Executed validation

Environment: macOS arm64, Darwin 27.2.0, Node 22.22.3, pnpm 10.30.3.

| Check | Result |
| --- | --- |
| Secure store + local approval gates | 3 files, 71 passed |
| Secure store + preload fixture after fixture-contract alignment | 2 files, 17 passed |
| Final complete `pnpm run check` | 171 files; 2,318 passed, 2 existing skipped; exit 0 |
| Chromium browser suite | 14 files; 87 passed; exit 0 |
| Opt-in native Keychain check | Passed all five bounded operation groups; two owned entries absent after cleanup |

The complete check includes release/canary contracts, lint, types, unit/client
tests, build, import isolation, capability CLI, request metrics, compatibility
and package validation. It regenerated committed `lib` artifacts. Tracked input
hashes remained unchanged during the successful validation.

The first full check retained two failing preload assertions that still
expected undefined; after changing the fixture to match native null/Array,
those assertions were corrected and the focused checks passed before the final
complete check. The first browser invocation executed no tests because the
matching Chromium binary was absent. A test-only browser was downloaded under
this run's temporary directory, used for the passing suite, and removed. No
daily browser installation or running Host was changed. Initial failures are
preserved under [initial-validation](initial-validation).

## Native acceptance boundaries

The user explicitly authorized fake tokens, a temporary home, unique test-owned
native entries and cleanup of those entries. The opt-in
[`check-native-credential-store.mjs`](../../../scripts/check-native-credential-store.mjs)
requires `--synthetic-owned-entries-only`; it refuses synthetic keyring hooks,
generates unpredictable locators, checks absence before claiming ownership, and
never enumerates or opens a default/real credential path.

Passing operations:

1. Two independent random native keys, exact readback and locator/key separation.
2. Encrypted owner-only credential file and a fresh Node process readback.
3. Path binding and tampered-envelope rejection.
4. Explicit migration of only test-owned fake v1 primary/backup documents.
5. Final-account removal/logout deleting owned files and native keys.

[Native results](native-results.json) preserve both failed attempts, the bounded
shape diagnostic and the final pass, with source hashes and cleanup outcomes.
All test-owned entries were cleaned; no real account was read, migrated or
modified. There were no OAuth/model requests.

**Not performed:** Windows Credential Manager native acceptance; Linux Secret
Service native acceptance; locked native-store acceptance; real-account
migration; deployment or daily-profile acceptance. Mocked CI must not be
reported as native platform verification.

## Review and merge gate

This is current ChatGPT's direct implementation and verification, performed
through WebCodex MCP. No second model/Coding Agent/Codex CLI session was
launched. It is **not an independent review of the new head**.

Keep the PR draft until a fresh independent review and all required current-head
checks pass. The prior alert-31 disposition and ten passing checks were scoped
to the old head and are historical evidence only. No scan was disabled, no new
alert dismissed, and no safety gate bypassed. No merge, release, daily install,
service restart or real credential operation is claimed.

The [separate #358/#65 record](https://github.com/franksong2702/dsh-codex-connect/pull/375)
retains the intermittent writer-lock acceptance hold and the two-item issue
maintenance scope.

Public log copies remove ANSI codes, local home/temp-root prefixes and trailing
whitespace. The manifest retains raw and published hashes; outcomes are unchanged.
