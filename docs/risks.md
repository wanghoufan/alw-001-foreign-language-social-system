# ALW-001 风险与红线

更新：2026-11-01

## 并行工作区

- `socialmate-prototype/` 由另一智能体维护；V0.4.0 只改了其中的 `ai-gateway/`，其他文件不得修改、覆盖或 reset/clean。
- 工作区可能同时有其他智能体的未提交改动；提交前核对 diff，禁止强行覆盖。
- 组合服务只绑 `127.0.0.1`；真机依赖 `adb reverse`，无线 ADB 与 BOYA 同时占用 USB-C 时需确认映射仍在。

## 设备与端口

- 本机 Docker 容器 `keep-fitness` 占用 8787；不要按端口盲杀进程，ASR 桥接使用 8790。清理前先用 `lsof` 看 `COMMAND`。
- 不要停/重启正式 Docker（`socialmate` 等）；不得动 `DockerData` / `DockerBackups` / 其他服务。
- MIUI 的 `adb install` 可能报 `INSTALL_FAILED_USER_RESTRICTED`；需用户开「通过 USB 安装 / USB 调试（安全设置）」，或改用 `pm install-create/write/commit`；不得擅自改系统设置。
- `adb reverse` 用完移除；一台设备只保留一个 logcat；不要用 `adb logcat -d`。

## 双麦

- 当前 BOYA mini 实测 `MONO_MIX`（2026-11-01 复测 A -24.1 / B -27.96 dBFS，L−R=0，0 削波）；USB 声明 stereo ≠ 真分轨。不得把 stereo 声明写成“分轨已证明”。
- 2026-11-01 实测接收器枚举、路由均正常，但 A/B 采集 `L/R -180 dBFS`；先查发射器开机/配对/静音，不要先改音频代码，也不得把静音写成双麦通过。
- 立体声模式在 BOYA Central App；接收器没有 M/S 实体键。切换后必须重跑 A/B 并试听串音。
- 输入削波约 3.4%–5.7%；正式 ASR 前降低增益或拉开距离。
- 结论只对当前手机 + 接收器 + 固件有效，不代表所有博雅一拖二。

## ASR

- 腾讯云真实握手/英文转写已验证；MOCK 仍不是 ASR。说话人 `spk_N` 会随环境声源漂移，不能把 ID 直接映射为真实身份。
- 本模块按官方 ASR v2 文档实现；`647/131297` 的 “v3” 提示实际是 TRTC 的另一条接入（`asr.cloud-rtc.com/asr/v2`），不是 ASR 产品的 v3；新账号仍以控制台实际接口为准，不要盲改协议。
- 官方 v2 无 `confidence`；不得伪造置信度。
- 手机端不得出现 SecretId/SecretKey；不得把密钥写进 APK、仓库或日志。
- `NODE_TLS_REJECT_UNAUTHORIZED=0` 由 CodeArts agent-kernel 注入；不得设置该值、不得用 `-k` 或跳过证书校验。`service-v040.sh` 启动前剥离继承值，`live-server.mjs` 对 env 文件中的 `=0` fail-closed。
- 腾讯云 ASR 上限 1 元、按 1 元/小时估算；剩余 ≤0.01 元拒绝新会话。不得自行改大或清空账本；本地估算不等于云账单。
- 混音说话人分离在重叠、相似音色、背景提示音下可能标错或新增 ID；`spk_N` 只作聚类，不保证 A/B 对应。
- 真实环境噪声是正常输入，不要求为验收清空环境；严格 A/B 准确率只作可选实验指标。

## 内容建议层

- 建议层是 BM25 确定性检索，不是大模型语义理解；不要把模板问题说成 AI 生成。
- 个人故事文件当前为空；只加载 `confirmed:true` 的英文条目，不得自动抓取或编造私人内容。
- 检索可能错配；已做精确标题优先与主导领域收敛，但仍需人工判断。
- 软件介绍只读 V1.4；禁止读取 `temp/intros-A～I`。

## 本机档案

- 只接受用户显式确认后的写入：`PUT /api/profile` 必须 `confirm:true`，缺失即 400；不得把自动推断写成档案事实。
- 存储固定在 `SocialMate-Data/Profile/`（已 gitignore），不入公开仓库、不上传云端；`current.json` 保持 0600。
- 字段白名单只留 stories/people；不要把主题、显示设置或未知浏览器状态带进档案。
- 本机档案不等于正式 `People/*.md`：未获确认前不自动改写正式人物目录。

