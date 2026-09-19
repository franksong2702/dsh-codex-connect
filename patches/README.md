# Issue 211: upstream plugin-command repair

Status: **upstream repair proposed in [Discussion #5537](https://github.com/deepseek-ai/deepseek-harness/discussions/5537#discussioncomment-18498638); downstream diagnostics and reproduction tooling prepared as a separate PR. No official-host fix or daily-service deployment is implied.**

This delivery is split from local source `3de1b6934ae0d71d0a39d9ff6d77145c711d966a` onto `franksong2702/issue-211-diagnostics-delivery`, based on main `eae9430f16f1707d8cefb76dec6e8344871d7684`. The immutable reports below describe the pre-split source and package hashes, not the new PR head. Use the PR's current-head Checks for its own CI. The independent Astra/Remember changes are not included here. Issue #211 stays open for upstream delivery and stock-release confirmation.

## Ownership and cause

This repair targets `deepseek-ai/deepseek-harness`, tag `dsh-v0.1.6-alpha.2`, commit `ddefc45fbc7f8e46dd73185e68295696d1297887`. Codex Connect's business code is not the defect location.

The upstream [resolution-generation design](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/.agents/notes/implemented/architecture/2026-09-09-profile-resolution-generations.md) and [app-boot contract](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/boot/app-boot/README.md) explain the change: ordinary profile startup now installs an in-process resolver instead of creating filesystem fallback links. `dsh plugin --profile web exec ...` starts a separate process through pnpm. Its [command owner](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/boot/plugin-manager/src/operations.ts) did not prepare that child's dependency resolution. Booting `web --help` first no longer supplies another process's missing peers.

## Source repair

The tag-to-tag source comparison confirms the transition: `apps/cli/src/profile-boot.ts:305` at alpha.1 commit `0a15e36e7f82b6ed45af6fa9759f29b40dcd965d` defaults to `options.resolutionMode ?? 'link'`; line 263 at alpha.2 commit `ddefc45fbc7f8e46dd73185e68295696d1297887` defaults to `options.resolutionMode ?? 'runtime'`. Both source files were read directly during repair; the earlier diagnostic-only record did not establish this upstream change.

`dsh-0.1.6-alpha.2-plugin-exec.patch` adds one import and nine lines inside `runPluginCommand`'s existing profile manifest lock. Explicit CLI `exec` calls load the selected profile without parsing its user patch and call the public `healIsolatedProfileModuleFallback` helper before spawning. Cancellation is checked before and after preparation.

This reuses the host's canonical dependency traversal and profile-local projection, not a hand-written peer list or package copies. Host package identity is retained; profile-owned packages are not overwritten. Ordinary runtime boot, service package management, non-exec commands, permission decisions and supported versions are unchanged. This narrow patch handles `exec` as the first forwarded pnpm argument; it does not add parsing of other pnpm command aliases or flags.

## Reproduce without modifying a daily installation

From this Codex Connect checkout with its locked development dependencies installed:

```sh
node scripts/issue-211-repair.mjs
```

The script reads the immutable upstream source, verifies exact patch anchors, prepares a disposable exact-version build host, proves the original command failure, compiles the patched operations module and runs eight real upstream-command regressions. It then packs the repaired `@deepseek-ai/dsh-plugin-manager` and installs that archive into a **different, fresh** exact alpha.2 host. Codex Connect is installed through normal `dsh plugin add`; its ordinary doctor and installed-runtime checks run without modifying the acceptance installation's files or manually creating peer links.

The artifact keeps the upstream package version because it is a local candidate, not a release. Reports identify its archive/module hashes separately. `.issue211-artifacts/` contains the local tarball and descriptor and is excluded from Git and the Codex Connect npm package. No actual account or provider requests are used. Build and acceptance installations are removed after completion.

The normal install CLI does **not** accept a repair from an environment variable. Only the explicit programmatic candidate call uses the hashed archive, is confined to undeclared alpha.2, and labels its report. The declared-host matrix rejects any candidate-labelled report.

## Historical evidence obtained before the PR split — 2026-09-18

- [Fresh repaired-host validation](issue-211-repaired-host-validation.json), job `wc_job_EBKV8DEvcltIABC-`, Node `22.22.3`, pnpm `10.30.3`.
- The original upstream command failed with a missing peer; the repaired module passed eight actual subprocess/materializer cases: ESM and CommonJS host identity, repeat execution, local precedence, invalid user-patch preservation, non-exec isolation, service isolation, cancellation and application-profile scope.
- A fresh installation with the repaired host package passed the unmodified doctor gate, eight model preparations, disposal, Reserve transitions, ten separate native-compaction processes over none/zstd, and synthetic direct/PTC image checks. All seven optional defaults remained false. Real provider requests: zero.
- Codex Connect full check passed 95 test files / 905 tests, including typechecking, lint, build, CLI and package checks; job `wc_job_mJQ9bxrV2OdvCeRo`. Workflow contracts passed 77 assertions and candidate-checker contracts 75 assertions. The standalone real-upstream regressions are separate from the 905 Vitest tests.
- [Four unmodified declared hosts](issue-211-declared-host-matrix.json), job `wc_job_DVbXfR6JHtpWIds4`, all passed: `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, each on Node `22.22.3`, eight models and ten independent native-compaction processes per host. These runs contain no upstream candidate override. Their Codex Connect archive SHA-256 is `412d620da203b6dcd829016e8ca0cf246db8783bb17b35ae9b0adbbe3e1097c7`, also matching the archive in the repaired alpha.2 test. This is 40 stock-host lifecycle processes plus the separately labelled repaired-host 10, not a two-Node-version or live-provider matrix.

The earlier scope comparison ran while the installer was rebuilding `lib/` and observed the temporary clean-output phase. The build completed, and the final generated runtime matches the task-start commit; no such transient deletions are part of the patch. Current-status paragraphs in the existing documentation were updated after the installation matrix; those text-only updates are not the previously hashed npm archive. Runtime source, generated code, dependency metadata and the tested upstream patch remain unchanged.

Source patch SHA-256: `46259f6ef42ce6737c1692fc6e66442fabb33ffae6f6bf0ffa8fa2cdfdce5c18`.
Repaired manager archive SHA-256: `6aac90d240b127ff454ff5eed548406a9bfc7ad90a99ffeef9a28db87ebecdf5`.
Repaired operations module SHA-256: `03f04644cf8761018d5ce1ba45390991b8ec95ddf48da967412d38fa6f281ebd`.

This evidence does not certify an unmodified registry alpha.2, current upstream main, another Node version, a complete deployed browser flow or live model behavior. The upstream monorepo-wide suite was not run. No PR was pushed, no package was published, and no user service was restarted. Issue 211 remains open for upstream delivery and stock-release confirmation; a Codex Connect-only publication cannot ship this host repair.
