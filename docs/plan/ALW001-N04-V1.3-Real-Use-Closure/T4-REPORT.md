# ALW-001 N04 V1.3｜T4 拔 USB 后安全外出使用 + Mac 自恢复

task_id: SM-ALW001-20261102-N04-V13 / T4
执行时间: 2026-11-02 17:47 – 18:14 (Asia/Shanghai)
设备: REDACTED-SERIAL · Redmi 21091116AC · Android 11 · APK 0.8.1 (versionCode 36)
APK SHA256: `9971836f0d1cd34afceaf3063f3d8d3cba652faf1f7d3e753dc0d0f03e042296`
源码: git HEAD `fc2379c` + 32 个未提交改动（工作树快照，未 reset/clean）

**结论：`PARTIAL`** —— `verify-t4.mjs` 退出码 **2**，31 条断言 **30 PASS / 0 FAIL / 1 NOT_RUN**。
唯一 NOT_RUN 是「手机侧 Tailscale 未授权」，必须用户本人在手机上登录并授权（见第 6 节）。
其余 T4 要求（四端口自愈、崩溃/重启恢复、图形界面一键恢复、离线只读、写失败不伪报、恢复后不混写、TLS 证书链、鉴权/CORS/日志不泄令牌）全部真跑通过。

---

## 1. 改动清单

### 新增
| 文件 | 作用 |
|---|---|
| `socialmate-v1.2/service-all.sh` | 四端口（8790/8791/8781/8782）统一 `health/heal/up/down/status/watch/agent-*`；复用 `service-v040.sh` `archive-service.sh` `demo-archive-service.sh`，不重复实现启动逻辑 |
| `docs/plan/ALW001-N04-V1.3-Real-Use-Closure/verify-t4.mjs` | T4 验收脚本（31 条断言，JSON + 退出码） |
| `docs/plan/ALW001-N04-V1.3-Real-Use-Closure/tools/t4/build-recovery-app.sh` | 生成「SocialMate 服务恢复.app」（双击恢复，不需要终端） |
| `~/Library/LaunchAgents/com.alw.socialmate-stack.plist` | 开机自启 + `KeepAlive`（由 `service-all.sh agent-install` 写入，可 `agent-uninstall` 撤销） |
| `release/t4/SocialMate 服务恢复.app` | 图形界面兜底恢复入口（release/ 不入 Git，用上面的脚本重建） |

### 修改
| 文件 | 改动 |
|---|---|
| `socialmate-v1.2/service-all.sh` 之外无服务端改动 | T4 不新增业务功能，四个服务入口脚本保持原样 |
| `android-poc/app/src/main/java/.../AsrActivity.java` | ①「外出模式 / 本机 USB」一键切换三个地址（ASR `wss://…:10000/asr`、UI `https://…:8443/v12`、归档 `https://…/alw/api/archive/session`）；② 在线加载成功后写本地只读快照；③ 加载失败时显示原生「离线只读模式」面板替代白屏，含「重试连接」 |
| `android-poc/app/src/main/java/.../SessionArchive.java` | 新增 `localHistorySummary()`：只读列出 exported/outbox（已同步 / 待上传），离线面板用 |
| `android-poc/app/build.gradle` | versionName 0.8.0→**0.8.1**，versionCode 35→**36**（便于区分已装版本与源码） |

红线遵守：没有 kill 任何非本仓库进程；端口占用先查 cwd/命令行归属（`owned_pid()`），外部进程一律 `BLOCKED` 不处理；未改预算（腾讯 ASR 剩余 ¥0.80，未新增调用）；未发布、未申请公网域名、未开 HTTP 明文、未用 `NODE_TLS_REJECT_UNAUTHORIZED=0`、未用 `curl -k`。

---

## 2. 每条命令与退出码

