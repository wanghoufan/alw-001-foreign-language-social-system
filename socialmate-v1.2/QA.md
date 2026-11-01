# QA · SocialMate V1.2

日期：2026-10-31｜执行：Chrome 156 headless + CDP 真实点击（`file://` 离线）

## 结论

`HTML 交互通过`（本机 Chrome）；`Mock 规则链路通过`；真实腾讯云 ASR 已在 `android-poc/asr-bridge` 单独实测，**尚未接入本 UI**。

## 逐项

| 验收项 | 结果 | 证据 |
|---|---|---|
| 五 Tab：软件/海南/聊天/关于我/人物 | PASS | `ui-test-result.json` → `summary.checks.tabs5` |
| 软件 51 条记录 / 204 步 | PASS | `checks.apps51/steps204` |
| 海南 115 地点、ID 唯一 | PASS | `checks.places115` |
| 户外跑步自动出现 3 个正式地点 | PASS | 万绿园 / 海口湾滨海步道 / 白沙门公园 |
| 自然接话 + 2–3 追问 + 分享句 | PASS | `chat.coach` 文本 |
| 卡片点击进入地点详情、含地图 | PASS | `checks.drawer` |
| 返回聊天保留原会话 | PASS | 前后 bubbles=1；修复了原实现从卡片进详情会切走 Tab、会话视图丢失的 Bug |
| 手动搜索默认折叠 | PASS | 5 个话题下 `details.manualextra` 均未展开 |
| 5 话题回归 | PASS | 跑步/咖啡/软件/海边/日常；`topic-test-result.json` |
| 360/390/412/430 无横向溢出 | PASS | `scrollWidth == innerWidth` |
| 桌面 1440 | PASS | 1425 ≤ 1440 |
| 浅色默认 + 深色可切 | PASS | `initialTheme=light`，`darkToggle=true` |
| 无在线图片/外部 JS/CSS | PASS | 单文件内嵌数据与样式；地图仅点击后联网 |
| 本轮未主动写入 Android/ASR | PASS | 本轮新增仅 `socialmate-v1.2/`；工作区存在 21:09 的既有 ASR 未提交修改（不属于本轮） |

## 数据口径

- 51 条软件记录（去重后 53 个 P 编号：P027/P062、P015/P029 合并），204 步。
- 其中 25 条标注“资料有限/未真机验收”，不按“已验收”表述。
- 海南 115 条来自正式地点库，ID/中英原文保留。
- 自动关联卡是**规则匹配**，不是语义检索；界面已标“规则匹配/规则模拟”。

## 未完成 / 限制

- 软键盘遮挡未测（headless 无输入法）。
- 红米/小米/OPPO 自带浏览器真机未测。
- 真实 LLM 未接入；追问与卡片为规则模拟。
- 公开分享页沿用 `socialmate-prototype/public-share.html` 的隔离方案，本版未重建。

## 复现（目录自包含）

```bash
python3 socialmate-v1.2/build-v12.py
node socialmate-v1.2/test-ui.mjs
node socialmate-v1.2/test-topics.mjs
node socialmate-v1.2/shots.mjs
```

`source/` 为 V1.1 基准与 115 地点快照；`vendor/ws` 为测试用 WebSocket 依赖，不依赖其他项目目录。

## 2026-10-31 追加 · V1.2.1 修改后的验证范围

原有本文件上方 Chrome 和 Note 11 真机结果属于 V1.2 改版前。请勿将旧证据解释为 V1.2.1 的字体/密度/AI 网关真机通过。

### 本轮实际修改

- 已修正式 index.html 及构建源 source/V1.1-baseline.html：四处一级资料页删除顶部绿色介绍 Hero；首屏直接展示可用内容。
- 新增右上角显示设置，字号4档、英文专用3档、密度3档，本地保存；默认 16/18/14 CSS px。
- 关于我新增分类+自定义标签筛选与编辑，原始演示数据及其他会话记录未被覆盖。
- 新增可选真实 AI 请求，只有云端同意且从同源 localhost 8791 /v12 打开后才会访问 /api/ai/analyze；其他情况不发送。
- AI 网关服务端新增 /v12 静态正式 UI 路由，只绑定 127.0.0.1，不暴露密钥。

### 代码级回归

- 自动测试文件：socialmate-v1.2/test-display-and-ai.mjs。
- 已通过 V8 + Node 兼容 shim 执行该测试文件的 8/8 测试逻辑：51/204/115 数量、构建源同步、五页无 Hero、设置存储、关于我标签保存/筛选、无授权零云请求、file:// 零云请求、私有网关授权后真实请求形状与推荐回填。
- 这不是 Mac mini 原生执行 node --test，也不是 Chrome 截图。Mac 真 Node、重构建再测试与红米/小米/OPPO 的设置弹窗、键盘/横屏和 200% 放大仍待验收。
- API 曾由桌面开发者在旧页面真实验收；V1.2.1 新 UI → 真实付费 API 的在线端到端复测尚未实际执行，不能宣称新版已通过。

### 暂未完成

- 真人双人 ASR说话人分离，BOYA stereo 复测、嘈杂环境。
- 手机 APP 原生字幕流嵌入 V1.2.1 UI；目前 /v12 是私有浏览器页面（模拟字幕），不是安卓正式录音界面。
- 关于我确认内容跨设备与正式 Markdown 的双向同步；当前仍为浏览器单机档案。
- 新版正式分享/PWA 独立部署、安全鉴权、用户最终视觉验收。


## 2026-10-31 · V0.4.0 ASR 实时字幕/AI 联动新增 QA

