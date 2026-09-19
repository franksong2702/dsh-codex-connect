# Alpha 4.37 release readiness — historical preparation

**Published on 2026-09-19.** Release workflow `35439115133` succeeded at `5cbd0d330d12c81f0bf37515b65bc799e480aa78`; independent npm artifact, channel, Git tag and GitHub prerelease checks passed. See [publication verification](ALPHA_437_PUBLICATION.md). The preparation and gate descriptions below are historical, not the current publication state.

## Identity and scope

Candidate: `0.1.0-alpha.4.37`, based on main `525e01b6e1c2b7d23ba70e29510ef1fd31fb0168` after #216. Since published 4.36, main includes #212 (diagnostics/host-repair evidence), #213 (scoped denial guidance and runtime evidence), #214 (bounded Remember restart controls) and #216 (native-context opt-in presentation). Main CI `35436177342` passed for that base; candidate results are separate.

This preparation changes version/build identity and documentation, not capability defaults or dependency resolutions. Keep README/INSTALL/README.i18n recommendations on their already-published pair until post-publication readback. Preserve compatibility history; record this candidate only after its exact installation checks pass. No new highlight kind is invented for an existing capability's settings improvement.

## Release disposition and authorization

- **#215 triaged from maintainer-supplied excerpt:** the identified blocker is a missing local dsh-computer-use archive in the web-profile dependency set, not a declared Codex Connect dependency. A three-case offline pnpm control reproduces that failure without loading this plugin. UND_ERR_DESTROYED causality and reporter recovery remain unconfirmed. Keep the issue open; it is not currently a confirmed release-blocking plugin regression for the unchanged supported-host set. See [triage evidence](../docs/agent-notes/issue-215-install-triage-2026-09-19.md). No alpha.2 support or 4.37 fix claim follows from this disposition.
- **Host-only fix:** the preview's checkpoint-only retry repair (`2e5469e`) is a separate local DSH 0.1.5-rc.1 modification, not automatically installed by this plugin. The release notes must disclose the stock-host redundant-attempt limitation; do not claim universal repaired long-task acceptance.
- **Approval:** after #215 triage, the maintainer explicitly authorized publishing 4.37 on 2026-09-19. This covers completing the candidate PR, normal merge after current-head checks, exact-main CI and the existing `Publish alpha release` workflow with `version=0.1.0-alpha.4.37` and `confirm=PUBLISH`. It does not authorize bypassing repository/environment approvals, promoting `latest`, merging Think/Split or installing the host patch, changing 3080/3081, or live model calls.

## Supported and excluded scope

The declared host set remains exactly `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, `0.1.5-rc.2`. DSH 0.1.6-alpha.1/#207 and stock 0.1.6-alpha.2/#211 remain undeclared; 0.1.5-alpha.2/#182 is superseded, not verified.

Do not include unmerged Think #167 or Split #199/#200. Their CI does not establish production composition. #208 (new-session Fast Mode default) and #194 (live Reserve eligibility/recovery) are separate work, not completed features/acceptance in this release. #183, #196 and #65 remain open for broader acceptance.

## Candidate validation record

Local preparation checks on M15 / Node 22.22.3 completed successfully:

- Frozen install preserved dependency resolutions and the lockfile.
- `pnpm run check`: 99 files / 975 tests, lint, typecheck, build, CLI, compatibility and package checks passed (`wc_job_i2FXkZPZnpsWosio`).
- Chromium: 8 files / 32 tests passed (`wc_job_sbgBFhl12aRo6ZS4`).
- All four declared hosts passed against the same 4.37 packed artifact (`wc_job_GQOQ0gIqDdLFg_dJ`), including ten fresh native-compaction lifecycle processes per host, both storage encodings and automatic/fallback/replay checks. These were synthetic-provider fixtures, not live-account acceptance. The report is retained in the ignored checkout cache at `node_modules/.cache/alpha437-initial-matrix.json`.
- `npm pack --dry-run --json --ignore-scripts`: 87 files; root/Chinese READMEs and draft release notes present, no handoff/cache/credential paths. Product source, default flags, dependencies, lockfile, compatibility declaration and published-install recommendations are unchanged.

Historical preparation paused when the final diff/release-workflow inspection and a separate #215 body read were blocked; dependent delivery stopped and no alternative channel bypassed those refusals. The maintainer later supplied #215's log excerpt, whose separate triage is linked above. On the newly authorized publication pass, repository identity and the release workflow were reread normally. The already-passing four-host candidate report permits recording the unchanged exact supported pairs in `verified-compatibility.json`; final metadata/package changes still require fresh artifact verification. Current-head local checks, PR/main CI, immutable artifact identity and publication readback are recorded in the release PR/workflow, not inferred from the historical results above.

Required before candidate merge: frozen install, full `pnpm run check`, browser regression, all four declared-host installation checks with the same packed artifact, `npm pack --dry-run`, reviewed diff and final-head remote CI. Candidate verification is not publication or real-account acceptance. All fixture credentials/model responses remain synthetic.

The publication-pass full check initially detected that the exact catalog fixture in `tests/update-compatibility.spec.ts` still ended at 4.36. Its fixture now includes the same dated 4.37 record as the catalog; parser, duplicate/schema rejection and exact catalog assertions are unchanged. This is release-metadata synchronization, not a relaxed test or an additional supported host. The failed run remains historical evidence and a fresh complete pass is required.

## Publication procedure (not executed)

After resolving the publication hold and approving the candidate: merge it, verify successful exact-main CI, recheck npm/version/tag absence, then follow `RELEASING.md` and explicitly approve **Publish alpha release** with the exact version and `PUBLISH`. Independently verify npm archive integrity, alpha tag, Git tag and GitHub prerelease. Do not promote `latest` or alter existing installations during preparation.

Registry preflight on 2026-09-19 found alpha `0.1.0-alpha.4.36`, latest `0.1.0-alpha.4.34`, and no npm version or Git tag for 4.37. Recheck these mutable facts immediately before publication.
