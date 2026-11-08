# Changelog

## 2026-11-07 · V1.7 R3 Note 12T Pro 蜂窝实用性（0.9.2 / 70 未变，PARTIAL）

1. **费用闸**：新增 `AsrBudget`（30 分钟/日，本机估算）；真机 6.8 分钟录音后 `asr.used_ms=407722`，`stopStreaming` 只结算一次。
2. **300 秒自动续接**：`rolloverClients` 在 300 秒边界关闭旧会话、新建同 track 会话并延续时间轴；实测连续 6.8 分钟 `isRecording=true`，无错误、未被迫停止。
3. **备份含原文**：`LocalBackup` 打包/恢复 `archive/exported`；导出 `SocialMate-backup-20261107-0012.smbak` 36,219B，解密 ZIP 含 27 条。
4. **导入冲突语义**：`LocalStore.importBackup` 返回 `conflicts`，同 ID 不覆盖；`POST /v12/api/local/import-file` 实测 `imported 2 / archive 27 / conflicts 8`。
5. **导出路径**：Android 10+ 直接写 `MediaStore.Downloads`，绕开 MIUI DocumentsUI 保存面板不返回。
6. **未关联人物录音**：`startRecording` 不再强制选人物；未选时弹确认，选择「不关联开始录音」后直接录音，字幕不写入人物档案。
7. **LAN 安全**：`LocalSync.normalizeBase` 拒绝普通 LAN 明文 HTTP，仅 HTTPS/回环/Tailscale；`lan-net.isTailscaleIp` 允许 `100.64/10`；LAN 失败回退 Tailscale。
8. **结论**：A01/A02/A07/A09/A10 PASS，A03/A04/A06/A08 PARTIAL；真人字幕、豆包 3 段听音、T4 实景未完成，**不得标 DONE**。证据 `docs/plan/ALW001-N05-V1.7-R3/STATUS-20261107.md`。

## 2026-11-06 · V1.7 R2 本机 origin + SQLite 本地真源（**0.9.2 / 70**，PARTIAL）

1. **C0 盘点**：新增 `docs/plan/ALW001-N05-V1.7-R2/` 四份矩阵：真相源、前端 52 个 URL/37 个桥方法分类、可逆迁移与回滚、风险 18 条（高 6 / 中 9 / 低 3）。
2. **C1 首屏脱 Mac**：新增 `LocalServer`（127.0.0.1 随机端口、Host/Origin/随机 token 校验、APK assets 提供 `/v12`）；`AsrActivity` 启动改为「起本地 origin → 立刻五 Tab」，LAN 探测仅后台更新 ASR/归档地址，不再重建界面；Mac 地址只用于配对、令牌、归档、ASR、同步。
3. **C2 本地真源**：新增 `LocalStore`（SQLite schema 1：people/cards/card_media/overrides/favorites/private_places/place_records/practice_reports/prefs/profile/manual_drafts/sync_log）与 `LocalSegments`（移植句数守恒/逐字回查/全文复原）；新增 `/v12/api/*` 本地路由与 `/api/profile`、`/v12/history`。
4. **迁移**：`scripts/v17-export-migration-backup.mjs` 从 8791 只读导出（不含密钥/令牌/会话原文），计数 people 8 / cards 1 / favorites 1 / pv 1 / records 41 / practice 38 / media 3；手机 `files/migration/backup.json` 一次性导入。
5. **真机断网**：WiFi/数据关闭、Tailscale 不可用、8790/8791/8781/8782 停止、`adb reverse` 清除后冷启动 `TotalTime 666ms`、DOM 363ms；五 Tab/people 8/fav 1/海南 116/地点 36/搜索 1/116/卡片 CRUD（建→改 revision 2→软删→恢复→删）全通过；截图 5 张见 V1.7 evidence。
6. **C3 备份实测**：设置页导出 → SAF 保存 → `SocialMate-backup-20261106-0739.smbak.zip` 39,802B（backup.json + 3 张 JPG）；删除收藏后导入恢复 `imported 41 / media 3 / favorites 1`。MIUI 选择器点选文件不返回，补 `POST /v12/api/local/import-file` 内部投递入口。ZIP 未加密、LAN 同步未实现。
7. **C4 云网关**：`cloud-gateway/` 33 项 node:test 通过；未部署。
8. **修复**：`readAllBytes` 在 Android 不存在；prefs 字符串未按 JSON 存导致备份接口断开；媒体索引未含迁移图片；WebView 预连接占满 4 线程 + 15s 超时导致详情卡「正在读取」；构建改 Gradle 8.14.3 + `~/.gradle-alw001` + `--offline`。
9. **未完成**：4G/5G 真实 AI/ASR/TTS、300s、393×852、深色/拍照、P50/P95、备份加密、LAN 同步。**V1.7 不得标 DONE**。
10. **方案 2 手机直连（用户选择）**：设置页「云端 Key（仅本机）」+ `CloudKeys`（Android Keystore AES-256-GCM）+ `DirectCloud`（DeepSeek 翻译/草稿/建议、豆包 TTS）+ **腾讯 ASR 直连**（`TencentAsrSign` HMAC-SHA1 + `TencentAsrClient` wss v2 + `Pcm16` 16k/mono 重采样）+ 每日额度（DeepSeek 1 元/豆包 2 元，402 超额）；优先级「手机 Key → 云网关 → 503 / Mac 中继」。假 Key 已验证请求到达厂商（DeepSeek 401→403、豆包 401/45000010→403、腾讯 WS 被拒触发重连）；真实 Key 待用户录入。Key 不进 APK/git/备份/日志。
11. **输入法与测试**：Key 输入框从 `type="password"` 改为 `type="text"` + `-webkit-text-security:disc`，解决 MIUI 强制小米安全键盘、微信输入法不可用；DeepSeek/豆包/腾讯每项新增「测试通联」（腾讯只握手不发音频），无 Key 不发请求。覆盖安装 `install -r` 实测 Key 保留。
12. **C3 备份加密**：`.smbak` = `SMBK1` + salt16 + iv12 + AES-256-GCM；PBKDF2WithHmacSHA256 120000；导出先设口令（至少 6 位），导入自动识别加密/旧 ZIP 并提示口令；口令不存储。真机验证：导出 39,973B、Node 解密得 ZIP、删除收藏后导入恢复 `imported 42/media 3`。
13. **公开 115 图片离线**：构建时把 `docs/成果整理/Hainan-Travel-Guide/images` 复制进 APK assets（211 个 webp，APK 54MB）；`LocalServer` 的 `/v12/img/*` 改为 assets 读取，真机 `200 image/webp`。
14. **LAN 同步 MVP**：Mac 新增 `POST /v12/api/local/sync/push`、`GET /pull`、`GET /status`；手机新增 `LocalSync` + 设置页「同步到 Mac / 从 Mac 拉取」。真机：push 446,319B 写入 `SocialMate-Data/Backups/`，pull `imported 2`，status `backups:1`。
15. **性能**：真机 10 次冷启动 P50 1039ms / P95 1064ms；Tab 最大 海南 P50 126.8ms / P95 222.7ms，全部低于 2000ms / 300ms 门槛；报告 `PERF-REPORT.md`。
16. **393×852 / 深色**：CDP 视口覆盖 393×852 无横向溢出，深色背景 `#192d35`；截图 `evidence/07-393x852.png`、`08-dark-393x852.png`。
17. **300s 真实会话（PASS）**：直连模式加 `direct_asr_max_ms`（默认 300000）；4G/WiFi 下连续录音 300 秒，到点自动停止、页面显示「已结束」，本轮识别 15 段 final，页面同时给出 DeepSeek 接话；`retention:false` 时按设计不落原文。
18. **TTS 直连**：`RemoteTtsAdapter` 增加「手机豆包 Key 优先直连」分支；页面朗读 `/v12/api/tts/synthesize` 直连豆包已实测返回 `audioId`。原生 `startQueue` 的直连真机验证受 MIUI 权限弹窗打断，未确认成功，不得写成「原生队列已直连」。
19. **拍照入卡片**：用户用系统相机拍摄 `IMG_20261106_114447.jpg`；压缩到 1600px 后经页面内 `POST /v12/api/cards/story/c-2585f970/media` 导入，卡片 `revision 7 / media 4`；页面重载后 4 张图全部 `blob:` 显示，截图 `evidence/09-card-photo.png`。相册选择器已验证弹出；App 内“拍照”入口未单独验证。
20. **修复卡片保存失败**：本地服务对 `/v12/api/demo/write-ticket` 也要求 token，而页面取票不带 token → `WRITE_TICKET_UNAVAILABLE`。改为写票生成免 token（写请求仍校验 token），真机卡片保存返回「已保存」。
21. **ASR P0-1**：`LocalServer` SSE 增加 256 条环形缓冲、单调 `id`、`Last-Event-ID` 补发；断线重连不再丢 final。真机验证：停止录音后新建 `EventSource('/api/asr/live')`，收到缓冲补发 `id 1–10` 共 10 条。
22. **ASR P0-2**：`stopRequested` 只在主动停止后允许 `session/ended` 放行；腾讯同包 `final=1` 先收 `sentences` 再结束。短录音 `stop wait ended=true remaining=0`。
23. **录音按钮复位**：`stopStreaming` 立即恢复「开始录音」按钮，避免收尾异常后界面卡在禁用态。
24. **原生 TTS 直连豆包**：`RemoteTtsAdapter` 优先手机豆包 Key；音色白名单过滤系统 voice 名称（Ruth → 豆包默认）；真机缓存 `audioId=direct-a34cf6b87269fc26`。
25. **App 内相机**：新增 `capturePhoto(kind,cardId)` 走 `ACTION_IMAGE_CAPTURE` + MediaStore 全尺寸输出，压缩 1600px/JPEG82 后写入卡片；真机拍照后 `revision 10 / media 5`。
26. **重负载性能**：海南卡片加 `content-visibility:auto` 后录音中重测：海南 P50 131.7ms / P95 205.3ms（原 457.3/557.3），软件 55.7/93.7、聊天 33.5/115.8、关于我 26.8/36.4、人物 24.5/37.1，全部 PASS。
27. **ASR P1-2/P1-3/P1-6**：断线缓存最近 20 帧并在重连后补发；重连事件加时间轴偏移；首连最多 3 次重试；direct 模式不再被 `ws://` 地址格式拦截。
29. **ASR P1-5（PASS）**：新增 `AsrForegroundService`（`foregroundServiceType=microphone`），`onStop` 不再停录；真机 HOME 切后台 12 秒、锁屏 10 秒后从最近任务返回，`isRecording=true`、URL 保持 `?live=1`、服务存活。之前用 `am start` 测试会重建 Activity，是测试方法错误。
30. **ASR P1-7**：Mac 中继重连重新获取短期令牌，不再复用开局令牌。
32. **Key 误报修复**：`CloudKeys.get` 增加 120ms 短重试；Note 12T Pro 启动后 `cloudKeyStatus` 三项 `true`，DeepSeek 通联成功，不再把已配置误报成未配置。
33. **5G / Tailscale 同步**：`lan-net.isTailscaleIp` 允许 `100.64.0.0/10`；`TRAVEL_UI_URL` 改 `http://100.125.100.15:8791/v12`；`LocalSync` 在 LAN 失败时 fallback 同一 Tailscale 地址。Note 12T Pro 关 WiFi（5G + Tailscale）下 push 76,106B、pull `imported 2`（46.6s）。不再要求同一 WiFi，但需 Tailscale 连接。
34. **版本**：0.9.1/69 → 0.9.2/70；`release/SocialMate-0.9.2-vc70-debug.apk`，SHA-256 `fd922f3b769114aa4cc9b617aacfed97215a9b7d16bb68d449a3e28517004296`。

