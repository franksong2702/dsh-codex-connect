# Codex Connect Alpha 4.45 — generated images visible in answers

## English

Generated images now appear below a completed answer without opening the collapsed processing details. The existing Tool result remains available inside those details, including its original-image download and follow-up controls. The answer view uses the same validated image result and attachment access; it does not generate a second image, alter the provider request, or duplicate image bytes in the Session log.

This release targets DeepSeek Harness `0.1.7-rc.1`. The fix passed local unit and Chromium tests, and the reporter confirmed the visible result on an isolated 3081 instance. That review did not send a new image-generation request or validate other DSH versions. Preparing this package does not upgrade existing installations; publication and the npm `latest` promotion are separately verified steps.

After npm publication is confirmed, install the exact version with:

```sh
dsh plugin --profile web add dsh-codex-connect@0.1.0-alpha.4.45
```

## 中文

生成的图片现在会显示在已完成回复的下方，不必展开折叠的“处理过程”。原有 Tool 结果仍保留在处理详情中，包括原图下载和后续操作。回复区域复用同一份已验证的图片结果与附件访问，不会再次生图、改变 Provider 请求，也不会在 Session 日志中复制图片数据。

本版针对 DeepSeek Harness `0.1.7-rc.1`。修复已通过本地单元测试和 Chromium 测试，并由报告者在隔离的 3081 实例上确认图片可见。该次验收没有发起新的真实生图请求，也不代表验证了其他 DSH 版本。准备安装包不会升级现有实例；发布和 npm `latest` 提升分别核验。

确认 npm 发布后，可使用上面的精确版本命令安装。
