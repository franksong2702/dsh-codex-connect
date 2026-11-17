# 版本管理规则

[English](../VERSIONING.md) | 中文

Codex Connect 使用独立于 DeepSeek Harness 的插件版本。应并列展示插件版本与已验证的 DSH 组合，不从一个版本号推断另一个。

## 发布身份与阶段

当前发布序列从 `0.2.0-alpha.1` 开始，后续使用 `0.2.0-alpha.N`。经维护者批准，新版本采用这一短编号，替代较长的 `0.1.0-alpha.4.x` 序列。本次只简化独立插件版本号，不缩窄 DSH 兼容范围、不要求升级宿主，也不代表插件晋升 Beta 或稳定版。已发布版本及 tag 保留原有名称和内容，DSH 更新不会使插件计数归零。

发布工作流接受 `MAJOR.MINOR.PATCH-alpha.NUMBER[.NUMBER…]`，各数字部分为无前导零的非负整数。构建元数据不是发布计数器：SemVer 比较版本时忽略 `+build.n`，当前固定的 npm 发布实现也会移除它。每个新包必须使用不同且排序更高的版本，不得覆盖已发布包或将其发布 tag 移到不同内容。

插件公开行为包括配置、工具、命令和持久化数据。在 `0.y.z` 开发阶段，不兼容变更需要明确的发布说明与迁移指引；有意开启新的不兼容发布线时，递增插件次版本。同一 Alpha 发布线中的常规迭代递增预发布计数。复制宿主版本不能代替对插件变更范围的判断。

Alpha、Beta、RC 和不带预发布标识的版本表示插件自身的就绪程度，而不是 DSH 的阶段。阶段晋升由维护者单独决定，并以记录的验证结果为依据；涉及真实账户和升级时，需要相应验收。DSH 发布稳定版不代表插件已经稳定。当前工作流仍仅发布 Alpha；Beta、RC 和稳定版需要另行审查工作流与渠道变更。

## 兼容性证据

| 信息 | 维护位置 | 含义 |
|---|---|---|
| 插件构建版本 | `package.json.version` | 写入构建和 CLI 的版本身份 |
| 宿主依赖要求 | `compatibility.json` 与依赖声明 | 计划支持的运行时约束，由检查保证一致 |
| 已验证精确组合 | `verified-compatibility.json` | 每个明确 DSH/plugin 组合的验证证据 |
| 用户可见变更 | GitHub Release notes 与 `update-highlights.json` | 插件发布之间发生了什么变化 |

兼容性目录在原 URL 保留 `schemaVersion: 1`、`checkedAt`、`latestDshVersion` 和 `pluginVersions[].{version,verifiedDshVersions}` 字段，并保留历史条目。未列出的组合表示尚未验证，不一定不兼容。目标依赖或其他组合的绿色测试都不能证明本组合可用。

新组合必须经过验证后才能记录。候选版本的验证记录不代表它已在 npm 发布。公开推荐之前，必须确认该版本在 npm 存在、具有对应发布 tag，且组合已有验证记录。离线 lint 检查只验证已有组合记录和双语一致性，不联网查询 npm，也不证明发布完成。

不得在原地址将 V1 替换为按版本号索引的对象，也不得从单个成功版本推断兼容范围。未来若必须使用不兼容格式，需要提供版本化入口，并继续为已安装的 V1 客户端输出旧格式。

## 渠道与安装推荐

- `alpha` 是当前发布工作流写入的移动渠道。
- `latest` 跟随已验证支持 npm `latest` 当前解析出的精确 DSH 版本、且按 SemVer 排序最新的已发布插件版本。该插件可以是 Alpha 或稳定版；渠道不会改变它的就绪阶段。推广仍由维护者明确授权后单独执行，发布 Alpha 不等于授权或执行推广。
- 精确安装命令标识插件发布，dist-tag 不能保证兼容性。
- 准备新候选时，公开 README 继续推荐已确认发布的组合。因此推荐版本可以与 `package.json.version` 不同。

根据 [#445 的决定](https://github.com/franksong2702/dsh-codex-connect/issues/445#issuecomment-6935776620)，这条规则替代“首次稳定版之后 latest 只能指向稳定版”的旧限制。它改变的是渠道政策，不是当前 npm 标签、支持的宿主或发布工作流。如果 DSH `latest` 更新后没有已验证且已发布的组合，保持插件标签不变并报告默认安装缺口；不得推断兼容性或推广未验证候选。其他 DSH 版本的用户仍需选择已验证的精确组合。实时 registry 核对、隔离安装、授权、回读及回退流程见 [latest 推广操作](../RELEASING.md#promoting-latest-short-lived-interactive-authentication)。

项目最新版与适合用户现有 DSH 的最新已验证插件是两个问题。更精确的宿主专属推荐及安装区自动生成属于后续工作；本规则不声称当前更新界面已经从所有历史记录中计算这一选择。

## 更新亮点

V1 亮点条目按 SemVer 递增排列，版本唯一，能力类别必须已知，并保留现有历史。新文档或维护版本可以省略条目；历史空 `highlights` 数组仍然有效。修复仍应在 Release notes 中说明。不要为了通过目录检查而虚构能力，或要求计数必须连续。

## 迁移至 0.2.0 Alpha 编号

`0.2.0-alpha.1` 的排序高于所有 `0.1.0-alpha.4.x` 版本，包括最近已发布的 `0.1.0-alpha.4.54`。不要重置为 `0.1.0-alpha.1`，它的排序低于历史序列。未发布的 `0.1.0-alpha.4.55` 候选由本版本替代，不属于已发布历史。

现有更新检查器按 SemVer 比较 `alpha` 和 `latest` 两个渠道，因此即使 `latest` 保持 `0.1.0-alpha.4.50`，也能识别新版 Alpha。它仅提示更新，不自动安装插件或升级 DSH。用户可在现有 profile 安装精确插件版本。兼容性和亮点历史保留 V1 格式；四个声明支持的 DSH 目标仍为 `0.1.7-rc.1`、`0.1.7-rc.2`、`0.2.0-rc.1`、`0.2.0-rc.2`。新增目录条目仍须先完成精确组合验证。

发布继续使用仅接受 Alpha 的现有工作流、受保护环境、`v0.2.0-alpha.1` tag、GitHub prerelease 和 npm `alpha` 渠道，不推广 `latest`。后续若改变发布阶段，仍需另行审查门禁及发布、读回路径。宿主升级、数据结构变更和编号迁移应分别可审查。

## 发布检查

完整流程见 [RELEASING.md](../RELEASING.md)。冻结安装及各项现有检查需要分别执行：

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:browser
pnpm run check:dsh-matrix
npm pack --dry-run
```

`check` 不包含浏览器测试或隔离 DSH 安装。只有依赖变更需要时才重新生成锁文件，不为文档或本地化发布刷新依赖树。自动化检查不能替代真实 OAuth 验收。合并、发布和 `latest` 推广仍是不同操作。

规范依据：[SemVer 2.0.0](https://semver.org/spec/v2.0.0.html) 与固定的 [npm 11.6.4 发布实现](https://github.com/npm/cli/blob/v11.6.4/workspaces/libnpmpublish/lib/publish.js)。
