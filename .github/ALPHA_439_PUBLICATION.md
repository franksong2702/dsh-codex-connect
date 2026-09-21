# Alpha 4.39 publication verification — 2026-09-21

PR #230 was normally squash-merged after all required exact-head checks into release commit `e78f934b77685fd653a91d0109a043b489d52116`. No administrator bypass was used. The release packages the backend request-governance work from merged #227; the overlapping #226 is closed as superseded.

| Identity | Verified value |
| --- | --- |
| npm package | `dsh-codex-connect@0.1.0-alpha.4.39` |
| Release commit and tag target | `e78f934b77685fd653a91d0109a043b489d52116` |
| Git tag | `v0.1.0-alpha.4.39` |
| Exact-main CI | [35552132368](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35552132368), success |
| OIDC release workflow | [35552461838](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35552461838), success |
| npm publication timestamp | `2026-09-21T02:01:38.771Z` |
| GitHub prerelease | [v0.1.0-alpha.4.39](https://github.com/franksong2702/dsh-codex-connect/releases/tag/v0.1.0-alpha.4.39), published `2026-09-21T02:01:48Z` |
| Channels | `alpha = 0.1.0-alpha.4.39`; `latest = 0.1.0-alpha.4.34` unchanged |
| Archive | 1,273,824 bytes; 91 entries |
| SHA-256 | `2dff58e6eaf53d18acc14ac8b094a35b34c1cb9c8e54c51677ce8e2d37fb3aca` |
| npm SHA-1 | `d9c0d59bb8e736361b3f1edcdf97c9ff764cad13` |
| npm integrity | `sha512-XUxCxqoRThQlhEDaYgMEJcb9TUFBzHVahLKwp4ZhkqOPRLF2gaxu70DAsKcXqKtz4XLf8ARMnAmeGnji3xwVKA==` |

The release workflow rechecked successful CI for the exact main SHA, rebuilt and packed the verified tree, checked the uploaded artifact digest after the protected `npm-release` environment approval, published through npm Trusted Publishing, verified public npm version plus the `alpha` tag, and created the matching GitHub prerelease. The `latest` channel was not promoted.

Independent public npm readback returned the same version, SHA-1 and integrity recorded by the candidate dry-run. A separately downloaded public tarball has SHA-256 `2dff58e6eaf53d18acc14ac8b094a35b34c1cb9c8e54c51677ce8e2d37fb3aca`, exactly matching the package exercised by both four-host candidate matrices. The public tag and GitHub prerelease both target `e78f934b77685fd653a91d0109a043b489d52116`.

Release validation included 104 test files / 1,037 tests, 8 Chromium files / 32 tests, both Node CI targets, Windows subprocess contracts, and identical-artifact installation checks for DSH 0.1.2-rc.1, 0.1.5-alpha.1, 0.1.5-rc.1 and 0.1.5-rc.2. Optional capabilities remained off and matrix provider traffic was synthetic; this does not broaden support to DSH 0.1.6 or establish live-account recovery for #219.

The immutable npm archive was prepared before public install guidance could truthfully move from 4.38 to 4.39, so its embedded README may retain the prior confirmed recommendation. The repository documentation follow-up updates the current recommendation without republishing the package. No daily DSH service, saved OAuth state, live model call, feature default, or `latest` dist-tag changed.
