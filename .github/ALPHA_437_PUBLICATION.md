# Alpha 4.37 publication verification — 2026-09-19

The maintainer authorized this alpha publication after #215 triage. Release PR #217 was normally squash-merged; the merge tree exactly matched reviewed candidate `926eb56eaa31227e9e5e6e77e60138914966af12`. No protection override or publication retry was used.

| Identity | Verified value |
| --- | --- |
| npm package | `dsh-codex-connect@0.1.0-alpha.4.37` |
| Immutable release commit / tag target | `5cbd0d330d12c81f0bf37515b65bc799e480aa78` |
| Tag | `v0.1.0-alpha.4.37` |
| Exact-main CI | [35438853684](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35438853684), success |
| OIDC release workflow | [35439115133](https://github.com/franksong2702/dsh-codex-connect/actions/runs/35439115133), verify and publish both success |
| npm publication timestamp | `2026-09-19T11:09:22.495Z` |
| GitHub prerelease timestamp | `2026-09-19T11:09:42Z` |
| Channels after publication | `alpha = 0.1.0-alpha.4.37`; `latest = 0.1.0-alpha.4.34` unchanged |
| Published archive | 1,255,319 bytes; 88 files |
| SHA-256 | `811c8562b080bb41a671f2165eb188d8ec6e7e50c45ca66a2a69c5b2146f842c` |
| npm SHA-512 integrity | `sha512-wdp7rUT4rKvoayYwm/jvEKAhs8RPNnrF2mkfGxYgqn4aFLVq6jSBlY0WqwJbj9effJijyq4BD2yF5COyRgcPhA==` |

Independent download verified registry integrity and byte equality between the public npm archive, the workflow's verified artifact, and the final local four-host tested package. GitHub release `392040738` is a published prerelease, not a draft, and its tag resolves to the exact commit above. Curated bilingual notes preserve the generated changelog and explicitly disclose the host-only compaction limitation.

Final candidate checks passed: frozen install, full local check (99 files / 975 tests), 32 Chromium tests, and the four exact declared hosts with identical package bytes and ten fresh native-compaction lifecycle processes each. All eight PR checks and the six actual main checks, including CodeQL, passed. The release workflow independently reran its complete check and verified the artifact before npm Trusted Publishing. Installation/lifecycle model replies were synthetic; no new live model request or real-credential acceptance is implied.

The public installation recommendations are updated only after this readback. Older-host pins and historical 4.35 evidence remain intact. The immutable npm archive can retain its preparation-time installation text; neither changing repository documentation nor release notes republishes that version or moves the tag.

No 3080/3081 service, saved configuration, model selection or feature default changed. The preview's DSH repair at `2e5469e` is not included or installed by this package. Think #167, Split #199/#200 and #208 remain excluded. #215 stays open for reporter recovery; this release does not fix the missing external local archive or claim official DSH 0.1.6-alpha.2 support.
