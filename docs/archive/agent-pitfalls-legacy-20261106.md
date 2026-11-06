# ALW-001 踩坑归档（2026-11-04 及以前）

> 迁移时间：2026-11-06 阶段复盘。原文保留，`agent.md` 只留最近条目与指针。

## 构建

- Gradle 8.9 从 `services.gradle.org` 307 到 GitHub，直连常 0 字节；代理下 ZIP 到 `~/.gradle/alw001-bootstrap` 再 `build-apk.sh`。
- 版本号以 `aapt2 dump badging` 为准。
- `assembleDebug` 全 UP-TO-DATE 时产出可能是旧构建；证明「从当前源码构建」必须 `clean` 后 assemble。
- `android-poc/local.properties` 缺 `sdk.dir` 时报 "SDK location not found"；构建用 `JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=~/Library/Android/sdk`。

## 服务 / 同源 / 真机写入验收

- `originOK` 只认 `127.0.0.1:<port>` 时，真机经 Tailscale（`:8443`）POST 全 403（GET 不带 Origin 才"正常"）；判定用 Origin 的 host:port 比请求 Host（含 `x-forwarded-host`）。
- 复盘页有两个 `.status`（生成/保存）：`querySelector('.review .status')` 拿前者，别据此判"保存没生效"。
- CDP 点击前先 `scrollIntoView` 再取 `getBoundingClientRect`；坐标过期会点到相邻按钮（曾误触真实计费）。
- 真机验写入用 `SM_CONVERSATION_DIR`/`SM_PROFILE_DIR`/`SM_PEOPLE_DIR` 起隔离实例 + `adb reverse`，比改 `ui_url` 安全；收尾删 reverse、清 WebView 虚构事实。

## MIUI / 真机

- `INSTALL_FAILED_USER_RESTRICTED` ≠ APK 坏；Note 12T 需开「通过 USB 安装」，Note 11 可用 `pm install-create/write/commit`。
- MIUI 12.5 上 `pm grant RECORD_AUDIO` 后仍可能弹「仅在使用中允许」；用 `uiautomator` 找 bounds 再 tap。
- `am start` 非 exported 的 `AsrActivity` 会被 `SecurityException`；从 MainActivity 按钮进入。
- `uiautomator` bounds 是设备像素、截图是缩放图；点击坐标用 dump 的 bounds，不能按截图目测。
- Android 15/target 35 强制 edge-to-edge；ScrollView 加 WindowInsets listener，否则标题压状态栏。
- 不要用 `adb logcat -d`；流式写文件后 grep。
- Note 11 的 MIUI 拦 `adb shell input text`/字母 keyevent（`input tap` 正常）；真机验证用界面自带按钮。

## 代码 / 数据

- 2026-11-03 · 分段设置 · 选 2 句/段无效 · `Math.max(MIN,...)` 夹回 3 · 区间显式 1–8，改完用样例对比段数。

## 播放队列（V1.3 结论仍有效）

- V1.3 的队列实现与灭屏 `onStop` 相关结论已归档：`docs/archive/agent-pitfalls-v13-playback-20261104.md`（原文保留）。V1.4 已把队列搬进前台服务，勿按旧架构改回网页推进。
- 2026-11-04 · 私有地点入口 · 海南从 116 掉回 115、红城湖消失 · 一次性初始化失败后永不重试且 `catch{}` 静默 · 3 次退避重试 + 切页补拉 + `window.__smLoadPrivate()` 手动入口。`建议进用户级`

## 会后复盘 / 档案写入

- 复盘读原文，`/v12/api/review` 必须带 `x-archive-token`；令牌由归档服务校验，ai-gateway 不存不写日志。
- 测写入用 `SM_PROFILE_DIR=/tmp/xxx` 重启，别写正式 `SocialMate-Data/Profile`；测完回默认并确认 `/api/profile` 仍是 `null`。
- ASR 会重复定稿同一句；候选去重按归一化子串 + 词集 Jaccard ≥ 0.8，留更完整的一条。
- 说话人只有聚类编号：`attribution` 只能是 `unknown`，由用户选「关于我 / 人物 / 不保存」。

## N05 V1.4 后台朗读 / 自动归档（2026-11-04 阶段复盘）

- 2026-11-04 · 会话开工 · 在 `~/WorkBuddy/<时间戳>` 空目录里找项目，子代理按该 cwd 落盘 · 新建会话默认工作区 ≠ 项目目录，子代理继承父会话 cwd · 开工先确认项目绝对路径，每条子代理提示词写死路径并禁止写项目外目录。`建议进用户级`
- 2026-11-04 · 无人值守守护 · 归档 watch「一直在跑」却从不扫描 · 手工 `node --watch` 不是 launchd 托管，会话结束即消失 · 定时任务必须 RunAtLoad+KeepAlive 托管，验收回读 `launchctl list` + 本轮扫描时间戳。`建议进用户级`
- 2026-11-04 · 页面按钮属性 · 点「听词组」弹出「显示与阅读设置」并写坏界面语言 · 朗读按钮复用 `data-lang`，与界面语言开关同名，`closest('[data-lang]')` 先命中 · 语义不同的控件不得复用同名 data 属性，朗读用 `data-tts-lang`；2026-11-05 N05 新按钮复犯，已统一并真机四按钮验证。
- 2026-11-04 · 原生队列段类型 · 中文词组被英文声线朗读（日志 `lang=en text=晚上散步`） · 按 `kind` 映射 segment 丢了 lang，落到 `phrase → en-US` · 段类型一律由 `lang` 推导（`segmentOfLang`），kind 只做展示。
- 2026-11-04 · 长任务取证 · 熄屏 45 项无法用 logcat 判完整性 · 休眠后 logcat 丢事件，`-d` 只取缓存 · 长任务由原生写 `files/tts-queue-timeline.jsonl`（事件+时间戳+idx），验收以文件为准。
- 2026-11-04 · 归档索引 · 生产索引 thought 43→44 多出一条测试样本 · 子代理验证链路时投了自造文件且未标 fixture · QA 样本必须带 `qa_fixture`，验完 `--remove` + 删文件，并回读 `realTotal/testFixtures`。

## P066 / 聊天页 V1.5（2026-11-04 阶段复盘）

- 2026-11-04 · P066 流式接 ALW · final 恒为 0、只有 interim · P066 `translate()` 只判外层 `msg.final`，腾讯定稿句子用 `sentence_type=1` · 改为 `sentence_type=1 || msg.final` 双判，并把 final 数量写进验收；改后单段 1、多段 2。`建议进用户级`
- 2026-11-04 · P066 修 final · 只在本机 `stream-relay.mjs` · 重部署会覆盖 · 保留 `.bak-20261104-finalfix`，验收写死 `sentence_type` 与 final 数。