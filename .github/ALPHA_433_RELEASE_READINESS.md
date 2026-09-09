# Alpha 4.33 dual-DSH release readiness

Alpha 4.33 is published from `45e58f508e4f2c22f985e0d8f6d41762fb4bedce`. PRs #172 and #173 are merged, including the manual OAuth callback change from PR #171. PR #167 is outside this release scope.

## Targets

- One Codex Connect `0.1.0-alpha.4.33` artifact.
- DSH `0.1.2-rc.1` with pi-ai `0.84.4` resolved within the existing `^0.84.2` requirement.
- DSH `0.1.5-alpha.1` with pi-ai `0.85.1`.
- Preserve the plugin's independent Alpha numbering and existing npm `latest` channel.

## Acceptance status

Validation completed on 2026-09-09 with Node `26.5.0`:

- `pnpm install --frozen-lockfile && pnpm run check && pnpm run test:browser` exited 0 in each isolated dependency environment: 718 tests across 83 files and 26 browser tests per target. Lint, type checks, build, package checks, and the pinned OAuth reproduction check passed.
- `pnpm run check:canary-workflow && pnpm run check:dsh-matrix` exited 0: 57 workflow assertions and 59 candidate-check assertions passed. Both exact DSH targets loaded 8 models and 8 reasoning models, disposed successfully, and preserved all five disabled optional-capability defaults.
- Both matrix reports used plugin artifact SHA-256 `847a4ec08a5a31c33a0b771f00d7cee33af6429509cab9c2c1dfef8a11fdf063`.
- Bounded existing-account acceptance passed in fresh, isolated installations: 4 live Astra Low requests per host, 8 total. Each host completed a tool round trip, a continuation, and a continuation after disposal and restoration from persisted session data, with exact expected answers. Source and copied credentials were unchanged; private test data and temporary installations were removed. No existing service was restarted or modified.

The live test used candidate artifact SHA-256 `48ec3ad7fe307b0557ab493a230f8c30b002f2b325ec61bd6d0c7fccbdc264ea`. Later changes affected documentation and development dependency metadata; the runtime implementation was unchanged. This live result is candidate-code evidence, not a claim that the final tarball bytes received live acceptance. The final packed-artifact matrix above is separate evidence. Builds from both dependency environments produced identical runtime chunk bytes.

## Follow-up acceptance

PR #172 merged as `fbe05f8323bf88112aa4ea166c2d9c5bd41067cc`. The main merge into PR #173 produced `008e808c6e82eec81e2d4e838bcfd22ea78904fe` with no candidate file changes. All eight reported CI checks passed on that commit, including Node 22.19 and 24, browser regression, Windows contract, dependency review, and CodeQL.

`pnpm run check:canary-workflow` passed 57 workflow and 59 checker assertions after the merge. `pnpm exec vitest run tests/oauth-manual-callback.spec.ts tests/oauth-provider-cancellation.spec.ts tests/oauth-cancel-commit.spec.ts tests/oauth-socket-regression.spec.ts tests/image-asset-routes.spec.ts` exited 0 with 14 tests in five files. These use fixtures, not fresh account authorization.

Isolated upgrade acceptance exited 0 on both exact DSH targets. Each installed published plugin `0.1.0-alpha.4.32`, generated a tool round trip and continuation through the real agent loop with offline model responses, disposed the runtime, and upgraded with the DSH plugin CLI to candidate artifact `847a4ec08a5a31c33a0b771f00d7cee33af6429509cab9c2c1dfef8a11fdf063`. A new process loaded `0.1.0-alpha.4.33`, resumed the persisted session, recovered both expected answer messages, and verified the five calibrated Astra efforts. The profile configuration and fixture credential file were byte-identical after upgrade. No live model requests were made; private fixture data and temporary installations were removed. This proves the isolated fixture upgrade path, not an upgrade of either existing user service or a post-upgrade live account request.

Fresh OAuth acceptance passed with the user's browser participation. An isolated temporary page called the candidate's real WebAuth implementation; a local callback-port placeholder emulated a remote browser requiring manual submission. One real token exchange completed, the manual callback was accepted, and the independent credential store reported an authenticated account. A preceding cancellation rejected a stale callback without a token request or stored credential. The user confirmed success. The temporary credential directory and listeners were removed afterward. This verifies the real OAuth implementation through an acceptance page, not a second full DSH settings UI end-to-end run.

The exact-pair catalog now records both DSH targets for Alpha 4.33; the public installation recommendation stays on the previously published version until npm readback. Enabled optional capabilities received targeted fixture regression, not fresh live search or image generation acceptance. This Alpha release retains that explicitly limited verification scope and does not change the npm latest tag or either existing local service.

## Release boundary

[Release workflow 34342603518](https://github.com/franksong2702/dsh-codex-connect/actions/runs/34342603518) completed successfully. Independent npm readback confirmed version `0.1.0-alpha.4.33`, alpha `0.1.0-alpha.4.33`, and unchanged latest `0.1.0-alpha.4.30`. Git tag `v0.1.0-alpha.4.33` and the non-draft GitHub prerelease both identify `45e58f508e4f2c22f985e0d8f6d41762fb4bedce`.

The downloaded npm archive has SHA-256 `0b645ae485308e54536463b76fbe9c4d78be689c38f8f998df3a2b067f09bc82` and npm SHA-1 `409cd8c46b20f3f5b774ffc353f88ca483004b97`. Its archive bytes differ from the local packed archive, but all 62 extracted files are byte-identical to the verified release checkout. No package was republished to update documentation.

Merge, publish, and npm `latest` promotion are distinct actions. No deployment or service restart is included. After acceptance, record the exact verified pairs, complete release checks for the final candidate, and obtain the required merge/publication approval. After publication, read back the npm artifact, Alpha dist-tag, Git tag, and GitHub prerelease before updating public recommendations.