## 2026-11-05 · V1.6 分角色审查整改（0.9.1 未变版本）

1. **P0 全部关闭**：并发写加随机临时名 + 同路径串行锁；`restore` 在库同 id 返回 409 `RESTORE_CONFLICT`；三类列表/详情渲染封面与图库（blob URL）；上传串行 + 429 重试、失败不关弹层；关于我只保留统一「编辑」入口；详情补「复制中文 / 复制英文 / 分享图片」。
2. **P1**：PATCH 缺 `revision` → 400 `REVISION_REQUIRED`（前端保存前先取单卡）；`deleteMedia` 只按 mediaId 在卡片目录内匹配；`readMedia` 拒绝符号链接与越界；`draft-en` 需令牌；令牌探测 30s 实例内缓存；媒体限流去掉 200ms 间隔；列表失败显示「离线：显示上次数据 / 读取失败 · 重试」。
3. **字号**：底部导航 11.5→15px，`.tag/.previewtag/.formlabel/.n05mini`→15px，`.hero p` 13/12→15px；`.cardbottom small` 保持 14px（非关键元信息）。
4. **测试**：新增 12 条路由/存储用例（并发、恢复冲突、路径穿越、鉴权、媒体、warnings）；后端全量 **158 pass / 0 fail**。
5. **独立复审**：P0 全部关闭，结论「可发布」（`docs/qa/V1.6-Living-Card-Library/re-review.md`）。
6. **修正首轮报告不实之处**：测试卡 `v1-6` 实际在回收站（此前写 PASS）；`window.__errs` 是 CDP 临时注入，不是产品埋点；媒体 429 为整改前状态，现连续 3 图已通过。
7. **仍未交付**：覆盖层前端入口、备份/恢复、相机拍照、393×852、非 WiFi→Tailscale 的 origin 切换验证。

## 2026-11-05 · V1.6 真机验收修复（**0.9.1 / 69**）

1. **表单底部按钮不可见**（真机截图 + 图像审查发现）：新建/编辑表单超过弹窗高度，保存按钮滚到屏幕外。改为操作条 `position:sticky; bottom:0`，中文/英文输入框从 4 行收到 3 行；复审截图中「取消 / 保存 / AI 生成英文草稿」无需滚动即可见。
2. **相册入口缺失**（真机复测发现）：`FileChooserParams.createIntent()` 在 MIUI 上停「下载内容」，侧栏没有相册。改为给系统选择器：默认「相册」（`ACTION_PICK` + `MediaStore.Images`），备选「文件/文件管理」；真机已见三项，可进相册。
3. **构建失败记录**：Java 块注释里写了 `type */*`，`*/` 提前结束注释导致 `非法字符`；注释改为「通配类型」后构建通过。
4. **补充真机验证**：真实停掉 8791（非 fetch 模拟）后打开红城湖，仍显示 1 条记录/19 段与「离线缓存 · 上次同步 18:31」；服务恢复后点「刷新」标记消失。
5. **版本**：0.9.0/68 → **0.9.1/69**，APK `release/SocialMate-0.9.1-vc69-debug.apk`，SHA-256 `dce4519b53c32a41681346797fe9e92dc2f7c29a578174d4aa2adf5d42dc3e97`。

## 2026-11-05 · V1.6 三大活资料库 MVP（**0.9.0 / 68**）

1. **统一卡片层**：新增 `ai-gateway/private-cards.mjs`，三类卡片（place/story/app）共用新建/读取/编辑/软删/恢复/媒体接口；落 `SocialMate-Data/PrivateCards/{places,stories,apps,trash,overrides,media}`，目录 0700、文件 0600、写前备份、tmp+rename 原子写。
2. **冲突与恢复**：`revision` 版本号，PATCH 带旧版本返回 409 并回 `currentRevision`；删除只进回收站，可恢复；覆盖层 `overrides/<kind>-<id>.json` 只记改写字段，原 115 地点与内置资料不动。
3. **媒体**：前端 Canvas 重绘压缩（长边 1600、JPEG 0.82，重绘即剥离 EXIF/位置/方向），服务端校验 base64、magic bytes、边长 ≤4096、单张 ≤6MB，落盘并自动设首张封面。
4. **三页 UI**：海南、关于我、软件作品统一「＋新建 / 回收站」；表单含中英、分类、标签、状态与图片；列表页保持首屏干净，管理工具只在详情/编辑出现。
5. **关于我中英直显**：列表卡片中文在前、英文紧随，不折叠、不要求切语言。
6. **AI 英文草稿**：新增 `POST /api/ai/draft-en`，复用 DeepSeek 账本、consent 与 busy 闸；只填草稿，中文真源不被覆盖，失败仍可单独保存中文。
7. **原生**：`AsrActivity` 补 `WebChromeClient.onShowFileChooser` + `onActivityResult`，网页 `<input type=file>` 可打开系统相册/文档选择器；不接管 alert/confirm。
8. **修复**：卡片模块位于 N05 IIFE 内，通过 `window.__smCards` 暴露给 Tab/详情页；冷启动在令牌到达后补拉；媒体上传独立限流（60s/30 次、200ms），避免保存后连传第二张即 429。
9. **验证**：`private-cards.test.mjs` 7/7；后端全量 146/146；Note 11 真机完成新建→编辑→双图上传→AI 草稿→软删→回收站恢复；未做相机拍照、覆盖层前端入口、备份恢复与 393×852，详见 `docs/plan/ALW001-N05-V1.6-Living-Card-Library/qa/FINAL-REPORT.md`。
10. **版本**：0.8.32/67 → **0.9.0/68**，APK `release/SocialMate-0.9.0-vc68-debug.apk`，SHA-256 `9a691100787816a3d0a1a0524ed288f2e3c3891eb53a4c29292b9290398049dd`；已 `install -r` 到 Note 11 5G。

## 2026-11-05 · 弱网首屏与地点记录加速（**0.8.32 / 67**）

1. **问题**：不连 WiFi 时进入软件很慢，红城湖游玩记录也要转半天。根因三处：`/v12` 与全部静态资源 `Cache-Control: no-store`，冷启动每次重下 582KB 未压缩页面；地点详情与记录接口同样不缓存，前端只放内存，刷新即丢；手机保存的是局域网地址 `192.168.31.61:8791`，离开 WiFi 后不可达，WebView 要等 TCP 超时才失败。
2. **服务端**：`/v12`、`/v12/history`、静态白名单改为 `no-cache` + ETag + gzip（`server.mjs` 的 `sendTextCached`）；实测 596,198 → 168,999 字节，内容未变回 304（0 字节）；内容改动后 ETag 变化，仍立即生效。
3. **前端**：地点详情写 `localStorage['sm.place.cache.v1.<id>']`，先渲染缓存再后台刷新，弱网显示「离线缓存 · 上次同步 本地时间」；私有地点列表写 `sm.privatePlaces.v1`，断网不再退回 115 条。
4. **原生**：非 WiFi 且配置为局域网地址时自动改用 Tailscale 私有入口（回环地址不动，USB + adb reverse 仍可用），避免等局域网 TCP 超时。
5. **验证**：Note 11 5G 真机冷启动 `domContentLoaded=295ms`、TTFB 11ms（304 命中）；模拟断网后红城湖仍显示 1 条记录/19 段并标「离线缓存 · 上次同步 2026-11-05 18:31」。
6. **版本**：0.8.31/66 → **0.8.32/67**，APK `release/SocialMate-0.8.32-vc67-debug.apk`，SHA-256 `ca0a4d03ad6c47d67c45a01de04612ea82c697f189da165b19bdf4e9c952b371`；已 `install -r` 到 Note 11 5G。

## 2026-11-05 · 音色跨网络持久化，缓存命中恢复

1. **问题**：局域网 `http://192.168.31.61:8791` 与 Tailscale `https://…ts.net:8443` 各自一套 localStorage；换网络后朗读音色回默认 Tina，而缓存键包含音色 → 整页缓存失效、重复合成（同一句 94 字符英文 B 当天扣了 5 次 0.0282 元）。
2. **修复**：新增 `GET/POST /v12/api/prefs`（`SocialMate-Data/Prefs/ui.json`，仅存 `ttsVoice` / `ttsEngine`，音色白名单 + 写票校验）；页面加载拉取并应用，设置变更回写；播放前最多等 1.5s 让偏好就位。
3. **验证**：Tailscale 源保存小何 → 刷新后 localStorage 恢复小何；点英文 B 走豆包，账本 79→79 条、¥1.0989 不变（命中缓存）。
4. 版本仍是 **0.8.31 / 66**，仅网页与服务端改动，无需重装；手机当前 WiFi 关闭、VPN 为 Tailscale，保持不切回。

## 2026-11-05 · 豆包朗读额度 10 元 + 额度不足不再静默换系统声

1. **预算**：`SM_DOUBAO_BUDGET_CNY` 1 → 10（独立账本 `TtsCache/ledger/doubao.json`；改后重启 8791 生效）。原 1 元已花 0.951，新的英文 B 被 402 拦下后静默回退系统 TTS，表现为「播到一半换声」。
2. **预检**：`startStudyQueue` 开始前按字符本地估算本段成本（0.0003 元/字符），剩余额度不足则不启动并明确提示，避免整段播到一半才发现额度不够。
3. **硬闸**：`ttsSpeakItem` / `speak` 遇 `TTS_BUDGET_*` 或 `RATE_LIMITED` 停止并提示，不回退原生 TTS；原生仅用于设置里主动选系统语音，或非额度类失败。
4. **验证**：Note 12T 听英文 B 与听本段 15/15 项均 `engine=doubao`、`native=0`；暂停→已暂停、继续→播放中、停止→待机，无 `TTS_NOT_PLAYING`；滚动 900 后控制栏 `top=56`、高 105px。账本 10 元，已花 1.07，剩 8.93。

## 2026-11-05 · N05 V1.5.2 聊天录音页压缩与分享卡（**0.8.31 / 66**）

