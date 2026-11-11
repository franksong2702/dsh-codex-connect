# DSH 0.2.2-rc.1 compatibility candidate — issue #423

This is an unreleased source candidate based on main `674af2699af2755619e130081e26dd8b3d37f371`. Published Alpha 12 remains paired with its existing fifteen exact Hosts; it does not acquire rc.1 support by editing this branch. Recommendations and `verified-compatibility.json` remain unchanged. No release, daily installation or service change is part of this work.

## Official contract evidence

The accompanying JSON records registry SRI for 19 official alpha.3/rc.1 DSH package pairs and six framework/dependency pairs. All compared non-manifest files are equal after normalizing only the exact compared version strings. Manifest changes include the new Cordis `~4.1.0`, Loader/Include `~1.1.0`, CosmoKit `~1.9.0`, Schemastery `~3.19.0` and Timer `~1.2.0` graph. This static comparison does not establish installed compatibility, account entitlement, or safety outside the compared surfaces.

The AgentLoop model/tools/prompt-capture contract and executor-only tools surface remain unchanged from alpha.3. The candidate therefore selects the existing recovery-only contract for this **one exact new Host**, rather than attempting the removed presentation API or reopening frozen automation. The original fourteen legacy Hosts retain their full test path; alpha.3 keeps its existing recovery contract. A mixed alpha.3/rc.1 set in the Task admission bindings (agent, agent-loop and tools) fails identity validation, as do partial missing or foreign metadata. This does not claim that every unrelated package mixture is detected by that Task-specific check. Future versions are not inferred supported.

On rc.1, retained Task records permit inspection, authenticated Stop/manual takeover and existing strict safety exits. Automatic routing/resume/delegated recovery remain closed. Owner/session/revision, counters, ledger fencing, cancellation and truthful child cleanup retain their existing implementations. Reserve remains retired. Quota/account services and all optional defaults remain unchanged.

The recovery fixtures retain their historical `alpha3` case/profile names as a shared contract. Each matrix report separately binds the actual exact installed Host package identities; those labels do not substitute an alpha.3 runtime for rc.1. The new rc.1 profile must execute every recovery case and crash boundary, not skip the old automatic suite without replacement.

## Validation status at Draft PR preparation

This records the local checkpoint at PR preparation. Subsequent exact-head CI and the PR conversation carry later terminal results; pending work below is not counted as a pass.

- Frozen dependencies installed in a separate worktree.
- Full source check: 2,455 tests passed, two existing skips; lint, types, build and 73-file package checks passed. The first run caught one published-catalog expectation that wrongly included the unshipped candidate; the corrected test preserves Alpha 12's fifteen-Host archive and adds an explicit rejection of rc.1 in all published records.
- Browser: 99 passed with the existing isolated Playwright cache. The initial default-cache invocation had no Chromium executable and ran no tests; it is not counted as a pass.
- Infrastructure attempts are retained: npm 11 Phase 1 resolution failed before tests; the existing explicitly selected npm 10.9.3 installer is now honored for all Hosts, as in Phase 2, with peer checks intact. The first installation matrix passed six Hosts then failed on a registry response-body timeout at the seventh. The reader now covers transient body errors within its original three-attempt deadline/backoff; malformed JSON and non-transient statuses remain failures. Twenty focused fixture/contract tests passed. No force, legacy peer mode or platform bypass was used.
- Full sixteen-Host same-artifact installation matrix: **in progress** after that definitive infrastructure failure. Phase 1 installed Task matrix passed all sixteen Hosts: fourteen legacy full profiles and alpha.3/rc.1 each 25 tests including actual runtime identity. Phase 2 crash/consent recovery, exact-head CI and independent review remain pending. No rc.1 installed runtime acceptance is claimed yet.
- No real accounts, model requests, personal browser/native GUI or Windows Desktop acceptance. No publication/merge/deployment/restart.

## 中文迁移边界

这是未发布源码候选，不表示 npm Alpha 12 已支持 rc.1；原有发布目录和推荐保持不变。rc.1 复用已检查的仅恢复合同：旧任务可查看、经过身份校验后停止／转手动，以及原有严格安全退出；不支持自动路由、续跑或委派恢复。旧十四个 Host 的行为不变，alpha.3 的恢复限制不变，不推断未来版本或混合包兼容。无需删除会话、旧任务状态、账户或 return 文件，也不启用任何实验项。安装矩阵与后续 CI 尚未完成，不应把静态包比较或本地合成检查当作真实账户／Desktop／原生操作验收。
