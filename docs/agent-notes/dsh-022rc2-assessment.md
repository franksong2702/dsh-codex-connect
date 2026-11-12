# DSH 0.2.2-rc.2 candidate assessment (2026-11-12)

This is unreleased candidate evidence for issue #432, not a publication, Desktop
acceptance, or a change to the published verified-compatibility catalog. The
product version remains 0.2.0-alpha.13. Exact rc.2 peer metadata applies only to
this candidate; the released Alpha 13 artifact has not been changed.

## Upstream contract

Official npm metadata and package tarball SHA-512 integrity were checked for
`@deepseek-ai/dsh`, `dsh-agent`, `dsh-agent-loop`, `dsh-session`, `dsh-agent-team`,
`dsh-tools`, and `dsh-subagent`, all at 0.2.2-rc.2. At inspection, npm `latest`
remained 0.2.2-rc.1 and `next` was 0.2.2-rc.2.

The new ownership authority is the optional subagent service's `rootOf(agent)`,
not `parentSession` and not a reconstructed ancestry list. See the immutable
[official implementation](https://github.com/deepseek-ai/deepseek-harness/blob/ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c/packages/subagent/subagent/src/manager.ts#L503-L521).
It validates exact live handles, refuses unmanaged delegated agents, and can
retain tree membership after an intermediate creator leaves. Same-ID handle
replacement does not inherit authority.

## Candidate behavior

- Preserve legacy roots/isOwnedBy on older Hosts.
- Use exact rc.2 core and subagent metadata plus the real rootOf service.
- Durable ancestry is denial evidence only, never permission to recover a Task.
- Existing v1/v2 recovery, owner/revision checks, Stop/manual exits, cancellation,
  and accounting remain; public Task and automation remain frozen.
- No automatic routing is added. rc.2 fixes model selection before the deprecated
  request hook, so its profile stays recovery-only.
- A request without related retained v2 state may pass through when no ownership
  service is available only if no live v2 state exists anywhere and the exact
  live snapshot remains unchanged after reads. Missing service plus any live v2
  is conservatively refused. This is an explicit minimal-profile limitation.
- Corrupt/unknown state is not treated as absence. Exact handles and durable
  ancestry are rechecked after asynchronous reads.

## Evidence completed before candidate metadata expansion

All runs used synthetic adapters and no account credentials or real model calls.

- Main b343c1fd source with actual rc.2 reproduces the ordinary non-Codex turn
  regression: expected one synthetic provider invocation, observed zero.
- Candidate actual rc.2: 31 recovery/ownership cases, including signed HTTP
  owner/revision, v1/v2 recovery, cold cleanup, missing service, unrelated
  non-Codex turn, orphan delegated ledger and asynchronous same-ID replacement.
- Actual rc.2 crash suite: 12 cases / 24 fresh processes; zero external network
  attempts and zero real provider requests.
- Mutation proof: an isolated copy restoring the old filtered-roots managed
  loop fails the strengthened orphan-v2 test by invoking the synthetic provider
  once; the candidate invokes it zero times. The orphan is the only live agent.
- Actual rc.1: 24 recovery cases and 12 crash cases / 24 fresh processes passed.
- Baseline full check: 2,482 passed, 2 existing skips, lint/types/build passed.
- Baseline browser suite: 101 passed. This does not establish rc.2 UI acceptance.
- Latest focused helper/policy tests: 34 passed; TypeScript passed.
- Production dependency audit: 97 dependencies, zero vulnerabilities/advisories.
- Candidate metadata/unit contracts: 67 passed; frozen offline lockfile install
  remains unchanged.

## Additional candidate checks completed

The stock rc.2 install and complete installed-runtime checker passed with npm
10.9.3, without peer exemptions or an upstream repair. Packed SHA-256:
`e864efa0f0512f9c42cf06cf177a1fc9450ecd6070245cea72f4ffa1cc9d8afc`.
Final rebuilt npm 10.9.3 pack has the identical SHA-256. The full 17-Host matrix is still pending.
Defaults stayed unchanged; image, native-compaction, preflight, retry and Task
HTTP checks used only synthetic traffic.

Independent review verified 30 rc.1/rc.2 package pairs (60 archives) plus two
browser helpers against official SHA-512 metadata. Actual rc.2 primitives passed
16 Chromium cases, including narrow viewport and scrolled-container geometry.
The first run passed 11 and failed 3 solely because the old test assumed at most
145 px while the new Host rendered 146 px. Only the isolated fixture threshold
changed; production UI was not modified. No anchor displacement was reproduced.
See [API assessment](dsh-022rc2-api-assessment.md),
[package evidence](dsh-022rc2-official-api-review.json) and
[UI evidence](dsh-022rc2-ui-fixture-review.json).

Final candidate `pnpm run check` passed: 175 files, 2,504 tests passed, two
existing skips; lint, types, build, strict compatibility and 74-file package
inventory all passed. Production dependencies still audit at zero advisories.

## Pending before compatibility acceptance

- 17-Host same-artifact installation matrix (individual rc.2 install/runtime passed).
- Updated phase-1/phase-2 matrices requiring the extra rc.2 ownership fixtures.
- Remote review of the completed official API and actual rc.2 UI evidence.
- Remote CI for the submitted candidate.
- Desktop interactive installation, OAuth and live model acceptance remain unrun.

No merge, publication, deployment or daily-service restart is part of this work.