1. **全屏录音页**：录音成功进入 `S.v152.immersive`，隐藏页面标题栏与 5 Tab；单排控制（对象 / 状态 / ⋯ / 停止）；⋯ 含对调说话人、连接方式、诊断、退出全屏；系统返回先退全屏，录音不停。
2. **布局 1:2**：对话区按可用高度三等分（791 下 219px），建议区 flex；真机 219/438 = 0.500；首屏 5 条建议（第 5 条部分露出）。
3. **建议区**：接话 2 / 追问 2 / 换题 3（首屏 5 条），分享 3 条滚动可见；卡片删除朗读/复制，「中文」+「☆」同一行；阅读冻结、AI 首候选、四方向数据保持不变。
4. **删除占位**：隐私长文、「英文为主 · 中文可展开」「来自你已有的数据库」、「对话原文/最近 3 句」、常驻结束/放弃全部移除。
5. **停止弹层**：点停止才出现「结束并人工确认 / 放弃本轮 / 继续录音」；放弃文案写明归档不可撤回。
6. **关联资料**：一行 chips（无标题/类别）→ 英文分享卡（地点 `special_en`+`en` 去重、故事 `en`、人物无英文明确提示）；「原资料 ›」进入页内图片/完整卡片页，返回后录音继续。
7. **归档尾部**：原生 `stream()` 收尾由固定 `sleep(1500)` 改为等待 `session/ended` 或最多 3s 再 `archive.end()`（`CountDownLatch`）；真机 6 段页面/6 段归档、201/pending 0；继续录音后 1/1。
8. **按需翻译**：新增 `POST /api/ai/translate`（DeepSeek 单句、consent 必填、同一 1 元预算账本）；前端只在点「翻译」时调用，首次确认后本会话复用；真机实测「刚到海口，天气太潮湿了。」，耗时 1.4s、约 0.00027 元；无 consent 403。
9. **验证**：Note 11 5G 真机 393×791 通过 A1–A5、B1–B4、C1–C4、D1–D5、E1–E6、F1–F6；D2 进 `/v12/history`，D3 档案未写，D4/E6 `activeSessions=1`。录音为 TTS 回环（SYNTHETIC），不是真人验收。
10. **版本**：0.8.30/65 → **0.8.31/66**，APK `release/SocialMate-0.8.31-vc66-debug.apk`，SHA-256 `b8fa8b24c6232aabeab661d7c379ef82f8c5f614c7583163daec669a1903b9a9`；已 `install -r` 到 Note 11 5G 与 Note 12T Pro。

## 2026-11-05 · N05 播放控制吸顶/紧凑、暂停修复、中文整理写回

1. **控制栏吸顶**：倍速/循环/暂停/继续/停止/重试与状态收进 `.n05controls`，`position:sticky; top:56px`；滚到第 2 段以后仍可随时暂停/停止。真机滚动后 `ctrlTop=56`。
2. **紧凑**：控制区高度压到 **105px**（原占半屏）；按钮 32px 高、13px 字，一行四键。
3. **暂停/继续修复**：豆包音频改走 Web Audio 的 `suspend()/resume()`，不再调原生 `pause`，消除 `TTS_NOT_PLAYING`。真机暂停/继续/停止均成功。
4. **中文整理写回**：按用户 A1 只改 `blk-hc-2/4/11/17`——残句标「（原话未完）」、删「知道吗？」「什么的」「嘛」、去掉重复「孤单」；记录 revision 3→4，原文件备份 `.bak-20261105-cn`；其余 15 段不动。

## 2026-11-05 · N05 对照区去重（中文/英文不再重复）

1. **原文折叠**：`sourceText` 收进「原文 [start–end]」`<details>`，默认收起，不再与中文正文平铺重复。
2. **中文只显示一次**：正文只渲染 `cnSentences`；末尾短残句（如「就是要……」）不再单独成句，统一标「（原话未完）」。
3. **英 B 折叠**：默认只显示英 A；英 B 收进「另一种说法（英 B）」，且与英 A 相同则不显示。
4. **真机验证**：第 2/19 段可见中文出现 1 次，原文与英 B 默认收起，中文为「…很舒适。（原话未完）」。

## 2026-11-05 · GPT 练习 Prompt 判定放宽

1. **中文考短语/整段**：只要说出一种自然、对得上中文大意的英文，就算掌握；英文 A/B 与目标短语只作参考，不要求两种都说，也不要求用最复杂的那一种。
2. **示例写进 Prompt**：「在湖边」说 `by the lake` 即可，不必用 `on the edge of the lake`；另一种表达只作提醒。
3. **真机验证**：复制 Prompt 含「一种自然」「by the lake」，`window.__n05LastPrompt` 可读到完整规则。

## 2026-11-05 · 豆包语音合成 2.0 接入（朗读默认豆包，系统 TTS 回退）

1. **适配器**：新增 `tts-adapter-doubao.mjs`，HTTP Chunked `POST /api/v3/tts/unidirectional`；鉴权用 `X-Api-Key` + `X-Api-Resource-Id: seed-tts-2.0`；30s 超时；错误只带状态码/上游 code，不显文本与密钥。
2. **注册**：`tts-providers.mjs` 新增 `doubao`（云、需显式同意、3 元/万字符、独立账本 `SM_DOUBAO_BUDGET_CNY=1`）；`tts-cache.mjs` 新增 `doubao` 独立账本；server 的 501/402 从写死 aws-polly 泛化为按 `kind==="cloud"` 与 provider 账本。
3. **修复重复记账**：`synthesize()` 内已记账，路由层又 `recordBilling()`，同一句记两次；改为只在新合成时记账，缓存命中不重复计费。
4. **前端**：`speak()` 优先豆包合成（超 1800 字按句分段），失败回退系统 TTS；`prepare` 等入口共用。
5. **验证**：中文 38637B、英文 34221B，均为 ID3 MP3；同文本二次 `cacheHit=true`、账本不再增加。
6. **Note 12T 根因修复**：`<audio>` 每次新建元素，WebView autoplay 只允许首次手势，第二项起 `play()` 被 blocked（`__ttsEngineLog` reason=autoplay blocked），全部回退原生 TTS。改用 Web Audio（首次点击 resume `AudioContext`，`BufferSource` 连续播放）后，听本段 15/15、听词组 12/12、英文 A/B、听中文全部 `engine=doubao`。
7. **验证方法修正**：App WebView 没有 `speechSynthesis`，原生 TTS 走原生桥；新增 `window.__ttsEngineLog` 逐项记录 engine/reason/voice，验收以此为准。
8. **N05 按钮接豆包**：`听词组 / 听中文 / 听英文 A/B` 复用 `data-lang` 被界面语言开关先命中，统一改为 `data-tts-lang`。
9. **朗读引擎可切换**：设置页「朗读引擎」= 豆包 2.0（默认）/ 系统语音；选系统时不再调用豆包。`applyLang` 对非法历史值回退 `zh`。
10. **统一音色（中英一个音色）**：设置页只保留「朗读音色（中英统一）」，默认 Tina老师 2.0；`smDoubaoSpeak` 不再按语言切换 voice。服务端放宽豆包 locale 校验：中文/中英混音色可读英文，英文音色读中文会被上游拒绝。设置页只保留小何/云舟/Tina 三个可读中英的音色，旧的英文音色偏好自动回退 Tina，避免误选后中文回退系统。
11. **防叠加与循环反馈**：新合成或停止时先 `stop` 旧 `AudioBufferSource`；旧队列 await 后检查 `SMQ` 不再续播。循环按钮点击后高亮 `.on` 并提示「循环播放 N 次」，完成/停止清除。
12. **豆包朗读默认开启**：App WebView 会自动取消 `window.confirm`，改为 `S.v152.ttsConsent=true`，不再依赖 confirm。

## 2026-11-05 · 人物详情顶部改为基本档案（页面修复，0.8.31 无需重装）

1. **后端**：`getPersonDetail()` 新增 `profileSections`，按 `00-profile.md` 章节把「会话确认事实」与「人工补充」合并；人工条目新增 `manualEntries[{text,section}]`，原 `manual` 字符串数组保持不变。
2. **前端**：人物详情顺序改为 **基本档案**（基本情况 / 兴趣 / 海南生活 / 工作学习 / 共同点 / 近期计划 / 已确认偏好）→ **见面前准备** → 会话记录；旧「已确认事实 / 人工段落」仅在无 `profileSections` 时回退。
3. **紧凑版**：人物详情改为 `.pcompact` 单列密排——去掉「标识 / 私有在线 / 来自 Mac 主档 / 会话确认+我的补充 / 最多 3 条」等开发文案与每节计数；每条撤回改为行尾「×」；准备卡三按钮改为图标；会话记录默认折叠。真机内容高度 **4563 → 1276**，首屏可见条目 **2 → 10**（共 17），空白占比 0.307 → 0。
4. **验证**：`person-detail.test.mjs` 11 pass；Note 11 5G 真机打开 Mia-Chen，顺序为「基本情况…已确认偏好 → 见面前准备 → 会话记录（折叠）」，截图 `qa/t10-device/09-person-profile.png`、`10-person-compact.png`。

## 2026-11-04 · N05 V1.5.1 真实交流收口（**0.8.30 / 65**）

1. **ASR 握手鉴权**：ASR WebSocket 在 upgrade 阶段校验设备短期令牌（`x-asr-token`）、可信 Origin、每 IP 限流与并发上限；非法握手在创建 P066 上游会话之前拒绝。真实部署负例：无令牌/伪造/撤销/错误 Origin 分别 401/401/401/403，`activeSessions` 保持 0；合法原生无 Origin 握手成功。桥单测 54 pass。
2. **TTS 调试入口**：Release 清单 `TtsSelfTestActivity exported=false`（debug 单独放开）；release 忽略 adb 命令；`remote_base` 白名单 loopback/RFC1918/`*.ts.net`，拒绝 userinfo/非 http(s)/路径穿越。
3. **断线可见**：`AsrClient` 20s ping/pong；每 track 单飞重连（1s/2s/4s，最多 3 次），失败停录并显示「连接中断」。真机实测：停服务后看门狗拉起新进程，客户端自动重连成功、字幕继续；外部占端口阻断时 3s 显示「连接中断 · 重连中(3/3)」、13s 停录并显示「已结束 · 可复盘」。页面新增 `smNativeLinkState`，只显示人类可读状态。
4. **归档 401**：新增 `TokenRefresher`，401 只刷新一次并重试一次（实测两次 POST 令牌哈希不同，第二次 201）；403 仍 fail-closed。
5. **接话质量**：10 话题模板（天气/海口初到/跑步/咖啡/海南景点/软件/旅行/周末/音乐/转场），四方向每组 3 条，switch 随话题；去掉无来源第一人称断言；质量表 10/10 相关、0 重复、0 编造。
6. **现场密度**：新增 `v151-realuse` 样式——候选事实收为一行计数、建议区 23vh 独立滚动、结束/放弃吸底；真机 392×791 下建议 `top 433`、资料入口 `top 685`、整页高 1277（原 3886）。
7. **验证**：0.8.30 真机 TTS 回环音频（SYNTHETIC）多条 final → 归档 201 → Mac 落地；服务中断重连/失败停录 PASS；真人 30 分钟、Wi‑Fi↔蜂窝切换、来电/耳机仍 NOT_RUN。
8. **版本**：0.8.29/64 → **0.8.30/65**，APK SHA-256 `794e68a8117fea87149c0b5acd3ff40b2a47c87fcbe0683385f755c3c96972a3`。

## 2026-11-04 · 聊天页 UX V1.5（**0.8.29 / 64**）

1. **单栏现场交流**：顶部只留对象/录音状态/连接方式/停止；调试、端口、模型、配对入口退出聊天首页。
2. **字幕**：默认最近 3 句、固定 156px；历史展开 44vh；最新置顶/回到最新保留。
3. **建议**：四方向（自然接话/继续追问/分享自己/转换话题），每类 2–3 条；英文主、中文折叠；朗读/复制/收藏图标化；去掉 `slice(0,1)`。
4. **阅读冻结**：新 final 不重建建议，显示「有新的接话建议 · 点击更新」；点击后刷新。
5. **资料条**：地点/关于我/人物/软件四类横向精简卡；设置内新增「高级诊断」。
6. **验证**：Note 12 Pro 120 句 DOM 压测 PASS（首屏 3 条、历史 120 条、四组 2/3/2/3、深色可读、无调试信息）；P066 真机回归 PASS（2 final、归档 201、复盘写档案）；流式 401/403 PASS，402/300s 未跑。
7. **版本**：0.8.28/63 → **0.8.29/64**，APK SHA-256 `cb07a89e643b93fbabb8d01d6a896aa339446c702e5bc27f9eebf5088e582e60`。

