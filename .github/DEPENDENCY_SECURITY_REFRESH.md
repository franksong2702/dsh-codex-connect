# Host development dependency security refresh

The repository lockfile resolves `js-yaml` to `4.3.2` and `sharp` to `0.35.4`, with its matching `@img/sharp-*` packages and libvips `1.3.3` distributions. The installed macOS binary reports libheif `1.23.2`. These are the upstream fixes for [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) and [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c).

## Reachability and scope

`@deepseek-ai/dsh-agent-presets` loads preset metadata with js-yaml's default schema, which interprets merge keys. By contrast, the Cordis include entry-list schema extends `JSON_SCHEMA`; it does not enable merge-key processing. Both packages resolve the same patched parser. Codex Connect's HTTP and OAuth inputs do not directly enter this YAML path.

`@deepseek-ai/dsh-attachment-local` calls sharp for image metadata, decoding and normalization. The plugin's image tests use this host service. The host's media-type and size limits are not substitutes for fixing a vulnerable decoder.

GitHub classifies these paths as development dependencies of this repository. They are dependencies of host packages, not direct production dependencies bundled by Codex Connect. This change fixes the repository's locked development/test installation; it does not update an existing DSH installation, alter a published npm package, or prove a host profile's independent dependency tree is safe. No DSH version, peer requirement, plugin version, runtime code, account or service is changed.

## Verification

- The two bounded empty-mapping YAML cases were accepted by `4.3.1` despite `maxTotalMergeKeys: 1`; both now reject. A normal YAML merge remains valid.
- The native decoder check failed on old libheif `1.23.1`; the updated library reports `1.23.2`, completes a one-pixel PNG-to-AVIF-to-PNG round trip, and rejects invalid image bytes. No native memory-corruption exploit was executed; native security evidence is the upstream fixed-version mapping plus verification of the loaded binary.
- `pnpm --config.minimum-release-age=0 install --frozen-lockfile` passed.
- `pnpm exec vitest run tests/dependency-security.spec.ts tests/loader-composition.spec.ts tests/view-image.spec.ts tests/image-tool-local-attachment.spec.ts tests/settings-integration.spec.ts` passed 12 tests in five files. `pnpm run typecheck` passed.
- `pnpm run check && pnpm run test:browser` exited 0 with 723 tests across 84 files and 26 browser tests. Build, metadata/source lint, package checks and frozen dependency checks passed; generated runtime files are unchanged.
- `pnpm audit --json` exited 0 on 2026-09-09 with zero reported advisories. This is a point-in-time registry result, not a complete security audit or evidence about an existing host installation.
- Lockfile inspection confirms 28 replacement package entries belong only to js-yaml, sharp and sharp's platform distributions. All root dependency resolutions and declarations remain unchanged; unrelated resolver updates were excluded.

`tests/dependency-security.spec.ts` resolves libraries through their real host consumers rather than installing test-only copies. The tests run in the existing complete check and CI. Main-branch Dependabot closure is separate from local verification and requires merging the lockfile update and GitHub re-evaluation.
