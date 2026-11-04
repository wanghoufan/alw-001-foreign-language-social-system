# T2 验收报告｜真实 ASR final → 人物事实更新

task_id: SM-ALW001-20261102-N04-V13 / T2
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
executed_at: 2026-11-02 16:24 – 16:34 (+08:00)
git_head: `fc2379c`（工作树含 T1+T2 改动，未 commit、未 push）
device: Redmi Note 11 5G `21091116AC` / Android 11 / serial `REDACTED-SERIAL`
apk: `app-debug.apk` versionName **0.7.9** / versionCode **34**
apk_sha256: `136c6559079def22c77ef0f5f5ec4a4cfd34f6fc50b53bbd97f235a5631eb3d8`
asr: 腾讯云实时 ASR，`mock:false` / provider `tencent`（`/api/asr/status` 与 `/health` 双重回读）
audio: **SYNTHETIC**（macOS `say -v Samantha` 合成英文，经 Mac 扬声器 → 手机 AudioRecord 麦克风）
conclusion: **PASS（43/43 断言，退出码 0）**；真人音频、双人分离按红线 **NOT_RUN**

---

## 1. 结论摘要

| 验收项（PLAN T2） | 结果 | 证据 |
|---|---|---|
| Android AudioRecord → 8790 腾讯 ASR → 8791 SSE → APP final | PASS（真机 + `mock:false`） | `asr-events.jsonl`、`05-pending-cards.png` |
| 事件驱动生成待确认候选卡（非 demo/final 回放） | PASS | SSE `pendingId` → `#liveFacts` 卡片；`/v12/api/live/pending` |
| 无录音同意不开麦 | PASS | `03-no-consent-rejected.png`；8790 `activeSessions:0`，预算 0 变化 |
| 无原文留存同意不写逐字到 Mac/文件 | PASS | `12-retention-off.png`（0 写盘/0 上传）；磁盘全文扫描 0 命中 |
| 逐字原文只在内存、离开清理 | PASS | reload 后 pending `1 → 0`；已确认事实保留（`leave-cleanup.json`） |
| 单条事实字段分离 + speaker unknown + 必须选人 | PASS | 候选含 `sessionId/segmentIndex/textOriginal/candidateFact`；`speaker:unknown`，`speakerRaw:spk_0` 仅审计 |
| 确认 → 人物档案变化 → 2 专属 + 1 通用即时重算 | PASS | `prep-before.json` → `prep-after.json`；`06-confirmed-prep.png` |
| 重启/重进仍生效 | PASS | force-stop 重启后人物抽屉读回 6 facts + 新问题（`09-restart-person-prep-top.png`） |
| 撤回 → 对应问题消失 | PASS | `11-withdrawn.png`；三份 profile 与开工前逐字节一致（`diff` 退出码 0） |
| A 的事实不出现在 B/C | PASS | B/C profile sha256 前后一致，事实 id 不存在 |
| 断线/连点不双写、不额外计费 | PASS | 重复 final 只 1 张卡；重复确认 `duplicate:true`；ASR `calls` 只 +2（两次录音） |

`verify-t2.mjs`：`{"result":"PASS","checks":43,"passed":43,"failed":0,"notRun":0}`，**退出码 0**（`verify-t2.exit`）。

---

## 2. 改动清单

### 2.1 新增

- `socialmate-prototype/ai-gateway/live-facts.mjs`
  - 内存会话候选队列：只收 `type=final && final=true && mock=false`；`mock:true` 直接 `MOCK_FINAL_REJECTED`。
  - 每条候选独立字段：`sessionId`、`segmentIndex`（本会话单调递增）、`textOriginal`（ASR 逐字）、
    `candidateFact`（轻量抽取的候选摘要）、`speaker:"unknown"`、`speakerRaw`（`spk_0/A/B` 只审计）。
  - 90 秒内同句去重（断线/上游重发不重复出卡）；单会话 40 条上限；30 分钟 TTL。
  - 确认/撤回串行化（单进程队列），重复确认返回 `duplicate:true`，撤回重复调用幂等。
  - 落盘只有 `SocialMate-Data/Demo/live-facts.json` 元数据（factId/slug/sessionId/segmentIndex/时间，
    撤回后带 `withdrawnAt`），**不含逐字原文**，用于重启后仍能撤回。
  - 写档案只走 `Demo/People`；`assertIsolated()` 在任何写之前执行。