## 会话归档

- 只收 `final` 段；`interim` 不得持久化，也不能被当成原文。
- 留存并导出必须单独同意；录音同意不等于留存同意，缺 `consent.retention` 直接拒绝。
- 原文逐字保存，识别错误也保留；AI 内容必须放在独立小节，不得覆盖原文。
- 默认不保存 WAV/PCM；需要留音频必须另做同意与设计。
- 归档目录（默认 `~/Documents/SocialMate/Conversations`）不入 Git、不进公开静态路径。
- **不得开放未鉴权的写入口**：网络接收必须位于鉴权 + 加密入口之后；ADB reverse 只算开发路径。
- `sessionId` 只允许 `[A-Za-z0-9_-]{8,64}`，文件名由时间与会话 ID 派生，禁止路径拼接。

## 公开 PWA 隔离

- 公开包只允许 `public-share.html/js`、`public-places.js`、`styles.css`、`manifest.webmanifest`、`sw.js`、`icon.svg`；打包脚本命中私有关键字即失败。
- 公开站不得出现五 Tab、软件作品集、关于我、人物、聊天、字幕、AI、`/api/*`、密钥或私有 Mac 端点。
- 分享链接只含地点 ID；不收集朋友身份/位置，不上传选择到服务器。
- 未获用户授权不部署；部署前先确认托管目录只有白名单文件。

## 归档接收端

- `SM_ARCHIVE_TOKEN` 必填且 ≥24 字符，缺失直接拒绝启动；令牌只存 `.local/`（0600），不得写入 APK 或仓库。
- 只绑 `127.0.0.1`，外部访问只能经 Tailscale Serve（tailnet）或 adb reverse；不得开放公网。
- 单请求 ≤512KB；拒绝未勾选留存、interim、空原文、路径穿越与 revision 冲突。
- 日志只记状态与会话 ID 前缀，不记录转写正文。

## 隐私与内容

- 录音需双方知情同意；提供停止与删除；未核实权限前不开放公共服务。
- 原始 WAV 含本人语音，放 `.local/`（已 gitignore），不提交、不上传、不放进公开 PWA。
- V1.4 是唯一正式软件介绍主稿；禁止用 `temp/intros-A～I` 替换。
- 不把仅代码完成 / MOCK / 合成语音 / 编译通过写成真人验收通过。
- DeepSeek 仅在用户授权的 1 元累计额度内自动调用；超限不得绕过预算闸或改大上限。预算 ledger 落 `.local/`，不要提交。
- Note 11 为 **0.6.0（15）**；Note 12T 当前未安装本项目 APK。两台设备操作必须显式 serial，不能共用 reverse/会话。
- `ADB_SERIAL` 对 Note 11 必须用 mDNS 名 `adb-REDACTED-SERIAL._adb-tls-connect._tcp`，写型号 `21091116AC` 会被脚本判成「非授权设备」。
- 用改写 App `shared_prefs` 的方式验证归档补传前，必须 `pidof` 确认进程已退出：进程存活会沿用内存里的旧配置，合成会话可能被写进**真实**归档目录（本轮发生过一次，已删并还原）。
- 手机 UI 是「原生工具栏 + WebView」两层：只改 Web 不会更新原生资源；改 native（图标/启动/文案）必须重建 APK 并 `install -r`。

## N03b / N04 新增

- 3 个地点（25 席地而坐 / 26 手帐咖啡好天气 / 69 三婆与海）用的是**同类型借用实景**，已标「示意」；不得当作该地点真实照片对外。
- 原生面板仍有两条动态文案（留存提示、归档状态）与「本轮原文与复盘」为中文，切英文时中英混排。
- 演示数据默认可见：任何情况下都必须带「演示数据」标识，且清除只作用于 `SocialMate-Data/Demo/`。
- `/tmp/icons` 的三个图标方案只是预览，未做成自适应图标；当前发布图标为单气泡版本。

## V1.3 新增

- 旧长期 `archive-token` 仍是 8781 校验与配对签名源，未轮换；轮换需可重启窗口。
- 手机未配对时所有写操作 fail closed，用户看到的是「未配对」而非报错——首配属 Human Gate（Mac 取码 + 手机输入一次）。
- T2 的 ASR 输入为合成音频（SYNTHETIC），真实 ASR 标识 `mock:false`；不得表述为真人录音验收。

