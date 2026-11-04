# PREFLIGHT-RESULT｜N05 V1.5.1 开工前置检查

- 执行时间：2026-11-04 22:35（Asia/Shanghai）
- 唯一根目录确认：`pwd -P` = `/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统`；`git rev-parse --show-toplevel` 同值。无 symlink/相似目录越界。
- Git：HEAD `fc2379c`，工作树 dirty（29 项修改 + 多处未跟踪，均为既有会话产物）；本阶段不 reset/clean、不提交。
- 服务：`service-v040.sh status` 健康，8790/8791 同一进程 pid 60427，`mode=p066`、`mock=false`，`activeSessions=0`；8781 归档端与 8782 未变更。
- ASR 账本：本地 p066 模式停扣；状态接口报 `spentCny=0.582297 / limit 2`（历史腾讯账本，未重置）。P066 上游额度按服务器侧实测（上一轮 0.057567 / 3 元）。
- Android：两机均已装 `0.8.29 / versionCode 64`。
  - Note 12 Pro（`22101316C`，ruby，Wi-Fi `192.168.31.30:5555`）
  - Note 12T Pro（`23054RA19C`，pearl，USB）
- 配对台账：`dev_5e8ac2f3ba7b484f`（22101316C）、`dev_1ab13fb0ea160f5e`（23054RA19C）、`dev_e8d3162e656878ef`（21091116AC）均 ACTIVE；两台 verify-t1 已 REVOKED，可用于负例。
- V1.5 基线证据：`docs/plan/ALW001-N05-V1.5-Chat-UX/QA-REPORT.md`（14 项 DOM PASS、P066 2 final→201→复盘 PASS），本轮不重做。
- V1.4 安全审计：`docs/plan/ALW001-N05-V1.4-Real-Use-Autonomous-Closure/qa/20261104-t3/code-audit.md` 的 T-04/T-05/T-10/T-11 仍为未修，是本轮 T1/T2 的输入。

## 分类

### Hard Block
- 无。

### Can Do（本阶段实施）
- T1 本仓 ASR WS 握手鉴权（先拒后开上游）、TTS 调试入口 exported/remote_base 收敛。
- T2 AsrClient 断线感知/重连退避、归档 401 一次刷新重试、幂等与 pending 持久化复核。
- T3 10 话题接话质量基准与模板修正（零费用、本地规则）。
- T4 真机 360/393 视口、浅深主题、一轮短真实 ASR 联调。
- T5 报告、APK hash/签名、HANDOFF/CHANGELOG 追加。

### Test Only
- 断网/蜂窝：先本机模拟与受限实测；蜂窝长会话若现场条件不具备，记 NOT_RUN，不用 adb reverse 冒充。
- 归档 401：用过期令牌构造一次真实 401，再验证一次刷新重试（不循环）。

### Unauthorized（未获授权，继续 NOT_RUN）
- P066 402 预算不足、300 秒自动结束、管理面撤销：需真实计费或管理动作，本轮不制造。
- Polly 真实账号/真实合成：预算 0。
- 来电/耳机拔出/音频焦点：现场无耳机、无法造来电。
- P016 跨项目修改、公网发布、生产部署。

## 预算与隐私
- 真实 ASR 只用最短一段（目标 ≤60 秒，P066 已批准额度内）；其余用 fixture/SYNTHETIC。
- 不新增付费模型调用；DeepSeek 账本不动。
- 录音前双方知情同意；原文与 AI 派生分层，未确认不进人物档案。