## 2026-11-04 · P066 闭环 PASS（**0.8.28 / 63**）

1. **Note 12 Pro 已配对**：内部配对桥完成配对，`dev_5e8ac2f3ba` 为 `paired:true`；页面令牌 89 字符、人物主档 7 位在线。
2. **P066 流式闭环 PASS**：录音 2 条 final（`spk_0` 陈美玲 / `spk_1` 我）→ 归档 `savedSegments=2 / pending=0 / HTTP 201 / everSynced=true` → 本地复盘 1 条候选 → `speakerMap` 写入 `Mia-Chen` 档案，分节 `plan`。
3. **额度**：P066 `cost_cny=0.029148 / 3`，剩余 **2.970852**；本地腾讯账本不动。
4. **版本**：0.8.27/62 → **0.8.28/63**，APK SHA-256 `bc031222ecd08c3b5f8f4f8da188cad12b7e5d897d420c8964431791b4be09e2`；新增内部配对桥（不暴露 UI）。

## 2026-11-04 · P066 final 修复，ALW 流式切换 PASS

1. **P066 根因**：腾讯定稿句子用 `sentence_type:1`，P066 只看外层 `msg.final`，导致 final 永远为空；已改 `translate()` 判定。
2. **P066 配套**：`end` 等待 600ms→2500ms；上游签名补 `speaker_diarization`；备份 `stream-relay.mjs.bak-20261104-finalfix`。
3. **复测 PASS**：单段 final 1、多段 final 2；Note 12 Pro 真机 P066 模式 2 条 final、`spk_0/spk_1`、最新置顶、结束状态与连接胶囊正常。
4. **生产**：`ASR_UPSTREAM=p066`，`mode=p066`；P066 已用 0.020471/3 元，剩余 2.979529 元。
5. **待补**：Note 12 Pro 未配对，归档 pending；Note 12T Pro 回来后复验归档/复盘。

## 2026-11-04 · ALW 接入 P066 流式中继（代码就绪，final FAIL，生产回退）

1. 新增 `p066-asr-client.js`：`x-asr-token` 握手、16k PCM 透传、interim/final/budget/error 事件；`server.js` 支持 `ASR_UPSTREAM=p066`，本地预算在 p066 模式停用。
2. 真实测试：interim 9 条、spk_0 正常；**final 0 条**；P066 审计 stream ok=true，5.173s 扣 0.001437 元。
3. 疑似 P066 上游签名缺 `voiceFormat/needVad/speaker_diarization`，且 end 后 600ms settle 太短；需 P066 修。
4. 生产已回退 `ASR_UPSTREAM=tencent`，避免无定稿字幕；P066 修好后改环境变量切回。
5. Note 12 Pro 安装被 MIUI `INSTALL_FAILED_USER_RESTRICTED` 拦截，真机验收 BLOCKED。

## 2026-11-04 · P066 ASR 接入核验（无版本变更）

1. **ALW-001 已登记 P066**：引擎 `16k_zh_en_speaker_2.0`，预算 3 元/月；令牌存 `.local/p066-asr.env`（600），不入 Git/日志。
2. **拒绝路径 PASS**：无令牌 401；有效令牌 + 未授权引擎 403。402 未跑（需耗尽预算或改 P066，本轮不动）。
3. **最小真实调用 PASS**：5.173 秒中文语音 → 文本正确；P066 账本 `cost_cny=0.001729`、`calls=1`、`remaining=2.998271`。
4. **契约偏差**：契约说顶层 `cost_cny/remaining_cny`，实测顶层 null，值在 `status` 内；需 P066 确认/修文档。
5. **流式 A1 未完成**：P066 仍只有整段 `/transcribe`，无 interim/final；ALW 实时字幕继续走本地桥，未切换。
6. 证据：`docs/plan/ALW001-N05-V1.4-Real-Use-Autonomous-Closure/qa/20261104-p066/REPORT.md`。

## 2026-11-04 · 真机冒烟：选人→整段归属 + 状态/置顶/连接胶囊（**0.8.27 / 62**）

1. **真机短测 PASS**：Note 12T Pro 双麦，选 Mia-Chen 后开录；ASR 出字、`spk_0→Mia Chen（陈美玲）`、最新句在顶部、连接胶囊「家庭 WiFi」、停止后「本轮已结束 · 可复盘」+「开始新一轮」；归档 2 段 HTTP 201。
2. **修复 reload 假在线**：`?live=1` 重载但原生已停时不再显示「字幕已接入」；新增 `isRecording()` 桥，页面只在原生真的在录时订阅 SSE。
3. **选人硬前置**：未选人物时点录音直接提示先去「人物」页选择，不生成 `朋友` 默认归属；`sm-person` 写入 sessionStorage，重载后恢复。
4. **红城湖别名**：补 `Hong Chen lake park → 红城湖公园`；会话级地点记忆实测把红城湖排到推荐第一。
5. **额度**：本轮真机冒烟两次共约 10 秒；ASR 已停，`spent=0.503395 / remaining=0.496605`。
6. **版本**：0.8.26/61 → **0.8.27/62**，APK SHA-256 `2d00a694a11a8c3ddab24d3fc8134f0a0a7ceec91c5601db7ed8852fb82c6348`。

## 2026-11-04 · P0/P1 整改：一次归属 + 状态/置顶/连接可见 + 实体记忆（**0.8.26 / 61**）

1. **说话人一次归属（P0-2）**：会话级 `speakerMap`，`spk_0→选中人物、spk_1→我` 按首次出现自动分配；聊天页新增「对调说话人」一键翻转；复盘页新增「说话人一次性映射」，`?session` 或 sessionStorage 带入人物，服务端 `review/apply` 支持 `speakerMap`，不再逐句选人。
2. **档案分节修正（P0-1）**：`appendPeopleFacts` 兼容英文 key 与中文分节名；未指定分节时按内容自动归类（work/hainan/plan/interest/common），不再全部落「已确认偏好」。
3. **ASR 地名热词（P0-3）**：页面端 `SM_LEXICON` 规范化（honghan/hongcheng→红城湖公园、hai dian→海甸岛、guo xing→国兴大道、qi lou/kilo→骑楼老街、se corner→仙本那等），用于话题与推荐匹配；不改写归档原文。
4. **录音状态说明（P1-4）**：停止后面板标题显示「本轮已结束 · 可复盘」，按钮变「开始新一轮」，复盘/放弃按钮保持可见。
5. **回到最新（P1-5）**：最新消息置顶基础上，用户上翻后暂停自动置顶并显示「回到最新」按钮；点击回顶并恢复自动置顶。
6. **连接方式可见（P1-6）**：聊天面板标题显示 `家庭 WiFi / Tailscale / 本机 USB` 状态胶囊（原生 `connectionMode()`），不暴露地址与配对信息。
7. **地点关联保留会话上下文（P1-7）**：本轮全部消息做实体记忆，提过的地点（红城湖公园等）持续出现在推荐卡；自我故事卡兜底「关于我 · …」。
8. **验证**：Gateway 测试 138/138 通过（新增 speakerMap 与分节归类 4 项）；DOM 实测：归属映射、对调、回到最新、状态横幅、状态胶囊、红城湖置顶推荐均符合预期；复盘页映射默认值与「应用到候选」可用。
9. **版本**：0.8.25/60 → **0.8.26/61**；服务端与页面热更新，无额外 ASR 消耗（验证全部走 DOM/单元测试）。

## 2026-11-04 · 双麦复测 PASS + 字幕置顶 + 关于我关联（前端热更新，APK 仍 0.8.25/60）

1. **USB 双麦复测 PASS**：发射器开启后，USB BOYA 输入通过 200ms 信号探测；Samantha/Daniel 两句均被真实 ASR 识别，归档 `savedSegments=3`、HTTP 201 已 ack。
2. **字幕改为最新在顶部**：对话气泡按倒序渲染，新 final 用 `afterbegin` 插入并 `scrollTop=0`，实时 interim 移到消息列表上方；用户不再需要一直往下拖。
3. **关于我关联**：本地 profile 为空时从 `D.stories` 重新播种 5 条自我故事；`cardsFor` 为自我故事保留至少一个槽位，并统一显示为「关于我 · …」。实测「健身房 训练」命中「关于我 · 健身和锻炼」。
4. **推荐**：双麦短测出现万绿园、海口湾滨海步道、白沙门公园与自我故事卡；红城湖因 ASR 把地名听成 “honghan lake park” 未命中，属识别质量而非关联逻辑。
5. **仍未修**：复盘写入档案的两条事实都落到了「已确认偏好」，未按提交的「工作 / 学习」「海南生活」分节；需修 section 分类。

## 2026-11-04 · 全链路双声音实测 + USB 双麦静音（**0.8.25 / 60**）

1. **录音链路 PASS**：Mac 端 Samantha/Daniel 双声依次播放，手机内置麦采集；34 段真实 ASR、2 个说话人聚类、约 2 分 47 秒；建议区出现本地接话/追问卡片。
2. **原文保存 PASS**：手机归档 `savedSegments=34`，`lastHttpStatus=201`，`everSynced=true`，`lastSyncedAt=2026-11-04 13:41`；服务端会话 `sess_20261104T053719_5a01d4` 有 34 段、`hasFinal=true`。
3. **复盘/档案 PASS**：本地复盘（0 次 AI）生成 12 条候选；向 `Mia-Chen` 写入 2 条事实（成本证书、海甸岛搬家成本），人物主档已追加并带 `sm-src` 来源。
4. **USB 双麦 BLOCKED**：BOYA USB 输入已打开，但 `AudioRecordImpl` 全部 `mute`；18 种 source/rate/channel 组合均返回 all-zero，内置麦也需显式指定设备才有信号。这是接收器/发射器或手机侧静音问题，不是 App 代码。
5. **版本**：0.8.24/59 → **0.8.25/60**，APK SHA-256 `bbd8daff7bdef66173772f4f50ce99fc5d6a729fcfa41b37031a488c2ae3f138`。
6. **待补**：USB 双麦恢复声音后复测双麦分离；红城湖位置卡需在提到公园的末轮上下文中复测。

## 2026-11-04 · 点击无反应修复（**0.8.20 / 55**）

1. **现象**：手机点「开始录音」没有任何反应。
2. **根因**：①原生 `trustedPageUrl` 在页面刚加载时可能仍为空，`requestRecording()` 直接返回 false；②上一轮录音的 `running` 状态残留时，`startStreaming()` 直接 return，页面无任何反馈。
3. **修复**：桥改为在 UI 线程读取当前 WebView URL 并校验私有 origin，失败弹 Toast；`running` 残留时先停旧录音、join 旧线程，再强制重启本轮。
4. **真机验证**：Note 12T Pro（0.8.20/55）家庭 WiFi、Tailscale 关闭 → 点录 `activeSessions=1`、SSE `ready`；停止后 `0`；再次点录恢复 `1`。
5. **版本**：0.8.19/54 → **0.8.20/55**，APK SHA-256 `4bf70b236f2fea492520a2c2af9e75d0e900abdd7f536fc118b631c6bd139dfd`。