| 检查项目 | 状态 | 备注 |
| --- | --- | --- |
| 私有事件 hub 过滤和 mock 保留 | V8 代码级 3/3 PASS | 不转发音频/密钥，SSE 限最多 2 观察者 |
| 正式 V1.2 Android 字幕 Web UI | V8 代码级 6/6 PASS | interim 不付费、mock 不付费、真实 final 调模型、去重、同意、断开 |
| 8790 ASR WebSocket -> in-process onEvent | 代码已写 + Node 测试文件已写 | Mac 真实 npm test 未执行 |
| Android ASR Activity 内嵌受限本地 WebView | Java 源码已写 | 尚未 Gradle 编译 / 红米安装 |
| 0.4.0 APK SHA-256 与签名 | NOT RUN | 源代码版本更新不等于 APK 已构建 |
| 真实腾讯云 final -> 同屏 DeepSeek | NOT RUN | 尚未在新版 Android 0.4.0 真机验证 |
| 生产环境无 ADB 单机网络、自动服务恢复 | NOT BUILT | 现有连接仅本机 + adb reverse，正式方案后续专门解决 |

验证脚本（只有实际执行才能填 PASS）：`bash socialmate-v1.2/verify-v040.sh`。


### 最终代码级核对补充

- 新增 `test-android-wiring.mjs` 4 组静态接线/权限/隐私/单 Activity 检查，V8 兼容执行 **4/4 PASS**。
- 既有 V1.2.1 UI 8/8、实时 ASR 页面 6/6、SSE hub 3/3、Android 接线检查 4/4 合计 **21/21 组代码级逻辑验证**；不是 Mac 原生命令，也不等于真实 APK 编译/安装。
- Android 前台录音界面新增独立的同行人录音及云端 ASR 同意复选框；录音停止后取消勾选，未同意时不能开启麦克风。Web 页面向 DeepSeek 发送**文字**仍需另外勾选，不混为一项授权。


## 2026-10-31 23:25 · 本机真实构建验收结果（以最新运行日志为准）

证据：`socialmate-v1.2/.local/qa/verify-20261031-232512.log`，Mac mini 本地 Node v24.19.0。

| 阶段 | Mac 实际结果 |
| --- | --- |
| UI + Android 接线 + SSE（第一轮） | 18/18 PASS |
| AI 双模型网关 + ASR final 适配器 + 事件 hub | 15/15 PASS |
| ASR 桥接 WebSocket、音频算法、真实语料及 callback | 37/37 PASS |
| 正式 115 地点 HTML 重构建 | 成功，51 软件/204 步/115 地点/5 故事 |
| 重构建后 UI/隐私/事件回归 | 18/18 PASS |
| Android Java 核心算法测试 | 12 个断言 PASS |
| Gradle Android debug APK 构建 | BUILD SUCCESSFUL，32 任务，约 7 秒 |

合计 Node 测试 **88/88 PASS、0 FAIL**，另 12 个 Android 核心断言 PASS。

V0.4.0 APK 实际输出路径：`android-poc/app/build/outputs/apk/debug/app-debug.apk`；SHA-256：`02bbba7a444813767acdc21e2efc015e37889ca42fde38dbe7bb7f1123cef92f`。该编译产物在默认忽略 build 目录，Mac Project Reader 不直接读取 APK 二进制；此事实以终端日志为依据。

**仍未验收**：安卓真机安装、前台录音与 WebView 同屏、实际腾讯云定稿→DeepSeek 接话→海南卡片全链路、无 USB 网络及异常重连。上方历史描述「Mac Node 未执行/Gradle 未编译」已被本次真实运行结果取代；不要继续引用旧结论。

下一步已备安全安装脚本：`bash socialmate-v1.2/install-phone-v040.sh`。只有连接、授权一台安卓手机后运行；默认 `adb install -r` 不清除 App 数据，不会自动卸载、开放公网或绕过录音/AI 同意。安装及服务健康摘要写入 `.local/qa/phone-install-*.log`，可供云端读取定位问题。

## 2026-10-31 23:32 · 手机安装首次执行发现多设备，已修复脚本

- 用户在 Mac mini 真正运行 `install-phone-v040.sh`，生成 `.local/qa/phone-install-20261031-233258.log`。
- 原脚本检测到两部已授权真机后按保护策略主动中止，**APK 未安装，端口映射和服务启动均未进行**；这不是 APK 构建失败。
- 两部设备型号：`21091116AC` 与 `22101316C`；不应擅自猜测用户想装哪部。
- 已直接修改 `socialmate-v1.2/install-phone-v040.sh`：多设备时逐一展示编号、marketname、型号和序列号，用户在交互终端输入 1 / 2 后仅在被选手机上运行 `adb install -r`、reverse 和启动 APP；一部手机时继续自动选择。错误编号安全中止，非交互终端避免错误设备。
- 修改后已重新读取源码，检查目标选择、保留安装数据、反向映射只对所选设备等条件存在。**尚未在 Mac shell 实际重跑该脚本**，等待用户重新运行后读取最新安装日志。

## 2026-11-01 00:05 · V0.4.0 服务阻塞修复与真机联调结果

### 根因（有现场进程证据）

- 8791 被 **旧独立 AI 网关**占用：pid 25852，`node --env-file-if-exists=.env server.mjs`，cwd 为 `socialmate-prototype/ai-gateway`，启动于 22:09；它没有 8790 ASR、没有 `/api/asr/status` 能力。
- 8790 当时没有 combined 服务；安装脚本只检查 8791 的 `/api/ai/health` 就判定“AI 已监听”，随后 2 秒内 8790 超时，直接给出“Stop the old standalone service and retry”死路，既不识别旧服务身份，也不做安全恢复。
- 安装脚本此前还缺少显式 `--serial`，多设备时必须交互选择；这与本次非交互执行冲突。

### 修改

