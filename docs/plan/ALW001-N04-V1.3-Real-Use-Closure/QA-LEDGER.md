# ALW-001 N04 V1.3｜QA 台账（T1–T5 汇总）

task_id: SM-ALW001-20261102-N04-V13
更新: 2026-11-02 18:35 (+08:00)
设备: Redmi Note 11 5G (`21091116AC`) / Android 11 / serial `REDACTED-SERIAL`
当前版本: **0.8.1 / versionCode 36**，APK SHA-256 `9971836f0d1cd34afceaf3063f3d8d3cba652faf1f7d3e753dc0d0f03e042296`
固定证据根: `docs/plan/ALW001-N04-V1.3-Real-Use-Closure/qa/`

| Task | 结论 | 证据目录 | 关键数字 / 说明 |
|---|---|---|---|
| T1 原文溯源 + 原生/服务安全 | **PASS** | `qa/20261102-155616/` | 3/3 逐字一致；伪造段/跨源/无票负例全拒；APK 无长期令牌 |
| T2 真实 ASR final → 人物事实 | **PASS** | `qa/20261102-t2/` | 43/43；`mock:false`；确认→2 专属+1 通用重算；撤回还原 |
| T3 手机 outbox → Mac 归档 | **PARTIAL** | `qa/20261102-171216/` | 38/39；1 NOT_RUN = 系统 Markdown 查看器（需第三方隐私政策） |
| T4 拔 USB 外出 + Mac 自恢复 | **PARTIAL** | `qa/t4-20261102-175042/` | 30 PASS / 1 NOT_RUN = 手机 Tailscale 未授权 |
| T5 最新 APK 端到端 + 文档收口 | **PARTIAL（本次）** | `qa/20261102-t5/` | 见 `t5-report.json`；NOT_RUN 4 项见下 |

## T5 结果摘要

- 可重复构建：clean 两次 → APK 与 `classes.dex` 字节一致；`install -r` 保留数据（`firstInstallTime` 未变）。
- 全链一次走完：3 演示人物 → 编辑/批量/撤销 → 三人 2 专属 + 1 通用 → 清空/重启/恢复 → 合成音频真实 ASR final（`mock:false`，+¥0.012022）→ 选人确认 → 问题变化 → 停止 → outbox → Mac `.md/.json` 逐字一致 → 历史原文 + SAF 导出 → 断通道离线只读 → 恢复在线。
- 安全负例：无票 403、跨源 403、伪造段号 4xx、未配对归档 401、APK 无归档令牌。
- 本轮修复：① 写票一次性导致的「第二次写 403」；② 演示专属问题被档案元数据占满。

## 仍然 NOT_RUN（4 项，均需用户本人或外部条件）

1. 手机 Tailscale 授权 → 未登录本 tailnet，`100.125.100.15` 不可达（T4 已确认）。
2. 物理拔出 USB → 已用 `adb reverse --remove-all` 断唯一数据通道做等价验证，未真的拔线。
3. 第三方 Markdown 查看器 → 系统无默认查看器，接受第三方隐私政策需用户同意。
4. 真人双人语音 / BOYA → 需真人知情同意；本轮音频为 macOS `say` 合成（SYNTHETIC）。

## 未被覆盖 / 未重跑

- 未跑全量回归（`verify-v040.sh` 等），只跑 T1–T5 相关脚本与本次端到端。
- 未修改预算上限（腾讯 ASR / DeepSeek 各 1 元）；未发布、未推送、未删除隐私数据。
- 不覆盖任何历史 QA 目录（`20261102-155616`、`20261102-t2`、`20261102-171216`、`t4-20261102-175042`）。
