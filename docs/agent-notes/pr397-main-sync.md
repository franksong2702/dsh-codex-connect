# PR #397 main synchronization — 2026-10-28

The external [PR #397](https://github.com/franksong2702/dsh-codex-connect/pull/397) head was `51e240d0b366ecfdc5db34a5aef3609d2810aed1`. Main `ed099b7119ab258f78d020b92d1bf9f1a666518d` adds the squash-merged Terra support from #398. The PR was mergeable without textual conflicts, but its `behind` state did not satisfy the strict required-check ruleset. The author enabled maintainer edits; the authenticated base-repository maintainer has push permission. The update merges main without rewriting contributor history. It does not merge the PR or publish a package.

The merged source retains one compact speed menu for every eligible Codex GPT model. Additional regressions exercise both Luna and Terra: Standard → Fast → Standard, disabled Ultrafast without a mutation, and English/Chinese touch-reachable explanations. The real-route fixture covers stale completion, session replacement, unmount, bounded GET/POST headers and bodies, and explicit-read recovery without replay. Terra's payload contract still rejects Ultrafast; Fast remains `priority` and Standard omits `service_tier`. No server gate, dependency, default or permission changes are introduced by this synchronization.

## Local validation

Environment: Node `v24.13.0`, pnpm `10.30.3`, locked DSH API `0.1.7-rc.1`, pi-ai `0.85.1`. Dependencies and Chromium are isolated to the task. No real credentials, daily Host or live model was used.

- `pnpm --config.minimum-release-age=0 install --frozen-lockfile`: passed, without changing the lockfile.
- `pnpm exec vitest run tests/openai-codex-speed.client.spec.tsx tests/speed-mode-contract.spec.ts tests/speed-mode-routes.spec.ts tests/conversation-speed.spec.ts tests/terra61-model.spec.ts`: 5 files / 95 tests passed.
- `pnpm run check`: passed; 171 files / 2,374 tests passed / 2 existing skips, build, lint/typechecks, workflow contracts, import/CLI/compatibility and 71-file package validation passed. The upstream UI package's absent source map emits the same non-failing warning as the earlier Terra run.
- `PLAYWRIGHT_BROWSERS_PATH=<task-browser-directory> pnpm run test:browser`: 14 files / 97 tests passed.
- `PLAYWRIGHT_BROWSERS_PATH=<task-browser-directory> pnpm exec vitest run --config vitest.browser.touch.config.ts`: 1 file / 5 tests passed, Chromium `hasTouch` at 390×844, including both languages on Luna and Terra.
- `git diff --check`: passed.
- Generated `lib/` came only from the project build. SHA-256: `lib/client.js` = `66317ee713a29ea7425c2bf476ccbaaa5d9cb1c4834ad4ccb604900dded0bead`; `lib/index.js` = `cbd65e2bcb72f08661445d031b2991a713b3f35d5aeb67bad408639e74a1bfa3`; `lib/bin.js` = `9f56fc32f7479ca5744d1691265589217ef42c17950271942c1df9a7994ce91b`.

## Security-check investigation

At the original PR head, GitHub reports successful [CI run 40551649504](https://github.com/franksong2702/dsh-codex-connect/actions/runs/40551649504) and [Dependency Review 40551649234](https://github.com/franksong2702/dsh-codex-connect/actions/runs/40551649234), totaling seven successful jobs. There is no CodeQL suite or analysis for `refs/pull/397/head`. These old successes are not validation of the synchronized commit.

Repository CodeQL **default setup is configured**, using the default query suite. Main has CodeQL analyses `2041728665` and `2041724067` at exact `ed099b7…`, and the same-repository Terra PR #398 has analyses at its own heads. There is no checked-in advanced CodeQL workflow. [GitHub's default-setup documentation](https://docs.github.com/en/code-security/concepts/code-scanning/setup-types#about-default-setup) states that PR scanning excludes forks, matching #397's external fork origin. Thus absence here is an unscanned PR, not a successful security scan or a global GitHub read-permission failure.

The active ruleset requires `validate (22.19.0)`, `validate (24.x)`, `dependency-review` and `browser-ui-regression`, with strict up-to-date policy. CodeQL is not among those four required contexts. No workflow, ruleset, security configuration or account permission was changed. Whether to require a separate pre-merge security scan remains a maintainer decision; this update makes no security-approval claim.

All local responses and account identities are synthetic. Chromium touchscreen automation does not establish physical iOS/Safari/VoiceOver acceptance. Real OAuth, entitlement, served tier, billing, production service and release acceptance remain untested.
