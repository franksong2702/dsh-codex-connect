# Dependency security patches — 2026-10-06

This change starts from main `f2a4616b2afdda0c68688c865b5c4f5b27b880e8`. It updates affected transitive dependencies without changing the direct DSH host API versions, declared Node support, runtime Undici 8 dependency, experimental defaults or installed services.

| Dependency | Previous | Patched | Selection |
| --- | --- | --- | --- |
| undici | 7.29.0 | 7.29.1 | Patch jsdom's development dependency instead of upgrading jsdom to a major release with a higher Node minimum. |
| katex | 0.16.47 | 0.18.9 | Align the affected math extension dependency with the existing direct, patched KaTeX version. |
| source-map-js | 1.2.1 | 1.2.2 | Patch development CSS tooling. |
| compression | 1.8.1 | 1.8.2 | Patch the development host-webserver dependency without mixing DSH host API versions. |

Seven open repository dependency alerts covered brace-expansion and Undici 7. The local audit additionally reported GHSA-238p-pmpm-9mq7, GHSA-68fv-2mgg-jv7q and GHSA-vc2v-76pw-4v95 for KaTeX, source-map-js and compression. Version-bounded overrides exclude unaffected or later versions. Remove each override after its upstream dependency chain resolves only unaffected versions, then repeat the relevant checks.

The brace-expansion 5.0.9 to 5.0.12 fix remains exclusively in #295. This change deliberately does not duplicate it or close its alerts. The initial combined local patch passed `pnpm audit --json` with no advisories, `pnpm run check` with 135 files and 1583 tests plus successful build/package checks, and `pnpm run test:browser` with 11 files and 53 tests on Node v24.15.0. After separating #295, an offline frozen-lockfile installation succeeded and the final branch independently passed `pnpm run check` with the same 1583 tests and all build/package checks. Its audit returned exit 1 with only three brace-expansion advisories (one moderate, two high), all covered by #295: GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7 and GHSA-6j4f-fj2g-mc7p. Rebuilt tracked library artifacts were identical to main.

These are isolated, keyless checks with synthetic fixtures, not acceptance of live accounts, models, OAuth or installed services. A clean dependency audit does not constitute a complete product security audit.
