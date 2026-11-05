# QA｜V1.5.2 聊天录音页压缩与分享卡（Android 0.8.31 / vc66）

> 日期：2026-11-05 ｜ 结论：**真机 393×791 与真实 P066 录音链路均通过；按需翻译已接入并实测；长会话/蜂窝等既有 NOT_RUN 项不变。**

## 1. 版本与产物

| 项 | 值 |
|---|---|
| APK | `release/SocialMate-0.8.31-vc66-debug.apk` |
| SHA-256 | `b8fa8b24c6232aabeab661d7c379ef82f8c5f614c7583163daec669a1903b9a9` |
| 设备 | Redmi Note 11 5G（锁定 `codeartsdoer`，USB，393×791，dpr 2.75） |
| 安装 | `install -r` Success；`dumpsys` 0.8.31 / versionCode 66 |
| 构建 | `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home sh android-poc/build-apk.sh` → BUILD SUCCESSFUL |

## 2. 真机布局与交互（Note 11 5G，393×791）

数据来自 `qa/tools/sm-device.mjs`（CDP 直连设备 WebView），截图与 JSON 在 `qa/t10-device/`。

| 项 | 实测 | 判定 |
|---|---|---|
| A1 全屏无 Tab/标题 | `.top`、`.mobilebar` display=none | PASS |
| A2 一排按键 | `#v152bar` = 对象 / 状态 / ⋯ / 停止 | PASS |
| A3 对话:建议 ≈1:2 | 219 / 438 = **0.500** | PASS |
| A4 首屏 ≥5 条建议 | 4 条完整 + 第 5 条露出；总 10 条 | PASS |
| A5 chips 一行 | 3 个 chip，高 40px，无标题/类别 | PASS |
| B1 对话默认纯英文 | 默认无 `.v152zh` | PASS |
| B2 按条翻译 | 点「翻译」只展开该条；实测返回「刚到海口，天气太潮湿了。」 | PASS |
| B3 建议按条中文 | 只展开所点 1 张 | PASS |
| B4 说明文字 | 页面检索无隐私长文/「英文为主」等 | PASS |
| C1 分区与配比 | 接话2 / 追问2 / 换题3 | PASS |
| C2 无朗读复制、保留收藏 | 节点 0；收藏变 ★ | PASS |
| C3 阅读冻结 | 内容变化后「有新的接话建议」显示 | PASS |
| C4 四方向数据 | `eval-suggestions.mjs`：各 3、0 重复、0 编造 | PASS |
| D1 停止弹层三选项 | 结束并人工确认 / 放弃本轮 / 继续录音 | PASS |
| D2 结束并人工确认 | 原生打开 `/v12/history` 复盘页 | PASS |
| D3 放弃本轮不写档案 | 会话清空、提示归档不可撤回；`Mia-Chen/00-profile.md` mtime 未变 | PASS |
| D4 继续录音 | `activeSessions` 1、回全屏、弹层关闭、消息保留 | PASS |
| D5 页面消息=归档段数 | 第一轮 6/6；继续录音后第二轮 1/1 | PASS |
| E1 分享卡英文 | 地点 41 英文句（`special_en` 与 `en` 去重） | PASS |
| E2 中文按翻译 | 默认英文，点「翻译」才出中文 | PASS |
| E3 人物无英文提示 | 「该资料暂无英文表达…不生成假英文」 | PASS |
| E4/E5 原资料页 | 图片 3/3、标题 23px、地址中英、返回按钮、录音中胶囊 | PASS |
| E6 往返录音不停 | 停留 20 秒 `activeSessions` 始终 1；期间 1 条 final 返回后可见 | PASS |
| F1 归档 | `savedSegments` 6、`pending=0`、`lastHttpStatus=201`；Mac 落地 6 段 md；第二轮 1 段 | PASS |
| F2 AI 首候选 | `aiState=ready` 时第一张为 AI reply | PASS |
| F3 深色主题 | 深底浅字，无白底冲突 | PASS |
| F4 字号 | 英文 19px、中文 15px、原资料标题 23px | PASS |
| F5 范围 | 未改 ASR/归档/档案结构 | PASS |
| F6 提交/推送 | 未 commit / push / 部署 | PASS |

## 3. 按需翻译（A1，已授权）

