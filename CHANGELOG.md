# Changelog

## 2026-11-01

- 会后复盘闭环（P0）：停止录音后可查看本轮原文 → 生成复盘（本地规则 / 云端 AI 二选一）→ 逐条勾选编辑归属 → 显式确认写入本机档案。
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
