# ALW-001 踩坑记录

更新：2026-11-04（格式：日期 · 场景 · 现象 · 原因 · 解法；`建议进用户级` = 换项目也成立）

> 2026-11-01 的踩坑条目已归档：`docs/archive/agent-pitfalls-20261101.md`（原文保留）。
> 2026-11-02（N04 T5 / N05 V1.1）的踩坑条目已归档：`docs/archive/agent-pitfalls-20261102.md`（原文保留）。
> 音频/设备、端口/清理、深色模式等低频条目已迁：`docs/archive/agent-pitfalls-legacy-20261104.md`。
> ASR / 运行时（含预算闸、TLS、分离参数）已迁：`docs/archive/agent-pitfalls-asr-20261104.md`。
> V1.3 队列实现与灭屏 `onStop` 相关条目（含低频 TTS/密钥条目）已迁：`docs/archive/agent-pitfalls-v13-playback-20261104.md`。
> 2026-11-03 验收/桥接/AI 分段/派工条目已迁：`docs/archive/agent-pitfalls-20261105-migrated.md`（原文保留）。

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


## 播放队列（V1.3 已归档，结论仍有效）

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

## 2026-11-05 阶段复盘（V1.5.2 / 人物 / 豆包）

> 沉浸高度、样式块 `</style>`、Note 12T 豆包朗读、N05 暂停/控制栏、中文整理明细已迁：`docs/archive/agent-pitfalls-20261105-detail.md`（原文保留）。

- 2026-11-05 · App 内云端朗读 · 点「听本段」仍回退系统 TTS 并报「朗读被系统中断」 · WebView 自动取消 `window.confirm`，首次确认返回 false · 云端朗读默认授权 `S.v152.ttsConsent=true`，不依赖 confirm；实测豆包音频播放完成。`建议进用户级`
- 2026-11-05 · TTS 账本 · 同一句扣两次 0.0069 · `synthesize()` 内记账后路由又 `recordBilling()` · 只在新合成时记账，缓存命中不重复计费；修正重复条目。
- 2026-11-05 · 收藏 · 第二次点 ☆ 不取消、还要去「关于我」删 · `saveFavorite()` 只 POST 新增，服务端按英文去重返回 duplicate · 改为先查 `S.fav.items` 命中则 DELETE；人物页进入时预加载收藏。`建议进用户级`
- 2026-11-05 · 人物档案层级 · 顶部是「见面前准备」且开发式文案占屏 · 详情按数据块顺序渲染，没有把主档章节汇总到顶部 · `getPersonDetail()` 返回 `profileSections`，前端按章节密排；开发文案移出。`建议进用户级`
- 2026-11-05 · 真机旧 JS · 改完前端仍走原生 TTS · WebView 缓存旧 `index.html`，`am start` 不重新加载 · force-stop+start 或 `location.replace(url+'?v='+Date.now())`；核对 innerHTML 含新函数。`建议进用户级`
- 2026-11-05 · 显示改动越权 · 用户没要求却把英 B 折叠 · 不确定的显示改动先不做，只改用户点名的；误改已回退。`建议进用户级`

> 豆包 API Key 鉴权与密钥填写规范已迁：`docs/archive/agent-pitfalls-20261105-detail.md`（原文保留）。

## V1.6 活资料库（2026-11-05）

- 2026-11-05 · 图片压缩 · `createImageBitmap(file,{imageOrientation:'from-image'})` 报「not a valid enum value」 · Android WebView 不支持该枚举值 · 改用 `<img>` 解码 blob URL（Chromium 自动按 EXIF 摆正）再 Canvas 重绘。`建议进用户级`
- 2026-11-05 · 前端模块作用域 · 页面按钮点击报 `smCardNew is not defined` · 卡片模块写在 N05 的 IIFE 内，函数不挂全局 · 需要跨脚本调用时用 `window.__smCards` 显式暴露，别直接引用函数名。`建议进用户级`
- 2026-11-05 · 前端构建 · 页面改动在真机不生效，仍显示旧 UI · 只改 source 未执行 `build-v12.py`，WebView 拿到旧 `index.html` · 改前端后先 build、grep 新标记，再 force-stop 启动验证。`建议进用户级`
- 2026-11-05 · Android 构建 · 报「非法字符 / 非法的表达式开始」 · Java 块注释里写了 `type */*`，其中的 `*/` 提前闭合注释 · 注释里不写 `*/`，用「通配类型」等文字代替。
- 2026-11-05 · 批量上传 · 保存卡片后第二张图片 429 · 媒体上传与文字保存共用 400ms 间隔限流桶 · 批量写接口用独立限流桶（限总量与窗口，不设最小间隔）。`建议进用户级`
- 2026-11-05 · 交付报告 · 报告写「无 JS 错误」但页面重载即失效 · 用的是 CDP 临时注入的 `window.__errs`，未标注来源 · 报告证据必须注明「产品埋点 / 临时注入 / 模拟」，PASS 项要能在当前环境复现。`建议进用户级`