- 服务端新增 `POST /api/ai/translate`：单句 ≤700 字符、必须 `consent:true`、走同一 DeepSeek 预算账本、9.5s 超时。
- 前端只在点「翻译」时调用；首次弹一次确认，本会话记住；结果缓存在消息对象，不批量预翻译。
- 实测：`Just arrived in Haikou, and the weather is so humid.` → `刚到海口，天气太潮湿了。`，耗时 1435ms，用量 99 tokens，成本约 **0.00027 元**（预算剩余 0.786096）。
- 负例：无 `consent` → **403**。
- 无英文源时（纯中文）直接透传；上游失败显示可重试文案，不编造。

## 4. 归档尾部（T6）

- 原生 `stream()`：`finish()` 后等 `session/ended` 最长 3s 再 `archive.end()`。
- 真机第一轮 6 条 final：页面 6、归档 6、`pending=0`、HTTP 201、`everSynced=true`，Mac 6 段；第二轮（继续录音）1 条 final：页面新增 1、归档 1。
- 未再出现 V1.5.1 的「页面 43 / 归档 40」。

### 30 分钟连续会话（TTS 回环）

- 会话 `sess_20261105T031139_294de0`：**30 分 10 秒**（03:11:39 → 03:41:49 UTC）。
- 页面 final **226 条**；归档 **226 段**、`pending=0`、HTTP 201、Mac 落地；`activeSessions` 全程 1。
- 本地估算 ASR 成本 **约 0.50 元**（1800 秒，1 元/小时档）；DeepSeek 未参与该会话。
- 性质：系统 TTS 经扬声器回环（SYNTHETIC），不是真人对话。

## 5. 未跑 / 边界

| 项 | 状态 | 说明 |
|---|---|---|
| 30 分钟连续会话（TTS 回环） | PASS | 30 分 10 秒、226 段/226 归档、201、pending 0、约 0.50 元 |
| 真人 30 分钟连续交流 | NOT_RUN | 需真人在场说话，不能由 TTS 回环替代 |
| Wi‑Fi↔蜂窝切换 | NOT_RUN | 未切网 |
| 来电/耳机/音频焦点（BG04） | NOT_RUN | 现场无法制造 |
| P066 402/300s/撤销 | NOT_RUN | 需预算或撤销动作 |
| 真实 Polly | NOT_RUN | 无授权 |
| 393×852 档 | PARTIAL | 本轮设备 393×791；比例按可用高度三等分，852 档由同一 CSS 公式推导 |

## 6. 人物详情基本档案（2026-11-05 追加）

- 问题：人物详情第一条是「见面前准备」，缺少个人基本情况汇总。
- 修复：`getPersonDetail()` 新增 `profileSections`，按主档章节合并「会话确认事实」与「人工补充」；前端顺序改为 基本档案 → 见面前准备 → 会话记录。
- 真机 Mia-Chen 区块顺序：基本档案 / 基本情况 / 兴趣 / 海南生活 / 工作 / 学习 / 共同点 / 对方近期计划 / 已确认偏好 / 见面前准备 / 会话记录。
- 单测：`person-detail.test.mjs` 11 pass（新增 profileSections 合并用例）。
- 紧凑版：内容高度 **4563 → 1276**，首屏可见 **2 → 10 / 17** 条，开发式文案 0；会话记录折叠。
- 可读性：正文 17px、英文 18px、章节 16px；内容高度 1655，首屏 6/17 条。
- 收藏：☆→★→☆ 两次切换实测（收藏数 1→2→1）；收藏列表正文占满 345/367，三图标在正文下方。
- 听本段：`ttsSpeakItem` 先豆包，实测豆包音频 4.872s 播放完成；失败才回退原生。
- 音色：设置页中英各 3 个选项，切换后 `S.v152.voiceZh` 与 `localStorage.sm.ttsVoiceZh` 同步（截图 `13-voice-setting.png`）。
- 证据：`qa/t10-device/09-person-profile.png`、`10-person-compact.png`、`11-favlist.png`、`12-person-readable.png`、`person-density.json`。

## 7. 证据

- 真机截图与逐项 JSON：`qa/t10-device/`（01-immersive、02-translate-zh、03-share、04-origin、05-back、06-menu、07-stop、08-exit、result.json）。
- 桌面 393×852 对照：`qa/t10-desktop/`。
- 归档落盘：`~/Documents/SocialMate/Conversations/2026/11/` 两个本轮会话（6 段 + 1 段，正文不入库）。
- 设备状态快照：`files/archive/state.json`（`savedSegments:6/pending:0/lastHttpStatus:201`；第二轮 `savedSegments:1`）。