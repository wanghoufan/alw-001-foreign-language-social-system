# ALW-001 N05 V1.1 · S0 前置核查与安卓预构建报告

- 执行时间：2026-11-02 21:51–21:58（Mac 本地）
- 执行范围：仅前置核查 + Android debug 预构建/安装；未改任何界面/业务代码，未 commit/push
- 结论：S0 可交付；1 项 FAIL（USB 手机 Tailscale 未连接），2 项 UNKNOWN（TTS 中英语音包实听、STT 实际识别），均由 S4/最终 Human Gate 覆盖

## 1. Git 基线与并发编辑判断

| 项 | 实测值 | 命令/退出码 |
|---|---|---|
| HEAD | `fc2379cdc9909b26e0dc2a200791ae81ec046d55`（main） | `git rev-parse HEAD` / 0 |
| dirty 文件数 | 43（22 modified + 21 untracked） | `git status --porcelain=v1 \| wc -l` / 0 |
| 最近源码 mtime | 18:35（N04 收尾）；近 30 分钟仅 relay 文档 21:50 | `find -newermt '-30 minutes'` / 0 |
| 并发编辑进程 | 无其他 gradle/IDE/编辑代理；仅当前 codearts + 常驻 live-server/service-all watch | `ps aux \| grep -E 'gradle\|adb\|service-all'` / 0 |
| adb server | 单实例 pid 24074，设备仅 REDACTED-SERIAL | `adb devices -l` / 0 |

**判断：无其他并发编辑正在改同一业务文件。**

未提交清单（22 M + 21 ??）：
- M：CHANGELOG.md、agent.md、android-poc/IMPLEMENTATION_STATUS.md、android-poc/app/build.gradle、AsrActivity.java、SessionArchive.java、docs/architecture-facts.md、docs/archive/handoff-flow-20261031.md、docs/handoff/HANDOFF.md、3 个 N04 verify-*.mjs、N04-V13 README、docs/relay/CURRENT_TASK.md、DESKTOP_GPT_START_HERE.md、docs/risks.md、ai-gateway 7 个 mjs/html、socialmate-v1.2/index.html
- ??：DevicePairing.java、SecureStore.java、N04-V13 QA-LEDGER/T4-REPORT/qa/tools/verify-t1..t5、N05 V1.0 计划目录、N05 V1.1 计划目录、3 份 relay receipts、demo-write-guard.mjs、live-facts.mjs、pairing.mjs、socialmate-v1.2/service-all.sh

## 2. A / B / C / D 分类

### A｜必须用户本人操作
1. 手机 Tailscale 登录/开启：`com.tailscale.ipn` 已装，但本机 USB 手机无 `tun*`/无 100.x 地址，`dumpsys connectivity` 显示 `NOT_VPN`；tailnet 上 ONLINE 的是另一台 `Redmi Note 12 Pro`（100.91.121.33），与本机 `21091116AC` 不符。**FAIL → 需本人登录本机 tailnet**（S4/S6 外出验收前置）。
2. 中英 TTS 实听与语音包缺失时授权安装（S4）。
3. 最终 ChatGPT Voice 人工练习并回贴复盘（S5/D）。
4. 真人双人 BOYA 同意（仅当要验说话人分离）。

### B｜开发者已解决
1. 环境基线：Node v22.22.2、JDK 17.0.20.1、SDK 35、Gradle 8.9（腾讯镜像下载，SHA-256 与官方一致 `d725d707…`）。
2. 四端口健康：8790/8791/8781/8782 全 OK（`service-all.sh health` → HEALTHY 4/4）。
3. 数据目录读写：`SocialMate-Data`、`People` 可写；`PlaceNotes` 尚不存在（S3 新建，S0 未创建）。
4. 源数据哈希：`places-115.json` = `0412673d…`；公开 PWA gh-pages 源与线上 `index.html` 一致（`d5c3bc5c…`）。
5. 预算只读核对：腾讯 ASR 剩 ¥0.789751/¥1，DeepSeek 已用 ¥0.21363352，1 元闸未动、无新付费。
6. APK clean 预构建成功（`CLEAN_BUILD_EXIT=0`，34 tasks executed），SHA-256 `9971836f…`，与构建前基线一致（字节可复现）。
7. `adb -s REDACTED-SERIAL install -r` 成功；`firstInstallTime` 保持 2026-10-31 18:25:27，数据保留。
8. `dumpsys package` 回读 versionName 0.8.1 / versionCode 36 / targetSdk 35，三项权限 granted=true。
9. 真实 People 目录只读哈希 `78482d07…`（41 文件），与 HANDOFF 记录一致，未动真实档案。

### C｜可替代
1. 手机未登录 tailnet 时，S1–S3 仍可走 `adb reverse` + 本机模式推进；不得把该链路记为“外出 PASS”。
2. 语音引擎/语音包不可用时，文字输入与人工整理可继续；真 TTS 不得假 PASS（S4 明确）。
3. AI 或系统 STT 失效时，先完成文字/人工候选流，不阻塞其它 Task。

### D｜最后 Human Gate
1. 本机 tailnet 登录后拔 USB/清 reverse 复跑外出验收。
2. 中英文 TTS 三段循环、切段停止、耳机实听。
3. 已登录 ChatGPT APP 完成一段 Voice 练习并粘贴两份报告（旧版不串档）。
4. 最终 QA01–QA07 汇总与唯一 Human Gate。

## 3. 构建过程备注
- 首次执行 `build-apk.sh`：官方 Gradle 下载 `curl: (16) HTTP2 framing layer`，`BUILD_EXIT=16`（日志保留在 build.log 第 1–5 行）。
- 处置：改用腾讯镜像下载 Gradle 8.9，SHA-256 与官方 `.sha256` 完全一致后解压；未改构建脚本与任何业务代码。
- 第二次 `build-apk.sh`：`BUILD_EXIT=0`；随后 clean 重建 `CLEAN_BUILD_EXIT=0`，产物字节与基线一致。

## 3.1 真机预览
- `monkey -p app.socialmate.dualmic 1` → exit 0；前台 `app.socialmate.dualmic/.AsrActivity`。
- 截图 `s0-launch.png`（1080×2400 PNG）与 `ui-dump.xml`：界面正常渲染“离线只读模式”面板（`adb reverse --list` 为空，USB 本机服务未反向映射，属预期离线状态，非崩溃/黑屏）。
- 未恢复在线、未改任何数据；在线预览留后续按需执行。

## 4. UNKNOWN
- TTS 中英语音包是否已下载/可发音（引擎与默认选中 OK，实听留 S4）。
- STT 实际识别质量（服务存在、录音权限 granted，实际识别留 S2/S4）。
- 另一台 ONLINE 的 Redmi Note 12 Pro 是否即用户日常验收机（本机 USB 设备为 21091116AC，不匹配）。