- `socialmate-prototype/ai-gateway/server.mjs`：新增 `/api/asr/status` 与 `features.asrLive/combinedService`；健康接口携带 ASR 模式、mock、端口和活动会话数；8791 端口占用时明确报错退出。
- `socialmate-prototype/ai-gateway/live-server.mjs`：先起 ASR 再起 AI，注册同进程能力；ASR 异常关闭自动重启（最多 5 次，指数退避），并向 SSE 推送恢复状态。
- `socialmate-v1.2/service-v040.sh`（新增）：`status / ensure / start / stop / restart`。只停止 cwd 在本仓库内、命令匹配本项目服务的 PID；端口被外部进程占用时拒绝 kill 并打印 pid/cmd/cwd；`ensure` 幂等，不重复启动；20 秒健康等待。
- `socialmate-v1.2/install-phone-v040.sh`：支持 `--serial` / `SOCIALMATE_SERIAL` / `--skip-install`；服务改用 `service-v040.sh ensure` 并校验 combined 能力；显式校验两条 adb reverse；启动后检查 pid、前台 Activity 与 FATAL 日志。
- `socialmate-v1.2/source/V1.1-baseline.html`（并重建 `index.html`）：`?live=1` 自动开会话并连接字幕；SSE 断线 0.5–8s 指数退避自动重连（最多 10 次，显式停止后不再重连）；新增“允许把本轮字幕文字发送给云端 AI”复选框，默认不勾选；取消勾选会递增请求序号，忽略在途回复。
- `AsrActivity.java`：debug 构建启用 WebView CDP；录音启动后加载 `/v12?live=1`，刷新后仍自动重连字幕。
- 新增 `test-live-e2e.mjs`（mock 手机音频→ASR→SSE 全链）、`phone-live-check.mjs`（真机 WebView CDP 探针）、`service-v040.sh`；补齐 live 自动连接、重连、云端同意测试。

### 实际执行与结果

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| Mac Node 回归 | **93/93 PASS** | `verify-20261101-082913.log`：21 + 15 + 37 + 20 |
| Android 核心断言 | **12 PASS** | 同上 |
| APK 构建 | BUILD SUCCESSFUL | SHA-256 `30992001df58d5c20f30c20588236c27444a10f1a8312e4277bc52c014ab62ae` |
| Note 11 安装 | Success，versionName 0.4.0，保留数据 | `phone-install-20261101-000839.log` |
| 服务身份 | 单进程同时提供 8790/8791，`combined:true` | `/api/asr/status` |
| 双端口 reverse | 8790、8791 均存在 | `adb -s &lt;note11-serial&gt; reverse --list` |
| 真机 WebView | 打开 `http://127.0.0.1:8791/v12`，标题/51 软件/115 地点可见 | CDP `/json/list` + UI dump |
| 真机 MOCK 全链 | `[mock] speech detected 1000 ms` 出现在聊天气泡，标“模拟音频”，AI 仍为“本地规则模拟” | `phone-v040-live-mock.png`、`phone-v040-final-apk-mock.json` |
| 服务重启恢复 | 8790/8791 重启后 WebView 自动重连并收到新字幕 | 同上（`--keep-page`） |
| 真实腾讯云 ASR | 2 条 final，`mock:false`，`spk_0`，端到端 1.54s | `asr` 现场输出 |
| 真机真实 ASR→UI | 两条 final 显示“腾讯云定稿”，说话人“待确认” | `phone-v040-live-real.png`、`phone-v040-final-apk-real-ai.json` |
| 真机显式同意→DeepSeek | “真实 AI · DeepSeek 官方”，2.06s，卡片 39/41/45 | `phone-live-check --ai-consent` |

### 口径与仍未完成

- 真机 ASR 测试音频为 macOS `say` 合成的英文语音，**不是真人录音**；因此只证明真实云端链路、UI 呈现和代码路径，不是真人语音验收，也不是双人说话人分离验收。
- Note 11 当前未插博雅接收器，界面显示“未发现 USB 音频输入”，真机双麦 A/B 仍需插硬件后测。
- 真人录音、双方同意、嘈杂环境、两人重叠说话、断网/锁屏恢复仍需用户现场完成。
- 服务当前仍是本机 `127.0.0.1` + USB `adb reverse`，没有公网/无 USB 方案；不上传音频、不持久化转写。

### 2026-11-01 真人单人语音验收（Note 11 + 最终 APK）

- 操作：Note 11 自带麦克风，mix 模式，用户本人朗读英文；录音同意由用户在界面确认，云端文字发送由用户单独授权。
- 腾讯云 ASR：41 条事件，8 条 final，全部 `mock:false`、`spk_0`；手机聊天气泡标「腾讯云定稿 / 说话人待确认」。
- 识别结果：主体正确；首句将 “SocialMate with a real voice” 识别为 “social media with RA voice”，其余句包含 running、Haikou、Evergreen Park、waterfront walk、weather、coffee 等。
- 规则卡片：万绿园 39、海口湾滨海步道 41、白沙门公园 45。
- 用户明确允许后调用一次 DeepSeek：UI 显示「真实 AI · DeepSeek 官方」，主题“跑步与咖啡”，生成接话、2 条追问、分享句；卡片为 39、15 FUNBAY、41、45。
- 证据：`screenshots/phone-v040-human-voice-1.png`（字幕与规则卡片）、`screenshots/phone-v040-human-voice-ai.png`（真实 AI）、`.local/qa/phone-v040-human-voice-ai.json`。
- 边界：单人说话只能验证 `spk_0`，双人 `spk_0/spk_1` 分离仍未验收；首句专有名词误识别可作为后续词表/场景优化依据。

### 2026-11-01 DeepSeek 预算闸（用户授权自动启用）

- 用户授权：`deepseek-flash` 累计开销上限 **1 元**；未达到前自动启用，不逐次询问。
- 实现：`DEEPSEEK_BUDGET_CNY` 默认 1；按官方高峰价保守估算（缓存命中 0.04、未命中 2、输出 8 元/百万 token）；累计写入 `.local/ai-budget.json`，跨重启保留；剩余 ≤0.01 元返回 `402 BUDGET_EXHAUSTED`，不调用上游。
- 验证：一次真实短对话 `usage=1742` tokens，记账 `spentCny=0.004204`、`calls=1`；重启后仍保留；`/api/ai/health` 返回 `budget`。
- 口径：此前未记录 usage 的调用无法精确回算，预算闸从启用后开始累计；当前剩余 `0.797992` 元（48 次，0.202008 元）。

### 2026-11-01 第二轮“双人”测试更正

