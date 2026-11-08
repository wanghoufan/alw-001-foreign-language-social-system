# ALW-001 风险与红线

更新：2026-11-06

## V1.7 本机 origin / 本地真源

- 本机页面走 `http://127.0.0.1:<随机端口>`（同等安全 APK 本地 origin），不是 WebViewAssetLoader；必须保留 Host/Origin/随机 token 三校验，禁止改成 `0.0.0.0` 或固定端口对外监听。
- 本地页面与旧 Mac 页面是不同 origin，localStorage/sessionStorage 不共享；切换 `ui_mode` 前先导出本机备份，迁移完成前不得卸载旧包或清数据（`allowBackup=false`）。
- 公开 115 图片已打进 APK（211 张 webp，APK 约 54MB）；素材更新后必须重建，低存储设备先确认空间。
- `.smbak` 已用 AES-256-GCM 加密，口令由用户自设且不保存；忘记口令无法恢复，导出时必须提示。
- 云端薄网关未部署时 AI/TTS 返回 503，只影响功能按钮；不得把“本地资料可用”写成“外出完整可用”。
- `release/SocialMate-0.9.2-vc70-debug.apk` 是中间构建；以 `android-poc/app/build/outputs/apk/debug/app-debug.apk` 为准，SHA 未回读前不得引用。
- 本地 ASR 事件只走内存 SSE，partial 不落盘；final 归档仍必须遵守留存同意，不得因本机化而默认留存。
- **方案 2 手机直连（用户 2026-11-06 明确选择）是对「密钥只在服务端」的授权例外**：Key 只进 Android Keystore，禁止编译进 APK、写日志、进备份包或 git；手机 Root/丢失仍可能泄露，泄露后立即在厂商控制台换 Key。
- 手机直连的每日额度（DeepSeek 1 元/豆包 2 元）是本地粗估，不等于厂商账单；真实费用以厂商控制台为准，禁止据此宣传“费用已封顶”。
- 重负载（录音中）海南 Tab 已优化到 P95 205.3ms；不得把“单次 PASS”写成“所有设备/场景 PASS”。
- P1-5 已实测切后台 12 秒、锁屏 10 秒录音保持；但仍依赖用户允许后台运行，MIUI 省电策略/长时间后台可能杀掉，不能写成“任何机型/任意时长都保活”。
- 腾讯 ASR 直连没有本地额度闸；费用只能靠腾讯控制台预算/告警，禁止宣传“费用已封顶”。

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
- 软件介绍只读 V1.4；旧 `temp/intros-A～I` 多版本稿已清理，不得重新引入替换。

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
- V1.4 是唯一正式软件介绍主稿；不得用旧 `temp/intros-A～I` 多版本稿替换。
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
## N05 V1.5.2（2026-11-05 新增）