## 2026-11-04 · 家庭 WiFi 零配置 / 一键开录（**0.8.18 / 53**）

1. **自动选路**：手机启动时向 UDP 8799 广播发现同一 WiFi 下的 Mac，优先使用局域网 `http://<Mac IP>:8791`；发现不到且 Tailscale 在线时回退 `https://…:8443`。用户只需连 WiFi 或开关 Tailscale，不配置地址。
2. **一键开录**：点「开始录音」直接开麦并连接 ASR；移除弹出式原生录音面板与“对方已知情并同意录音”勾选门槛。本轮原文默认留存，可在高级设置取消。
3. **服务端局域网监听**：8790/8791/8781 默认监听 `0.0.0.0`，但请求来源仅放行回环 + RFC1918/链路本地；82 仍是演示归档，不动正式数据。
4. **真机 PASS**：Note 12T Pro 保持 WiFi、关闭 Tailscale → 页面 `http://192.168.31.61:8791/v12` 真实加载，人物主档 7 位、红城湖 `pv-hongcheng-lake-park` 已加载；点录 `activeSessions=1`，停止后 `0`；归档 HTTP 201 已 ack。
5. **保留限制**：明文仅 debug 构建允许；ASR 端点无握手鉴权、`AsrClient` 无自动重连；蜂窝 relay 曾 100% 丢包，蜂窝原生录音未复测。
6. **版本**：0.8.17/52 → **0.8.18/53**，APK SHA-256 `dc75a2cdeb689499e388e78da316c77229a1818ecdf119cc18fb549aff62d42d`。

## 2026-11-04 · T3 Tailscale 外出 / 断 WiFi（**0.8.15 / 50**）

1. **真机断 WiFi PASS**：Redmi Note 12T Pro 关闭 Wi-Fi，Tailscale VPN 底层切为 `MOBILE[NR]`（`Transports: CELLULAR|VPN`）；`ping mac-mini.tail4e4317.ts.net` 2/2、0% 丢包；Mac 侧 443 `/alw`、8443、10000 三条 Serve 路由均 200；经 Tailnet 无线 ADB 安装 APK 成功。
2. **修复 BLOCKER（外出字幕/AI 永不连接）**：`V1.1-baseline.html` 的 `connectLiveASR()` 与 `requestRealAI()` 只认 `http://127.0.0.1:8791` / `localhost:8791`，Tailscale `https://…:8443` 下直接 return。改为复用 `HTTP_UI` 协议判断，不绑定 host；`index.html` 已由 `build-v12.py` 重建。
3. **修令牌不覆盖**：`AsrActivity.injectAccessToken` 原先只在 `sessionStorage` 为空时写入，重新配对/换令牌后旧值永久 401；改为无条件覆盖，仍只写 sessionStorage、只对私有 origin 注入。
4. **真机结果**：`https://…:8443/v12?live=1` 实际加载，SSE `asrState=ready`、`asrStream=true`，页面显示「字幕已接入」；Wi-Fi 下原生 ASR `activeSessions=1`。
5. **未验**：归档写入需先「配对这台手机」，当前未配对返回 401（通路已到达归档服务）；蜂窝下原生录音未重新开麦；AI 真实请求未发（预算）。证据 `docs/plan/ALW001-N05-V1.4-Real-Use-Autonomous-Closure/qa/20261104-t3/REPORT.md`。
6. **版本**：0.8.14/49 → **0.8.15/50**，APK SHA-256 `21f6857695bbc5fa27a08add27b48d8d0cc133b1819644aecd6df4486a00aca9`。

## 2026-11-04 · Mac 归档扫描周期调松至 30 分钟（运行配置变更，无版本号）

1. 用户裁定「**A2 ＋ B2**」：扫描周期 300s → **1800s（30 分钟）**；运行形态**保留常驻 `--watch`**，不改 `StartInterval` ＋ `--once` 的定时一次性任务。
2. `~/Library/LaunchAgents/com.alw.learning-archive-watch.plist`：`SM_LEARNING_ARCHIVE_INTERVAL` 与 `--interval` 兜底值同步改 1800，`launchctl bootout` ＋ `bootstrap` 重载。
3. 核验：`plutil -lint` OK；`launchctl print` state=running、pid 54327；日志 `WATCH: … interval=1800s`；`--health --text` = `学习归档健康: OK`、间隔 1800s、下次约 1792s 后、连续漏扫 0；首轮即时扫描 84 文件 / 新索引 0 / 未变 84 / 失败 0 / 索引 85；进程 RSS ≈ 48 MB。
4. 影响：新资料最迟 30 分钟入库（原 5 分钟）；急用可 `launchctl kickstart -k gui/$(id -u)/com.alw.learning-archive-watch` 立即扫一轮。回归证据仍按 300s 时期记录（`qa/20261104-t2`、`qa/20261104-t5`），未改写。


## 2026-11-04 · N05 V1.4 锁屏后台连续朗读 + Mac 无人值守归档（**0.8.14 / 49**）

1. **朗读队列搬进前台服务**：新增 `TtsPlaybackService`（`foregroundServiceType=mediaPlayback`、`PARTIAL_WAKE_LOCK`、AudioFocus、耳机拔出监听、通知栏暂停/继续/停止）与 `TtsQueueRunner`（间隙/轮次/重试/看门狗全部原生化）。网页只下发播放计划（`startQueue`），Activity `onStop` 不再停队列。
2. **锁屏真机 PASS**：红城湖第 1 段「循环 ×3」，`mWakefulness=Asleep` 全程 **45/45 项、3 轮、227.9 秒、0 重试**，顺序三轮一致；队列结束即退前台 + `stopSelf`，通知记录归零。原始时间线 `qa/20261104-t5/bg01-timeline.jsonl`。
3. **Home → 重开恢复**：`queueState` 回灌当前轮次/项，页面不停在旧进度，也不会起第二条队列。
4. **修「听词组/听中文/听英文」误弹「显示与阅读设置」**：朗读按钮 `data-lang` 与界面语言开关撞名，会把 `SAV.lang` 写成 `phrases/zh/enA` 再 `openSettings()`。改 `data-tts-lang` + 语言分支白名单 + 启动修复被写坏的语言值。
5. **修中文词组被英文声线朗读**：原生队列按 `kind` 映射成 `segment=phrase` → `en-US`；改为 `SpeakRequest.segmentOfLang(lang)`，与 V1.3 网页路径一致（`zh→cn`、`en→enA`），缓存键与声线不变。
6. **Mac 无人值守归档**：根因是旧 watch 从未被 launchd 托管（手工进程，会话结束即消失）。新增 `com.alw.learning-archive-watch`（RunAtLoad + KeepAlive + 300s，日志落项目 `.local/`），生产实测「放文件 → 165 秒自动索引」；幂等/改版不覆盖/杀进程补扫/断网本地扫描/DEGRADED 判定 7 项全 PASS。
7. **索引语义修正（ARC03）**：唯一 `self_test` 是 QA fixture，标 `test:true / sourceTag:"qa_fixture"`，`--status` 报 `realTotal=84 / testFixtures=1`；新增幂等 `--retag-fixtures`。
8. **P016 跨项目交接**：`P016-TRANSFER.md`（D1–D4 + C1–C4 + E1–E5 最小证据集 + 派单文本）；P01601 PASS，P01602 保持 NOT_RUN。
9. **新增取证工具**：`scripts/sm-cdp.mjs`（adb forward + WebView DevTools，只连 127.0.0.1）。
10. 仍未验证：来电/耳机拔出（BG04）、脱 USB 私网（WIRE01/02，手机 Tailscale 未登录）、真实 Polly、第二台 Android 14 设备、红城湖照片。

## 2026-11-03 · N05 V1.3 混合语言播放队列 + 中英词组 + 归属/归档收口（**0.8.13 / 48**）

1. **学习页按已批准布局重排**：第一行「听本段 / 循环 ×N」、第二行「听词组」、第三行「听中文 / 听英文 A / 听英文 B」；停止/暂停/继续/重试、上一段/下一段、倍速、编辑英文、合并、拆分、GPT Prompt、回贴复盘全部保留。
2. **统一播放队列 `buildStudyPlaybackQueue`**：一轮 = 中文 → 英A → 英B → 每个常用表达「中文 → **1000ms 静音** → 英文」；单播与循环共用；循环 N 次是 N 个完整队列（真机 3 轮 45 项、20 轮 300 项按序完成）。
3. **推进只由真实音频完成回调**：原生状态事件此前实际没送到网页，改为派发到 `window.SocialMateTtsHost.onState`；新增 12s 首次初始化上限、可重试退避（`TTS_REMOTE_REJECTED`/`TTS_ITEM_TIMEOUT` 最多 3 次）、失败不跳过；新增原生 `pause()/resume()` 与 `SocialMateLog` 时间线通道。
4. **`phrasePairs` 结构化**：19 段 102 条（可播 99 / 待确认 100 / 不可播 3），`source` 与 `reviewStatus` 可追溯，原 `phrases` 只读保留；后端加 `normalizePhrasePairs` 白名单校验与长度上限。
5. **红城湖 rev3**：第 2 段回退 AI 补全、第 4 段删残留空行；原始逐字版 hash 不变、句子 34 条守恒、sourceSpan 重算后逐字可复原。
6. **归属修复**：写路径 `Number("pv-…")→NaN→null` 修正为保留字符串 id；读取侧补 `placeIdSource`，历史记录零字节改写。
7. **朗读合成限流拆分**：独立额度 48 次/60s、150ms 间隔（原 12 次/分会让一轮 15 项必然 429）。
8. **自动归档**：生产索引 `--once` 33 → 85（新增 52 / 未变 32），二次扫描幂等；全部 `awaiting_consent` 未外发。
9. 新增可复跑证据：`queue-unit.mjs`（19/19）、`merge-split-unit.mjs`（9/9）、`device-drive.mjs`（真机 CDP 驱动）。

## 2026-11-03 · N05 V1.2 T4 AI 语义分段

1. 新增 `ai-segment.mjs`：AI 只给句子分组，服务端按原串切块（零丢失/零重复/span 精确）；兼容 0/1 基、区间、对象三种返回；任何异常降级规则分段并带原因。
2. 新增路由 `POST /v12/api/places/:id/records/segment`；1 元预算内、单次预估成本上限 0.05 元、限流。
3. 前端「记录新想法」增加 AI 分段开关（默认关），保存时先分段预览再落库，失败自动规则保存。
4. 实测：真实 DeepSeek 返回 2 块（5 句样例），未授权与故障均正确降级；`verify-n05-tts-provider` 复跑 31/31。

## 2026-11-03 · N05 V1.2 T2/T3 红城湖私有地点与 19 段入库

