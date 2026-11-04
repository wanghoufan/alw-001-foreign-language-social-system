# T3 验收报告｜Android 原生 outbox → Mac 完整归档

task_id: SM-ALW001-20261102-N04-V13 / T3
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
executed_at: 2026-11-02 17:12 – 17:45 (+08:00)
git_head: `fc2379c`（工作树含 T1+T2+T3 改动，未 commit、未 push）
device: Redmi Note 11 5G `21091116AC` / Android 11 / serial `REDACTED-SERIAL`
apk: `app-debug.apk` versionName **0.8.0** / versionCode **35**，sha256 `b1c4770499bd82128abbb6f5b020c21d7dbeec03d422ac8de6207120bc5ce039`
asr: 腾讯云实时 ASR（`mock:false`，3 条 final + 1 条 final），**SYNTHETIC**（macOS `say` → 手机麦克风）
conclusion: **PARTIAL（38/39 断言 PASS，1 条 NOT_RUN）**；NOT_RUN 只涉及「系统查看器显示 md 内容」，不涉及归档链路

---

## 1. 结论摘要

| PLAN T3 要求 | 结果 | 证据 |
|---|---|---|
| 未开「原文留存并导出」不得收集完整 final / 不得写 Mac | PASS | `10-privacy-retention-off.json`（retention=false，0 条写盘）、`10-no-current-json.txt` |
| 服务拒绝 → outbox 保留 → 恢复 → 补传 → Mac 收 `.md`+.`json` | PASS | `13-*`、`14-recovered-synced.json`、`19-mac-archive-files.txt` |
| 与 final 逐字/数量/时间戳一致 | PASS（3/3 段，逐字符、startMs/endMs/receivedAt 全等） | `t3-report.json` → `mac/segments-verbatim-count-timestamps` |
| 手机显示「已同步 Mac」 | PASS | `21-ui-synced.txt` + `.png` |
| 两次上传幂等，失败不擦数据、不伪报成功 | PASS | `15-ack-first/replay.json`（201→200，hash 相同）、`16-mac-sha-before/after-replay.txt` 逐字节相同 |
| 6 次退避耗尽 → 可理解状态 + 自动/手动恢复 | PASS（3/10/30/60/60/60s，第 6 次后进入「已用完」；手动补传恢复） | `17-backoff-exhausted.json`、`17-backoff-exhausted-ui.png`、`17-after-manual-retry.json` |
| 401/403/429/5xx/413/体积超限/服务重启/设备重启/离线 均不丢原文 | PASS | `18-error-matrix.log`（5 种 HTTP）、`18-local-oversize.json`、`18-stub-down.json`、`19-after-reboot.json` |
| SAF 导出 md 到用户目录 | PASS（/sdcard/Download，514 B，内容逐字） | `20-saf-export.json`、`20-saf-exported.md` |
| 从系统文件管理器重新打开 | **PARTIAL**：文件管理器可见 + 系统能解析打开方式；但该 ROM 无默认 Markdown 查看器，可用查看器需接受第三方隐私政策，未代为同意 → 打开后看到内容记 NOT_RUN | `20-saf-filemanager.png`、`20-saf-resolver.png`、`20-saf-open-attempt-htmlviewer.png` |
| 演示 9 对母版可清空/恢复、隔离不写真实档案 | PASS（真实 Conversations 4 文件 hash 不变；Demo 18 文件不变） | `22-isolation.json` |
| 版本 0.8.0(vc35)、install -r 保留数据、dumpsys 回读 | PASS（firstInstallTime 仍为 10-31 18:25） | `device-dumpsys.txt`、`install.log`、`apk.sha256` |

`verify-t3.mjs`：`{"result":"PARTIAL","checks":39,"passed":38,"failed":1,"notRun":1}`，**退出码 2**（见 `verify-t3.log`）。

---

## 2. 审查结论：`SessionArchive` 状态机与令牌来源

审查对象：`SessionArchive.java`（`current.json / outbox / exported`）、`AsrActivity` 的留存勾选与上传接线、`archive-receiver.mjs`、`conversation-archive.mjs`、`pairing.mjs`。

