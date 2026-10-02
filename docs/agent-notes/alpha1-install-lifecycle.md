# Published 0.2.0-alpha.1 removal and reinstallation — 2026-10-01

This check fills the removal/reinstallation evidence gap; it does not repeat the
already completed four-host release matrix or reopen experimental acceptance.
The tested npm artifact is the immutable published `dsh-codex-connect@0.2.0-alpha.1`,
not a package rebuilt from this documentation change.

## Identity and isolation

- Release source: `ba75aa66579bdb22f179c949628e9593b60bf469` ([PR #299](https://github.com/franksong2702/dsh-codex-connect/pull/299)).
- Artifact SHA-256: `afe0c5e9cb08d10912ddf215c8b7f601b9a6d51adfa5cb0cb34e2e7ae8c7258a`.
- Host: stock npm DSH `0.2.0-rc.2`, consistent exact closure of 278 DSH packages; Node `v22.19.0`, pnpm `10.30.3`.
- A separate temporary host, home, workspace and `web` profile were used. Package-manager configuration contained only the public registry; dependency scripts were disabled. No daily profile, credential or service was used.
- The artifact download matched SHA-256 and npm SHA-512 integrity. All 146 published files matched after both installation and reinstallation.

The four declared host targets remain unchanged. This additional lifecycle result
covers **only DSH 0.2.0-rc.2 on macOS**; the earlier four-host compatibility result
is not relabeled as four-host removal acceptance.

## Commands and outcomes

Here `<fixture>` is the isolated directory and `dsh` is its installed stock CLI.
The environment points `DSH_HOME` and the user home at empty fixture directories,
disables telemetry, and supplies an empty npm authentication configuration.

| Check | Command | Result |
| --- | --- | --- |
| Install published bytes | `dsh plugin --profile web add file:<fixture>/release.tgz` | Exit 0; bundle selected, package and all file hashes correct |
| Compose configuration | `dsh --profile web --dump-config` | Exit 0; default model and Web/search configuration unchanged |
| Boot command and diagnostics | `dsh web --help`; `dsh plugin --profile web exec dsh-codex-connect doctor --json --install-anchor <fixture>/host/node_modules/@deepseek-ai/dsh/package.json` | Exit 0; compatible, credential file missing |
| Signed-out status | `dsh plugin --profile web exec dsh-codex-connect status --json` | Expected exit 1; signed out, version `0.2.0-alpha.1` |
| Basic installed runtime | Installed-host resolver + LLM/pi-ai + plugin, then disposal | 11 models; GPT-6.1 Sol prepared without dispatch; provider removed on disposal |
| Unrelated dependency | `dsh plugin --profile web add file:<fixture>/unrelated-fixture` | Exit 0; separate synthetic plain dependency retained through removal/reinstall |
| Remove | `dsh plugin --profile web remove dsh-codex-connect` | Exit 0; dependency, bundle selection and package link absent; profile cannot resolve package; effective provider row absent |
| Boot without plugin | `dsh web --help`; `dsh --profile web --dump-config` | Exit 0; host defaults unchanged |
| Reinstall identical artifact | Same `add file:<fixture>/release.tgz` | Exit 0; bundle selected exactly once; all 146 files match again |
| Recheck runtime | Doctor, dump-config, help and installed runtime | Passed; provider and GPT-6.1 Sol rediscovered; disposal passed |
| Isolated Web server | `dsh web --host 127.0.0.1 --port 0 --no-open` | Ephemeral port 49883; root HTTP 401; process exited after test |

The [machine-readable record](evidence/alpha1-install-lifecycle.json) includes
command exit codes, timings, identities and assertions. One initial fixture
attempt appended a YAML row after an empty-array document and failed parsing.
The fixture was corrected to a single patch array with `config`; already passed
installation/startup stages were retained, and the remaining checks continued.
No product defect or runtime code change was needed.

## Preservation and residual state

Before removal, the fixture added a user patch setting the Sol context-window
value to 272001, a synthetic storage marker, an opaque synthetic auth-file marker
and the unrelated plain dependency. Removal and reinstallation preserved each
marker byte-for-byte. The context setting disappeared from the effective plugin
configuration while the bundle was removed and became effective again on
reinstallation. The opaque auth marker was removed before runtime startup; it
was never a usable credential. This proves file preservation, not live OAuth
reuse or token validity.

Removal unselects and removes the profile package. It does not promise to erase
user-authored patch rows, storage, separate OAuth state or package-manager caches.
Cache contents were not audited or purged. Do not delete an OAuth file merely to
complete package removal; credential deletion requires separate authorization.

The final fixture has the plugin reinstalled, its user patch/storage marker and
unrelated dependency retained, no usable credentials, and no running test server.
The package manifests of the daily and 3081 profiles/installed plugins had
unchanged size and modification time across the final checks. No real provider
requests, browser authentication, inference, quota exhaustion or service restart
occurred. HTTP 401 establishes listener startup and the authentication fence;
it does not establish signed-in browser use. Physical Windows/mobile behavior,
live-account reuse, an upgrade of DSH itself and daily-service deployment are
outside this result.