1. **私有地点命名空间**：新增 `private-places.mjs`（`pv-*`、`SocialMate-Data/PrivatePlaces/`、`confirm` 必填、同 id 幂等）；`place-notes` 与 `server` 放开 `pv-*` 路由；前端仅在原生桥存在时把私有地点合并进海南列表（公开 PWA 行为不变）。
2. **红城湖公园入库**：`pv-hongcheng-lake-park`，海口/公园；记录 `rec-20261103072022-16b79c`，**19 段 / 英 A/B 38 条 / 原文 1148 字**（中文逐字）。
3. **缺口标注**：第 18 段英文 B、第 2/3/18 段表达为 **AI 补写**（待用户确认），用户原译未改。
4. **真机**：海南列表 116 项（115+红城湖），记录页 76 个朗读钮，点「中文」完整读出；`places-115.json` SHA 不变。
5. 证据：`docs/plan/ALW001-N05-V1.2-Hongcheng-Closure/qa/20261103-t0/`（`README-T2T3.md`、`04-hongcheng-19blocks.png`）。

## 2026-11-03 · N05 V1.2 T1 云端朗读显式授权（**0.8.11 / 46**）

1. 设置页新增「云端朗读授权（本次运行有效）」复选框 + 撤销按钮；授权状态随 `providerInfo.cloudConsent` 回显。
2. 实测：勾选 → 「已授权（本次运行不再弹窗）」；`remote + aws-polly` 未配置时点朗读 → **弹窗 0 次**，只返回 `TTS_PROVIDER_NOT_CONFIGURED`，云合成 0。
3. 构建：0.8.11（vc46），APK SHA-256 `4ead8415eae54a4f9d71a6abea50fb588e0c793e19644d3daeb0b9a74a02b86c`；T0/T1 证据 `docs/plan/ALW001-N05-V1.2-Hongcheng-Closure/qa/20261103-t0/`。

## 2026-11-03 · 弹窗打断修复 + 分段力度可调（**0.8.10 / 45**）

1. **云端同意改为「本次运行只问一次」**：原来 `consentGrantedOnce` 每读一次就清零，导致每段、每次点「中文/英A/英B」都弹同意框。改为 `consentSessionGranted`，切换服务商才重置，停止不再清除。
2. **未配置时不弹框**：`aws-polly` 无凭据（`quote.configured=false`）时直接返回 `TTS_PROVIDER_NOT_CONFIGURED`，不再让用户对一个「反正只会 501」的请求点同意。真机验证：点朗读 → 0 弹窗 + 明确错误文案。
3. **分段力度可调**：新建想法面板新增「每段几句」选择（2/3/4/6），存 `localStorage.sm_seg_gran`，随保存请求传 `maxSentencesPerBlock`；服务端 `segmentRawInput` 允许 1–8（原固定 ≥3）。
4. **原文上限提示**：面板注明单条原文上限 20000 字符（服务端 `MAX_RAW_INPUT`）。
5. **实测**：2 句/段 → 6 句样例分 3 段；3 句 → 2 段；4 句 → 2 段；6 句 → 1 段。界面选择器默认 4，选项文案齐全。
6. **构建**：0.8.10（vc45），APK SHA-256 `66aea6d5d39f3fbc02210bc01ff1b537410db9238422fca2fccd5d0f581a2e71`。

## 2026-11-03 · 冷启动排队 + 事件回调守卫（**0.8.8 / 43**、**0.8.9 / 44**）

1. **冷启动不再报错**：系统 TTS 还在初始化时点朗读，原来直接返回 `TTS_INITIALIZING`；现在挂起这一次（上限 4 s），引擎就绪后自动播放，超时/初始化失败才按原样报错并清理。
2. **事件回调守卫**：原生把 TTS 状态推给页面时没有判断 `onState` 是否存在，页面未定义该回调会抛 `TypeError`；改为 `typeof === 'function'` 守卫。
3. **真机（Note 11）**：冷启动立即点朗读 → 日志先 `system_queued`，`init READY` 后自动播放并 `queue finished`；真实产品路径（海南 → 地点 → 我的游玩记录 12 条 → 打开听读 / 练习 → 点「中文」）朗读正常，页面无异常。
4. **构建**：0.8.8 308788 B `7ba892cd6f31b31a6e6e8e6a6f310024bb0fb6822f257a709576aa37b3f5aca7`；0.8.9 308816 B `2eb7c0dce39fb08b4cc1b8acefc56189cd2e3e6002e47c642cb763bbb2456ed5`。

## 2026-11-03 · 默认切换为本机系统语音（**0.8.7 / versionCode 42**）

1. **决定**：用户选择先不接 AWS，朗读先用本机语音跑起来；Polly 后补。
2. **默认值**：`TtsPlaybackController` 默认 provider 由 `fake`（0.9 s 占位音）改为 `system`；`system_fallback` 默认开启。`fake` 仍可手动选（自检用）。
3. **文案**：`系统声音（本机引擎）`、`本机系统声音（默认开启）`；设置页说明改为「默认用本机系统语音朗读，Polly 凭据到位后可切云端」。
4. **真机实测（Note 11）**：中文 26 字读完 ~6.1 s（`lang=zh voice=zh [zh-Hans]`）、英文 A ~5.4 s（`lang=en voice=en [en]`）；主页面 `speakText` 桥接同样落到 system 且 `ok:true`。
5. **已知限制**：冷启动约 1 秒内点朗读返回 `TTS_INITIALIZING`（引擎未就绪），再次点击即成功；未改为自动排队。
6. **构建**：0.8.7（vc42），APK 307844 B，SHA-256 `cbfb79796caa8ee151cbb3a8dff887d441e66669a921e2adc381f637eb2e69c1`。
7. **未验证**：新装设备的默认值（第二台 Android 14 设备 USB 安装被系统拦 `INSTALL_FAILED_USER_RESTRICTED`）。

## 2026-11-03 · 修复设置页朗读 blockId（**0.8.6 / versionCode 41**）

1. **缺陷**：设置页「朗读」把 `blockId` 传成中文标签（`中文原文`/`英文 A`…），服务端 `ID_PATTERN` 只允许 `[A-Za-z0-9._:-]`，远端 provider 一律 `400 INVALID_BLOCK_ID`。此前真机验收走的是 ADB intent 路径（`blockId=cn`），所以 UI 路径一直未覆盖到。
2. **修复**：`TtsSelfTestActivity.speakSegment` 改为 `blockId = "selftest-" + segmentType`（ASCII），一条改动覆盖四类段落。
3. **实测（Note 11，UI 路径）**：`remote + aws-polly-fake` → `synthRequests=1`、`voiceId=Zhiyu`、audio 600 ms、播放 735 ms；切 `aws-polly` → 同意弹窗显示 region=`ap-northeast-1`/engine=`neural`/26 字符/¥0.0039/「尚未配置」；点同意 → `501 PROVIDER_NOT_CONFIGURED`，**合成 0**。证据 `qa/20261103-polly/android/`（`30`–`33`）。
4. **设置入口缺失（同批修复）**：`index.html` 从未调用 `SocialMateTts.openSelfTest`，设置页在真机上无入口、只能靠 adb 打开。已在「设置 → 本机功能」增加「朗读语音设置」按钮（中英词条齐全），CDP 实测点击后跳转 `TtsSelfTestActivity`。
5. **构建**：0.8.6（vc41），APK 307864 B，SHA-256 `bea0a8559a872a05915c3cef014b1d84e6cdbd3fb8a0c9efa7202df56f45d95b`。

## 2026-11-03 · N05 真实 Polly 显式同意 UI（**0.8.5 / versionCode 40**）

在 0.8.4 假适配器验收基础上，补齐真实 `aws-polly` 的「estimate → 用户同意 → 才发送」链路；本轮仍**未调用真实 AWS、未产生费用**。

1. **后端报价字段**：`quote` 与 `consentEcho` 增加 `region`、`engine`、`configured`，供 Android 弹窗展示「发给谁/发什么/多少钱」。`verify-n05-tts-provider` 增至 **31/31**（新增 P9-b：estimate 返回 region/engine/configured/字符/估价/摘录且不落盘、不建账本）。
2. **Android 同意前置**：`RemoteTtsAdapter` 新增 `estimate()` 与 `prepare(..., explicitConsent)`；`TtsPlaybackController` 在 `remote + aws-polly` 时先 `consent_pending` → 报价 → `consent_required`，用户点「同意并朗读」才带 `explicitConsent:true` 合成；点「取消」清空请求、不发文本。
3. **统一弹窗**：新增 `TtsConsentDialog`，主界面（AsrActivity）与自测页共用；展示服务商、区域、引擎、字符数、预计费用、文本摘录；未配置时明确写「确认后只会返回 PROVIDER_NOT_CONFIGURED，不会产生费用」。
4. **真机验证（Note 11）**：弹窗内容完整；点同意 → 日志 `consent granted` → 后端 501 `PROVIDER_NOT_CONFIGURED`，**合成请求 0**；点取消 → `consent_cancelled` + 「已取消发送；没有产生任何云请求」，**合成请求 0**；切回 `aws-polly-fake` 后普通话播放正常。
5. **构建**：0.8.5（vc40），APK 307840 B，SHA-256 `66318df341129d45a6aa6f3f6ca4cbf159ef3d774c08c27578b06b5f84e92c22`；证据 `docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/qa/20261103-polly/android/`（`20`–`24` 截图/XML、`logcat-consent.txt`）。
6. **AWS 凭据与预算入口**：`SM_POLLY_BUDGET_CNY` 环境变量（默认 0、上限 1000）驱动 `aws-polly` 独立账本；`service-v040.sh` 增加加载 `.local/aws-polly.env`。已创建并打开预填凭据文档（官方链接在顶部、密钥只留最底部），文件 `.local/aws-polly.env` 已 gitignore、0600。
7. **仍未验证**：真实 AWS 合成、DescribeVoices、真实音质试听（需你填凭据并授权预算）；未 commit/push、未跑全量回归。

## 2026-11-03 · N05 Amazon Polly 接入（假适配器真机验收，**0.8.4 / versionCode 39**）

用户选定 Amazon Polly 作为正式朗读供应商；本轮只换 provider，不重做已通过的 N05 功能，**未调用真实 AWS、未产生费用、未改公开 PWA**。

