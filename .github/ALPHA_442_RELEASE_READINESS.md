# Alpha 4.42 candidate — 2026-09-23

The maintainer explicitly authorized completing/merging #248, publishing a new release and promoting npm latest. #248 was normally squash-merged as `c831b9dd255ff0636d5fdaebd6484e530d2b7fb2` after all current CI and security checks passed. The accepted tree is `f31c44bab6ec0c102d29a1b6a3456ad0cd0b521a`.

This candidate advances only package/build identity, its CLI snapshot, exact verified compatibility records and release notes. Public task activation remains hard closed. Accounts, ordinary manual models, native compaction, dependencies, lockfile and release workflows remain unchanged. Public install recommendations remain on confirmed 4.41 until 4.42 is actually published.

## Artifact verification

Isolated preparation run: https://github.com/franksong2702/dsh-codex-connect/actions/runs/35833862208 . Its read-only job checked that public 4.42 did not exist, changed the version from 4.41, ran the complete check and all four declared installed-host checks. Only after success did it append the exact compatibility pair and matching test fixture. A final pack verified those non-packed metadata changes left the archive unchanged.

- Exact hosts: `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, `0.1.5-rc.2`.
- Every host used package SHA-256 `b868df611c281b27f9e38390795155b70389cc397ff11a7c1bf6cec0ade2c708` with defaults unchanged and synthetic-only provider fixtures.
- The final four changed compiled library files and package identity were independently rebuilt on local Node22.19.0 and compared byte-for-byte with the CI candidate; all matched. Unchanged library files retain the accepted main baseline. The obsolete hashed chunk is deleted.
- Candidate/archive and individual Git object hashes were independently verified before committing. The temporary evidence workflow is absent from the final tree. Its separate object job only created inert Git blobs, not refs or releases.

## Remaining release gates

The isolated preparation is not final-head CI or publication. The committed release candidate must pass ordinary CI (Node22/24, all declared-host/runtime matrices, browser and installed synthetic upgrade) and security checks, then normal squash merge. The existing protected main-only OIDC workflow additionally requires completed successful CI for that exact main SHA and verifies the package artifact before publishing.

A historical temporary dispatch job initially performed no operation. An explicitly authorized later job rerun may dispatch only the existing `release.yml` for 4.42, after this release PR is merged, main equals its merge SHA and every exact-main CI job succeeds. It has no OIDC/npm credential, package execution, ref write or environment-protection bypass. An existing dispatch/public version stops duplicate publication. The original release workflow remains the publishing authority.

npm alpha publication does not promote latest. The user's separate latest authorization still requires supported npm authentication; do not claim promotion from workflow success. Independently read back public archive identity, release/tag SHA and both channels. Never republish 4.42 after an uncertain publish result; use the existing recovery-only procedure if needed.

No real models/accounts, daily profiles, 3080/3081, service restarts or live orchestration-quality assessment are included. The installed full-page upgrade remains a synthetic baseline-host test; dedicated runtime matrices are not all-host human/mobile acceptance.
