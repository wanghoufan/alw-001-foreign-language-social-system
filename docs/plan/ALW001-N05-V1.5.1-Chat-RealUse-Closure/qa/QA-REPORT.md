# ALW-001 N05 V1.5.1 · 真实验收报告（阶段性收口）

- 阶段：`SM-ALW001-20261104-N05-V151-CHAT-REALUSE`
- 执行日期：2026-11-04 22:35–23:10（Asia/Shanghai）
- 唯一根目录：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统`
- Android：**0.8.30 / versionCode 65**（debug 签名，未对外分发）
- APK：`android-poc/app/build/outputs/apk/debug/app-debug.apk`
- APK SHA-256：`794e68a8117fea87149c0b5acd3ff40b2a47c87fcbe0683385f755c3c96972a3`
- 设备：红米 Note 12 Pro（`22101316C`，Android 14，Wi‑Fi `192.168.31.30:5555`）
- 服务：P066 流式（`mode=p066, mock=false`），8790/8791 同进程；设备走家庭 Wi‑Fi `192.168.31.61`
- Git：HEAD `fc2379c`，工作树 dirty；本轮**未 commit / 未 push / 未部署**

> 判定口径：只写实际跑过的。`PASS` 有证据；`PARTIAL` 部分覆盖；`NOT_RUN` 如实保留。

## 0. 收尾状态

- T2 的临时 QA 假归档端已停止；真实归档端已用 `archive-service.sh start` 恢复（`/health` 200、`auth: required`）。
- 设备内 QA fixture 已删除（`exported` 中 `qa_` 文件计数 0）。
- `npm test` 54 pass；`test-core.sh` 12 assertions PASS。

## 1. T0 前置检查

- `pwd -P` 与 `git rev-parse --show-toplevel` 均为本仓根；无 symlink/相似目录。
- 服务健康、P066 模式、两机 `0.8.29/64` 起点已核实，详见 `qa/PREFLIGHT-RESULT.md`。
- 授权设备台账：22101316C / 23054RA19C / 21091116AC 均 ACTIVE；verify-t1 两枚 REVOKED 用于负例。

## 2. T1 安全边界

### 2.1 ASR WebSocket 握手鉴权（PASS）

- 实现：`android-poc/asr-bridge/src/server.js` + `socialmate-prototype/ai-gateway/live-server.mjs`。
- 契约：原生客户端在握手头 `x-asr-token` 携带设备短期令牌；服务端在 `wss.handleUpgrade` 之前完成 IP/Origin/令牌/限流/并发校验，**拒绝时不创建 P066 上游会话**。
- 真实部署负例与正例（`qa/t1-security/live-ws-auth-rerun.log`，服务端日志见 `socialmate-v1.2/.local/qa/live-v040-20261104-223550.log`）：

| 用例 | 结果 | 错误码 |
|---|---|---|
| 无令牌 | 401，`activeSessions=0` | `AUTH_TOKEN_REQUIRED` |
| 伪造令牌 | 401 | `TOKEN_INVALID` |
| 撤销前签发令牌（i < revokedAt） | 401 | `DEVICE_REVOKED` |
| 有效令牌 + `Origin: https://evil.example` | 403 | `ORIGIN_NOT_ALLOWED` |
| 有效令牌 + 原生无 Origin | 握手成功，随后会话释放为 0 | — |

- 审计只记 `code + 脱敏 IP`，不记令牌全文；本地日志可见 `[asr-auth] denied code=...`。
- 单测：子代理新增 `android-poc/asr-bridge/test/ws-auth.test.js` 12 例；`npm test` 54 pass / 0 fail（含原有用例）。

### 2.2 TTS 调试入口（PASS，静态+构建证据）

- Release 清单：`TtsSelfTestActivity exported=false`；debug 清单用 `tools:replace` 单独放开为 `true`。
- `applyIntent` 在 release 直接忽略 adb 命令；`remote_base` 只允许 loopback / RFC1918 / `*.ts.net`，拒绝 userinfo、非 http(s)、路径穿越与非法端口。
- 合并清单与 APK 复核：debug=true / release=false；纯逻辑 17 条断言 PASS（子代理 B）。

## 3. T2 网络与归档恢复

### 3.1 归档 401 → 刷新一次 → 重试一次（PASS）

- 设备侧使用 QA fixture `qa_20261104T144500_a1b2c3`（非真实对话，仅 304B），归档地址临时指向本机 QA 假端；假端第 1 次 POST 返回 401，第 2 次返回 201。
- 证据 `qa/t2-recovery/fake-archive.log`：

```text
post:1 tokenSha12=fd6f91d9dd9b
post:2 tokenSha12=720296e3390c   ← 第二次已是刷新后的新令牌
```

- 设备 `files/archive/state.json` 随后为：`pending=0, lastHttpStatus=201, lastErrorCode=""`，fixture 只上传一次，无重复。
- 代码：`SessionArchive` 新增 `TokenRefresher`；仅 401 触发一次刷新+一次重试；403 仍 fail-closed 并提示重新配对。

### 3.2 断线感知与受限重连（PASS，运行期实测）

- 代码：`AsrClient` 20s ping/pong；`AsrActivity` 每 track 单飞重连，退避 1s/2s/4s，最多 3 次；失败明确停录；页面 `smNativeLinkState` 只显示“连接中断 · 重连中 / 已恢复 / 连接中断”。
- **恢复成功路径**：录音中真实停掉组合服务（pid 变化），看门狗在新进程拉起后，原生客户端自动重连成功，`activeSessions=1`，后续 TTS 句继续上屏（消息数继续增长），未重新开会话或伪造 final。
- **失败路径**（用外部进程占住 8790/8791，阻止自动拉起）：

