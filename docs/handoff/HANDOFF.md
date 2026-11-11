# HANDOFF · SocialMate（ALW-001 外语社交系统）

> 交接：2026-11-10 ｜ 分支 main ｜ **当前：N06 阶段 3 已接入，0.9.28/vc96 真机 PASS（已清场）**
> 阶段 4 报告：`docs/design/n06-s4/REPORT.md` ｜ 证据：`docs/qa/2026-11-10-n06-s4/`
> 阶段 3 报告：`docs/design/n06-s3/REPORT.md` ｜ 证据：`docs/qa/2026-11-10-n06-s3/`
> 阶段 2 报告：`docs/design/n06-s2/REPORT.md` ｜ 阶段 1 原型：`docs/design/prototype/n06/standalone-test/standalone.html`
> 旧线 N05 V1.7 R3 仍 **PARTIAL**

## 0. 常驻指针

- 架构 / 端口 / 版本 / 构建：`docs/architecture-facts.md` ｜ 风险：`docs/risks.md`
- 踩坑与流水：`agent.md`（旧条目归档 `docs/archive/agent-pitfalls-*.md`、`handoff-flow-*.md`）
- Android 验收台账：`android-poc/IMPLEMENTATION_STATUS.md`
- **N06 计划/任务**：`docs/plan/P001-N06-HainanGallery-FestivalTopics-V1.0-Approved-20261109.md`、`docs/relay/CURRENT_TASK.md`
- **N06 内容数据**：`docs/design/n06-s3/`（话题 170 条 + 节日来源补丁）；原型/审查 `docs/design/prototype/n06/`、`n06-audit/`、`n06-review/`
- **验证脚本**：`socialmate-v1.2/verify-n06-s3.mjs`（`n06-s3-result.json`、`qa/n06-s3/`）；阶段 2 为 `verify-n06-s2.mjs`
- 旧证据：V1.5–V1.5.2 `docs/plan/ALW001-N05-*/qa/`；V1.7 `R2/`、R3 `STATUS-20261107.md`
- 红城湖原稿：`docs/archive/20261103-红城湖公园-实测文稿-逐字版-备份.md`
- 豆包：`docs/plan/ALW001-N05-V1.5.2-Chat-Compact-Layout/DOUBAO-TTS-INTEGRATION.md`、`docs/DOUBAO-TTS-KEY.md`
- 组合服务：`bash socialmate-v1.2/service-all.sh health | heal | up | down`（8790/8791/8781/8782）
- 真机取证：`node scripts/sm-cdp.mjs "<js>"`（只连 127.0.0.1；先按 PID 重建 forward）
- 设备绑定：`ANDROID_DEVICE_LOCK_PROFILE=codearts-main-alw001`（已绑定 OPPO PLG110）
- 媒体守卫：中央 `webview-media-control-guard-local-zh`（改 WebView 连续音频必须先调用并出回执）
- 界面偏好：`GET/POST /v12/api/prefs`（`SocialMate-Data/Prefs/ui.json`）

## 1. 当前进展

### 1.1 已收口

- V1.4–V1.6：TTS 前台、Tailscale、单栏聊天、ASR 鉴权/归档/重连、P066 流式；全屏录音控制、停止弹层、分享卡、按需翻译、豆包 Web Audio 连播与暂停；三类活资料库、新建/回收站、`/api/ai/draft-en`。
- V1.7 R2：本机 origin + 211 离线 webp + SQLite 真源；断网冷启动 P50 1039/P95 1064ms；五 Tab/搜索/CRUD；加密备份、LAN 同步、300s 直连、相机入卡片、原生 TTS 直连。
- N06 阶段 1：五 Tab、海南 13 地点 26 图、节日 47、聊天三标签；单文件 104/104、多文件 80/80；R2 复评 P0 清零。
- N06 阶段 2：软件→话题（五 Tab 不变）、6 子标签、47 节日筛选/双语复制、海南 13 地点轮播/全屏、默认 SYSTEM、聊天节日小标签、记录识别预览；0.9.13–0.9.15 真机通过。

### 1.2 N06 阶段 3（2026-11-10，0.9.28/vc96 真机 PASS）

