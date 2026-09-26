# Alpha 4.50 release readiness — 2026-09-26

Authorized urgent maintenance: Issue #271 exact DSH rc.2 compatibility, preserving rc.1. Version `0.1.0-alpha.4.50`, npm channel `alpha`; no `latest` promotion, daily-service deployment, host downgrade, compatibility exemption or experiment activation.

## Gate evidence

`docs/experiments/dsh-017rc2-compatibility.md` and its machine-readable evidence record the 25-package API comparison, original rc.2 rejection, independent-review UI-peer finding and five red/green controls, final review scope, frozen rc.1 full check (1,452 tests), both-host Chromium (73 each), rc.2 source types/focused regressions, and same-artifact exact rc.1/rc.2 installed matrix. Final runtime hashes did not change when verification records were added. No independent live-account claim is made.

Wait for the final PR SHA's complete CI and security checks. Merge with an exact head fence, require exact-main CI, then dispatch the existing protected release.yml. Read back npm exact version, alpha, Git tag SHA and prerelease. If npm upload succeeds but readback fails, never rerun publication; use the existing recovery-only evidence workflow against that original run.

After publication, notify and close #271 as the scoped compatibility delivery, and update the bilingual README/INSTALL recommendation through a separate documentation PR. Preserve all earlier pairs. #208 was closed as implemented/released; #270 received the corrected 4.49 notification. Waiting-information and research trackers were clarified without inventing acceptance or reviving retired PRs.