## V1.3 T5（2026-11-02 验收发现）

- **写票一次性 × 客户端缓存**：真机上「编辑→撤回→批量」连续操作时，第二次写会被 403（提示“需要写授权票”）。已修为发出即作废缓存；若将来改回缓存，必须同时改服务端语义，否则出现“点两次才生效”的假故障。
- **演示专属问题质量**：种子数据把「来自XX / 职业：未注明」也写成事实，按时间排序会占满两条专属问题。已改为对话事实优先；新增种子字段时不要让「档案元数据」抢占问题位。
- **归档地址与出行模式耦合**：`archive_url` 与「本机 USB / 外出模式」分开存储，切回本机模式后若旧地址仍在，会持续 `UnknownHostException`（本轮真机复现），表现为“已保存但传不上去”。切换模式后应校验地址并触发一次补传。
- 手机 Tailscale 在 V1.3 时仍未授权：所有无 USB 的真机验收（T4/T5）只能算 PARTIAL；2026-11-04 T3 已登录并完成断 Wi-Fi 实测，历史结论不改写。
- 本轮 ASR 输入为合成音频（SYNTHETIC），`mock:false` 只证明链路非模拟，不等于真人录音验收。

## N05 V1.1（2026-11-02 新增）

- TTS 倍速仅 PARTIAL：0.75× 与 1.0× 实测时长仅差 6.7%，小米引擎对 `setSpeechRate` 响应弱；不得写成「倍速已通过」。
- 有线耳机插拔 NOT_RUN（现场无耳机）；扬声器下切段停读/循环自停通过，不等于耳机路由通过。
- UI 验收 ②–⑦ 因 CodeArts 会话权限中断未跑完，真机 4 张截图未拍；S5 只到「代码已接入 + ① 补记 PASS」，不得表述为前端全量验收。
- CodeArts 无人值守会话里，脚本触发需交互授权的命令会被 `user rejected permission` 中断整条链路，不是脚本失败；长验收须拆分段或改本地执行。
- 演示管理默认关闭，演示读写只落 `SocialMate-Data/Demo/`；任何情况下不得写入真实 People。

## N05 V1.2（2026-11-03 新增）

- **AI 分段会外发原文**：勾选「AI 整理」时整段原文发往 DeepSeek（云端）。必须由用户显式勾选、走 1 元账本闸、失败即降级为规则分段；不得默认开启，也不得把「AI 已分段」写成「原文已脱敏」。
- **AI 产出的英文不是用户原话**：段 18 的英文 B、段 2/3/18 的表达为模型补写并标注「待确认」；未经用户逐条确认前，不得当作实测文稿或对外展示素材。
- **私有地点不进公开 PWA**：`pv-*` 地点只落本机 `SocialMate-Data/PrivatePlaces/`，`places-115.json` 与 GitHub Pages 站点均不含它（这是设计目标，不是缺陷）；对外只能说「本机私有」，不能说「已上墙」。
- **T5 两项 NOT_RUN 不得写成通过**：20 次循环实播（UI 无该档位）、两份复盘不覆盖，均未执行。
- **系统语音 ≠ 音质验收**：0.8.6 起默认本机系统 TTS，真机只证明「点得响、能读完」；音色、停顿、中英混读质量仍属 Human Gate 待听项。
- 第二台 Android 14 机安装被 MIUI 拦（`INSTALL_FAILED_USER_RESTRICTED`），新装默认 provider 未验证；不得据 Note 11 的升级安装推断新装表现。

## N05 V1.2 收尾与自动归档（2026-11-03 追加）