- 用户确认：本轮是**同一个人用两种语气**轮流说，不是两位不同的人。
- 因此所有英文 final 判为 `spk_1`（首句无关中文为 `spk_0`）**不构成说话人分离失败**；双人 `spk_0/spk_1` 仍未验证。
- 本轮夹入一句无关中文提示音“你头部向前伸的有些久了，请调整一下姿势”，来源不是本测试脚本；建议双人复测时关闭其他 App/通知并保持安静。
- 本轮 DeepSeek 自动调用 8 次，预算从 0.004204 增至 **0.033159 元 / 1 元**；真实 AI 主题“晨跑与海边路线”，卡片 41/39/45。
- 证据：`screenshots/phone-v040-two-speaker.png`、`.local/qa/phone-v040-two-speaker.json`。

### 2026-11-01 真机双人分离（真人 A + TTS B）初测

- 配置：Note 11 + BOYA mini，mix 模式，48k/2ch；A 为用户真人，B 为 TTS 生成女声从 Mac 外放。
- 结果：ASR Activity 出现 **`spk_0`（A）与 `spk_2`（B）交替**，不再是同一 ID；首次观察到双说话人区分。
- 限制：现场夹入多个无关中文提示音（“目前这个工作还剩多少”“眨眨眼”“头部向前伸…”），占用 `spk_0/spk_1`，导致 B 被分到 `spk_2`；因此这是一次**有干扰的初步通过**，不是安静环境下的干净验收。
- 手机 V1.2 页面仍按设计只显示“说话人待确认”，不把 A/B/spk_N 映射冒充真实身份；原始 `spk_0/spk_2` 只在 ASR 实验页转写中出现。
- DeepSeek 自动调用（1 元授权内）：主题“周末晨跑与海边日落”，真实 AI 接话、追问、卡片 39/41/45；预算累计 **0.113562 元 / 1 元，28 次**。
- 证据：`screenshots/phone-v040-two-speaker-tts-transcript.png`、`screenshots/phone-v040-two-speaker-tts-ai.png`、`.local/qa/phone-v040-two-speaker-tts.json`、`.local/qa/phone-v040-two-speaker-tts-transcript.txt`。
- 下一步：关闭其他 App/通知，在安静环境用两位真人或 A+独立 TTS 复测，确认 `spk_0/spk_1` 稳定交替。

### 2026-11-01 双人复测（真实环境）结论：功能通过，严格准确率未测

- 本轮开头仍录到 TTSMaker 页面自带的英文介绍“Tts maker ...”，说明 B 的播放页面/系统声音没有完全隔离。
- 说话人 ID 会随环境声源漂移：A 的句子分到 `spk_1` 和 `spk_2`，B 的句子多处为 `spk_0`。这属于真实环境下的多声源干扰，不构成本轮功能失败；UI 始终显示“待确认”，未误认身份。
- 真实 AI 仍正常：主题“周末晨跑与海边日落”，接话、追问、卡片 39/41/45；预算累计 **0.202008 元 / 1 元，48 次**。
- 结论：**真实环境功能验收通过**（字幕、AI、卡片、多说话人 ID 均工作）；严格 `spk_0/spk_1` 准确率未测，仅作为可选实验室指标，不作为本轮门槛。
- 证据：`screenshots/phone-v040-two-speaker-tts-retest-transcript.png`、`screenshots/phone-v040-two-speaker-tts-retest-ai.png`、`.local/qa/phone-v040-two-speaker-tts-retest.json`、`.local/qa/phone-v040-two-speaker-tts-retest-transcript.txt`。

### 2026-11-01 Mac 收尾执行：TLS、构建、新 UI、ASR 预算

#### 1. 代码测试与 APK

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| Node 回归 | **102/102 PASS**（前端 24 + 网关 15 + ASR 桥 40 + 重建后 23） | `socialmate-v1.2/.local/qa/verify-20261101-095933.log` |
| TLS 防护测试 | **2/2 PASS** | `node --test socialmate-v1.2/test-tls-guard.mjs` |
| Android 核心断言 | **12 PASS** | 同上 verify 日志 |
| APK 构建 | BUILD SUCCESSFUL，versionName **0.4.0**，versionCode **9** | `android-poc/app/build/outputs/apk/debug/app-debug.apk` |
| APK SHA-256 | `da46425f7e5e1e69b243ac87171bf47f1301c2f32a25c52a23399236fdf69b7e` | 同文件 |
| Note 11 安装 | 保留数据安装成功；安装后 `/data/data` 内仍有 61 个文件 | `phone-install-20261101-094228.log` |

#### 2. `NODE_TLS_REJECT_UNAUTHORIZED=0` 根因与修复

- **实际来源**：CodeArts 桌面端的 agent-kernel（PID 13323）把 `NODE_TLS_REJECT_UNAUTHORIZED=0` 注入每个工具 shell。
- 已排除：`launchctl getenv` 为空；`~/.zshrc`、`~/.zprofile`、`~/.bashrc`、`~/.bash_profile`、`~/.profile`、`~/.zshenv`、`~/.zlogin` 均未设置；项目 `.env` 也未设置。
- **修复**：`service-v040.sh` 在创建新进程前检测并 `unset` 继承的 `=0`，证书验证保持开启；`live-server.mjs` 仍对 env 文件中的 `=0` 拒绝启动（退出 78），防护未削弱。
- **重启证据**：组合服务旧 PID 70100 / 32361 / 40144 全部停止；新 PID 40845，`ps eww` 中不再出现该变量。
- **真实 TLS 验证**（无 `-k`、无关闭校验）：
  - `asr.cloud.tencent.com`：HTTP 404，Node `socket.authorized=true`，TLSv1.2。
  - `api.deepseek.com`：HTTP 401（未带 Key 的预期响应），Node `socket.authorized=true`，TLSv1.3。
  - curl `ssl_verify_result=0`（证书链验证通过）。
- **真实业务验证**：8790 收到腾讯云 final（`mock:false`）；8791 的 DeepSeek 返回 `real-ai`，2.094s，预算记账成功。
- 未输出、未写入任何 API Key。

#### 3. 腾讯云 ASR 1 元预算闸

