# Alpha 4.36 Harness compatibility release readiness

## Scope and identity

The candidate version is `0.1.0-alpha.4.36`. It packages the reviewed PTC image presentation and download repair from #206, the exact-host enabled-image validation from #209, and the already-merged maintenance PRs #201, #202, and #204. It does not include the unmerged Astra #167 or Split #199/#200 work.

The declared DSH target set remains `0.1.2-rc.1`, `0.1.5-alpha.1`, `0.1.5-rc.1`, and `0.1.5-rc.2`. The upstream `0.1.6-alpha.1` canary remains intentionally undeclared: its isolated checks are useful candidate evidence, but they do not replace a separately recorded host acceptance.

## Existing evidence

PR #206 repaired the DSH PTC bridge's nested image presentation path, including preview recovery and exact-original download handling where a new result retains the original reference. #209 then exercised enabled direct and PTC images, original downloads, inherited-fork access, and denial for earlier forks and unrelated sessions across every declared DSH host. Its exact-head CI run `35171123627` passed on Node 22 and 24, including the declared-host matrix and the upstream canary. Provider replies, preview storage, and code backend in that matrix are synthetic; the host bridge and plugin route are real.

The current user acceptance was observed on the running DSH `0.1.5-rc.1` test host with published Codex Connect `0.1.0-alpha.4.35`. It is evidence for that published pair only, not for Alpha 4.36 or DSH `0.1.6-alpha.1`.

## Candidate gates

Before merging or publishing, this exact candidate must pass frozen installation, `pnpm run check`, browser regression, the declared-host matrix, package inspection, PR CI, and exact-main CI as required by `RELEASING.md`. The publishing workflow must create the npm package, `alpha` dist-tag, Git tag, and GitHub prerelease before this candidate is called released. Do not promote `latest` in this release.