- **按需翻译是付费调用**：`POST /api/ai/translate` 走 DeepSeek 1 元账本；必须带 `consent:true`，一次约 0.0003 元，剩余 ≤0.01 元返回 402。前端只在点「翻译」时逐句调用并缓存，不得改成批量预翻译；不得用词典/模板拼中文冒充。
- **V1.5.2 录音是 TTS 回环**：Note 11 5G 的 6 段 final 来自系统 TTS 经扬声器回环（SYNTHETIC），只证明链路与归档一致；真人 30 分钟、蜂窝切换、来电/耳机仍 NOT_RUN，不得写成真人验收。
- **归档尾部已验证但依赖上游 ended**：真机 6/6、1/1、201、pending 0；若 P066 上游不发 `session/ended`，仍会走 3s 超时并可能丢尾部 final，需保留 `stop wait ended=...` 日志。
- **分享卡英文长度**：地点把 `special_en` 与 `en` 去重后拼接，长句可达 500+ 字符；抽屉可滚动，但不要在小屏改成截断后当成完整句子朗读。
- **原资料页同 Activity 内视图**：`S.v152.view='origin'` 不重建会话；期间 final 只进数据不进 DOM，返回后一次性渲染，避免打断图片滚动。
- **沉浸态与原资料页共用 `sm-immersive`**：`smBack` 退出顺序为 停止弹层 → 分享卡 → 菜单 → 原资料 → 退全屏；改动顺序会导致返回键一次退两层。
- **沉浸高度不能用 `100dvh` 单条**：真机 WebView 不支持 dvh 且会保留“最后一条”无效声明，使 `height` 回落 auto、建议区撑到 976px；必须先用 `100vh`，再用 `@supports(height:100dvh)` 覆盖。
- **N05 控制栏吸顶**：`.n05controls` 用 `position:sticky; top:56px`（drawerhead 高度），滚动后固定在顶部；不要改回普通流式，否则第 2 段后无法暂停/停止。
- **暂停/继续只走 Web Audio**：豆包播放时原生 `pause` 会回 `TTS_NOT_PLAYING`；必须 `AudioContext.suspend()/resume()`，原生仅作回退。
- **中文整理写回有备份**：只改 `PrivatePlaces/.../records/rec-*.json` 的 `cnSentences`，`sourceText`/英文不变；写前备份 `.bak-20261105-cn`，记录 revision 递增。
- **对照区不要平铺重复**：`sourceText` 与 `cnSentences` 内容高度重合，必须把原文折叠；中文只渲染一次，末尾短残句标「（原话未完）」，不要拼成完整句或让 A/B 各翻译一遍。英 B 默认折叠。
- **GPT 练习判定只认一种自然表达**：中文考短语或整段时，说出一种对得上大意的英文即算掌握；英文 A/B、目标短语只作参考，不得要求两种都说或强行使用低频复杂表达（如 `on the edge of the lake`）。
- **统一音色默认 Tina**：豆包中文/中英混音色可读英文，英文音色（Tim/Dacey/Stokie）读中文会返回空音频；设置页只保留一个「朗读音色」下拉且只列小何/云舟/Tina（可读中英），`smDoubaoSpeak` 不按语言切换 voice；旧 localStorage 若是 Tim/Dacey/Stokie 自动回退 Tina。
- **切换/停止必须 stop 旧 AudioBufferSource**：否则连续点击会多个音频叠加；`smPlayBuffer` 与 `smqCancel/smqFail/smqFinish` 都要 `smStopAudio()`，旧队列 await 后检查 `SMQ` 再续播。
- **豆包必须用 Web Audio 连续播放**：`<audio>` 每次新建元素时，WebView autoplay 只允许首次手势，第二项起 `play()` 被 blocked 并回退原生 TTS。必须用 `AudioContext`（首次点击 resume）+ `BufferSource`，播放 Promise 仍带「时长+3s、最少 8s」超时。验收看 `__ttsEngineLog`，不能只看 `speechSynthesis`（App 内不存在）。
- **队列重启要忽略旧 stopped**：`startStudyQueue` 先 `ttsStop()` 再建新队列，旧 `stopped` 回调会把新队列误判「被系统中断」；启动后 1.5s 内忽略 `stopped`。
- **朗读按钮不得复用 `data-lang`**：N05 的「听词组/中文/英文 A/B」曾复用 `data-lang`，被界面语言开关先命中，表现为切语言或不播放；必须用 `data-tts-lang`。新增朗读按钮同样处理。
- **系统语音选项走原生桥**：设置「朗读引擎=系统语音」时 App WebView 没有 `window.speechSynthesis`，由原生 TTS 前台服务播放；不要在页面判断 `speechSynthesis` 是否存在。
- **豆包 TTS 鉴权是 `X-Api-Key`**：控制台给的是 API Key，不是 AppID+Access Token；旧组合返回 401 `45000010`，`volc.service_type.10035` 返回 403 `45000030`，只有 `X-Api-Key` + `seed-tts-2.0` 为 200。密钥只进 `ai-gateway/.env` 的 `SM_DOUBAO_API_KEY`。
- **收藏是 toggle**：`saveFavorite()` 先确保 `S.fav.items` 已加载，命中同句则删除；人物页进入时预加载收藏，按钮 ☆/★ 由它决定。服务端仍按英文去重，不会重复插入。
- **听本段与普通朗读共用 `smDoubaoSpeak`**：N05 队列的 `ttsSpeakItem` 先豆包，成功直接 `smqAdvance`；豆包失败才调原生，避免等待原生回调超时。
- **TTS 记账只能一次**：`synthesize()` 已在新合成时记账，路由层不得再 `recordBilling()`；缓存命中不收费。豆包 3 元/万字符，1 元预算约 3333 字符。
- **豆包朗读会外发文本**：用户已明确要求用豆包替换系统语音，`S.v152.ttsConsent` 默认 `true`；App WebView 会取消 `window.confirm`，不要再依赖它做首次确认。失败回退系统 TTS，日志只记错误码，不记文本与密钥。
- **人物紧凑样式限定 `.pcompact`**：抽屉被其他详情共用，不要在 `.drawerbody` 全局压字号/间距；会话记录用 `<details>` 默认折叠，展开后仍走原链接。
- **人物档案聚合只读**：`profileSections` 从 `00-profile.md` 派生，不回写；撤回仍按 `factId` 走原接口，人工段落只显示「我补充」且无撤回按钮。章节顺序来自主档 `#` 标题，新增章节无需改前端。
- **`v152-compact` 必须是独立 `<style>`**：上一块 `v151-realuse` 的 `</style>` 丢失时，整段 v152 CSS 被吞进上一块，样式虽多数生效但沉浸高度选择器异常；改动样式块后先确认 `document.querySelectorAll('style')` 中有 `v152-compact`。
## N05 V1.5.2 增补 · 预算与偏好（2026-11-05 下午）