| # | 命令 | 退出码 | 结果 |
|---|---|---|---|
| 1 | `bash socialmate-v1.2/service-all.sh health` | **0** | 4/4 HEALTHY |
| 2 | `bash socialmate-v1.2/service-all.sh health --json` | **0** | JSON 四端口 ok |
| 3 | `bash socialmate-v1.2/service-all.sh heal` | **0** | 重启 1 个端口后 4/4 |
| 4 | `bash socialmate-v1.2/service-all.sh agent-install` | **0** | LaunchAgent `state = running` |
| 5 | `bash docs/.../tools/t4/build-recovery-app.sh` | **0** | 生成 `.app` |
| 6 | `gradle :app:assembleDebug`（JDK17 + SDK 35） | **0** | BUILD SUCCESSFUL |
| 7 | `adb -s REDACTED-SERIAL install -r app-debug.apk` | **0** | `Success`，保留数据（firstInstallTime 未变） |
| 8 | `bash socialmate-v1.2/service-all.sh down` | **0** | 只停本项目 4 个端口 |
| 9 | `openssl s_client -connect 100.125.100.15:443 -servername mac-mini.tail4e4317.ts.net -verify_return_error -CAfile /private/etc/ssl/cert.pem` | **0** | `Verify return code: 0 (ok)`，TLSv1.3，Let's Encrypt |
| 10 | 同上 `:8443` / `:10000` | **0 / 0** | 同样 `0 (ok)` |
| 11 | `curl https://…:10000/health`、`:8443/api/ai/health`、`:8443/v12`、`/alw/health`（均未加 `-k`） | **0** | HTTP **200** ×4 |
| 12 | `curl -X POST https://…/alw/api/archive/session`（无令牌 + 跨源 Origin） | **0**（HTTP 401） | 未授权写入被拒 |
| 13 | `node docs/.../verify-t4.mjs --qa <QA> --json <QA>/t4-report.json` | **2** | `PARTIAL`：30 PASS / 0 FAIL / 1 NOT_RUN |

崩溃/重启恢复实测（脚本内，均记录到 `t4-run.log`）：
- `kill -9 8782`（先验证 cwd + 命令行属于本仓库）→ 看门狗 **6.0 s** 自动拉起，pid 82293 → 85951，日志 `HEAL: 端口 8782 不健康…`。
- `launchctl bootout` → 四端口全 DOWN → `agent-install` → **2.0 s** 内 4/4 恢复（模拟 Mac 重启）。
- 双击「SocialMate 服务恢复.app」（先 `kill -9 8781`）→ 弹窗「已自动恢复，手机可以继续使用。8790/8791/8781/8782 全部在线」，**不需要终端**。

---

## 3. verify-t4 JSON（关键断言）

`docs/plan/ALW001-N04-V1.3-Real-Use-Closure/qa/t4-20261102-175042/t4-report.json`

```
summary: {total: 31, pass: 30, fail: 0, notRun: 1, verdict: "PARTIAL"}
```

| 组 | 断言 | 证据要点 |
|---|---|---|
| preflight | device-report | 0.8.1/36，APK SHA 前缀 9971836f，HEAD fc2379c + 32 dirty |
| stack | health-4-ports / launch-agent-loaded / launch-agent-plist | exit 0；`state = running` |
| gui | recovery-app-present / manual-doubleclick-evidence | 脚本只调 `launchctl kickstart`，不 spawn node；双击截图 |
| sec | archive-post-requires-token | 无令牌 POST → **401** |
| sec | no-wildcard-cors | 无 `Access-Control-Allow-Origin` 头（含 `*` 检查） |
| sec | tokens-not-in-logs | 归档令牌/演示令牌在 `qa/` 日志中 0 命中 |
| tls | openssl-chain-443/8443/10000 | 三条链均 `Verify return code: 0 (ok)` |
| tls | tailnet-https-endpoints | 4 个映射全 200 |
| tls | no-insecure-flags | 源码/脚本无 `curl -k`、无 `NODE_TLS_REJECT_UNAUTHORIZED=0` 赋值、无 `http://100.` |
| crash | victim-is-project-owned → watchdog-restarted | 旧 82293 → 新 85951，6.0 s |
| reboot | agent-unloaded-services-down → bootstrap-recovers | 全 DOWN → 2.0 s 全 OK |
| stack | phone-online-baseline | CDP 读到 DOM 含 Oliver/Maya/Ji-eun；快照 3 人 9 段 |
| write | no-false-success / failure-message-visible | DOM 出现「清空失败」，**没有**「已清空演示数据（真实数据未改动）」 |
| offline | no-adb-reverse / readonly-cache-shown | `adb reverse --list` 为空；面板含 3 人、9 段、本地原文、限制说明 |
| recover | back-online / demo-not-cleared-by-failed-write / demo-counts-intact | 服务端 3 人 9 段 54 句；Demo+People 目录哈希前后一致 `eb504de7…` |
| nousb | mac-side-tailnet-entry-verified | 证书 + 4 端点 200（Mac 侧替代验证） |
| nousb | phone-tailnet-session | **NOT_RUN**（见第 6 节） |

---

## 4. 截图与日志

QA 目录：`docs/plan/ALW001-N04-V1.3-Real-Use-Closure/qa/t4-20261102-175042/`