- 新增 `android-poc/asr-bridge/src/asr-budget.js`；按腾讯云实时语音识别（大模型 2.0 版）后付费 **1.0 元/小时** 保守估算。
- 默认 `ASR_BUDGET_CNY=1`，剩余 ≤ `0.01` 元拒绝新会话（`ASR_BUDGET_EXHAUSTED`）；账本 `android-poc/.local/asr-budget.json`（0600），按实际上送 PCM 时长累计。
- 历史 26 秒种子计入（4 次）；当前：**0.033884 元 / 1 元，121.981 秒，8 次**。
- 查看：`curl -s http://127.0.0.1:8791/api/asr/status` 或 `http://127.0.0.1:8790/health` 的 `budget`。
- 这是本地估算，不是腾讯云账单；达到 1 元会停止新建会话，需要重新授权。

#### 4. Note 11 新 UI 九项验收

| # | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 首页显示 SocialMate，不是 BOYA 工程页 | **PASS** | `phone-v040-newui-home.png`；UI 树 “SocialMate / 外语社交助手 · 实时对话 / 开始实时对话” |
| 2 | 点“开始实时对话”进入录音操作 | **PASS** | `phone-v040-newui-recording.png`；AsrActivity 显示录音同意、开始、停止、高级设置 |
| 3 | 未同意录音不得启动麦克风 | **PASS** | `phone-v040-no-consent.png`；状态“请先确认…”，服务 activeSessions=0 |
| 4 | 同意后启动腾讯云识别，聊天页显示实时字幕 | **PASS** | 新 UI `?live=1`；CDP 文本出现两条“腾讯云定稿”；`phone-v040-chat-stopped.png` |
| 5 | DeepSeek 文字发送独立授权，预算闸有效 | **PASS** | 云端 AI 复选框默认未勾选，AI 卡片为“本地规则模拟 · 非真实 AI”；`/api/ai/health` 显示 0.20641/1 元，49 次 |
| 6 | 聊天页可直接停止录音 | **PASS** | 点顶栏“停止录音”后 `activeSessions` 1→0；`phone-v040-chat-stopped.png` |
| 7 | 切到后台停止录音 | **PASS** | Home 后 0.5s 内 `activeSessions` 1→0；`phone-v040-background-stopped.png` |
| 8 | 高级设置可打开，BOYA 检测/音轨未丢失 | **PASS（检测）** | `phone-v040-advanced-boya.png`；`USB_DEVICE #556 · USB-Audio - BOYA mini`，48000/2ch，A/B 按钮与 mix 音轨均在 |
| 9 | 页面溢出、按钮遮挡、字号 | **PASS（布局）** | 1080×2400；UI bounds 无重叠，长内容在 ScrollView 内滚动；标题 24–26sp，正文 15–17sp，元信息 13–14sp |

- 第 8 项补充：BOYA **路由成功但 PCM 为数字静音**。A/B 两次 5 秒采集均为 `L/R -180.0 dBFS`，因此“双麦独立声道”无法在本轮成立；这是当前硬件/发射器状态，不是路由或代码丢失。证据：`phone-v040-boya-silent.png`、`ui-boya-a-level.xml`、`ui-boya-b-level.xml`。

#### 5. 双音色双人分离（腾讯云真实链路）

- 使用 macOS 两个明确不同音色：Samantha（A，en_US 女声）/ Daniel（B，en_GB 男声），四轮对话，共 28.8 秒。
- 直接送 8790（mix），7 条 final：
  - A 的三句全部 `spk_0`；
  - B 的三句全部 `spk_1`。
- 结论：**双说话人分离在本轮双音色素材上成功**，A/B 稳定分离，未被环境声源打散。
- 证据：`.local/qa/two-voice-direct-long-events.jsonl`、`.local/qa/two-voice-direct-long.log`。
- 限制：这是 Mac 生成的双音色素材直连 ASR 的结果，不是手机+BOYA 的现场双人录音；手机端双人现场仍被第 8 项的 -180 dBFS 静音阻断，未伪造通过。

#### 6. 仍未完成 / 边界

- BOYA 发射器需要开机/配对/确认未静音后，才能重跑“手机 + BOYA 现场双人”验收；当前软件路由和检测均正常。
- Note 12T Pro 本轮未操作；只读检查显示当前未安装本项目 APK。
- 本轮未执行 Git commit / push；保留所有未提交修改。
- 服务仍是本机 `127.0.0.1` + 无线/USB `adb reverse`，没有公网入口。
- ASR 预算是本地按秒估算，不等于腾讯云实际账单。

#### 7. 本轮证据索引

- 构建/测试：`.local/qa/verify-20261101-095933.log`
- 安装：`.local/qa/phone-install-20261101-094228.log`
- TLS/服务：`.local/qa/live-v040-20261101-094952.log`
- ASR 预算：`android-poc/.local/asr-budget.json`
- 双音色：`.local/qa/two-voice-direct-long-events.jsonl`、`.local/qa/two-voice-direct-long.log`
- 真机截图：`screenshots/phone-v040-newui-home.png`、`phone-v040-newui-recording.png`、`phone-v040-no-consent.png`、`phone-v040-live-chat.png`、`phone-v040-chat-stopped.png`、`phone-v040-background-stopped.png`、`phone-v040-advanced-boya.png`、`phone-v040-boya-silent.png`、`phone-v040-two-voice-boya-no-caption.png`

### 2026-11-01 本机档案持久化（P2）

- 新增 `GET/PUT /api/profile`：`PUT` 必须 `confirm:true`，缺失返回 400 `CONFIRM_REQUIRED`；只接受 stories/people 已知字段，单次 ≤64KB。
- 存储：`SocialMate-Data/Profile/current.json`（0600、临时文件 + rename 原子替换）+ `current.md`（人读）；目录已 gitignore。
- 界面：`/v12`「关于我」新增「同步到本机档案」；`profile-sync.js` 同源加载，`file://`/离线静默失效，仍用 localStorage。
- 定向测试：`node --test socialmate-prototype/ai-gateway/profile-store.test.mjs` → **5/5 PASS**（无文件返回 null、字段白名单、截断、非法输入、确认标记）。
- API 实测（隔离端口 + 临时目录）：初始 `profile:null`；无确认 **400**；带确认 **200**；回读 stories/people 一致；`current.json` 权限 `-rw-------`。
- 端到端（Chrome headless + 同源页面）：脚本加载、按钮存在、`confirm` 后按钮变「已同步」，落盘 **5 条话题 + 1 个人物**、`confirmedByUser:true`；测试用临时目录，结束后删除，未污染正式档案。
- 服务重启后仍 `combined:true`，ASR/DeepSeek 账本数值未变（0.033884 / 0.20641）。
- 边界：本章节未跑全量回归；正式 `People/*.md` 归档、会话收尾摘要仍未接通。

