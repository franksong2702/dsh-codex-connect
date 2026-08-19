# Migrating from `dsh-codex`

`dsh-codex-connect` uses the same provider id (`openai-codex`), OAuth filename (`.openai-codex-auth.json`), Cordis row id (`llm-openai-codex`), and browser auth routes for compatibility. The packages cannot be active together because Harness forbids duplicate provider adapters.

1. Record the effective default model, search route, and `llm-openai-codex` config without reading any OAuth file.
2. Remove `dsh-codex` from the selected profile and add `dsh-codex-connect`.
3. Keep exactly one `llm-openai-codex` row loading `dsh-codex-connect`.
4. Decide explicitly whether to set `enableSearch` and `enableImageTool`; both default to `false` after migration.
5. Preserve the prior `agent-default-model` and `web.searchProvider` only when the user wants those routes to remain selected.
6. Run `--dump-config`, then `dsh-codex-connect doctor`. Do not run OAuth again when `status` already reports signed in.

Rollback is the inverse package swap. Do not delete or copy the separate OAuth file during either direction. If Harness reports a duplicate `openai-codex` adapter, the old bundle or a manual provider row is still active; resolve that one row instead of changing credentials.

## Repairing search history written by Alpha 4.10

Alpha 4.10 briefly wrote `web/openai-codex-search-llm-request` as a required private Session event. Because an external plugin cannot extend the Host persistence vocabulary across independent module instances, a newer Harness can refuse to read those histories after the event writer is removed.

Upgrade Codex Connect, then inspect the default `$DSH_HOME/sessions` root without changing it:

```sh
dsh plugin --profile web exec dsh-codex-connect migrate-history --json
```

If the dry run reports affected events, stop every DSH process that can write this Session root and apply the migration:

```sh
dsh plugin --profile web exec dsh-codex-connect migrate-history --apply --json
```

The migration changes only that retired event's envelope by adding `"ignorable": true`. It preserves event data, sequence, time, and the concatenated Zstandard frame layout, and creates `session.jsonl.zstd.pre-codex-search-history-migration` beside every changed artifact before replacing it. Re-running the command is safe. For a non-default JSONL persistence root, pass `--root /absolute/path/to/sessions`. SQLite and uncompressed JSONL stores are not modified by this command.