| # | 缺陷（修复前） | 后果 | 修复 |
|---|---|---|---|
| D1 | `current.json` 只在 `end()` 时转 outbox；进程被杀/设备重启后残留文件无人回收，`begin()` 会直接覆盖 | **静默丢原文**（真机上已复现：kill 进程后 3 条 final 停在 current.json） | 构造/`begin()` 时 `recoverStaleSession()`：补 `endedAt`（取最后一段 `receivedAt`）→ 写 outbox → 删 current；解析失败的移入 `quarantine/` 保留 |
| D2 | 6 次退避耗尽后 `scheduleRetry()` 直接 return，界面仍显示「失败可重试」，无手动入口 | 用户不知道已停摆，以为会自动恢复 | `retryExhausted` 状态 + 文案「自动重试 6 次已用完（原因）· 原文仍在手机」+ 「立即补传」按钮 `retryNow()`（重置预算） |
| D3 | 所有失败一视同仁重试：401/403（令牌失效）、413（体积）也照样退避 6 次 | 无意义重试 + 文案不指向真正原因 | 分类：`AUTH`（401/403，不自动重试）、`TOO_LARGE`（413 或本地 >512KB，不重试且**不发请求**）、`THROTTLED`(429)/`SERVER`(5xx)/`OFFLINE`（可重试）、`REJECTED`（其它 4xx） |
| D4 | `everSynced` 只在内存；重启后 pending=0 会显示「尚未上传（需先填地址与令牌）」 | 伪报未同步（误导） | `last_synced_at` 持久化到 SharedPreferences；只有服务端 2xx 才写 |
| D5 | 上传成功只 `renameTo(exported)`，没有服务端回执留痕 | 无法事后核对「同一份原文只归档一次」 | 每次 2xx 写 `exported/<id>.ack.json`（sessionId/hash/httpStatus/syncedAt） |
| D6 | 令牌来源 = 手填长期令牌 > 配对短期令牌，手填令牌以明文存 SharedPreferences，UI 还提供密码框 | 与 T1「APK 里不放长期令牌」矛盾，且明文落盘 | 删除手填令牌输入与 `setToken()`；启动时清除历史 `archive_token`；`effectiveToken()` 只认配对短期令牌，无配对即 fail closed（`configMissing`） |
| D7 | 配对用 `archiveUrl`（8781）当基址，而配对接口在 8791 | 设备上永远 404 | 改为 `privateUiBase()`（8791） |
| D8 | 配对 HTTP 跑在主线程 | 真机必现 `NetworkOnMainThreadException`，配对从未成功过 | 移到 `pairing-claim` 线程；失败文案直接写面板（不再被 `refreshPairingStatus()` 覆盖） |
| D9 | 冷启动时 outbox 有积压，但缓存令牌为空 → 直接跳过上传，之后无重试 | 重启后不自动补传 | 令牌刷新成功后回调 `flushAsync()` 补传一次 |
| D10 | 网页「停止接收」只断开网页 SSE，原生麦克风仍在录 | **隐私问题**：界面像已停、麦克风没停 | 新增 `stopRecording()` 桥（网页→原生）+ `smNativeRecordingStopped()`（原生→网页），双向同步 |
| D11 | 归档历史页「下载 (.md)」用 `a.download` + blob，WebView 不触发下载器 | 用户点导出没有任何反应 | 优先走原生桥 `saveText()` → SAF；blob 仅作浏览器回退 |
| D12 | 归档状态只有一句中文，无可观测字段 | QA/排障无法确认「到底停在哪一步」 | 每次状态变化原子写 `files/archive/state.json`（只有计数/状态/错误码，无任何原文） |

**留存闸门复核**：`begin()` 未勾选时直接 `return`（不建对象、不写盘），`addFinal()` 首行 `if (!retention || current == null) return;`，`end()` 同闸门；`conversation-archive.mjs` 服务端再拒 `consent.retention !== true`，双重闸门。真机验证见 `10-*`。

---

## 3. 改动清单

**原生**
- `android-poc/app/src/main/java/app/socialmate/dualmic/SessionArchive.java`：D1–D6、D9、D12（恢复/退避/错误分类/ack/state.json/令牌 fail closed）。
- `android-poc/app/src/main/java/app/socialmate/dualmic/AsrActivity.java`：D7–D10（配对线程与基址、错误可见、「立即补传」按钮、停录双向同步、复盘入口文案）。
- `android-poc/app/build.gradle`：`versionCode 35` / `versionName 0.8.0`。

**Web / 服务（仅本项目，未动其它业务）**
- `socialmate-prototype/ai-gateway/archive-history.html`：D11（导出优先原生桥）。
- `socialmate-v1.2/index.html`：D10（停录桥调用 + `smNativeRecordingStopped`）。

**新增**
- `docs/plan/.../verify-t3.mjs`：11 组 39 断言。
- `docs/plan/.../tools/t3/ui.mjs`：真机 UI 驱动（dump/tap-text/screenshot）。
- `docs/plan/.../tools/t3/fault-stub.mjs`：8799 故障注入桩（401/403/429/500/413/reset/ok），只绑 127.0.0.1。

**未改**：`archive-receiver.mjs` 的正文逻辑、`conversation-archive.mjs`、T1/T2 的既有证据目录、真实归档与 Demo 母版。

---

## 4. 真机链路时序（17:12–17:45）