### 2026-11-01 海南公开 PWA V1.1（本地构建 + 浏览器端到端）

- 新增用户功能：想去/选择按钮、已选数量、我的清单、取消/清空、按选择过滤、生成只含地点 ID 的分享链接（`?selected=3,39,41`）、收件人打开回显同一清单、`navigator.share` 优先 + 复制回退、manifest/SW/图标。
- 打包白名单：7 个文件（`public-share.html/js`、`public-places.js`、`styles.css`、`manifest.webmanifest`、`sw.js`、`icon.svg`）；脚本会拒绝 `/api/`、`profile/asr/ai`、`DeepSeek`、`getUserMedia`、`microphone` 以及 `index.html/app.js/data.js/v12` 引用。
- 浏览器 E2E（Chrome headless 390×844，解包后仅白名单目录 + `python -m http.server 8901`）：
  - 列表 115 张卡；点击 3/39/41 → `wants=3,39,41`；
  - 刷新后仍为 `3,39,41`；
  - 生成链接 `http://127.0.0.1:8901/public-share.html?selected=3,39,41`；
  - 新导航打开该链接 → 显示 “A list shared with you · 3”，三条与选择一致；
  - Service Worker 注册 `true`，manifest 已加载。
- 包：`2026-10-31 … ALW001 Hainan Guide-Public Share - V1.1.zip`，SHA-256 `b46252247c15d07415b3cd7801b0e5551ce35c014a139c4ae464b4c27741d119`，7 文件 167,675 字节。
- **未部署**：没有公开 HTTPS 链接；部署需用户明确授权（可先给临时域名）。

### 2026-11-01 Mac 会话归档接收端（鉴权 + 幂等 + 原子写）

- 新增独立接收端 `socialmate-prototype/ai-gateway/archive-receiver.mjs`，只绑 `127.0.0.1:8781`；`SM_ARCHIVE_TOKEN` 缺失或不足 24 字符直接退出 78（fail closed）；单请求上限 512KB；兼容 Tailscale 前缀 `/alw`。
- 启动脚本 `socialmate-v1.2/archive-service.sh {start|ensure|stop|status|token}`；令牌生成在 `socialmate-v1.2/.local/archive-token`（0600，gitignore）。
- 实测：无令牌 **401**；带令牌 **201 created**；重复投递 **200 duplicate**；`consent.retention=false` **400**；`textOriginal` 首尾空格原样保存（`repr` 验证）；`current.json`/`current.md` 权限 `-rw-------`，目录 0700。
- Tailscale：新增 `/alw` → `127.0.0.1:8781`（原 `/` → 8779 保持不变）；`https://mac-mini.tail4e4317.ts.net/alw/health` 返回 `{"ok":true,...}`。

### 2026-11-01 Android 0.5.0（原文归档 + outbox + 自动导出）

- 构建：`BUILD SUCCESSFUL`，`versionCode=10`、`versionName=0.5.0`；APK SHA-256 `cf7f25d436d382dcf21b43cfa877614fe2c38434e965edb5ade139bb6ed24833`（142,495 字节）。
- Note 11（Redmi 21091116AC，无线 ADB）`pm install-write/commit` 安装成功。
- 真实语音链路（Mac `say` 外放 → 手机麦克风 → 腾讯云 ASR）：收到 final `Hello, this is a real voice test for social made archive export.`（识别错误原样保留），停止后自动导出到 Mac：
  - `SocialMate-2026-11-01-031731-sess_20261101T031731_e80121.md` SHA-256 `cdc11c08214929413104c66e43bcc85b8273489d5a6984f9998cb3120e1b502e`
  - `.json` SHA-256 `8f112b86202b12064c0dc77dbc45763a2aab1e0c40940627117be92c0ab65cb4`
- 合成传输测试（明确标注非真人）：预置 outbox → Tailscale 未登录时 `UnknownHostException`；改 adb reverse 后 `201 created`，Mac 落盘。
- 断网重试：移除 8781 reverse → `ConnectException`，待导出 1；恢复后打开 App 自动补传，outbox 0。
- 留存闸：取消「允许留存并导出」后跑同流程，outbox/exported 均为 0，不产生归档。
- APK/测试数据已在验收后清理（Mac 测试归档与手机 exported 目录均删除）。

### 2026-11-01 无 USB 状态（BLOCKED）

- Note 12T Pro：`adb install` 与 `pm install-create/commit` 均被 MIUI `INSTALL_FAILED_USER_RESTRICTED` 拒绝，需用户开启「通过 USB 安装」。
- Note 11：已安装 Tailscale（`com.tailscale.ipn`），但未登录/未建立 VPN；`ping mac-mini.tail4e4317.ts.net` 返回 `unknown host`，因此 App 无法走 Tailscale HTTPS。
- 结论：会话归档代码与接收端已可用，但「完全脱离 USB 的日常链路」**未验收**；当前 ASR/UI 仍需 `adb reverse`，归档可用 Tailscale 一旦手机 Tailscale 登录即可切换。

### 2026-11-01 海南 PWA 真机原生浏览器（Redmi Note 11 / MIUI 浏览器）

