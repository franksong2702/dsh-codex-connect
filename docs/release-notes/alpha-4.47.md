# Codex Connect Alpha 4.47 — isolated plugin import

## English

Alpha 4.46 could fail to load as a Cordis bundle when a DSH profile did not independently install `@deepseek-ai/schemastery` and `@earendil-works/pi-ai`. Depending on which libraries happened to be visible, activation failed with a missing-package import or `z.union(...).volatile is not a function`. Alpha 4.47 declares the exact compatible versions as plugin-owned runtime dependencies so a normal plugin install supplies them. DSH, Cordis, and React remain host-owned peers.

This release targets DeepSeek Harness `0.1.7-rc.1`. The missing-library import was reproduced with the built bundle in a disposable profile before the fix and passed after it. The keyless DSH install matrix checks the packed candidate, but real-account and user-profile upgrade acceptance remain separate. Publishing to `alpha` does not promote npm `latest` or install this release into an existing profile.

After npm publication is independently confirmed, install this exact version with:

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.47
```

## 中文

Alpha 4.46 在 DSH profile 没有另外安装 `@deepseek-ai/schemastery` 和 `@earendil-works/pi-ai` 时，作为 Cordis bundle 加载可能失败。根据环境里偶然可见的库，错误表现为找不到依赖，或 `z.union(...).volatile is not a function`。Alpha 4.47 把兼容的精确版本列为插件自身的运行依赖，正常安装插件时即可一并安装；DSH、Cordis 和 React 仍由宿主提供。

本版针对 DeepSeek Harness `0.1.7-rc.1`。修复前已在一次性 profile 中用构建后的 bundle 复现缺依赖导入失败，修复后同一检查通过。无凭据的 DSH 安装矩阵会检查打包候选版；真实账号和已有用户 profile 的升级验收仍是独立事项。发布到 `alpha` 不会同步提升 npm `latest`，也不会自动安装到现有 profile。

独立确认 npm 发布后，可使用上面的精确版本命令安装。
