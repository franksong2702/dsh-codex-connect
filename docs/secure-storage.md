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
This patch's tests use synthetic credentials and a mocked keyring exclusively.

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
Mac/Windows/Linux credential-store acceptance remains a separate installation
check; mocked tests do not prove it.
