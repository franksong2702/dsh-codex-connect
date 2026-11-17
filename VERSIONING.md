# Versioning policy

English | [中文](docs/VERSIONING.zh.md)

Codex Connect versions identify plugin releases independently of DeepSeek Harness. Show the plugin version and its verified DSH pairing together; do not infer one from the other.

## Release identity and phase

The current release series starts at `0.2.0-alpha.1` and continues as `0.2.0-alpha.N`. This maintainer-approved numbering cleanup replaces the longer `0.1.0-alpha.4.x` sequence for new releases. It simplifies the independent plugin version; it does not narrow DSH compatibility, require a host upgrade, or promote the plugin to Beta or stable. Published versions and tags keep their original names and contents. A DSH update does not reset the plugin counter.

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
- `latest` follows the newest published plugin release, by SemVer precedence, verified against the exact DSH version currently resolved by npm `latest`. That plugin release may be an Alpha or a stable version; the channel does not change its readiness designation. Promotion is a separate, explicitly authorized maintainer action. Publishing an Alpha does not authorize or perform it.
- Exact installation commands identify a plugin release; dist-tags do not guarantee compatibility.
- Keep the public README recommendation on a confirmed published pair while preparing a newer candidate. The recommendation may therefore differ from `package.json.version`.

This rule supersedes the former stable-only restriction after the first stable release, as decided in [#445](https://github.com/franksong2702/dsh-codex-connect/issues/445#issuecomment-6935776620). It changes channel policy, not the current npm tag, supported hosts or release workflow. If DSH `latest` advances without a verified published pairing, leave the plugin tag unchanged and report the default-install gap; do not infer compatibility or promote an unverified candidate. Existing users on other DSH versions still need a verified exact pairing. Follow [the promotion procedure](RELEASING.md#promoting-latest-short-lived-interactive-authentication) for fresh registry checks, isolated installation, authorization, readback and rollback.

The project newest version and the newest verified plugin for a user's existing DSH are different questions. More precise host-specific recommendations and generated installation sections are follow-up work; this policy does not claim the current update UI computes that choice from every historical record.

## Update highlights

Keep V1 highlight entries in increasing SemVer order, with unique versions and known capability kinds. Preserve the existing history. New documentation-only or maintenance releases may be omitted; existing empty `highlights` arrays remain valid. Release notes still describe fixes. Do not invent capabilities or require a contiguous counter sequence just to validate the catalog.

## Numbering migration to 0.2.0 Alpha

`0.2.0-alpha.1` sorts above every `0.1.0-alpha.4.x` release, including the last published `0.1.0-alpha.4.54`. Do not reset to `0.1.0-alpha.1`: it sorts below the historical series. The unshipped `0.1.0-alpha.4.55` candidate is replaced by this version and is not a published release.

The existing update checker compares both `alpha` and `latest` using SemVer, so it recognizes the new Alpha even while `latest` stays at `0.1.0-alpha.4.50`. It reports an update without installing it or upgrading DSH. Users can install the exact plugin version into their existing profile. Compatibility and highlight history keep their V1 formats; the four declared DSH targets remain `0.1.7-rc.1`, `0.1.7-rc.2`, `0.2.0-rc.1`, and `0.2.0-rc.2`. Exact verification still precedes a new catalog entry.

Publication uses the existing Alpha-only workflow, protected environment, `v0.2.0-alpha.1` tag, GitHub prerelease, and npm `alpha` channel. It does not promote `latest`. Any later phase change still requires separate review of the gates and publication/readback path. Keep host upgrades, schema changes, and numbering migration separately reviewable.

## Release checks

Follow [RELEASING.md](RELEASING.md) for the complete procedure. Run the frozen install and existing checks separately:

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:browser
pnpm run check:dsh-matrix
npm pack --dry-run
```

`check` does not include the browser suite or isolated DSH installation. Regenerate the lockfile only when dependency changes require it; do not refresh the dependency tree for a documentation or localization release. Automated checks do not replace real OAuth acceptance. Merge, publish, and `latest` promotion remain distinct operations.

Normative references: [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html) and the pinned [npm 11.6.4 publishing implementation](https://github.com/npm/cli/blob/v11.6.4/workspaces/libnpmpublish/lib/publish.js).
