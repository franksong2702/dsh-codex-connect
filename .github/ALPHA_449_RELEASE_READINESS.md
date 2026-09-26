# Alpha 4.49 release readiness — 2026-09-26

Corrective release for the two reproduced P2 defects in #272 / Alpha 4.48, delivered by #273. Candidate version: `0.1.0-alpha.4.49`; npm channel: `alpha` only. No rewrite of 4.48, published tags, host versions or daily services; npm latest promotion is excluded.

## Review and verification

- Separate ephemeral read-only Codex CLI 0.153.4 reviewer, actual model **gpt-6-astra**, returned PASS / zero findings for source at `804c0820024618016297889bc6c2df35d78bebbd`. See `docs/agent-notes/issue-273-independent-review.md`; its limitations and the unsuccessful Sol CLI attempt are preserved. The implementation source has not changed since that review.
- Frozen installation and complete check passed: **125 files / 1,440 tests**. Chromium passed: **13 files / 73 tests**.
- All three original reproduction tests passed, without weakening their assertions; 47 excluded tests were skipped, not counted as passing.
- Exact DSH `0.1.7-rc.1` matrix passed for the 4.49 runtime, with unchanged disabled defaults, original/inherited/source/refusal checks, two synthetic generations and two synthetic edits, and zero real provider calls. Record a verified pair only after this result.
- Machine-readable counts, tested archive identity, and runtime fingerprints: `docs/experiments/evidence/alpha-449-release-verification.json`. Final evidence/verified-pair/reference annotations followed the matrix, without changing runtime files. Final exact-head PR CI and exact-main CI remain mandatory.

## Publication procedure

After final CI, merge #273 with a head SHA fence, require successful exact-main CI, then dispatch the existing `release.yml` with this version and `confirm=PUBLISH`. Approve the existing npm-release environment only under the maintainer's release authorization; keep protections intact. Verify npm exact version, alpha tag, Git tag SHA and GitHub prerelease. Do not republish if readback fails.

Public installation recommendations remain on the already published 4.47 pair until 4.49 publication is read back. After publication, update the README/INSTALL bilingual recommendation through its own PR, add the exact installation command to the release notes, and annotate 4.48 known issues as fixed by 4.49 without erasing the original warning.