1. **后端 provider 适配层**：新增 `tts-adapter-polly.mjs`（真实 Polly 懒加载 `@aws-sdk/client-polly`，无 SDK/无凭据只返回 `PROVIDER_NOT_CONFIGURED`；另提供 `aws-polly-fake` 本地预置替身）。`tts-providers.mjs` 注册 `aws-polly` / `aws-polly-fake`，固定 5 个声线：zh-CN `Zhiyu`(neural)、en-US `Ruth`/`Joanna`(generative)、en-GB `Amy`/`Brian`(generative)，并按 locale 自动路由，客户端可用 `voiceProfileId` 覆盖。
2. **缓存与预算**：缓存键纳入 provider/voice/locale/engine/region/原文 sha，Polly 的 rate 只影响播放；音频扩展名按 mime 决定（`.wav`/`.mp3`）且兼容旧缓存。新增 `aws-polly` 独立账本，硬上限 **0 元**，任何计费请求在进入适配器前 402，账本零变动。
3. **安全闸**：`aws-polly` 未配置 → 501 `PROVIDER_NOT_CONFIGURED`（附 region/reason，不泄露凭据）；第三方传输未显式同意 → 403 `CONSENT_REQUIRED`；`style` 非空 → 400 `SSML_NOT_ENABLED`；响应/日志无 AWS Key、无原文外泄。
4. **后端定向验收**：`verify-n05-tts-provider.mjs` **30/30 PASS，退出码 0**，`realCloudCalls=0`、`https/fetch=0`；证据 `docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/qa/20261103-polly/backend/`。
5. **Android 0.8.4（vc39）**：远端服务商可切 fake / aws-polly-fake / aws-polly，按 locale 持久化声线（默认/ Zhiyu / Ruth / Joanna / Amy / Brian），自测页与 ADB 命令均可操作；clean 构建 APK 303352 B，SHA-256 `e34f5a16abd29eb2c2594171fc301feefa0e29089cd8adb7eb69ea153160bcb3`。
6. **Note 11 真机（aws-polly-fake）**：cn/enA/enB/phrase 四类 locale 全部播放，声线 Zhiyu/Joanna/Ruth/Amy/Brian 均命中；循环 5 次、停止、切段、重复段客户端缓存命中（不新增合成）均通过；跨 locale 声线 → 400 `UNKNOWN_VOICE`；系统 TTS 未手动开启 → `TTS_SYSTEM_FALLBACK_NOT_ENABLED`（不自动降级）。证据 `qa/20261103-polly/android/`（截图/UI dump/audio_flinger/logcat/providers）。
7. **仍未验证（NOT_RUN）**：真实 AWS 合成、`DescribeVoices`、真实音质试听（需用户授权 AWS 账号、IAM 最小权限、计费与测试预算）；真人双人/Boya、手机 Tailscale、有线耳机等 N04/N05 遗留项不变。
8. **未做**：commit / push（等用户明确指令）；未跑全量回归；未改真实 People/PlaceNotes、`places-115.json` 与公开 PWA。

## 2026-11-02 · N04 V1.3 T5 最新 APK 端到端验收 + 文档收口（**当时版本 0.8.1 / versionCode 36**）

以当时 HEAD `fc2379c` + 33 个未提交改动的**工作树快照**构建（未 reset / clean / push），clean 构建两次得到**逐字节相同**的 APK（`9971836f…042296`，`classes.dex` 同哈希），`install -r` 保留数据（`firstInstallTime` 仍为 2026-10-31 18:25:27）。

1. **修复：写授权票被复用（真机可见缺陷）**。`socialmate-v1.2/index.html` 的 `demoApi()` 复用了 `smTicket()` 缓存的票，而票是一次性的：第一次写成功后，第二次写必然被服务端拒（403 `WRITE_TICKET_REQUIRED/REPLAYED`），用户要点两次。改为**发出后立即作废本地缓存**，每次写重新取票。
2. **修复：演示「专属问题」被基本情况字段占满**。`demo-store.mjs` 的 `buildDemoPrep()` 只按确认时间排序，种入的「来自XX」「职业：未注明」两条最新，导致两位专属问题退化成「上次你提到…」。改为**对话来源（`origin=conversation`）优先**，且用 `textEn` 匹配问句模板；三位演示人物的专属问题恢复为 `Have you found a routine that works for your gym mornings?` / `How is your pull-up goal going?` 等真实可用问句，与 fixture `expected.beforeCustomized` 一致。
3. **端到端一次走完（真机 Redmi Note 11 5G / Android 11）**：打开即 3 演示人物 9 段 54 句 → 分组编辑 / 批量移动 / 撤销（单次点击）→ 三人 2 专属 + 1 通用 → 清空（0/0/0，重开仍空）→ 恢复（3/9/54）→ 合成音频经真实腾讯 ASR `mock:false` 出 final（预算 +¥0.012022，上限仍 1 元）→ 选 Oliver 确认、专属问题即时变化 → 停止 → 手机 outbox → 重启后自动补传（HTTP 201）→ Mac `~/Documents/SocialMate/Conversations/2026/11/…md/.json` 逐字一致 → 历史页原文 + SAF 导出 `/sdcard/Download/SocialMate-sess_20261102T102615_e52f2f.md` → 断 `adb reverse` 后原生「离线只读模式」面板（3 人 / 9 段 / 54 句 + 本地原文），恢复通道后一键回在线。
4. **安全负例实跑**：无写票 403 `WRITE_TICKET_REQUIRED`、跨源 403 `ORIGIN_REJECTED`、伪造段号 4xx `SOURCE_TEXT_MISMATCH`、未配对归档写 401；APK 二进制内不含本机归档令牌。
5. **证据**：`docs/plan/ALW001-N04-V1.3-Real-Use-Closure/qa/20261102-t5/`（`INDEX.md`、`build.log`、`apk.sha256`、`apk-metadata.txt`、`install.log`、`device-dumpsys.txt`、24 张截图、`t5-report.json`）；未覆盖 `qa/20261102-155616`、`qa/20261102-t2`、`qa/20261102-171216`、`qa/t4-20261102-175042`。
6. **仍为 NOT_RUN**：手机 Tailscale 授权（需用户本人）、物理拔 USB（已用断 `adb reverse` 等价验证）、第三方 Markdown 查看器、真人双人语音 / BOYA。

> 0.6.6（vc21）与 0.7.0（vc25）仅为历史里程碑，**不是当前安装版本**；当前代码与真机均为 0.8.1（vc36）。

## 2026-11-01 · N03b 产品化收口（「界面像开发版」→ 一级入口即产品态）

只收口入口与界面形态，不改 N03 的数据链路与授权模型。

1. **打开即五 Tab**：`MainActivity` 无 `diagnostics` extra 时立即 `startActivity(new Intent(this, AsrActivity.class))` + `finish()`；桌面图标不再落到原生卡片首页，双麦/设备检测改为 `diagnostics=true` 才进。
2. **Web 顶栏瘦身**：`AsrActivity` 打开即 `showSocialMatePanel()`；顶栏由「← 录音控制 / 刷新界面 / 停止录音」三个大按钮改为 40dp 细栏（品牌名 + `⋮`），录音、刷新、服务地址、设备检测收进 `PopupMenu`。
3. **录音改底部面板**：把手 + 标题「开始录音」+ 关闭 + 三枚说明 chip（需双方同意 / 原文默认不留存 / 云端 AI 默认不发）+ 两个勾选项与说明 + 状态行 +「本轮原文与复盘 / 停止录音」+ 折叠「高级设置」+ 主按钮「开始录音」；面板高度随内容，不留空白。
4. **前端去演示化**（`socialmate-v1.2/source/V1.1-baseline.html`）：删除「开始演示 / 开始对话演示 / 进入演示 / 模拟输入 / 模拟识别完成 / 手动演示 / 本地规则模拟 / 示例按钮（户外跑步、软件、咖啡）」；主 CTA 统一「开始录音」，有原生桥时调 `window.SocialMateAndroid.requestRecording()` 并**不立即订阅字幕**，等原生回调 `window.smNativeRecordingStarted()` 后再订阅；手动输入收进「更多 · 人物与云端授权」的二级折叠「手动补充一句话」。
5. **版本推进**：0.6.1(16) → 0.6.2(17) → 0.6.3(18) → 0.6.4(19) → 0.6.5(20) → **0.6.6(21)**（`android-poc/app/build.gradle` 现值）。
6. **测试口径变更**：`test-android-wiring.mjs` 断言改为「顶栏菜单化 + 打开即进主界面」；`test-live-asr.mjs` 增「原生桥被调用 / 无桥降级」两条；`test-ui.mjs` 增 `noDemoEntry`、`ctaIsRealAction`。

本轮实跑（只跑这三条，未跑全量 `verify-v040.sh`，无新增真机证据）：

- `node socialmate-v1.2/test-ui.mjs` → 12/12 检查通过（含 `noDemoEntry`、`ctaIsRealAction`）。
- `node socialmate-v1.2/test-live-asr.mjs` → **9 pass / 1 fail**：首条用例仍要求「点 CTA 后立刻订阅字幕流」，与 0.6.6 的「等 `smNativeRecordingStarted()` 再订阅」冲突（harness 未触发该回调，`streams.length` 得 0）。断言待随新契约更新。
- `node --test socialmate-v1.2/test-android-wiring.mjs` → **4 pass / 3 fail**：失败三条仍在找 0.6.0 的旧字符串（`我已告知并获得同行者同意录音`、`SocialMate · 实时对话`、`stylePrimary(startButton)`），需随底部面板与细顶栏更新。

## 2026-11-01 · N03（SDD V1.1，P0→P3 一次做完）

验收表与证据索引：`docs/plan/ALW001-N03-SDD-V1.1/ACCEPTANCE.md`

- **Android 0.6.0（versionCode 15）**，SHA-256 `972eed42d9fe1722e9f47d63f0bd69a073878747560eb2392e3dae42d24861b1`，Note 11 5G（Android 11）`install -r` 保留数据安装。
- **P0-01 原文留存默认未勾选**：`retentionConsent.setChecked(true)` → `false`；录音知情 / 原文留存 / 云端 AI 三项拆开并写明互不代替；灰条实时显示「当前：不留存（默认）· 本轮 0 条写盘、0 条上传到 Mac」。
- **P0-02 断网补传 + 中文四态**：`SessionArchive` 增 3/10/30/60s 退避（最多 6 次，不常驻轮询）、单飞上传、`onNetworkAvailable()` 网络恢复即补传；状态统一为「手机已保存 / 待上传 N 条 / 已同步 Mac / 失败可重试」，只有 2xx 才算已同步。
- **P0-03 令牌不再长期落浏览器**：归档历史页与私有 UI 的令牌都只放 `sessionStorage`（关闭即失效），并清理旧 `localStorage` 残留；令牌仍只走请求头。
- **P1 人物统一到正式主档**：新增 `GET /v12/api/people/<slug>`（已确认事实带 Session/段号来源、人工段落、上次联系、会话记录）、`GET /v12/api/people/slug-suggest`（拉丁名转 ASCII，中文用 `person-YYYYMMDD-xxxx`，重名给备选）、`POST /v12/api/people`（`confirm:true` 必填，0600/0700，重复不新增）、`POST /v12/api/people/<slug>/facts/revoke`（只删目标事实、保留人工段落、不可定位来源 409 安全拒绝、幂等）。
- **P1 历史检索**：`GET /api/archive/sessions?q=&person=&from=&to=&limit=&cursor=` 服务端本地检索 + 分页（limit ≤50），搜索词与原文不出本机、不写日志；历史页加关键词/人物/日期/每页/加载更多，默认只显示日期/段数/归属，附 UTC 与本地日期差异说明。
- **P2 见面前准备**：`GET /v12/api/people/<slug>/prep` 纯本地规则给最多 3 条中英对照，标注「来自已确认资料 / 通用模板」，0 次外部请求。
- **P2 聊天建议卡**：固定「一条自然接话 + 一条继续追问」，英文优先、中文释义可折叠、长文本折叠、复制/朗读/收藏；手机端把两张卡移到字幕正下方（原先排在整段对话之后、首屏看不到），并把「会话设置」折叠成一行。
- **P2 收藏表达**：`favorites-store.mjs`（本机 JSON+MD，上限 500，同句归一化去重）+ `GET/POST/DELETE /v12/api/favorites`；聊天卡与复盘句子可收藏，「关于我」可浏览/复制/朗读/取消。
- **P3 图标与启动**：自适应图标（108dp 前景 + 单色层，`res/mipmap-anydpi-v26/ic_launcher(.round)`，Manifest `icon`/`roundIcon`）与 Android 12+ 系统 SplashScreen（`values-v31` 的 `windowSplashScreenBackground/AnimatedIcon`，未引入 `core-splashscreen`、无独立 Splash Activity、无 sleep）；SVG 母版导出 1024/512 PNG 留证。
- **P3 导出**：WebView 内新增受限原生桥 `SocialMateAndroid.saveText(filename,text)`（仅私有同源注入，桥内再校验可信页面）+ `DownloadListener`（blob/data），落盘走 `ACTION_CREATE_DOCUMENT`，不申请 `WRITE_EXTERNAL_STORAGE`。
- **P3 回归**：`verify-v040.sh` 新增 2c 步（N03 六个测试文件），最新一次 **215 项 Node 全绿 + 12 项 Android 核心断言 + Gradle 构建成功**；`qa-people-e2e.mjs` 10/10；`asr-bridge` 40/40。
- 测试口径更新（按新契约，不是放宽）：字幕改「只追加气泡」后可见性断言同时看 `#messages` 与 `#content`；`test-android-wiring` 由「禁止任何 JS 桥」改为「桥必须在私有同源注入 + 桥内二次校验 + 不申请存储权限」；`POST /v12/api/people` 由 405 改 401（现在是受支持接口）。
- 边界：未重置 ASR / DeepSeek 账本（0.129189 / 0.213634，上限各 1 元），未改公开 115 地点 PWA，未删除或改写任何真实人物档案；真机未执行「新建人物 / 撤回事实」写真实主档的操作，仅用临时目录与单测覆盖。

