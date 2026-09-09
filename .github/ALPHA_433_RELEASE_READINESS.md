# Alpha 4.33 dual-DSH release readiness

This is an unpublished candidate, not a compatibility declaration. It depends on PR #172 and includes the merged manual OAuth callback change from PR #171. PR #167 is outside this release scope.

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

Fresh OAuth authorization, manual callback and cancellation, enabled optional capabilities, and upgrade acceptance remain unverified. They require evidence or explicit maintainer acceptance of remaining limits before release. The historical verification catalog and public installation recommendation have not been updated. The local checks do not substitute for the CI Node/platform matrix.

## Release boundary

Merge, publish, and npm `latest` promotion are distinct actions. No deployment or service restart is included. After acceptance, record the exact verified pairs, complete release checks for the final candidate, and obtain the required merge/publication approval. After publication, read back the npm artifact, Alpha dist-tag, Git tag, and GitHub prerelease before updating public recommendations.
