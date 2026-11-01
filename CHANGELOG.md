# Changelog

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