## 2026-11-01

- 修复深色模式文字不可见：`values-night` 曾把主题继承到深色 `Theme.Material`，而页面/卡片写死浅色，导致白字白底；改为强制浅色主题，并给正文、CheckBox、按钮、EditText、Spinner 补显式文字色。Android **0.5.4（14）** 真机（Note 11 5G，深色模式）两页文字均清晰可读。
- **新建人物主档（N02-A2，用户选定开放）**：复盘页人物下拉新增「＋ 新建人物主档…」，填姓名 + 英文目录标识即可按 `_template/00-profile.md` 生成 0700 目录与 0600 主档（只写 front matter `name`，姓名做注入清洗）；服务端只在该人物确实分到事实时才建目录，回滚时删除仍为空的新建主档。标识限定 `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`。同时修掉一个真机暴露的缺陷：页面曾把下拉哨兵值 `__new__` 当 `peopleSlug` 提交，导致首次保存报 `UNKNOWN_PERSON`。
- **多人档案端到端 QA**：新增 `socialmate-v1.2/qa-people-e2e.mjs`（10 项断言，可重复运行）：临时建 3 个虚构人物 + 2 个虚构会话 + 隔离服务，验证分人写入不串档、人工条目与 front matter 保留、0600/0700、幂等、新建第 4 人、越权与非法输入拒绝、无孤立空目录；自带清理。真机（Note 11）同流程实走新建 `Eli-Tan` 并核对 Mac 侧档案。
- **正式人物主档同步（N02 P1）**：新增 `people-store.mjs` 与 `review-confirm.mjs`。用户确认的候选若归属到某个真实 `People/<slug>/00-profile.md`，会追加到对应语义章节（兴趣/工作学习/共同点/偏好等），保留 front matter 与人工段落、只追加不改写；每条事实带「会话 ID · 段号 · 确认时间」来源与不可见 `<!--sm-src:key-->` 幂等标记。写盘为「备份 → 临时文件 → 原子替换 → 写后自检」，失败用备份回滚；文件 0600、目录 0700。先写 People 再写 Profile，Profile 失败时自动回滚 People，避免“界面说已保存、实际只写一半”。
- **复盘写入服务端边界收紧（N02 P0.2）**：`POST /v12/api/review/apply` 现在必须带归档令牌，并用归档里的真实会话校验 `sessionId` 与段号（无令牌 401 / 假令牌 401 / 会话不存在 404 / 段号不存在则整条拒收 `SEGMENT_NOT_FOUND`）；`confirm:true` 不再能自证来源。新增 60s/12 次 + 400ms 间隔限流（429）。人物事实只接受用户显式选择的真实人物 slug，未选择则 `PERSON_NOT_SELECTED`，不再按显示名猜人或自动建人。新增 `GET /v12/api/people`（需令牌）供复盘页选择归属目标。用户改写候选时保留原始候选文本 `sources[].original`。
- **修复真机经 Tailscale 的 POST 全部 403**：`originOK` 此前只认 `http://127.0.0.1:<port>`，真机从 `https://<host>:8443` 打开时 Origin 与 Host 同源却被拒。改为「Origin 的 host:port 等于本次请求 Host（或 `x-forwarded-host`）即为同源」，跨源页面仍 403。
- **隐私权限收紧（N02 P2）**：`SocialMate-Data/Profile/current.md` 由 0644 改 0600（与服务层一致的显式 mode），档案目录 0700、临时文件 0600；服务启动时巡检并收紧历史 0644 文件，只改权限不改正文。
- 复盘页 UI：人物归属改为从真实人物主档下拉选择 + 章节下拉；403 错误按 `code` 区分（来源被拒 / 未勾选 AI 同意），不再把任何 403 都说成“未勾选同意”。
- 测试基建修复（与本次功能无关的历史红灯）：`test-display-and-ai.mjs`/`test-live-asr.mjs` 取「最后一个 script」被 `profile-sync.js` 外部脚本顶掉，导致 16 项误报；`test-android-wiring.mjs` 仍断言 0.4.0/versionCode 9/明文开启。均按原测试意图改为取真实内联主脚本、断言版本号格式与 `usesCleartextTraffic=false`。
- 预检脚本 `verify-v040.sh` 新增 2b 步：归档/复盘/本机档案/人物主档写入链路 52 项定向测试（临时目录，不碰真实档案）。
- 真机（Note 11 5G，0.5.4/14）实走：「本轮原文与复盘」→ WebView 深链到本轮原文 → 生成本地复盘（0 次 AI）→ 勾选候选 → 选 Test-Anna + 兴趣章节 → 确认保存 → 「已保存：人物备注 +1 · 人物主档 +1」→ 重开页面重复保存得 `DUPLICATE`、档案字节不变 → 「关于我」回读两处事实。测试全程用**隔离实例 + 虚构会话 + 临时目录**，真实 `SocialMate-Data` 未被写入。
- **会后复盘闭环（P0，上一轮）**：停止录音后可查看本轮原文 → 生成复盘（本地规则 / 云端 AI 二选一）→ 逐条勾选编辑归属 → 显式确认写入本机档案。
  - 新增 `session-review.mjs`：本地引擎 `aiUsed:false`、0 次外部请求；AI 引擎候选必须带真实段号，指不到段号的直接丢弃；近似重复候选只留更完整的一条；所有候选归属一律「未知」。
  - 新增 `POST /v12/api/review`（归档令牌 + local/ai 双模式，AI 需当轮同意且受 1 元预算闸）与 `POST /v12/api/review/apply`（`confirm:true` 必填、只追加不覆盖、按会话+段号+文本指纹去重）。
  - 归档历史详情页新增复盘区块与 `?session=` 深链；Android 0.5.3 录音页新增「本轮原文与复盘」按钮。
  - 定向测试 13/13（复盘引擎 7 + 档案写入 6），既有 profile-store / archive-history 10/10 未回归。
- 构建可复现：`build-v12.py` 固化 `/v12/history` 入口注入（此前为手改 `index.html`，重建即丢）。
- 产品决定：用户不需要知道朋友勾选了哪些地点，「清单回发」（计划 A3 / PWA-03）暂停验收；代码保留未删。
- 海南 PWA 真机矩阵补充：Note 12T Pro 自带浏览器验证 `115/115` 与共享链接 `?selected=3,39,41` → `3/115`、`A list shared with you · 3`；iPhone Safari 与微信/WhatsApp 实际发回仍需真人设备。
- Android 0.5.2（versionCode 12）：新增 `network_security_config.xml`，关闭全局明文、仅放行回环；真机差分验证非回环明文报 `ERR_CLEARTEXT_NOT_PERMITTED`、回环明文正常、自签名证书页面不渲染。
- DeepSeek 独立授权端到端：未勾选 `liveCloudConsent` 时 `/api/ai/*` 请求 0 次；勾选后真实调用并出建议卡，单次成本约 0.0047 元（累计 0.21106 / 上限 1 元）。
- 归档历史 UI 在 Android WebView 内实测可进入并读取列表与原文。
- 归档历史 UI：新增只读模块 `archive-history.mjs` 与三个令牌鉴权接口（list / session / export）；私有 UI 以 `/v12/history` + `/v12/api/archive/*` 同源反代提供，聊天页新增归档历史入口；日期区间按 UTC 过滤，导出为单份 Markdown。测试：无令牌 401、路径穿越 400、未知 ID 404、非法日期 400、反代 POST 405；浏览器零 console 错误与零横向溢出。
- Android 0.5.0：新增会话原文归档（仅 final、逐字保留、留存同意闸）与断网 outbox；真机真实语音经腾讯云 ASR 自动导出 Markdown/JSON 到 Mac。
- Mac 私有归档接收端：`/api/archive/session` 令牌鉴权、512KB 上限、幂等与原子写；Tailscale `/alw` 真证书入口打通。
- 海南公开 PWA V1.1：想去清单、选择过滤、`?selected=` 分享链接回显、manifest/Service Worker；已部署 GitHub Pages：https://wanghoufan.github.io/alw-001-foreign-language-social-system/
- 会话归档核心模块 `conversation-archive.mjs`：仅 final、留存同意闸、sessionId 幂等、revision 冲突、原子写 0600；8/8 定向测试，未接网络入口与 Android outbox。
- 本机档案持久化：新增 `GET/PUT /api/profile`，显式确认后写入 `SocialMate-Data/Profile/current.json + current.md`（0600、原子替换、目录不入库）；V1.2「关于我」新增「同步到本机档案」，离线仍只用 localStorage。
- V0.4.0 组合服务：单进程同时提供 8790 腾讯云 ASR 与 8791 V1.2 UI/AI/SSE；新增 `/api/asr/status` 能力校验。
- 修复安装脚本误把旧独立 AI 网关当作完整服务：新增 `service-v040.sh` 进程身份核验/安全替换/幂等启动；端口被外部进程占用时拒绝 kill。
- 真机 WebView 打通 `?live=1` 自动开会话与 SSE 断线重连；新增显式云端 AI 同意开关，默认不发文字、取消勾选忽略在途响应。
- 新增手机音频→ASR→SSE→UI 全链 mock 测试、真机 WebView CDP 探针；93/93 Node 测试 + 12 Android 断言通过；APK 0.4.0 安装 Note 11（保留数据）。

## 2026-10-31

- 腾讯云实时 ASR 真实连通：A/B 轨 `16k_en` 与混音 `16k_zh_en_speaker_2.0` 均返回英文转写与时间戳。
- 修复 ASR 桥接：签名 URL 补 `speaker_diarization=1`；解析 V2 `sentences.sentence_list`；新增回归测试（35/35）。

## 2026-10-06

- 为 SocialMate 添加 Dockerfile 和 Compose 部署配置，容器仅绑定宿主机回环地址，Markdown 数据通过 `APP_DATA_DIR` 持久化挂载。
- 文档化 Docker 部署、健康检查、日志和停止方式；真实数据与备份分别使用 DockerData 和 DockerBackups。