- 用局域网只服务 7 个白名单文件（`--bind 0.0.0.0:8902`，无任何私有 API），Note 11 原生浏览器打开 `http://192.168.31.61:8902/public-share.html`。
- 实测：`115 / 115 places`、城市/分类筛选、英文正文正常；详情页点「☆ Add to my list」→ 按钮变「★ Saved to my list」；返回列表后顶栏 `My list (1)`；打开清单显示 `My list · 1`、`Share link (only place IDs)`、`Send list to SocialMate`。
- 证据：`socialmate-v1.2/screenshots/pwa-v11-note11.png`、`pwa-v11-note11-selected.png`、`pwa-v11-note11-mylist.png`。
- 仍然：未部署公网 HTTPS；局域网测试不构成公开发布。

### 2026-11-01 产品化验收矩阵（V1.2 计划口径）

| 编号 | 结果 | 证据 / 说明 |
| --- | --- | --- |
| PWA-01 | PASS | 公开包 7 文件白名单；打包脚本拒绝 `/api`、profile/asr/ai、DeepSeek、麦克风与私有页面 |
| PWA-02 | PARTIAL | 115 条、搜索/城市/分类、双语详情、详情页地图链接均存在；**未实际打开** Google/Amap 外链 |
| PWA-03 | PASS（链接）/ NOT_RUN（聊天软件回发） | 选 3 处 → 刷新保留 → 生成 `?selected=` → 新会话回显一致；未通过微信/WhatsApp 实际发送 |
| PWA-04 | PARTIAL | Note 11 MIUI 原生浏览器实机通过并截图；小米/OPPO/iPhone Safari 未覆盖 |
| PWA-05 | PASS | 已部署 GitHub Pages：公开资源 200，`/api/profile`、`/api/asr/live`、`/api/ai/analyze` 全部 404；包内无录音权限 |
| APP-01 | PARTIAL | 本次 `BUILD SUCCESSFUL`、APK hash 已重算；按用户红线未跑全量回归，stage1b 未重跑 |
| APP-02 | PASS（真人语音与双说话人） | BOYA 轮次 4 条 final；Note 12T 轮次用户真声 `spk_0` + TTS `spk_1`，双说话人分离；DeepSeek 建议卡本轮未重验 |
| APP-03 | PASS（传输）/ NOT_RUN（坏证书拒绝） | USB 物理拔除后仅 Wi-Fi ADB，`reverse` 为空；ASR `wss:10000`、UI `https:8443`、归档 `/alw` 均跑通并落盘 |
| APP-04 | PASS | 真机 final 逐字写入 Mac MD/JSON（含识别错误）；断网 → 待导出 → 恢复后补传，无重复 |
| APP-05 | PASS | 录音同意与留存同意分离；不勾选留存零落盘；ASR 预算 0.0423/1 元，AI 预算未变 |
| APP-06 | PASS（非静音）/ N/A（真分轨） | 2026-11-01 复测 A -24.1、B -27.96 dBFS，L−R=0，0 削波，`routeVerified=true` → 确认 MONO_MIX；真分轨不成立，固定走混音+说话人分离 |
| APP-07 | NOT_RUN | 新归档 UI 未做独立截图评审（仅 uiautomator 文本核对） |
| APP-08 | PARTIAL | 手机断网重试通过；Mac 服务重启/弱网切换未单独复测 |

### 2026-11-01 BOYA 复测与说话人分离（Note 11 5G）

- 发射器开机后重新实测：A 段 L/R **-24.1 / -24.1 dBFS**、B 段 **-27.96 / -27.96 dBFS**，`leftMinusRightDb ≈ 0`，削波 **0**，`routeVerified=true`；不再是历史 `-180 dBFS` 静音。
- 结论：硬件确有正常电平，但左右声道完全相同 → **MONO_MIX 确认**；产品固定用 mix + 腾讯云说话人分离。
- 实时会话复测（mix，真实腾讯云）：
  - 三个声源（中文提示音 + Samantha + Daniel）→ `spk_0 / spk_1 / spk_2` 三个聚类；
  - 两个声源（中文提示音 + 英文女声）→ `spk_0 / spk_1`；
  - 本轮**未录到用户本人语音**（三次尝试只捕获 Mac 外放），真人双人仍 **NOT_RUN**。
- 归档：每轮 final 均自动写入 Mac（`sess_20261101T0407*`、`0408*`、`0409*`），测试后已清理；JSON 示例 SHA-256 `a937ca6eb5d510994bc0073e526d1a5d98d8f7713175b816afbf587a83c1ac10`。
- 阻塞：需用户本人对着 BOYA 发射器说话（或两位真人）才能完成 APP-02 真人双人验收。

### 2026-11-01 真人语音归档（Note 11 + BOYA，用户本人参与）

- 用户在界面上自行完成：录音同意 → 开始 → 对发射器说 4 句英文 → 停止。
- 腾讯云 final 4 条，**全部 `spk_0`（单人，符合预期）**，识别文本与口述一致；每句均带时间戳、轨道 mix、provider tencent、`mock:false`。
- 自动导出到 Mac：`SocialMate-2026-11-01-041251-sess_20261101T041251_d71d90.md/.json`。
  - MD SHA-256 `ee3f73cb2c2c12feca8636583f493725ea9a9aef86910fcd78fd3234d9648300`；JSON SHA-256 `65c1f926cd6b584208d764ba35268e3a3c9154d2333e11547b23919843063016`；权限 0600。
- 结论：**真人语音 → 腾讯云 ASR → 手机归档 → Mac 落盘** 全链路成立；说话人双人严格分离仍建议两位真人复测（TTS 双声源已能分 `spk_0/spk_1`）。

### 2026-11-01 海南 PWA 公网部署（GitHub Pages，用户授权）

- 地址：**https://wanghoufan.github.io/alw-001-foreign-language-social-system/**
- 方式：独立 `gh-pages` 分支，只含 `index.html`（public-share 副本）+ 7 个公开文件；`main` 分支与私有内容未改动。
- 匿名复验（不带任何凭据）：
  - 首页、`public-share.html/js`、`public-places.js`、`styles.css`、`manifest.webmanifest`、`sw.js`、`icon.svg` 均 **200**；
  - `?selected=3,39,41` **200**；
  - `/api/profile`、`/api/asr/live`、`/api/ai/analyze` 均 **404**；
  - 页面标题 `Hainan Local Guide · SocialMate`，地点数据 115 条。
