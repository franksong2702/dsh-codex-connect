# 插件设置页在 Host 插件重载后停留在“不可用”

## 现象

DSH `0.2.3-alpha.2` + desktop profile 下，Settings → Codex Connect 的「模型 / 网络 / 能力」
三个选项卡显示 `此 dsh profile 无法使用插件设置。`，而「账户与额度」正常。刷新页面、重载
Host 插件都不能恢复，重启整个 DSH App 后恢复。

## 定位

- 该文案来自本插件 `src/client/locales.ts` 的 `settingsUnavailable`，唯一渲染点是
  `OpenAICodexConfiguration` 的 `snapshot.status === 'unavailable'` 分支。
- 用临时匿名调试路由读取运行中 Host 的 `settings.describe()`：`llm-openai-codex`
  一直在返回的 36 个命名空间里，`value` 字段完整（`models`、`enableProxy`、`searchModel`、
  `searchMode`、`searchContextSize`、`searchMaxOutputTokens` 等），`configEditor.configuration()`
  中该条目 state=ACTIVE。因此**不是** desktop profile 的能力限制。
- `OpenAICodexConfigForm` 在内部 `ConfigForm` 状态不是 `loading` 时直接透传其快照。
  DSH 的 `ConfigFormController.derive()` 只在解码成功时写入 `status: 'ready'`，解码失败时
  保留原有状态：一旦它在某个时刻看到命名空间缺失（Host 插件被禁用/重载的窗口期），就会
  永久停在 `unavailable`，之后即使命名空间重新被服务也不会回到 `loading`。
- 本插件的 Host 配置带 `transform` 字段，客户端无法 rehydrate 对应 schema，内部表单因此
  始终无法自己解码成功——这正是 `OpenAICodexConfigForm` 用自带解码器兜底的原因；但兜底
  只在内部状态为 `loading` 时执行，于是被 `unavailable` 锁死。
- 现场吻合：上一轮排障中为加载修复后的 Host 代码，对 profile 中 `llm-openai-codex` 行做过
  `disabled: true → false` 的原地重载，页面一直开着；该窗口期让内部表单进入 `unavailable`，
  之后一直无法恢复。重启 App 重建客户端后恢复。
- 排除项：Host 侧把 `DSH_CONNECTION_UNAVAILABLE` 的 503 成因单独修复，与本问题无关；插件
  设置命名空间在 Host 端从未缺失。

## 修复

`src/client/config-form.ts` 的 `getSnapshot()` 改为“先读共享 mirror”：

1. 内部表单为 `ready` 时仍直接采用（Host 已自行解码）。
2. mirror 无 view 时保持旧行为（老版本 mirror 的 `unavailable` 仍映射为不可用）。
3. mirror 有 view 时，无论内部表单是 `loading` 还是 `unavailable`，都用本包解码器解码
   `llm-openai-codex` 段；成功即投影为 `ready`，命名空间缺失或解码失败才投影为
   `unavailable`。

这样 Host 插件重载、命名空间短暂消失后，只要 Host 重新服务该段，页面无需刷新即可恢复。

## 验证

- `tests/config-form.client.spec.ts` 新增两例：重载后恢复为 `ready`；重载后配置仍非法则
  保持 `unavailable`。
- 现有的 13 例全部通过；`pnpm run typecheck`、`pnpm run lint`、`pnpm run build` 与全量
  `pnpm run test` 的既有基线见交付记录。

## 限制

- `ConfigFormController` 的状态锁死属于 DSH 客户端自身行为，本次只在本插件侧规避；其它
  依赖 `configForms.get()` 且同样无法客户端解码的插件也会遇到。
- 本次排障期间运行中的进程曾载入含临时诊断路由的构建；诊断代码已从源码与提交中移除，
  重启 App 即载入清理后的构建。
