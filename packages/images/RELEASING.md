# Releasing Codex Connect — Images

The PR-1 package is intentionally marked `private: true` and must not be published. Remove that guard only in the final implementation PR after all Host, browser, isolated-install, smoke, and pack checks are complete.

Before the first npm release, a maintainer must separately confirm that:

1. The package name `dsh-codex-connect-images` is available or controlled by the maintainer.
2. npm Trusted Publishing is configured for this repository, `.github/workflows/release-images.yml`, and the `npm-release` GitHub Environment.
3. The release tag uses `images-v<version>` and does not overlap the core package's `v<version>` namespace.
4. `pnpm run check:all`, both isolated DSH installation gates, and the authorized 3081 smoke test are green.
5. The user has explicitly authorized the release.

The workflow must not use a long-lived npm token or promote the `latest` dist-tag.
