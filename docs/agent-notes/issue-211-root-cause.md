# Issue 211: missing profile-visible host peers

## Downstream delivery checkpoint — 2026-09-18

The complete upstream patch and generic regression are posted in [Discussion #5537](https://github.com/deepseek-ai/deepseek-harness/discussions/5537#discussioncomment-18498638). This downstream PR contains diagnostic improvements, explicit candidate-verification tooling and historical evidence only. It does not apply the upstream patch to normal installations, expand supported versions or close #211. Astra/Remember changes are delivered separately.

All test counts, source/archive hashes and execution-boundary notes below describe their original pre-split runs. They are not current-head PR CI evidence; later investigation superseded the earlier unknown-cause statements. The PR Checks identify fresh delivery validation. Original investigation history is preserved.

## Repair follow-up — 2026-09-18

The upstream cause is now confirmed and a local repair has passed fresh installation. Alpha.1's ordinary launcher default was `link`; alpha.2 changed it to `runtime`. The separate `dsh plugin ... exec` process did not inherit that process-local resolver. The source repair calls DSH's public profile-local materializer only for explicit CLI `exec`, inside the existing profile write lock, preserving native package identity and cancellation. It does not hand-link named peers or change Codex Connect's business code.

The portable upstream source patch, builder, candidate hashes and detailed results are recorded in repository path `patches/README.md`. A packed repaired `@deepseek-ai/dsh-plugin-manager` was installed into a fresh alpha.2 host before testing; no acceptance-installation file was patched afterward. The original failure was reproduced separately, eight repaired-command regressions passed, and the new installation passed doctor, models, disposal, Reserve, ten process-restart compaction phases and synthetic images. All four unmodified declared hosts also passed with the same Codex Connect archive. The local complete check passed 95 files / 905 tests.

This is a local upstream repair, not an update to the official alpha.2 registry package. No push, publication or daily-service replacement was performed. Issue 211 remains open for upstream delivery and later verification of an unmodified official release. The diagnostic-only findings below are preserved as historical evidence.

## Finding — 2026-09-18

The local exact-DSH `0.1.6-alpha.2` reproduction fails during ESM module linking, before the doctor can produce a report. Its first actual exception is `ERR_MODULE_NOT_FOUND` for `@deepseek-ai/schemastery`. This is an installation/profile dependency-resolution failure, not malformed JSON, extra logging, lost CLI arguments or a model/account failure.

The plugin already declares `@deepseek-ai/schemastery` in `peerDependencies` and deliberately leaves it external in `tsdown.config.ts`. It is present in the isolated DSH installation at version `3.18.2`, but initially invisible from the installed plugin's package directory. Reclassifying it as an omitted declaration or blindly bundling host peers would not describe the observed problem.

The checker obscured this failure: candidate exit 1 is provisionally allowed so a valid `unverified` doctor report can continue, but the startup exception also exits 1. Parsing its empty stdout then replaced the useful stderr exception with the generic one-JSON-line error.

## Evidence and causal control

Original GitHub run `35322318396`, alpha job `105527422364`, used main `eae9430f16f1707d8cefb76dec6e8344871d7684` and Node `24.15.0`. Its complete job log contains 431 lines, but neither doctor stream was retained separately; the artifacts API returned zero artifacts. The exact historical stderr cannot be recovered from that run.

New local observations use Node `22.22.3`, pnpm `10.30.3`, exact DSH `0.1.6-alpha.2`, and the plugin runtime from local commit `5128b7868f53b1a583553aee3125fdf755b8c16a`. This is a concrete reproduction, not a claim to have recovered the original Linux/Node 24 process. Within each comparison the installed plugin CLI bytes were checked against the built source; neither plugin nor host code changed between the control conditions.

| Observation | Result |
| --- | --- |
| Ordinary isolated checker, job `wc_job_ktzmpbSbAmf6gytH` | Exit 1; stdout is empty, zero bytes. |
| DSH `plugin exec` versus direct installed plugin CLI | Both exit 1 with the same missing `@deepseek-ai/schemastery` exception. |
| Read-only own-entry observer and explicit `--` separator | DSH forwards `doctor --json` correctly; the realpath main-entry comparison matches; the separator does not change the failure. |
| ESM resolution from the plugin package directory | All 22 declared peers are initially unresolved. Twenty-one exist in the exact host; `react` is not a direct host-root package. |
| Expose only host `schemastery` inside the disposable profile | The next missing peer becomes `@deepseek-ai/dsh-util-values`; this is broader than one missing library. |
| Expose the 21 existing host peers inside that same disposable profile | Doctor emits one 1,294-byte JSON report, credential state `missing`, compatibility `unverified`. Exit 1 remains expected for an undeclared host. |
| Existing installed-runtime check in the dependency-exposure control | Exit 0: eight models prepared, disposal and Reserve transitions verified, ten fresh native-compaction processes across none/zstd encodings, and synthetic direct/PTC image checks passed. |

The final experiment deliberately validates the **original failed doctor result**, even after the control succeeds. Its overall exit stays 1. The manual dependency-exposure control is not normal installation success and does not promote candidate support.

Sanitized machine-readable records:

- [Doctor/entry comparison](../experiments/issue-211-doctor-diagnostic-2026-09-18.json), job `wc_job_YySfh5MGD8JOWuAG`, SHA-256 `4a6ad4cd7876a1c4e3af1a6a470a419d063515c199f9881ee1cdd680da678c80`.
- [Peer-resolution counterfactual](../experiments/issue-211-peer-resolution-2026-09-18.json), job `wc_job_dsJNi-kcYVSc0i8Y`, SHA-256 `0de54233d7bab215aad9c8c3dd8189aa3c74a718fb7af9a9fcb9ef0603b7a951`.

The last comparison's packed-artifact SHA-256 is `08c8e37e31072fc9f9c94ecead174ff05eb392ae34cc721616a0c784b5a28841`. Different experiment runs can have different archive hashes because evidence documentation is included in the package; no runtime change was used to obtain the counterfactual recovery. Both recorded temporary installations were confirmed absent after completion. No live credentials or provider requests were used. Runtime responses and images remain synthetic, not live acceptance.

## Delivered diagnostic correction

`validateDoctorResult` now recognizes a single `ERR_MODULE_NOT_FOUND` startup exception naming one of this project's declared runtime packages when an undeclared candidate returns exit 1 and empty stdout. It reports only the error code and allowlisted package name, never the raw stderr, importer path or private text. Unknown/ambiguous errors keep the content-free framing diagnostic. Nonempty stdout still goes through strict JSON and schema validation, and infrastructure failures retain their classification.

The regression first failed one of 75 checker assertions, then passed all 75 after the correction. The existing 11 synthetic child-routing scenarios also passed. The temporary observation callback and experimental link/trace helper were removed after recording the evidence; no dependency linking is inserted into the normal checker or product.

Final `pnpm run check` passed on the completed checker/source changes: 94 files / 897 tests, typecheck, lint, build and package gates; job `wc_job_mvDMGKy8frhHrAxO`. The package check included 74 files. Replaying the saved actual process error through the final validator produced the expected safe missing-package diagnostic. Six local documentation links and the whitespace check passed. Generated `lib/` and runtime `src/` are unchanged from this task's starting commit. The GitHub cause report was posted and read back as issue-comment `5727830405`; #211 remained open. This paragraph is a documentation-only addition after that full check.

Ordinary fresh-install reproduction of the unresolved candidate is still:

```sh
DSH_VERSION=0.1.6-alpha.2 DSH_UNDECLARED_CANARY_VERSION=1 node scripts/check-dsh-install.mjs
```

This uses a disposable keyless installation. The new error is expected to identify the missing declared package rather than merely empty JSON; the final diagnostic change is separately validated against the saved actual process output without repeating an installation.

## Remaining repair boundary

The observed break is between the isolated host's installed peer packages and the profile/plugin's module-resolution context. The exact upstream source change that stopped exposing those peers has not been inspected or established. The earlier denied upstream-source inspection was not retried. This follow-up used the ordinary permitted installer and black-box process observations instead.

A production repair must restore the supported host/profile peer-resolution contract, preserving shared package identity, then pass a **fresh unmodified installation** and the current host matrix. Manual symlinks in an experiment are not that repair; copying peer packages or silently accepting arbitrary JSON is not an adequate substitute. Keep #211 open with cause localized and repair pending. No new supported version, release, merge, push, deployment or daily-service change is made here.
