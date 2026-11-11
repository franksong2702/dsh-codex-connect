# Effort-only composer stability — 2026-11-07

Refs [#425](https://github.com/franksong2702/dsh-codex-connect/issues/425).
Base: `674af2699af2755619e130081e26dd8b3d37f371` (main, Alpha 12 source).

## Cause and scope

Both composer entries treated only a `ready` model directory as eligible.
The Host retains the effective selection while `selecting`, including an
effort-only save. Returning null removed the speed entry, and quota's effect
aborted/reset its read and restarted polling when eligibility returned.

The installed DSH `0.1.7-rc.1` directory and the public
`@deepseek-ai/dsh-client-ui-model-selection@0.2.1-rc.2` package were inspected.
The latter keeps `current` and records `pending` while selecting, then clears
pending on success/error. Its npm SHA-512 integrity was verified. This is
contract inspection, not acceptance on that Host version.

The fix retains eligible current-model controls through `selecting`.
Speed interaction is disabled and an open menu is dismissed. Interrupted speed
reads/writes are aborted without replay. After settlement, speed is reread:
the existing backend intentionally invalidates its generation on every committed
`model/selection` event, including an effort change. Retaining an old Ultrafast
generation would be incorrect. No backend authority or invalidation rule changes.

Quota retains its data, in-flight read, polling deadline and failure backoff
during selection. It continues to pick the exact model's quota bucket.
Provider/model eligibility loss, error/loading/idle and unmount retain their
cleanup behavior. Replacing the session directory also cancels the old quota
request. Speed remains keyed by session, model and account identity.

## Reproducible evidence

Runtime: macOS, Node `22.22.3`, pnpm `10.30.3`, locked dependencies,
Chromium from Playwright `1.64.1`. No real credentials or model calls.

- Before the fix, the new repeated-effort regression fails because the mounted
  speed button becomes null at `selecting`. Quota regressions also expose
  premature cancellation and polling restart.
- `pnpm exec vitest run tests/effort-control-stability.client.spec.tsx`:
  8 passed. Includes repeated saves with actual synthetic Host session events
  and real speed HTTP contracts, stale speed GET/POST settlement, quota request
  cancellation, polling deadline and model/provider changes.
- Existing speed/quota/backend focused suites passed (84 existing tests).
- `pnpm run check`: passed, including lint, types, unit tests, build,
  isolated imports, CLI/compatibility contracts and packed inventory.
  Generated `lib/client.js` is updated only by this build.
- `pnpm run test:browser`: 15 files / 101 tests passed.
  The two new cases repeatedly switch High/Medium, dismiss menus, fail/cancel
  and retry, then change model/provider at 1280 × 720 and 390 × 844.
  They preserve the same speed/quota DOM nodes, one quota read across the
  successful effort cycles, and a 76 px synthetic composer height.

The browser fixture deliberately combines a 28 px model entry, the real 30 px
speed control and the real quota component to detect the reported height-loss
mechanism. It is **not** the actual DSH composer or Claude Style.
Linux/Node 24, Claude Style 0.19.9, real-account behavior and DSH Desktop
acceptance have **not** been executed or claimed. No version/dependency changes,
release, deployment, daily-service restart or migration is part of this fix.