| 文件 | 内容 |
|---|---|
| `10-baseline-online.png` | 拔通道**前**：在线人物页 3 人 / 9 段 / 54 句（People） |
| `21-clear-modal-offline.png` | 服务停掉后点「清空演示数据」的确认弹窗 |
| `22-clear-failed-toast.png` | 「清空失败：Failed to fetch」，演示数据仍在（无伪成功） |
| `30-offline-readonly.png` | 拔通道**后**：离线只读面板（3 人缓存 + 本地 3 段已同步 + 写操作不可用说明），非白屏 |
| `40-recovered-online.png` / `41-recovered-people.png` | 恢复后在线界面与人物页（3 位 · 9 段会话 · 54 句） |
| `50-gui-recovery-dialog.png` | Mac 图形界面双击恢复后的结果弹窗 |
| `30-stack-log-after-crash.txt` | 看门狗重启 8782 的服务日志片段 |
| `t4-console.log` / `t4-run.log` | 本次全部断言与每条命令的 exit code |
| `11/13/25/42/44-*.txt`、`12/43-*.json` | 控件树、WebView DOM 文本、离线快照、恢复后服务端状态 |
| `20-hashes-before.txt` / `41-hashes-after.txt` | Demo + People 全量 JSON 哈希（前后一致） |
| `60-network-drop-health.txt` / `61-network-restore.txt` | 断网实验：`tailscale down` 期间本地 4/4 仍健康、tailnet 入口 000；`tailscale up` 后 **2 s** 入口恢复 200 |

Mac 侧常驻日志：`socialmate-v1.2/.local/qa/stack.log`（每次 HEAL/WATCH/AGENT 都带时间戳）。

---

## 5. 用户视角的「一两步」恢复

1. **常态**：什么都不用做。LaunchAgent `com.alw.socialmate-stack` 开机自动起四个服务，任一崩溃 20 s 内自动拉起。
2. **异常**：双击 `release/t4/SocialMate 服务恢复.app`（或把它拖进「应用程序」），看到「已自动恢复」弹窗即可。
3. 手机端在酒店/外出：设置 → 高级设置 → 点「外出模式」，三个地址一次性切到 Tailscale 私有 HTTPS（不需要手抄地址）。

补充说明：恢复 App 刻意**不直接拉起 node** —— 实测 GUI 进程拉起 node 会弹「node 想要访问文稿文件夹」的系统授权框，反而多一步；改为 `launchctl kickstart` 后由 launchd 拉起，`~/Documents/SocialMate` 读写正常（`/api/archive/list` 实测 200）。

---

## 6. NOT_RUN 与需用户授权项

| 项 | 状态 | 原因 / 需要用户做什么 |
|---|---|---|
| 手机 Tailscale 私有入口实连 | **NOT_RUN** | 手机已装 `com.tailscale.ipn`，但**未登录/未授权**到本 tailnet：`ip addr` 无 `tailscale0`，`ping 100.125.100.15` 100% 丢包；tailnet 内在线设备只有 `3236741198的Redmi Note 12 Pro`（不是本机）。需要用户本人在手机上打开 Tailscale 登录并授权这台 Redmi Note 11，然后把 SIM 流量打开、拔掉 USB，再跑一次 `verify-t4.mjs` |
| 物理拔出 USB 线 | **NOT_RUN（替代已做）** | 数据线仍插在 Mac 上（充供电 + ADB）。已用 `adb reverse --remove-all` 断开唯一的数据通道并让 APP 走离线路径（截图 30），属于等价软件验证；物理插拔需用户手动完成 |
| Mac 真实重启（非 bootout） | PARTIAL | 用 `launchctl bootout` + `agent-install` 模拟；`RunAtLoad` 已配置，真实重启需用户择机验证 |
| Mac 整体断网（ISP/Wi-Fi） | PARTIAL | 本机无免密 sudo，无法关网卡。已用 `tailscale down` 做等价私有入口断网：入口不可达时四端口仍 4/4 健康（健康检查走 127.0.0.1，与上行无关），`tailscale up` 后 2 s 恢复 200（`60/61-*.txt`）|

Mac 侧替代验证已完成：证书链 3 条全 `0 (ok)`、4 个 tailnet HTTPS 端点全 200、无令牌写入被 401 拒绝、无通配 CORS、日志无令牌。

---

## 7. 已知边界

- 8782（演示归档）**不对外暴露**：它是服务端到服务端（8791 → 127.0.0.1:8782），只做本机健康检查与自启托管；这样比再开一个 tailnet 入口更安全。
- 离线面板只缓存「演示人数/会话数/已确认数 + 本地 outbox/exported 列表 + 上次同步时间」，不缓存逐字原文、不缓存令牌，符合 T1/T2 的隐私约束。
- 离线期间页面上的「清空/恢复/上传」由服务端不可达自然失败，并把失败原因显示在页面提示条（DOM 断言见 `25-clear-failed-dom.txt`）；磁盘哈希前后一致，说明没有半写。
