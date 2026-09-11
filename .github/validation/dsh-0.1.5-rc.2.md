# DSH 0.1.5-rc.2 compatibility validation

Candidate based on upstream `06383d2`; package version remains
`0.1.0-alpha.4.34` for development. This is not a published release claim.

## Problem and scope

Plugin alpha.4.33 omits the profile `modelErrors` map that DSH rc.1/rc.2 reads
while resolving models. Upstream PR #179 already fixes that adapter contract.
This change adds exact rc.2 declarations and regression coverage on top of that
fix; it does not implement another adapter or change OAuth behavior.

A CLI reporting rc.1 can resolve rc.2 DSH dependencies through its caret ranges.
The host package versions, rather than the CLI string alone, determine the
runtime compatibility report. Mixed model-runtime versions remain unverified.

## Checks

- `pnpm install --frozen-lockfile`: passed with the existing lockfile.
- `pnpm run check`: passed, including 85 test files / 747 tests, lint,
  host/browser typechecks, build, capability CLI, compatibility, and packing.
- `pnpm test tests/compatibility.spec.ts`: 10 tests passed after adding an
  explicit mixed rc.1/rc.2 rejection assertion.
- `pnpm run test:browser`: passed, 8 files / 27 tests with the pinned
  Playwright Chromium build.
- `DSH_VERSION=0.1.5-rc.2 pnpm run check:dsh-install`: passed with an exact
  DSH dependency closure, unchanged defaults, optional capabilities disabled,
  and all 8 models listed, resolved, and prepared; disposal verified.
- `pnpm run check:dsh-matrix`: passed on retry for 0.1.2-rc.1,
  0.1.5-alpha.1, 0.1.5-rc.1, and 0.1.5-rc.2 with identical package bytes.
  The initial run stopped at the baseline with a generic isolated-check failure;
  a direct baseline rerun and then the unchanged full matrix passed.
  Raw structured results are in [the install reports](dsh-0.1.5-rc.2-install-reports.json).
- Installed-host regression: alpha.4.33 reproduced the undefined `.get` error;
  the candidate passed the same runtime check with DSH model packages rc.2
  and pi-ai 0.85.1. Doctor reported compatible.
- Real-account smoke: a fixed, non-sensitive prompt through `ctx.llm.stream`
  using the installed adapter and `gpt-6-astra` returned the expected `ok`
  text and a `stop` finish. Existing OAuth credentials were used; no fresh
  authorization flow or complete interactive agent session was exercised.
- The standalone `capabilities --probe` returned HTTP 200 but classified its
  response as incomplete/nonmatching. This separate diagnostic result is not
  claimed as a pass and is outside this compatibility change.

The local checks used Node 24.19.0 on macOS arm64. CI remains responsible for
its other configured Node/OS combinations. No raw network bodies, credentials,
account identifiers, environment values, or private paths are included here.

## Release and privacy boundaries

No version bump, npm publication, historical verification-catalog rewrite,
user-guide recommendation change, or new feature highlight is included.
Maintainers can assign a release identity and record the published pairing
separately. OAuth storage, authorization, optional feature defaults, model
routing, and permissions are unchanged. Generated library changes come only
from the project build. Package-manager cache repairs and standalone probe
changes are outside scope.
