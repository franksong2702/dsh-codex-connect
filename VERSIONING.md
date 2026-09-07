# Versioning policy

English | [中文](docs/VERSIONING.zh.md)

Codex Connect versions identify plugin releases independently of DeepSeek Harness. Show the plugin version and its verified DSH pairing together; do not infer one from the other.

## Release identity and phase

The current release series is `0.1.0-alpha.4.x`. Increment the final counter for another release in this series; a DSH update does not reset it. This policy does not rename any existing release or select a new version.

The publishing workflow accepts `MAJOR.MINOR.PATCH-alpha.NUMBER[.NUMBER…]`, with nonnegative integer components and no leading zeroes. Build metadata is not a release counter: SemVer ignores `+build.n` when comparing versions, and the pinned npm publishing implementation removes it. Use a distinct, higher-precedence version for every new package. Never overwrite a published package or move its release tag to different content.

The plugin's public behavior includes configuration, tools, commands, and stored data. In the `0.y.z` development period, incompatible changes require explicit release notes and migration guidance; intentionally starting a new incompatible release line increments the plugin minor version. Routine iterations within the current Alpha line increment its prerelease counter. Copying a host's version is not a substitute for deciding the plugin's change scope.

Alpha, Beta, RC, and a non-prerelease version describe the plugin's readiness, not DSH's. Phase promotion is a separate maintainer decision backed by recorded verification, including real-account and upgrade acceptance where relevant. A stable DSH release does not make the plugin stable. The current workflow remains Alpha-only; Beta, RC, and stable publishing need a separately reviewed workflow/channel change.

## Compatibility evidence

| Information | Maintained in | Meaning |
|---|---|---|
| Plugin build version | `package.json.version` | Identity embedded in the build and CLI |
| Host dependency requirements | `compatibility.json` and dependency declarations | Intended supported runtime constraints, checked for consistency |
| Verified exact combinations | `verified-compatibility.json` | Evidence from checks of each explicit DSH/plugin pair |
| User-visible changes | GitHub Release notes and `update-highlights.json` | What changed between plugin releases |

Keep the compatibility catalog's `schemaVersion: 1`, `checkedAt`, `latestDshVersion`, and `pluginVersions[].{version,verifiedDshVersions}` fields at the existing URL. Preserve historical entries. An unlisted pair is unverified, not necessarily incompatible. Neither a target dependency nor a green test on a different pairing proves compatibility.

Record a new exact pair only after verification. A candidate's verification record does not prove npm publication. Before recommending it publicly, confirm both that the version exists on npm with its matching release tag and that the pair is recorded. The offline lint check verifies the recorded pair and bilingual agreement; it does not contact npm or certify publication.

Do not replace V1 in place with a version-keyed object or infer a range from a single successful version. Any future incompatible format needs a versioned endpoint and continued output for installed V1 clients.

## Channels and recommendations

- `alpha` is the moving channel written by the current release workflow.
- `latest` is promoted separately and intentionally. Before the first stable release it may point to a verified Alpha; afterward it must point only to stable releases. Publishing an Alpha does not authorize or perform this promotion.
- Exact installation commands identify a plugin release; dist-tags do not guarantee compatibility.
- Keep the public README recommendation on a confirmed published pair while preparing a newer candidate. The recommendation may therefore differ from `package.json.version`.

The project newest version and the newest verified plugin for a user's existing DSH are different questions. More precise host-specific recommendations and generated installation sections are follow-up work; this policy does not claim the current update UI computes that choice from every historical record.

## Update highlights

Keep V1 highlight entries in increasing SemVer order, with unique versions and known capability kinds. Preserve the existing history. New documentation-only or maintenance releases may be omitted; existing empty `highlights` arrays remain valid. Release notes still describe fixes. Do not invent capabilities or require a contiguous counter sequence just to validate the catalog.

## A future numbering cleanup

A shorter independent series, such as `0.2.0-alpha.1`, is a possible later migration, not the next version selected by this change. Do not reset to `0.1.0-alpha.1`: it sorts below the current `0.1.0-alpha.4.x` releases.

Before a migration, verify that installed clients recognize the new version as an update, preserve compatibility and highlight history, and check package, workflow, tag, and channel agreement. For a phase change, also update the Alpha-only gates and publication/readback path. Keep host upgrades, schema changes, and numbering migration separately reviewable.

## Release checks

Follow [RELEASING.md](RELEASING.md) for the complete procedure. Run the frozen install and existing checks separately:

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:browser
pnpm run check:dsh-install
npm pack --dry-run
```

`check` does not include the browser suite or isolated DSH installation. Regenerate the lockfile only when dependency changes require it; do not refresh the dependency tree for a documentation or localization release. Automated checks do not replace real OAuth acceptance. Merge, publish, and `latest` promotion remain distinct operations.

Normative references: [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html) and the pinned [npm 11.6.4 publishing implementation](https://github.com/npm/cli/blob/v11.6.4/workspaces/libnpmpublish/lib/publish.js).