- `docs/plan/ALW001-N04-V1.3-Real-Use-Closure/verify-t2.mjs`（contract 22 + http 8 + e2e 13 = 43 断言）
- `tools/t2/cdp-eval.mjs`（真机 WebView CDP 驱动）、`tools/t2/sse-watch.mjs`（私有 SSE 观察者）、
  `tools/t2/build-timeline.mjs`（把原始证据汇总成 `session-timeline.jsonl`，不补造事件）

### 2.2 修改

- `socialmate-prototype/ai-gateway/live-server.mjs`：`onEvent` → `liveFacts.ingest(event)`，
  把 `pendingId/pendingCount` 挂到 SSE 事件上，候选卡由事件驱动出现。
- `socialmate-prototype/ai-gateway/live-asr-hub.mjs`：SSE 白名单字段增加 `pendingId/pendingCount`（不透传其它状态）。
- `socialmate-prototype/ai-gateway/server.mjs`：新增
  `GET /v12/api/live/status|pending|facts`、`POST /v12/api/live/pending/:id/confirm|ignore`、
  `POST /v12/api/live/facts/:id/withdraw`、`POST /v12/api/live/clear`。
  写操作沿用 T1 的同源 + 一次性写票 + 限流 + `confirm:true`；`clear` 只清内存、不写盘。
- `socialmate-prototype/ai-gateway/demo-store.mjs`：
  - 新增 `addDemoConversationFact()`（带 sessionId/segmentIndex 的档案写入，复用 sm-src 幂等/备份/原子替换）；
  - 新增测试隔离入口 `SM_DEMO_ROOT`（仅显式设置时生效，真实 People 路径不受影响）。
- `socialmate-v1.2/index.html`：
  - 聊天页新增「待确认候选」区：原文/候选摘要分字段、`speaker: unknown`、必选人物下拉、
    确认按钮未选人时禁用、忽略、确认后展示 2 专属 + 1 通用；
  - 非录音状态只显示「已写入事实（可撤回）」，不展示逐字原文；
  - 人物抽屉新增「见面准备 · 2 条专属 + 1 条通用」区块（重启回读可见）；
  - `pagehide` → `sendBeacon /v12/api/live/clear`（只清内存）。
- `android-poc/app/build.gradle`：`versionCode 34` / `versionName 0.7.9`。

> `AsrActivity.java`、`SessionArchive.java` 的工作树改动属于 T1，本轮未再修改。

---

## 3. 真机真链路时序（16:24–16:34）

| 时间 | 事件 | 证据 |
|---|---|---|
| 16:24:35 | `install -r` 0.7.9/vc34，`firstInstallTime` 仍为 10-31 18:25（保留数据） | `install.log`、`device-version.txt` |
| 16:26:0x | 打开 Chat → 点「开始录音」→ 原生录音面板 | `02-recording-sheet.png` |
| 16:26:1x | **未勾同意**点 Record → 拒绝，8790 `activeSessions:0`，预算不变 | `03-no-consent-rejected.png`、`neg-before-asr-health.json` |
| 16:26:2x | 勾「对方已知情并同意录音」→ Record → 页面切成 `?live=1`，`asrState=ready`，8790 `activeSessions:1` | `04-recording-live.png` |
| 16:26:58 / 16:27:06 / 16:27:15 | 合成语音播放 3 次（6.1s/次） | `synthetic-t2.aiff` |
| +7.1s → +42s | 腾讯 ASR 返回 6 条 `final`，全部 `mock:false` / `tencent`，`speaker=spk_0` | `asr-events.jsonl` |
| +29s | 4 条候选卡出现（重复 final 去重为 1 条），`speaker: unknown` | `05-pending-cards.png` |
| 16:28:2x | 选 `demo-oliver-uk` → 确认写入 → `factId=14e3fa9b02c6d068` | `06-confirmed-prep.png` |
| 16:28:40 | 停止录音，8790 会话结束并记账 | `07-stopped.png`、`asr-budget-after.json` |
| 16:29–16:30 | force-stop + 重启 → 人物抽屉读回 6 facts + 新问题 | `09-restart-person-prep-top.png` |
| 16:30:5x | 撤回该事实 → 问题消失，fact 回到 5 条 | `10-restart-withdraw-entry.png`、`11-withdrawn.png` |
| 16:31 | 重复确认（真 HTTP）→ `duplicate:true`，factCount 仍 5 | `dup-confirm.json` |
| 16:32 | 第二段 2.0s 合成语音 → 1 条候选 → 停止 → reload → pending `1 → 0` | `leave-cleanup.json` |
| 16:33 | 原文留存默认关闭 → 「0 条写盘 · 0 条上传」 | `12-retention-off.png`、`retention-status.txt` |