| 时间 | 页面 | 含义 |
|---|---|---|
| 3s | `连接中断 · 重连中`，interim `正在重连（3/3）…`，rec=true | 断线可见、仍在重试 |
| 13s | `已结束 · 可复盘`，link 清空，rec=false | 3 次失败后停录，不显示“正在听” |

- 证据：`qa/t2-recovery/disconnect-3s.json`、`disconnect-13s.json`、`blocker.log`。
- UI 修正：页面在原生停录时清空 `S.asrLink`；`recLabel` 在 `asrState=off` 时优先显示“已结束 · 可复盘”，不再残留“重连中”。
- 仍 **NOT_RUN**：Wi‑Fi↔蜂窝/Tailscale 真实切换（手机走无线 ADB，切网会同时断取证通道）；本轮验证的是“服务中断/恢复”，不是蜂窝真机切换。

### 3.3 归档幂等与 pending 持久化（PASS，沿用+本轮复核）

- 本轮真实录音 10 条 final → `pending=0`、`HTTP 201`、ack 写入、Mac 文件落地；outbox 为空。
- 既有 `sessionId` 幂等键、原子写、`exported/` 与 `.ack.json` 未改动。

## 4. T3 接话质量（PASS，本地规则/零付费）

证据：`qa/t3-quality/REPORT.md`、`SCORECARD.md`、`fixtures.json`、`eval-suggestions.mjs`；复跑输出：

```text
[current] cases=10 topicHits=10 minItems respond3/ask3/share3/switch3
nearDupPairTotal=0 crossSwitchRepeatSentences=0 fabricatedClaims=0 privacyMisattribution=0
```

- 10 话题：天气 / 海口初到 / 跑步健身 / 咖啡 / 海南景点 / 工作或软件 / 旅行 / 周末安排 / 音乐生活 / 陌生话题转场。
- 人工审阅 10/10 相关；组内明显重复 0/10；个人事实编造 0；人物误归属 0。
- 修正内容：补齐话题模板、switch 随话题变化、去掉“I was born and raised in Haikou / 常在家做拿铁 / 喜欢做软件”等无来源第一人称断言。
- 真实大模型表现：**NOT_RUN**（未授权付费调用）；页面仍保留 AI 首候选 + 模板补足的既有路径。

## 5. T4 现场 UX（PARTIAL）

真机 WebView `392×791`（393px 档），真实录音进行中测得：

| 项 | 结果 | 证据 |
|---|---|---|
| 字幕最近 3 句固定 | PASS | `#messages` 高 156px，独立滚动 |
| 四方向建议每类 ≥2 | PASS | `[3,3,3,3]` |
| 建议区可达、不撑整页 | PASS | 建议区 `top 433 / bottom 679`，整页高从 3886→1277 |
| 关联资料入口可达 | PASS | 面板 `top 685`，资料卡首行 `top 752`（视口 791） |
| 结束/放弃不随内容滚走 | PASS | `compose` sticky `640–733` |
| 字号下限 | PASS | 正文/建议 19.72px，标签 16.24px，标题 23.2px，主按钮 18.56px |
| 深色主题 | 沿用 V1.5 PASS，本轮未复测 | — |
| 360px 档 | NOT_RUN（本轮只有 392） | — |
| 阅读冻结 | 沿用 V1.5 PASS，本轮未复测 | — |
| 真实录音链路 | PASS（但音频为 TTS 回环，标记 SYNTHETIC） | 10 final、归档 201、Mac 文件 1556B |

- 关键 UI 修正：新增 `v151-realuse` 密度规则——候选事实收成 1 行计数、建议区 23vh 独立滚动、结束/放弃吸底；未改四方向、2–3 候选、浅深主题结构。
- 真实人声/面对面长会话：**NOT_RUN**。本轮语音来源是手机系统 TTS 经扬声器回环（`SYNTHETIC_TTS_LOOPBACK`），不能写成真人验收。

## 6. T5 结论

| 验收项 | 判定 |
|---|---|
| 非法 ASR 握手先拒、零 P066 计费 | **PASS** |
| 合法真实设备可连接（凭据握手） | **PASS** |
| TTS 调试入口 release 关闭 / debug 白名单 | **PASS** |
| 归档 401 一次刷新重试、幂等 | **PASS** |
| 断线可见 + 受限重连 | **PASS（停服务/恢复；失败路径停录）** |
| 10 话题接话质量 | **PASS（本地规则）** |
| 393px 首屏密度/字号 | **PASS** |
| 真机短录音→字幕→归档 | **PASS（SYNTHETIC 音频）** |
| 真人 30 分钟连续交流 | **NOT_RUN** |
| Wi‑Fi↔蜂窝真实切换 | **NOT_RUN** |
| 来电/耳机、Polly、P066 402/300s/撤销 | **NOT_RUN** |

## 7. 已完成的收尾

- 停止 QA 假归档端、恢复真实归档端（`socialmate-archive` / `auth: required`）。
- 删除设备内 `qa_20261104T144500_a1b2c3` fixture（outbox/exported/ack），`exported` 中 `qa_` 计数 0。
- `cd android-poc/asr-bridge && npm test` → 54 pass / 0 fail。
- `cd android-poc && sh test-core.sh` → PASS 12 core assertions。

### 7.1 仍需人工决定的只有

- 是否要在真机上做 Wi‑Fi↔蜂窝切换验收（当前手机只走无线 ADB，切网会断取证通道，需要临时接 USB 或你在现场操作）。

## 8. 未越界声明

- 未修改 P066 / P016 源码；未改预算上限；未调用付费大模型；未 commit/push/部署。
- 未用 MOCK/编译通过冒充真人验收；TTS 回环音频与 QA fixture 均单独标记。