| 时间 | 动作 | 证据 |
|---|---|---|
| 17:14 | 构建 0.8.0/vc35 → `install -r`（数据保留）→ dumpsys 回读 | `build.log`、`install.log`、`device-dumpsys.txt` |
| 17:15 | 冷启动：`retention=false`、0 条写盘、无 `current.json`；历史明文 `archive_token` 被清除 | `10-*`、`state-01-launch.json` |
| 17:19 | 一次性配对码 → 设备配对成功 `dev_e8d3162e…`（修复主线程网络后首次成功） | `pair-code-issued.json`、`pair-status-after.json` |
| 17:20–17:21 | 勾选「知情同意」+「原文留存」→ 录音（3 段合成语音）→ 3 条 `mock:false` final 落 `current.json` | `device-current-before-crash.json` |
| 17:23 | **强杀进程**（模拟崩溃/重启）→ 启动后 `recoveredSessions=1`，current.json 进 outbox | `12-recovered-outbox.json`、`20-saf-*` 之前的状态 |
| 17:24 | 服务恢复 → 补传 201 → Mac 生成 `.md`+`.json`；手机显示已同步 | `mac-archive/*`、`21-ui-synced.png` |
| 17:25 | 设备级重放（outbox 再塞同一份）→ 200 duplicate，Mac 字节不变 | `15-ack-*`、`16-mac-sha-*`、`server-duplicate.log` |
| 17:26 | 停掉 8781 后停止录音 → outbox 保留、`第 2/6 次补传失败（网络不可达）` | `13-service-refused.json`、`13-outbox-listing.txt`、`05-failed-retry-ui.png` |
| 17:27 | 服务恢复 → 手动补传 201 | `14-recovered-synced.json` |
| 17:27–17:28 | 故障桩矩阵：401/403/429/500/413；本地 600KB 夹具未发请求 | `18-error-matrix.log`、`18-local-oversize.json` |
| 17:28–17:32 | 500 持续 → 3/10/30/60/60/60 共 6 次 → `retryExhausted=true`，数据仍在 | `17-backoff-exhausted.json`、`17-backoff-exhausted-ui.png` |
| 17:33 | 桩恢复 → 「立即补传」→ 201 | `17-after-manual-retry.json` |
| 17:33–17:34 | 桩停机 → OFFLINE；桩重启 → 启动即补传 201 | `18-stub-down.json`、`18-after-stub-restart.json` |
| 17:34–17:35 | **真实设备重启**（`adb reboot`，boot_completed=1，重启后 adb reverse 丢失需重建）→ 启动即补传 201 | `19-reboot.txt`、`19-reverse-after-reboot.txt`、`19-after-reboot.json` |
| 17:36 | 归档历史页「下载 (.md)」→ SAF 选择器 → 保存到 /sdcard/Download（514 B） | `20-saf-export.json`、`20-saf-exported.md` |
| 17:37–17:40 | 系统文件管理器可见该文件；系统能解析打开方式；无默认 md 查看器 → 内容显示 NOT_RUN | `20-saf-filemanager.png`、`20-saf-resolver.png` |
| 17:42 | 恢复生产归档地址、清理测试夹具，真实归档 hash 不变 | `22-isolation.json`、`23-final-device-state.json` |

---

## 5. 每条验证命令与退出码

| # | 命令 | 退出码 | 结果 |
|---|---|---|---|
| 1 | `JAVA_HOME=…/openjdk@17 ANDROID_HOME=~/Library/Android/sdk gradle -p android-poc --offline :app:assembleDebug` | **0** | BUILD SUCCESSFUL（0.8.0/35） |
| 2 | `adb -s REDACTED-SERIAL install -r app-debug.apk` | **0** | Success，firstInstallTime 未变 |
| 3 | `adb … shell dumpsys package app.socialmate.dualmic` | **0** | versionName=0.8.0 / versionCode=35 |
| 4 | `SM_CONVERSATION_DIR=<qa>/mac-archive node archive-receiver.mjs`（隔离 8781） | 0（后台） | `/api/archive/health` = 200 |
| 5 | `curl -s 127.0.0.1:8791/v12/api/pair/code` → 设备输入 → `pair/claim` | 0 | `dev_e8d3162e…`，短期令牌有效 |
| 6 | `say -v Samantha …` ×3 + `adb shell input tap`（同意/留/Record） | 0 | 3 条 final（`mock:false`） |
| 7 | `adb … shell am force-stop app.socialmate.dualmic`（模拟崩溃） | 0 | 启动后 `recoveredSessions=1` |
| 8 | `kill <8781>` → 停止录音 → 读 `state.json` | 0 | pending=1、OFFLINE、原文保留 |
| 9 | `bash socialmate-v1.2/archive-service.sh start`（隔离目录）→ 补传 | 0 | 201 |
| 10 | `curl http://127.0.0.1:8799/__mode/<401|403|429|500|413>` ×5 | 0 | 见矩阵日志 |
| 11 | 600 KB 夹具入 outbox → 冷启动 | 0 | `TOO_LARGE`，桩请求数不变 |
| 12 | `adb -s … reboot` → `wait-for-device` → `sys.boot_completed` | 0 | `boot_completed=1` |
| 13 | SAF：历史页下载 → DocumentsUI 保存 | 0 | `/sdcard/Download/SocialMate-sess_…md` 514 B |
| 14 | `node verify-t3.mjs --qa <qa> --json t3-report.json` | **2** | PARTIAL：38/39 PASS，1 NOT_RUN |
| 15 | 真实归档前后 `find … | shasum` | 0 | 4 文件、hash 一致 |