prep before → after（Oliver）：

```
before: [来自英国·伦敦] [职业：未注明（演示）] + 通用
after:  [Next month I want to try A10 kilometer race in Haikou] ← 新事实排第一
        [来自英国·伦敦] + 通用
撤回后: 与 before 完全一致
```

---

## 4. 每条验证的真实命令与退出码

| # | 命令 | 退出码 | 结果 |
|---|---|---|---|
| 1 | `JAVA_HOME=/opt/homebrew/opt/openjdk@17/... gradle -p android-poc --offline :app:assembleDebug` | **0** | BUILD SUCCESSFUL，0.7.9/34 |
| 2 | `adb -s REDACTED-SERIAL install -r app-debug.apk` | **0** | Success（保留数据） |
| 3 | `adb -s REDACTED-SERIAL shell dumpsys package app.socialmate.dualmic` | **0** | versionCode=34 / versionName=0.7.9 |
| 4 | `bash socialmate-v1.2/service-v040.sh restart` | **0** | 8790/8791 恢复，`mock:false` |
| 5 | `node tools/t2/cdp-eval.mjs --expr "…"`（每步点按钮/读状态） | **0** | 见 `qa/*.png` |
| 6 | `node tools/t2/build-timeline.mjs --qa qa/20261102-t2 --serial REDACTED-SERIAL` | **0** | 26 条事件 |
| 7 | `node verify-t2.mjs --base http://127.0.0.1:8791 --timeline qa/…/session-timeline.jsonl --json qa/…/t2-report.json` | **0** | 43/43 PASS |
| 8 | `diff people-sha-before.txt people-sha-after-withdraw.txt` | **0** | 三份档案逐字节回到开工前 |
| 9 | 未同意点 Record（`adb shell input tap 540 2022`） | **0** | 状态栏拒绝文案，0 开麦 |

`verify-t2.mjs` 退出码约定：0=PASS，1=FAIL，2=PARTIAL（有 NOT_RUN）。只跑契约/HTTP、缺少真机时间线时
实测为 `PARTIAL / exit 2`，因此不存在「用模拟冒充 PASS」。

---

## 5. 负例（真实跑）

| 负例 | 观察 | 证据 |
|---|---|---|
| 未勾录音同意点 Record | 原生直接拒绝，`activeSessions:0`，预算 `calls` 18 不变；8790 日志本轮只有 **2 次** `open session`（正好对应两次真正开始的录音，被拒那次 0 次） | `03-no-consent-rejected.png`、`asr-session-log.txt` |
| 候选未选人直接确认 | `400 ATTRIBUTION_REQUIRED`，factCount 不变 | `t2-report.json` → contract |
| `spk_0` 自动归人 | 候选 `speaker:"unknown"`；`speakerRaw:"spk_0"` 只作审计 | `05-pending-cards.png` |
| 未确认前写盘 | 确认响应里的 `before.factCount=5`（录音期间 0 写入） | `t2-report.json` → confirm |
| 重复 final（同句） | 只生成 1 张卡（`DUPLICATE_FINAL`） | `asr-events.jsonl` |
| 重复确认 | `duplicate:true`，factCount 仍 5，不重写 | `dup-confirm.json` |
| 无写票 / 跨源写 | `403 WRITE_TICKET_REQUIRED` / `403 ORIGIN_REJECTED` | `t2-report.json` → http |
| mock final 冒充真实 | `MOCK_FINAL_REJECTED`，0 候选 | `t2-report.json` → contract |
| 逐字原文落盘 | 全目录扫描「I usually go running…」0 命中 | 见 §6 |

---

## 6. 隐私与费用

- **录音同意**：原生 `startStreaming()` 第一道判断就是 `recordingConsent`；本轮实测未勾选时 0 次
  `AudioRecord`、0 次 8790 连接。
- **原文留存**：全程未勾「本轮保存原文」；面板显示「0 条写盘 · 0 条上传」；服务端
  `/v12/api/live/status.persistedTranscripts=false`；`SessionArchive` 未产生新会话文件。
- **逐字不落盘**（本轮实测扫描）：

```
grep -rl "I usually go running along the beach in the morning" \
  SocialMate-Data socialmate-v1.2/.local android-poc/.local   → 0 命中
```

  服务端内存只保留到 TTL（30 min）或离页清理；`Demo/live-facts.json` 只有元数据，无原文。
