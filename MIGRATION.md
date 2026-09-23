# Migrating from `dsh-codex`

## Alpha 4.43 candidate: upgrade the Harness together

This candidate targets DeepSeek Harness `0.1.7-rc.1` only. Upgrade the Harness
and its profile runtime first, then install the matching Codex Connect release;
this candidate is not compatible with the previously declared `0.1.2-rc.1` or
`0.1.5` hosts. Keep the existing `llm-openai-codex` row and OAuth store. The DSH
settings lifecycle, message-source types, and native-compaction integration have
changed, but the migration does not require signing in again or editing
credentials. This candidate is not published; do not use a public install
command until its exact package/host pair is verified and released.
DSH `0.1.7-rc.1` also changes the Session log format. Migration of an active
task from the previously supported Harness versions to this target has not
passed acceptance; do not treat same-host task recovery below as proof of a
cross-Harness upgrade. Finish or safely stop active delegated tasks before
changing the Harness until that migration is verified.

## Next release candidate: public task orchestration paused

Task-level automatic model selection and read-only delegation are being withheld
until maintainer acceptance. This change does not retroactively disable npm 4.41
or already-running installations. It takes effect only after the new package is
published, installed, and loaded.

A new ordinary conversation has no collaboration activation options. Cached
clients cannot start, resume, upgrade or authorize delegation through the closed
server route. On a supported same-version host, existing tasks keep authenticated
readback, Stop and manual takeover;
grants, original history and spent request counts are not deleted or reset.
Manual model selection (including GPT-6/Astra), accounts, existing optional tools
and native compaction settings are unchanged. Internal orchestration source and
tests remain, but there is no public setting or environment-variable escape hatch.
Reopening requires a separately reviewed source change and new build after
acceptance; per-task user authorization will still be required.

Before downgrading an existing delegated task, use the authenticated safety exits
and let the runtime verify cleanup and delivery. Do not delete the task ledger or
edit its counters to force recovery. Cross-device/new-cookie task ownership limits
remain unchanged.


`dsh-codex-connect` uses the same provider id (`openai-codex`), OAuth filename (`.openai-codex-auth.json`), Cordis row id (`llm-openai-codex`), and browser auth routes for compatibility. The packages cannot be active together because Harness forbids duplicate provider adapters.

1. Record the effective default model, search route, and `llm-openai-codex` config without reading any OAuth file.
2. Remove `dsh-codex` from the selected profile and add `dsh-codex-connect`.
3. Keep exactly one `llm-openai-codex` row loading `dsh-codex-connect`.
4. Decide explicitly whether to set `enableSearch` and `enableImageTool`; both default to `false` after migration.
5. Preserve the prior `agent-default-model` and `web.searchProvider` only when the user wants those routes to remain selected.
6. Run `--dump-config`, then `dsh-codex-connect doctor`. Do not run OAuth again when `status` already reports signed in.

Rollback is the inverse package swap. Do not delete or copy the separate OAuth file during either direction. If Harness reports a duplicate `openai-codex` adapter, the old bundle or a manual provider row is still active; resolve that one row instead of changing credentials.

## Astra reasoning selections

The plugin's Astra fallback definition offers `low`, `medium`, `high`, `xhigh`, and `max`. An omitted `reasoningEffort` preserves the provider default; it does not select Low or disable reasoning. The native dependency definition still takes precedence when present.

Before using Astra with a saved `minimal` or `off` selection, update the selected conversation and, if applicable, the default model setting:

| Saved value | Selection preserving its effective request behavior |
| --- | --- |
| `minimal` | Select `Low` (`reasoningEffort: low`); both send `low`. |
| `off` | Select `Default` (provider default), omitting `reasoningEffort`; both omit wire `reasoning`. This never guaranteed disabled reasoning. |

Other valid explicit efforts remain unchanged. A saved `minimal`, `off`, or unsupported `none` request is rejected with `UNSUPPORTED_REASONING_EFFORT` before authentication or model traffic; the plugin does not silently change it. `none` has no supported prior behavior to preserve: choose a valid effort or `Default` explicitly. The plugin does not rewrite settings or historical Session events. Use the conversation model selector for an existing Session; changing only the default model does not replace that Session's explicit selection. OAuth credentials do not need migration.

## Repairing search history written by Alpha 4.10

Alpha 4.10 briefly wrote `web/openai-codex-search-llm-request` as a required private Session event. Because an external plugin cannot extend the Host persistence vocabulary across independent module instances, a newer Harness can refuse to read those histories after the event writer is removed.

Upgrade Codex Connect, then inspect the default `$DSH_HOME/sessions` root without changing it:

```sh
dsh plugin --profile web exec dsh-codex-connect migrate-history --json
```

If the dry run reports affected events, stop every DSH process that can write this Session root and apply the migration. `--confirm-stopped` is required together with `--apply`:

```sh
dsh plugin --profile web exec dsh-codex-connect migrate-history --apply --confirm-stopped --json
```

The migration changes only that retired event's envelope by adding `"ignorable": true`. It preserves event data, sequence, time, and the concatenated Zstandard frame layout, and creates `session.jsonl.zstd.pre-codex-search-history-migration` beside every changed artifact before replacing it. Keep that backup until you have reopened and verified the repaired Session. Re-running the command is safe. For a non-default JSONL persistence root, pass `--root /absolute/path/to/sessions`. SQLite and uncompressed JSONL stores are not modified by this command. Applying fails closed when the filesystem cannot create the required same-directory hard-link backup. Applying is also fail-closed on Windows; Windows users can run the dry-run only.
