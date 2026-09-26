# Exact DSH 0.1.7-rc.2 compatibility — Issue #271

Alpha 4.50 candidate adds exact DSH `0.1.7-rc.2` while retaining `0.1.7-rc.1`. Both pair with plugin-owned pi-ai `0.85.1` and schemastery `3.18.4`. This is not support for intermediate alpha releases, rc.3, mixed versions, or a newer pi-ai. Current publication status is established by the matching npm package/tag/Release, not this candidate record. Public installation recommendations stay on the previously published version until readback.

## Contract and API investigation

The peer range is the explicit union `0.1.7-rc.1 || 0.1.7-rc.2`, not a wildcard. Development dependencies and the committed frozen lock remain at rc.1. Runtime diagnostics and the strict development checker require a consistent declared version. All **19 mandatory DSH peers**, including the four UI peers, are listed in the common compatibility contract; the checker asserts that list equals the mandatory DSH peer set. The optional commands service remains optional. The ordinary doctor's compact four-package report is not a complete UI-peer audit; use the capability diagnostics/strict checks for that broader scope. Neither output proves live model entitlement.

Compared integrity-verified registry declarations from 25 rc.2 packages against the installed rc.1 package declarations; nine had changes. Important additions include session/tool-history projection, the pending model-selection state, localized approval display fields and optional Modal controls. The atomic-write package now documents dead-PID lock recovery. Changed layout construction and removed OnboardingSurface are not consumed by this plugin. No new rc.2-only runtime API was required for the existing behavior. Do not infer cross-host/PID-namespace lock safety or native deferred-tool support from this compatibility update.

## Reproduced findings and repairs

The new rc.2 compatibility case failed before the declaration/pair update. An independent source reviewer then found that union peers could permit UI/core mixtures if mandatory UI peers were omitted from the consistency list. Five regression cases reproduced this gap before the fix; all pass after adding the UI peers and the mandatory-list invariant. The final independent review returned PASS within its static-source scope.

The rc.2 source fixture first failed types because three ModelDirectoryState test fixtures lacked the new `pending` field. They now explicitly supply `pending: null` with a type compatible with both hosts; production types were not weakened. Initial browser loading then failed because rc.2's UI primitives import the newly split `dsh-util-code-language` source helper. The disposable source-test fixture adds the actual published `0.1.7-rc.2` helper, not a stub; the full DSH distribution supplies it through dsh-tool-fs. No installed host library, default, plugin-manager exemption, or production dependency was patched for the passing installed checks.

## Executed evidence

- Frozen rc.1 dependency install and full check: **125 files / 1,452 tests**, lint, types, build, proxy/import isolation, CLI, strict compatibility and package audit passed.
- Final Chromium on rc.1: **13 files / 73 tests**.
- Disposable rc.2 source fixture: all 60 direct DSH development/source-helper packages pinned to rc.2; full host/client typecheck passed; Chromium **13 files / 73 tests** passed; nine focused image/selection/diagnostic suites **130 tests** and ten additional auth/transport/compaction suites **178 tests** passed. Source bytes match the final production source.
- Unmodified isolated DSH **rc.1 and rc.2** both installed the same packed candidate without version exemptions, loaded its profile and passed the runtime checker. Each preserved disabled defaults, prepared models, checked disposal/Reserve logic, exercised ten native-compaction processes across plain/zstd persistence, and ran two synthetic generations/two edits with inherited-access/source/refusal checks. Matrix archive SHA-256: `d7c50c41fc39f024d08c1b45444aec640f1ab1d4107059e0733de213dd0bc1ff`.
- No real image, selection or Reserve acceptance was performed; separate read-only model source reviews are recorded separately. The first pre-review-fix matrix was stopped and is not claimed as passing.

Machine-readable evidence, source/runtime hashes and package comparison identities: `evidence/issue-271-compatibility.json`. Final evidence/catalog annotations followed the matrix without changing runtime files; exact-head and exact-main CI remain release gates.

## Reproduction and boundaries

On the committed rc.1 development baseline run the frozen install, `pnpm run check`, `pnpm run test:browser`, and `pnpm run check:dsh-matrix`. The matrix reads both exact declared targets. For the additional rc.2 source check, copy the tracked source to a disposable directory, pin its DSH development packages plus `@deepseek-ai/dsh-util-code-language` to rc.2, install with `--ignore-scripts` and a fixture-only regenerated lock, verify exact package versions, then run host/client types and browser tests. Never apply that development fixture procedure to a user's daily profile.

Task orchestration remains hard-paused. No daily profile, account, 3080/3081 service, experimental default, latest promotion or host upgrade is part of this delivery. Full everyday Session/mobile/Windows GUI and live account quality remain outside the scoped evidence. Historical compatibility entries remain intact; older active npm channel trackers remain open instead of being falsely marked supported.
