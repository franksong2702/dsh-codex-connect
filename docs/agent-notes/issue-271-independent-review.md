# Issue #271 independent source review — 2026-09-26

Two separate ephemeral read-only Codex CLI processes used `gpt-6-astra`, receiving the exact source bundle and upstream declaration comparison, without implementation conversation history. They did not execute tests or perform live acceptance. The final source hashes in the machine-readable evidence still match the reviewed files.

Final input SHA-256: `fc62714c31cab46943d41b4fb41b69cb7737b8af6740d970e5228b471ff5ac47`; report SHA-256: `39eb7ac3d99fcf39ae0d24f297984c3d933cf17f1116a604368a22d231d06646`.

## Initial report — BLOCKED (preserved)

**BLOCKED — 存在一项源码级混合版本校验缺口。** 此结论仅依据所给源码，不代表已确认 rc.2 的实际运行故障。

1. **[P2] 扩大 peer 范围后，四个必需 UI peer 的 rc.1/rc.2 混装可以通过现有一致性检查。**

   - `package.json:118–121` 将 `dsh-client-ui-chat`、`dsh-client-ui-layout`、`dsh-client-ui-primitives`、`dsh-client-ui-tool` 分别放宽为两个版本任选。
   - 这四个包均不在 `compatibility.json:12–28` 和 `src/compatibility.ts:13–29` 的检查清单内。
   - `scripts/check-compatibility.mjs:121–127` 只检查该清单的一致性；`src/capability-diagnostics.ts:119–131` 也只对该清单执行版本读取和混装判断。

   **具体反例：** 清单中的 DSH 包全部为 rc.2、pi-ai 为 `0.85.1`，但 `dsh-client-ui-chat` 为 rc.1。在其他条件满足时，该组合满足新增的 peer 范围，版本检查仍可通过，capabilities 仍会报告 `supported`。补丁前，rc.2 清单包不满足精确 rc.1 peer 要求；补丁放宽后，原有检查遗漏成为两个受支持版本之间的放行缺口。

   这证明的是**未强制要求完整、同版本的 host 集合**，并非证明该混装必然崩溃。应将这些必需 peer 纳入一致性检查，并覆盖混装及元数据缺失场景。可选的 `dsh-commands` 应单独处理其缺席语义。

其余审查结果：

- `src/compatibility.ts:168–174` 保留了三个核心 DSH 包相互相等、版本精确命中及 pi-ai 精确为 `0.85.1` 的条件；未发现这里新增了未来版本或核心混装放行。
- 已检查包的未知状态仍阻止探测；凭据读取位于 runtime 门控及显式 `probe` 判断之后（`src/capability-diagnostics.ts:155–162`）。未发现本补丁新增的凭据泄露路径。
- 新增的 `pending: null` fixture 本身不能证明 rc.2 类型或浏览器兼容。

**独立验证仍待完成：** 两个精确版本的同产物安装/runtime matrix、分别针对 rc.1 和 rc.2 的 typecheck，以及浏览器回归。当前开发依赖仍固定 rc.1（`package.json:146–204`）；matrix 会检查产物哈希一致（`scripts/check-dsh-matrix.mjs:46–48`），但源码中的检查逻辑不等于检查已经通过。提供的上游声明差异也不能证明插件是否使用了被移除的 `OnboardingSurface` 或变更的 `LayoutController` 构造签名。

未执行工具、命令、测试或真实 provider 请求，也未检查源码包以外的文件。

## Final report after five reproduced UI-peer controls — PASS

**PASS（仅限所提供源码的静态审查）**。此前“四个 mandatory UI peers 未纳入一致性列表”的问题已修复；未发现足以阻塞本补丁的确定性回归。此结论不代表安装、运行时或浏览器验证通过。

- **UI/core 混装检查已补齐。** `src/compatibility.ts:17–20` 与 `compatibility.json:16–19` 均加入四个 UI peers。`scripts/check-compatibility.mjs:121–132` 校验列表与全部 mandatory DSH peers 精确相等，并要求安装版本一致。`src/capability-diagnostics.ts:119–131` 会拒绝 core/UI 混装；UI 元数据缺失返回 `unknown`，在第 155–157 行阻止凭据读取和网络探针。
- **rc.1 保留，rc.2 是精确扩展。** `src/compatibility.ts:7–10,172–178` 接受一致的 rc.1 或 rc.2，均固定配对 pi-ai `0.85.1`；不放行混合核心版本、rc.3 或其他 pi-ai 配对。开发依赖仍保留 rc.1。测试 fixture 添加 `pending: null` 没有引入生产代码对 rc.2 API 的依赖。
- **optional commands 没有被误设为必需。** `package.json:122,137–140` 保留其 optional 属性及精确版本范围；缺席不会使完整 mandatory 集合失效。但一致性检查**不检查已安装的 commands 版本**，因此不能宣称这些诊断证明了可选命令服务的版本一致性或行为兼容；提供的材料不足以据此认定实际回归。
- **不同检查的范围不能混同。** `src/compatibility.ts:35–40,241–250` 的 `detectCompatibility` 仍只检查三个核心包及 pi-ai。因此 doctor 的 `compatible` 单独不能排除 UI 混装或 UI 元数据缺失；完整 mandatory 检查存在于上述 capability diagnostics 和检查脚本中。

证据限制：

- `src/capability-diagnostics.ts:64–78,194–198` 只将完成响应视为所选模型、固定请求的成功；HTTP 200 本身不足，成功也不证明活动 profile、浏览器、续接或可选能力兼容。
- `scripts/canary-multiversion.test.mjs:27–36` 使用记录环境变量并退出的替身子进程，证明的是 canary 路由与分类逻辑，不是真实安装成功。
- `scripts/check-dsh-matrix.mjs:17–47` 要求两版本完整报告、相同制品哈希，并排除修补过的宿主候选；这些是验收逻辑，**未提供实际执行结果**。合成 runtime 报告也不能替代真实 provider 或浏览器验收。
- 上游声明存在构造函数变化及导出移除；未提供对应插件消费代码，不能断言命中或不命中。仅凭这些上游变化不能制造具体阻塞项。

按要求未使用工具、运行命令或引用实施历史。
