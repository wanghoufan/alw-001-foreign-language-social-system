# N05 V1.2 · T0/T1 证据（2026-11-03）

## T0 预检与预构建
- Git：`HEAD=fc2379c`，dirty=84（含其他智能体未提交文件，未 reset/clean）
- 源版本 0.8.10 / vc45 → 构建 → `adb install -r` 保留数据 → `dumpsys` 回读 **0.8.10 / vc45**
- APK：308956 B，SHA-256 `66aea6d5d39f3fbc02210bc01ff1b537410db9238422fca2fccd5d0f581a2e71`
- 设备：`REDACTED-SERIAL`（Note 11 5G / Android 11）、`indq5xfi6hovay4d`（Android 14，安装受 MIUI 限制）
- 源哈希基线：`places-115.json` `0412673d…`、`socialmate-v1.2/index.html` `89499e9c…`
- 截图：`02-device-0810.png`

## T1 朗读交互（0.8.11 / vc46）
- 修复：同意改为**会话级**；未配置（`configured=false`）直接 `TTS_PROVIDER_NOT_CONFIGURED`，不弹窗
- 新增：设置页「云端朗读授权（本次运行有效）」复选框 + 「撤销授权」
- 实测：勾选 → 状态「已授权（本次运行不再弹窗）」；`remote + aws-polly` 点朗读 → **弹窗 0 次**、错误文案正确、云合成 0
- 默认 provider 已恢复 `system`（本机语音），朗读可用
