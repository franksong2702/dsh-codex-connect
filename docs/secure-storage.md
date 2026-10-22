# Secure OAuth storage

This source change is a development candidate. It does not upgrade a running
Harness profile, migrate stored credentials, or authenticate an account.
Installation, credential migration, and OAuth require separate user approval.

## Persistence

OAuth tokens are encrypted with AES-256-GCM in
`$DSH_HOME/.openai-codex-auth.json`. A fresh 96-bit nonce is generated for each
write. The document format, cipher, tag, and absolute pathname are authenticated;
copying a document to another path does not silently rebind it.

A random 256-bit encryption key is stored through the pinned
[`@napi-rs/keyring` 2.1.0 binding](https://github.com/Brooooooklyn/keyring-node):

| Platform | Required store |
| --- | --- |
| macOS | Keychain |
| Windows | Credential Manager |
| Linux | Secret Service, such as an unlocked GNOME Keyring or compatible service |

The OS-entry account identifier is the SHA-256 digest of the resolved document
pathname. It is a non-secret locator, not a password verifier or key derivation.
The encryption key is independently generated with `randomBytes(32)` and read
back from the OS entry before use. Recreating the same entry generates a new
random key; knowing the pathname or its digest cannot decrypt the document.
The locator mapping is retained to avoid orphaning keys written by this draft.

Only the short key is placed in the OS store. This avoids platform credential
blob limits while retaining the existing 16-account, 512-KiB plaintext-document
limit. The JSON on disk contains ciphertext and encryption metadata, no OAuth
tokens or account identifiers. Existing owner-only permissions, atomic writes,
cross-process locking, captured-account refresh, and cancellation are retained.
POSIX reads also reject symlinks and files owned by another user. Directory
ancestors and their resolved paths must have trusted ownership and must not
permit writes by another user. The direct parent must belong to the current
user. Root-owned, non-writable OS aliases and root-owned sticky temporary
ancestors are permitted; user-controlled parent symlinks are rejected. The same
checks cover legacy backups before migration. Windows symlinks are rejected;
Windows inherited ACL acceptance remains part of native platform validation.

Linux explicitly requires `secret-service`; the binding's automatic fallback to
an ephemeral kernel keyring is disabled. An unsupported platform, missing native
binding, unavailable/locked store, failed key write/readback, invalid key, or
failed authentication blocks the operation. There is no plaintext fallback.
OAuth checks storage before opening the sign-in browser.

The OS store is accessed through native APIs, without token/key command-line
arguments, shell commands, or exported environment variables. Native errors are
replaced with bounded diagnostics. Doctor remains a metadata-only check and
does not establish OS-store availability.

## Explicit migration

Legacy v1/v2 plaintext documents are not imported during startup, status, token
refresh, or login. Stop every Harness process using this home, then explicitly
run the reviewed candidate's command:

```sh
dsh-codex-connect migrate-credentials --confirm-stopped
```

The confirmation records the operator's assertion that Harness is stopped; the
plugin cannot prove that all other processes are idle. Migration validates the
primary and any existing `.v1-backup` before writes, verifies the OS-held key,
encrypts the backup first, and then atomically encrypts the primary. Each written
file is reopened and decrypted for readback verification. No new plaintext
backup is created. A partial failure leaves the existing files for an explicit
retry; a mixture of legacy and encrypted files is accepted only by migration.
Ordinary authentication rejects a leftover plaintext backup too.

Migration and logout never read or change `~/.codex/auth.json`. Operators should
not print token-bearing files, paste their contents into chats, or commit them.
The default test suites use synthetic credentials and a mocked keyring. The
separate opt-in native check below uses only newly created test entries.

## Recovery and limits

Keep the OS-store key and encrypted document together, at their original path.
A lost key or moved document fails closed; an ordinary login does not overwrite
a key needed to recover existing data. Restore the original key/path, or
explicitly sign out before signing in again. Signing out all accounts, or
removing the final account, deletes the encrypted files and the OS-store key.
Uninstalling the plugin does not imply logout. An older plaintext-only plugin
cannot read this format; do not downgrade without an explicit recovery plan.

Encryption does not erase historical plaintext backups, snapshots, SSD remnants,
or credentials exposed before migration. Revoke/re-authorize an account if that
history is a concern. The host process still needs decrypted credentials in
memory. OS storage protects persistence; it does not remove the plugin's full
host trust or protect against a compromised authorized host process. Native
credential-store acceptance remains a separate platform check; mocked tests do
not prove it. The macOS result below covers the listed test-owned operations,
not real-account migration, locked-store behavior, or deployment acceptance.

## Native validation (2026-10-20)

The opt-in check creates a random temporary home and independently addressed OS
entries. It requires explicit consent and never opens a default credential path,
enumerates existing entries, signs in, or contacts a model:

```sh
node scripts/check-native-credential-store.mjs --synthetic-owned-entries-only
```

On macOS arm64 with Node 22.22.3 and `@napi-rs/keyring` 2.1.0, the check passed
native key write/readback, independent keys, encrypted file persistence, a fresh
Node process readback, pathname/tamper rejection, migration of test-owned v1
primary/backup files, and final-account/logout key deletion. Both test entries
were verified absent afterward, and the temporary home was removed.

This exposed a binding contract mismatch: native `getSecret()` returns `null`
or `number[]`, while its async declaration advertises `Uint8Array | undefined`.
The boundary now normalizes absence and validates every array byte before
conversion. Invalid values still fail closed; missing decryption keys are not
replaced. The fixture now models the observed native values. Negative-control
regressions reproduced both failures before the corresponding fixes.

[The acceptance record](reviews/2026-10-20-pr327/README.md) retains failures,
source hashes and cleanup results as well as the passing run. Windows Credential
Manager and Linux Secret Service native validation have **not been performed**.
No real account or existing credential entry was read, migrated or modified.

## Scanner history and current gate

CodeQL alert 31 (`js/insufficient-password-hash`) at the original draft head
`6be498b074fd3152652869ed090f864d743e9fc1` reports the pathname digest as a
password hash. Its three reported sources are `join(root, 'synthetic-oauth.json')`
or the dotted equivalent in the delegation fixtures; none reads file contents.
The digest reaches only `AsyncEntry`'s account argument. AES receives the
independent 32-byte OS-store secret returned by `credentialKey`, not this digest.
The added synthetic regression checks locator stability, path isolation,
independent fresh keys on the same path, and rejection of the locator as an
AES decryption key. This evidence addresses the specific claim, not a complete
security audit or native credential-store acceptance. The earlier maintainer
[recorded a specifically authorized false-positive dismissal](https://github.com/franksong2702/dsh-codex-connect/pull/327#issuecomment-6244657842)
for alert 31 and verified its result check on the then-current head. That
historical disposition is not approval of subsequent code. No scanner is
disabled or suppressed by this update; the new head still requires all current
security checks and an independent review before merge.