- **P016 的 18791 接收器是明文无鉴权**：局域网内任何主机都能写目录、同名覆盖。只可做只读兼容接收与索引，**不得**把它扩成私人聊天/个人档案的统一入口；修复需 P016 独立项目批准，ALW-001 不越权改。
- **P016 失败仍标导出完成**（`pushToMac()` 返回值被忽略）：Mac 未落地时手机可能不再补传；本轮不据此宣称端到端自动同步 PASS，22:00 自然触发一律 NOT_RUN 直到真实观测。
- **DeepSeek 上游 503 属外部依赖**：`AI_UNAVAILABLE / PROVIDER_ERROR` 时只走手工切句与规则整理；不得把降级结果写成 AI 已完成。上游恢复后须重跑 ①。
- **剪贴板桥只服务本页**：`copyToClipboard` / `clipboardMatches` 仅对白名单私有页生效，只写/比对传入的 Prompt，不读取其它剪贴板内容；不得扩展成通用剪贴板读取接口。
- **学习归档默认不外发**：所有条目 `consentScope=local_only`、`awaiting_consent`；未获逐类授权不得调用云端翻译/归纳。索引只存路径引用与哈希，原始文件留在各业务目录。
- **旧复盘正文回显**：聚合接口返回 500 字 `excerpt`，须走归档令牌；不得把 `rawReport` 全量放进无鉴权响应，也不得在公开 PWA 展示。
- **桌面预览的无桥提示仍待定位**：自动化未检出 `#drawerbody .n05warn`（面板已渲染 `n05tts`）；真机有原生桥不受影响，但不得据此宣称「桌面降级提示已验证」。

## N05 V1.4（2026-11-04 新增）

- **前台服务只能服务朗读**：`TtsPlaybackService` 声明 `foregroundServiceType=mediaPlayback`，只由用户点朗读显式启动；不得改造成后台录音、开机自启或常驻监听，也不得为「不断播」把队列塞回网页。
- **队列所有权在原生**：网页只下发播放计划。任何新增播放需求必须走 `startQueue`；绕过它直接在页面里起第二条队列，会出现两路声音同时播（V1.3 的 `onStop` 停播语义已按「有活动队列则不 stop」调整，改动前先读 HANDOFF §1.1）。
- **段类型必须按 lang 推导**：`segmentOfLang(lang)` 决定声线与缓存键。按 `kind` 自行映射会把中文词组交给 en-US 引擎（本轮真机已复现并修复），不要为了「看起来更语义化」改回去。
- **`data-lang` 是界面语言专用属性**：学习页朗读按钮用 `data-tts-lang`。历史上两者撞名导致点「听词组」弹出「显示与阅读设置」并写坏 `SAV.lang`；新增按钮不要再借用 `data-lang`。
- **通知栏与锁屏不得出现私人文本**：只显示轮次与序号；不得加地点名、原文片段、人物名或被朗读的句子。
- **BG04 仍无真实证据**：来电/耳机拔出/蓝牙断连路径已实现（暂停且不自动恢复），但现场无耳机、无法造来电，`AUDIO_BECOMING_NOISY` 是保护广播无法 adb 触发。不得据代码阅读写成 PASS。
- **Mac 归档守护的位置**：`com.alw.learning-archive-watch` 必须留在 `~/Library/LaunchAgents/`（launchd 硬要求），日志落项目 `.local/learning-archive/`。改动 node 路径要保留 fallback，否则系统升级后静默失效。
- **fixture 与真实记录必须可区分**：QA 样本一律带 `qa_fixture` 标记或文件名约定，验证完立即 `--remove` + 删文件。本轮曾有一条 e2e 样本混进生产索引（thought 43→44），已清理还原为 85 条。
- **P01602 不是「代码看起来没问题」就能 PASS**：必须有真机 22:00 自然触发 + 鉴权落盘 + 补传证据（见 `P016-TRANSFER.md` E1–E5）。
- **手机 Tailscale 未登录**：`com.tailscale.ipn` 已安装但无 VPN 网络，所有脱 USB 验收一律 NOT_RUN；不得用 `adb reverse` 或 Mac 侧 curl 成功替代。
## T3 Tailscale 外出（2026-11-04 新增）