---

## 6. verify-t3 断言分布

| 组 | 条数 | 结果 |
|---|---|---|
| privacy | 2 | PASS×2 |
| statemachine | 4 | PASS×4 |
| offline | 3 | PASS×3 |
| idempotent | 2 | PASS×2 |
| backoff | 4 | PASS×4 |
| matrix | 9 | PASS×9 |
| mac | 4 | PASS×4 |
| saf | 4 | PASS×3，NOT_RUN×1 |
| ui | 2 | PASS×2 |
| device | 4 | PASS×4 |
| isolation | 2 | PASS×2 |

---

## 7. 证据路径

主目录：`docs/plan/ALW001-N04-V1.3-Real-Use-Closure/qa/20261102-171216/`（83 个文件）

- 状态快照：`10-*`、`12-*`、`13-*`、`14-*`、`17-*`、`18-*`、`19-*`、`23-final-device-state.json`
- Mac 归档：`mac-archive/2026/11/SocialMate-2026-11-02-092052-sess_20261102T092052_bc60b9.{md,json}`
- 幂等：`15-ack-first.json`、`15-ack-replay.json`、`16-mac-sha-before/after-replay.txt`、`server-duplicate.log`
- 退避：`backoff-progress.log`（每 20s 采样）、`17-backoff-exhausted-ui.png`
- SAF：`20-saf-exported.md`、`20-saf-filemanager.png`、`20-saf-resolver.png`、`20-saf-export.json`
- 界面：`21-ui-synced.txt/.png`、`21-ui-pending.txt`、`05-failed-retry-ui.png`
- 构建安装：`build.log`、`install.log`、`apk.sha256`、`device-dumpsys.txt`、`device-apk-token-strings.txt`
- 结论：`t3-report.json`、`verify-t3.log`

脱敏说明：HTTP 日志只有状态码/字节数/会话 ID 前 12 位；`state.json` 与快照不含任何原文；原文只存在 `device-current-before-crash.json`、`mac-archive/*`、`20-saf-exported.md`（均为合成语音转写，无人隐私）。

---

## 8. 未完成 / NOT_RUN / Human Gate

1. **SAF「打开后看到内容」NOT_RUN（不影响归档链路）**：该 Redmi ROM 未安装默认 Markdown/纯文本查看器；系统解析出的 UC「TXT 阅读器」首次启动要求接受其隐私政策，**未代替用户点同意**。文件本身已验证：`/sdcard/Download/…md` 514 B、内容逐字、文件管理器可见。需要用户本人一次性选择查看器（Human Gate）。
2. **MIUI 文件管理首启隐私同意**：为完成「系统文件管理器可见」这一步，我点了该**系统应用**的「同意」（仅文件访问权限，可随时在权限管理撤销）。若不希望保留，可撤销该应用权限。
3. **飞行模式级「断网」未做**：归档测试走 `adb reverse` 回环（USB 在线），飞行模式不影响 127.0.0.1。真实「不可达」用两种方式覆盖：① 手机 Tailscale 未启动 + tailnet 域名 → `UnknownHostException`（`state-04`）；② 移除/停服 → `IOException`（`13-service-refused`）。**拔 USB + 移动网络的真实外出场景属于 T4**，本轮不打 PASS。
4. **真人双人语音**：未做（无知情同意），沿用 T2 的合成语音结论。
5. 未跑全量回归（红线）；只重启了本仓库 8781，临时增加 8799 故障桩并在结束后关闭；未改 1 元预算（ASR 期间 spent 0.165→约 0.17 CNY）。

---

## 9. 已知遗留 / 建议（不在 T3 范围）

- `state.json` 的 `lastHttpStatus` 在一次成功上传后、若紧接着发生一次失败重试会被重置为 0；不影响 `pending/everSynced/ack`，但排障时以 `ack.json` 为准。
- 「立即补传」按钮位于高级设置较下方；退避耗尽时的文案已明确指引，但可考虑在状态行旁直接放一个按钮（T5 UI 收口时评估）。
- 归档历史页在 App 内导出改走原生桥后，浏览器（非 App）仍保留 blob 回退路径，两条路径都保留。