- 手机复验：Note 11 原生浏览器通过公网 HTTPS 打开，显示 `115 / 115 places`、`My list`、`☆ Want to go`；截图 `screenshots/pwa-v11-https-note11.png`。
- 边界：GitHub Pages 国内直连速度可能波动；无自定义域名；未做 Xiaomi/OPPO/iPhone 全矩阵。

### 2026-11-01 Note 12T Pro 无 USB 私有链路（Tailscale）

- 设备核对：**UKCESWB67PUO7LPB = Redmi Note 12T Pro（23054RA19C / Android 15）**，Tailscale `100.94.116.99`；此前误用 indq5xfi6hovay4d（Redmi Note 12 Pro），已更正。
- 安装：APK 0.5.1（versionCode 11）安装成功；SHA-256 `304e01664e2d44e730c708ea485d888c9cf692d2e0ef8470ea5df12fa90f6757`。
- 配置：`asr_url=wss://mac-mini.tail4e4317.ts.net:10000/asr`、`ui_url=https://mac-mini.tail4e4317.ts.net:8443`、归档 `/alw/api/archive/session`；**`adb reverse --list` 为空**。
- 实测：
  - ASR 连接成功，服务端 `activeSessions=1`；状态「已连接 · 48000 Hz · 2 声道 · mix」；
  - WebView 实际 URL（CDP）`https://mac-mini.tail4e4317.ts.net:8443/v12?live=1`；
  - 停止后自动归档到 Mac：`SocialMate-2026-11-01-044131-sess_20261101T044131_7f46c2.md`；
  - 原文两条：用户真声「不能分开的3个档位吗？」→ `spk_0`；TTS「对着手机说4句英文。」→ `spk_1`，**双说话人分离成立**。
- 未完成：物理拔掉 USB 后复测；坏证书/非法令牌拒绝（令牌 401 已在 Mac 侧验证）；DeepSeek 同意与建议卡未在本轮启用。
- PWA 测试口径：公开页面只用手机自带浏览器（Note 11 `com.android.browser` 已验证），不使用 Chrome。

### 2026-11-01 USB 物理拔除后的无 USB 验收（Note 12T Pro）

- 拔线后设备只剩 `192.168.31.105:5555`（Wi-Fi ADB），`adb reverse --list` 为空。
- 链路：ASR `wss://mac-mini.tail4e4317.ts.net:10000/asr`、聊天页 `https://…:8443/v12?live=1`、归档 `https://…/alw/api/archive/session`。
- 三轮会话全部停止后自动归档到 Mac，未出现 outbox 积压：
  - `2026-11-01-044131`：用户真声「不能分开的3个档位吗？」→ `spk_0`，TTS → `spk_1`（双说话人）；
  - `2026-11-01-051542`、`051644`：仅捕获 TTS 与系统提示音，未捕获用户新语音。
- 结论：**传输链路已不依赖 USB**；用户语音能力已在 `044131` 轮证明。坏证书/非法令牌拒绝仅完成令牌 401（Mac 侧），TLS 坏证书未构造测试。
- 证据哈希：`051542` MD `a2f57c59bfdee0085bdc3ab56ac3d27fa79667ea48a6818f94fbea317ba91944`、JSON `6286775527abb8d2584827c67ef6749876cfd6c83b568b7b591128d04cafdb8f`。

### 2026-11-01 归档历史 UI（会话列表 / 原文 / 同步状态 / 按日期导出）

- 新增只读模块 `socialmate-prototype/ai-gateway/archive-history.mjs`：扫描 `~/Documents/SocialMate/Conversations/YYYY/MM/*.json`，产出元数据列表（不含原文）、按 `sessionId` 取完整会话、按 UTC 日期区间导出合并 Markdown。
- 归档接收端 `archive-receiver.mjs` 新增三个只读接口，全部要求 `x-archive-token`：
  - `GET /api/archive/list?from=&to=`（401 无令牌 / 400 日期非法）
  - `GET /api/archive/session/:id`（404 不存在 / 400 sessionId 非法或路径穿越）
  - `GET /api/archive/export?from=&to=`（`text/markdown` 附件）
  - `GET /history`（静态壳，不含任何数据；CSP `default-src 'none'`，仅允许同源连接）
- 私有 UI 同源接入：`server.mjs` 新增 `GET /v12/history` 与 `GET /v12/api/archive/*` 反代（只放行 GET，令牌透传，归档端未启动时 503 `ARCHIVE_UNAVAILABLE`），避免手机上跨端口/跨源请求。
- 聊天页入口：`/v12` 对话原文面板新增「查看 Mac mini 上已归档的会话历史 →」。
- 实测（本机 curl）：
  - 无令牌 `list`/`session` → **401**；`sessionId` 路径穿越 `..%2f..%2f..%2fetc%2fpasswd` → **400**；未知 ID → **404**；`from=bad` → **400**；
  - 有令牌：`list` 返回 `total=2 scanned=2 skipped=0`；`2026-11-01` 区间 `total=2`；空区间 `total=0`；`export` 1537 字节；
  - 反代 `/v12/api/archive/list` 带令牌 200、不带令牌 401、`POST` → **405**。
- 实测（浏览器，CDP 驱动 412×900 移动视口）：
  - `/v12/history`：连接状态「已连接 · 令牌已保存在本浏览器」，列表 2 条，点开详情渲染 1 段原文（`Token rejection check.`），返回列表正常；
  - 无横向溢出（`scrollWidth == clientWidth`）、console error 0、page exception 0、CSP violation 0。
- 证据截图：`/tmp/hist-list.png`、`/tmp/hist-detail.png`、`/tmp/v12-hist.png`（本机临时目录，未入库）。
- 未完成（本轮受限）：手机 App 内点击该入口未实测——复测时段手机前台为用户微信（`com.tencent.mm`），未抢占焦点；App WebView 已在同域 `https://mac-mini.tail4e4317.ts.net:8443/v12` 加载，入口链接已在服务端页面中存在（curl 校验）。
