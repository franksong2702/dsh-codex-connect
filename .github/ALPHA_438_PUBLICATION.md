# Alpha 4.38 publication verification — 2026-09-20

PR #223 was normally squash-merged after source-level author review and all required GitHub checks. Release tree 40dae54cac2561eb153cb217353a0b7345a43b8d exactly matches candidate bc8412841581672ecfeddec3db6719a70df6b728. No administrator override or independent review approval was claimed; the delegated review operation returned HTTP 403. The author review's concrete regression findings and fixes are recorded in the readiness note.

| Identity | Verified value |
| --- | --- |
| npm package | `dsh-codex-connect@0.1.0-alpha.4.38` |
| Release commit and tag target | `40dae54cac2561eb153cb217353a0b7345a43b8d` |
| Git tag | `v0.1.0-alpha.4.38` |
| Exact-main CI | [35498736638](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35498736638), success |
| Original OIDC release | [35498953151](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35498953151): verify and npm publish succeeded; public readback timed out |
| Recovery-only workflow | [35499339272](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35499339272), success |
| npm publication timestamp | `2026-09-20T08:19:05.916Z` |
| GitHub prerelease | [v0.1.0-alpha.4.38](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.38), id 392362227, 2026-09-20T08:22:22Z |
| Channels | alpha = 0.1.0-alpha.4.38; latest = 0.1.0-alpha.4.34 unchanged |
| Archive | 1,263,303 bytes; 89 files |
| SHA-256 | `478f66f7af7cdf82f25434d7068df55525169c55c760b289298585df5ae204e0` |
| npm integrity | `sha512-kwOa+/xwVBTaFA5Ty0Yg5Hv4VQGje949oeyQ0VlAIM6ZOdci2jYbHwjwb5Cit60dakT4VvXXb+5FUq5M9TBe4A==` |

npm accepted the upload and reported processing delay. The original workflow correctly failed closed after twelve ten-second readbacks still saw 404/old alpha. A later fresh readback verified 4.38 and the alpha tag. Read-only recovery verified original run identity, successful publish step, exact-main CI and identical archive bytes before the existing recovery workflow created the missing GitHub tag/prerelease. Both environment approvals followed the configured authorized-reviewer route. npm was NOT republished and existing tags were NOT moved.

Independent public npm download verified SHA-512 integrity and byte equality with both the original workflow artifact and the local tested package. Final local checks passed: 101 files / 1012 tests; 8 Chromium files / 32 tests; four declared exact DSH hosts with the same archive and ten fresh synthetic native-compaction lifecycle processes each. An additional undeclared DSH 0.1.6-alpha.1 canary passed on macOS / Node 22.22.3 with the same artifact, unchanged defaults, synthetic Reserve/image/persistence checks and zero real provider calls. It does not broaden the published support contract or claim Windows/account acceptance.

Public installation recommendations are updated only after publication readback. The immutable npm archive may retain preparation-time installation text; this docs-only follow-up does not republish it. Older-host pins and historical release evidence remain unchanged.

#219 remains open for verification of the original persistent failure. Confirmed client defects are fixed, but overloaded alone is not a block verdict and no 23-hour real-account recovery has been demonstrated. No daily DSH service, saved configuration, OAuth credential or feature default was changed. Do not treat publication as permission to close the original report without recovery evidence.