- **额度不足不得静默换声**：豆包 `TTS_BUDGET_EXHAUSTED` / `RATE_LIMITED` 必须停止并给提示，禁止回退系统 TTS（用户已要求统一豆包声线）；只有设置里显式选「系统语音」才走原生。
- **预算上限不得擅改**：当前 10 元（2026-11-05 用户同意由 1 元上调）；本地账本是估算，真实账单以火山控制台为准。
- **偏好不能只靠 localStorage**：局域网与 Tailscale 是两个源，音色重置会改缓存键并触发重复计费；必须走 `/v12/api/prefs`，文件 `SocialMate-Data/Prefs/ui.json`（已 gitignore）。
- **prefs 写接口只认白名单**：只接受三个音色 ID 与 `doubao|system`；新增字段先加服务端白名单，不得透传任意 JSON。
- **项目级 skill 强制**：凡改 WebView 连续音频（朗读队列、播放/暂停、控制栏），必须先调 `webview-media-control-guard-local-zh` 并出三项回执。
## 缓存与弱网（2026-11-05 新增）

- **不要改回 `no-store`**：`/v12` 是 582KB 单页，`no-store` 会让离开 WiFi 的冷启动每次重下整页；当前 `no-cache` + ETag 已保证不拿旧页面，改完好立即生效（内容变 → ETag 变 → 200）。
- **若改强缓存必须加版本穿透**：任何 `max-age` 都必须配合 `?v=<build>`，否则真机 WebView 会长期拿旧 JS（本轮前踩过）。
- **线上地点缓存只读展示**：`sm.place.cache.v1.*` 是展示副本，写操作仍必须走服务端；不得把缓存当权威数据或据此判断保存成功。
- **非 WiFi 自适应不是万能**：自动切 Tailscale 依赖手机已登录并开启 Tailscale；不可达时仍会失败，界面应给出提示，不得写成「离网可用」。
- **缓存里可能含私有内容**：地点详情含游玩记录与原文，只存本机 WebView localStorage，不进公开 PWA；清缓存会丢展示副本，但服务端数据不受影响。
## V1.6 活资料库（2026-11-05 新增）

- **卡片写接口必须双闸**：`peopleToken` + `requireWriteAuth`（同源 + 一次性写票），不得新增无令牌写入口。
- **删除只做软删**：进 `trash/`，列表接口默认不返回；硬删需人工处理，代码里不提供批量清空。
- **覆盖层不得改源数据**：用户改写 115 地点/内置软件只落 `overrides/<kind>-<id>.json`；`places-115.json` 与 `D.apps` 基线保持只读。
- **媒体校验在服务端**：前端压缩只是体验优化，服务端仍必须校验 base64、magic bytes、边长与 6MB 上限。
- **卡片模块在 IIFE 内**：外部脚本只能调 `window.__smCards`；直接引用函数名会报 `is not defined`（本轮已踩过）。
- **删除确认不能用 `confirm`**：App WebView 会自动取消 `window.confirm`，必须用页内二次确认按钮。
- **图片显示要带令牌**：`/v12/media/*` 需 `x-archive-token`，`<img src>` 直链会 401，必须 fetch 成 blob URL。
- **AI 草稿不是原文**：`draft-en` 只产出草稿，不得自动覆盖用户英文或当成用户已确认内容。