- **真实档案**：`find SocialMate-Data/People -newermt "2026-11-02 16:20"` → 空；本轮只写 `SocialMate-Data/Demo`。
- **ASR 花费**（`android-poc/.local/asr-budget.json`）：

| | spentCny | seconds | calls |
|---|---|---|---|
| 开工前 | 0.129189 | 465.081 | 18 |
| 收工 | 0.165422 | 595.521 | 20 |
| 本轮增量 | **+0.036233** | +130.44 | +2 |

  1 元总闸未改；本轮自设上限 0.05 元，实际 0.036233 元（含两段会话的空转时间，非纯语音时长）。
  确认/撤回/重复确认均为本地操作，0 次外部付费调用（`retryAsrCalls:0`）。

---

## 7. 未完成 / NOT_RUN（如实）

1. **真人双人音频、说话人分离、BOYA 硬件：NOT_RUN**。没有真人知情同意，按红线不做。
   因此 `spk_0` 到真人的映射没有被“证明正确”，只证明了**系统不会自动归人**。
2. **真实 People 写入：NOT_RUN by design**。红线「不动真实档案」，本轮目标人物是 3 位虚构演示人物；
   写链路（appendPeopleFacts + sm-src 幂等 + 备份）与真实档案同源，但只注入 `Demo/People` root。
3. **全量回归：未跑**（红线）。仅跑 T2 新增验收；T1 三项 N04 脚本本轮未重跑。
4. **长会话 / 多人多段**：只验证了一条 1 分钟级会话、6 条 final；更长会话的分页与 40 条上限未压测。
5. **服务端重启后的 pending**：内存候选按设计随进程消失（已在代码与文档中声明），本轮只验证了
   页面级离开清理与 TTL 逻辑，没有专门杀 8791 进程重放。
6. **真机 `mock:false` 只在 8790 `/health` 与 SSE 事件上验证**，未抓腾讯云控制台账单做第三方对账。
7. **录音中途真实断网（拔 adb reverse / 切网）未做：PARTIAL**。断线双写防护由三处证据覆盖：
   同一 final 重发只出 1 张卡（`DUPLICATE_FINAL`）、重复确认 `duplicate:true`、SSE 不重放历史事件；
   但「录音进行中断网再恢复」会新建一个计费会话，属于 T4 的移动网络场景，本轮不制造额外计费。
8. **发现并修复的一个真实缺陷（透明记录）**：初版 `pagehide` 清理被 `if(!LIVE_MODE)return` 限制，
   导致「非录音态页面离开」不会清理上一轮内存候选。已改为无条件 `sendBeacon`，并用第二段会话
   实测 `pending 1 → 0`（`leave-cleanup.json`）。

---

## 8. 回滚方式

- 代码：按文件回滚本轮 6 个改动文件 + 删除 `live-facts.mjs`、`verify-t2.mjs`、`tools/t2/`。
- 设备：`adb -s REDACTED-SERIAL install -r <T1 的 0.7.8 APK>`（`firstInstallTime` 不会变）。
- 演示数据：本轮结束后三份 `00-profile.md` 已与开工前逐字节一致；如需彻底回到母版，
  `POST /v12/api/demo/restore {"confirm":true}`（同源 + 写票）。`Demo/changelog.jsonl` 保留
  「新增/删除」两条审计记录，`Demo/live-facts.json` 保留一条 `withdrawnAt` 元数据（无原文）。

---

## 9. 证据索引

`docs/plan/ALW001-N04-V1.3-Real-Use-Closure/qa/20261102-t2/`

- `t2-report.json` / `verify-t2.log` / `verify-t2.exit`：43 条断言与退出码
- `session-timeline.jsonl` / `asr-events.jsonl`：脱敏时序（只有合成语音文本与 ID，无个人信息）
- `01-app-launch.png` … `12-retention-off.png`：逐步真机截图
- `prep-before.json` / `prep-after.json` / `prep-after-withdraw.json`
- `people-sha-before.txt` / `people-sha-after.txt` / `people-sha-after-withdraw.txt`
- `asr-budget-before.json` / `asr-budget-final.json` / `dup-confirm.json` / `leave-cleanup.json`
- `build.log` / `install.log` / `apk.sha256` / `device-version.txt`
- `synthetic-t2.aiff` / `synthetic-t2b.aiff`：合成语音原件（非真人）