- 手机 Tailscale 已登录：Note 12T Pro `100.94.116.99`、Note 12 Pro `100.91.121.33`；断 Wi-Fi + 蜂窝实测 PASS（VPN 底层 `MOBILE[NR]`、页面/SSE 真实加载、经 Tailnet 无线 ADB 安装成功）。不得再用「未登录」解释脱 USB 失败。
- **不要恢复固定 host 白名单**：页面 `connectLiveASR()` / `requestRealAI()` 只认 `127.0.0.1:8791` 时，Tailscale `https://…:8443` 下字幕与 AI 永远不连（本轮 BLOCKER 已修）。判断用 `HTTP_UI` 协议，不绑定 host。
- **归档写入是授权前置**：设备未配对时页面无令牌，`/v12/api/archive/*` 返回 401；这是 fail-closed 设计，不得写成 Tailscale 通路失败。配对仍需 Mac 本机取码 + 手机输入一次。
- **ASR 10000 端口没有握手鉴权**：只靠 tailnet ACL；同 tailnet 设备/手机上任意网页可开流消耗 ASR 预算。不要把它当公网入口，也不要放宽 ACL。
- **原生 ASR 无自动重连**：`AsrClient.setConnectionLostTimeout(0)` 且 `awaitOpen` 仅 4s；Wi-Fi→蜂窝切换后可能半开连接不可见。本轮未修，不得据一次连接成功写成「切网无感」。
- **蜂窝下原生录音未重新开麦**：本轮只验证 Wi-Fi Tailscale `activeSessions=1` 与蜂窝页面/SSE；不得写成「蜂窝原生录音已 PASS」。

## P066 流式 / V1.5（2026-11-04 新增）

- **P066 final 修复只在本机工作树**：`server/asr/stream-relay.mjs` 的 `sentence_type=1` 判定与 2500ms 收尾是 ALW 侧手工修的；P066 若从别的 checkout 重新部署，会再次出现「只有 interim、没有 final」。备份 `stream-relay.mjs.bak-20261104-finalfix` 必须随 P066 部署保留，并把 final 数量写进 P066 验收。
- **401/403 已 PASS，402/300s/撤销仍 NOT_RUN**：不得把「连接成功」写成「预算/时长/撤销边界通过」。
- **V1.5 阅读冻结是产品行为**：`S.suggFreeze` 置位后新 final 只更新字幕和「有新的接话建议」，用户不点不刷新。徽标入口必须始终可点，否则会被误判为建议不更新。
- **USB 麦可能静默全零**：`AudioInputs` 有 200ms 信号探测，但用户换机/换接收器后仍可能 all-zero；录音前先看「正在听」与实际 final，不能只看 `activeSessions=1`。
## N05 V1.5.1（2026-11-04 新增）

- **ASR 握手鉴权是默认必选**：真实模式未注入 `authVerify` 时 fail-closed（401 `AUTH_NOT_CONFIGURED`）；只有组合服务 `live-server.mjs` 已接入 `pairing.verifyToken`。standalone `bin/asr-bridge.js` 跑真实上游必须另注入验签器或显式 `ASR_WS_AUTH=off`，不得为“能连上”长期关闭。
- **握手令牌只走头**：原生客户端 `x-asr-token`，不进 URL、日志、页面；Tailscale Serve 反代下 `remoteAddress` 恒为 127.0.0.1，单 IP 限流会退化为全局桶，不信任 `x-forwarded-for`。
- **TTS 自测入口只在 debug**：release 已 `exported=false` 且忽略 adb 命令；今后 adb 听测只能用 debug 包。`remote_base` 只允许 loopback/RFC1918/`*.ts.net`，`socialmate-config.ui_url` 未加同规则（避免误伤既有配置，需另授权）。
- **401 只刷新一次**：`SessionArchive` 对 401 刷新一次并重试一次，403 不刷新；不得改回“无限刷新”或“401 直接放弃”。
- **断线重连已验证，但有边界**：真机停服务后客户端能重连并继续字幕；阻断端口时 3 次失败会停录且显示「已结束 · 可复盘」。**Wi-Fi↔蜂窝真实切换仍 NOT_RUN**（无线 ADB 会随切网断开），不得写成“切网恢复 PASS”。
- **TTS 回环 ≠ 真人录音**：本轮真机 10 条 final 来源是手机系统 TTS 经扬声器回环（SYNTHETIC_TTS_LOOPBACK），只能证明链路通，不是面对面验收。
- **关联资料仍可能来自本地演示故事**：聊天页「关于我 · 我来自海口」来自页面本地 `stories`，不是 `Profile/current.json` 已确认事实；真机使用前需用户确认或清理，不能当作已核实自我事实。
- **T2 QA 假端已收尾**：401 验证用的临时 8781 假端（只回 401/201、不写目录）已停止，真实 `archive-service.sh` 已恢复；设备内 QA fixture 已删除。若再复跑 401 实验，必须同样先停假端再恢复真实端，并核对 `~/Documents/SocialMate/Conversations` 无 `qa_` 文件。