- **无 AI 同意门禁**：删除「允许把字幕发送给云端 AI」复选框、翻译/朗读费用确认、N05 记忆与地点匹配的 AI 复选框；自动接话/点词/翻译点击即调用。APK 内 `/api/ai/*` 统一带 `x-archive-token`，不再 401。修复真实接话 `reply` 对象被当字符串导致的 `[object Object]`（`aiReplyParts()`）。
- **话题内容补齐 170 条**（`window.N06_TOPICS`）：日常生活 20 / 文化习俗 20 / 健身运动 46（球类 18、板类与户外 14、体能与日常 12、观赛与赛事 2）/ 更多 84（旅行与美食 9、影音与游戏 10、城市与环保 7、宠物与摄影 3、工作学习 20、家庭与关系 17、金钱健康科技 18）；每条中英标题、中文 40–70 字、英文 35–60 词、2–3 条双语问句、来源 URL、核实日期；卡片可展开来源与复制英文问句；健身与更多页内按分组渲染。球类含乒乓球、网球、匹克球、羽毛球、排球、沙排、棒球、垒球、板球、橄榄球、高尔夫、台球、保龄球、飞盘、壁球、手球；板类含滑板、冲浪、单板/双板滑雪、桨板、轮滑、攀岩。
- **节日来源核验**：47 条 → fixed 44 / pending 3（军坡节、换花节、海南欢乐节无政府公告源）；修正盂兰盆节为 8 月 15 日主日；来源以香港天文台/香港政府宪报/Nager/新加坡人力部/Office Holidays/UN 为主。
- **字幕主动点词查询**：默认不扫描、不标注；点英文词才发「该词 + 当前句」；点击即查询、无同意步骤；本地缓存 120 条；不中断录音、不改字幕与 ASR 状态。服务端 `/api/ai/term` + Android `DirectCloud.term()` + `LocalServer` 路由。
- **阶段 4 点词卡 v2**：中文解释 + 英文解释 + 四条顺势问（喜好/对比/体验/收获，固定 kind），每条单独复制；禁止「你听过吗」；「改查」收进标题栏；一屏 589px/700px；真实输入点击复制成功。
- **验证**：网页 `verify-n06-s3.mjs` **29/29 · 8 图**；真机话题 20/20/46/84、节日 47/3/44、点 `capoeira` 返回中英解释 + 四条问句、复制成功、翻译直连、接话无 `[object Object]`。
- **APK**：0.9.28/vc96，57,146,477B，SHA `c527029d…709a`；签名与已装一致；覆盖安装 Success；Key/配置/SQLite 装前后一致。

### 1.3 旧线 N05（本轮未复验）

- R3（11-07 蜂窝）与 OPPO（11-08，0.9.12/vc80）均 **PARTIAL**；细节 `STATUS-20261107.md`、`agent.md`。

## 2. 下一步

1. **内容**：3 条海南节日（军坡节/换花节/海南欢乐节）需地方政府公告或民俗机构来源；其余 102 个海南地点仍是单封面，需逐张真实图片与授权后再扩。
2. **真机补验**：录音进行中点词（确认不打断 ASR）；游玩记录保存写入落库（先可回滚）。
3. **旧线收尾（需用户在场）**：R3 真人字幕/豆包听音/T4；A08 夹具；LAN 加密需单独授权。
4. **工作树**：未 commit；入库/推送待用户明确指令。

## 3. 未完成 / NOT_RUN

- N06：3 条海南节日待补；海南 102 地点单封面；记录保存落库未实测。
- 点词查询：真机未在录音中并发测试。
- 真人 30 分钟、音频焦点（BG04）、R3 真人字幕/豆包听音/T4 实景 NOT_RUN；A08 夹具待修。
- OPPO：学习页「听本段」UI 未点开；后台保活未长时观察；系统无 TTS，原生队列已切豆包。
- P066 流式 402/300s/撤销、真实 Amazon Polly NOT_RUN；豆包账单以火山控制台为准。

## 4. 红线

- 详见 `docs/risks.md`；密钥只在服务端/Keystore、录音需同意且不入库、MOCK/合成语音/编译通过不得写成真人验收；不得跳过证书校验。
- 腾讯 ASR 2 元、P066 ASR 3 元/月、DeepSeek 1 元/日、豆包 2 元/日；不得擅自调大。
- V1.4 与海南资料只读；不 reset/clean 其他会话改动。
- 端口只停本仓库进程；手机操作必须显式 `-s`；不 commit/push/release 除非用户明确要求。
- 朗读 `mediaPlayback`、录音 `microphone`；不得扩成开机自启或常驻；通知栏不得出现原文/地点/人名。
- 对话翻译/豆包朗读/术语解释不得用词典/模板冒充；密钥不进日志、文档、仓库。
- N06：未核实内容与未排除图片不得当正式产物；发布/部署仍需单独同意。

## 5. 三日流水

- 2026-11-08：OPPO 换机迁移；字号/留白/头像/卡片修复（0.9.9）；ASR 直连与豆包队列修复（0.9.12）。
- 2026-11-09：N06 原型交付与 R2 复评；阶段 2 接入、紧凑化（0.9.13→0.9.15）；真机 PASS。
- 2026-11-10：话题 170 条与节日来源核验；点词查询接入；取消 AI 同意门禁；点词卡 v2（中英解释 + 四类问句）；0.9.16→0.9.28 覆盖安装与真机验证（29/29 + 真机 PASS）。

## 6. 接续提示词

先读 §0–§6：N06 阶段 3–4 已装 0.9.28/vc96，网页 29/29、真机与清场均完成；下一步只做 3 条海南节日来源、录音中并发点词、记录落库与旧线收尾；入库/发布仍需用户明确指令。证据见 `docs/design/n06-s3/REPORT.md`、`docs/qa/2026-11-10-n06-s3/`。