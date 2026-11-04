# ALW-001 N05 V1.1｜正式审查版开发入口

> **2026-11-03 用户最新决定：正式云TTS首选 Amazon Polly。** 请**优先读取** `docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/TTS-AMAZON-POLLY-APPROVED-SELECTION-V1.0.md`。这份新文件覆盖下述旧TTS选型文件中“比较Azure/ElevenLabs/Google并作为本阶段候选主服务”的建议。英文Ruth/Joanna或Amy/Brian Generative、中文Zhiyu Neural；按语言拆分/连续播放，不宣称Polly支持精通中英双语的同一声线。保留可切换Provider接口、缓存、已开发的系统TTS备用，**不重做其它已通过Task**。用户选择Amazon≠批准AWS账号开通、付费、敏感资料外发；新TTS默认0元，先做假适配器和真机播放，需真实AWS权限再集中一次向用户请求。


> **当前已生效的TTS技术路线修订（2026-11-02）**：用户确认 Android 系统TTS音质不符合正式英语学习要求。优先阅读 `docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/TTS-PROVIDER-ADAPTER-DECISION-V1.0.md`。当前`TtsController.java`已在开发，只保留为系统备选声源，不能拿系统试听作为最终自然英语音质验收。**从现在起须建立厂商可替换 TTSAdapter + Mac私有代理/缓存**，为未来可选 Azure/ElevenLabs/Google 神经语音预留接口；任何新付费Key/调用与私人资料外发必须另经用户许可。此项只修改声音提供方式，不重做已有分段/循环/人物/地点功能，旧SDD里“系统TTS作为主方案”由本条和修订文档覆盖。


status: APPROVED_N05_SCOPE_REVISED_SPEC_READY
mode: SINGLE_MAIN_DEVELOPER_CONTINUOUS
app: EXISTING_ANDROID_ONLY
date: 2026-11-02
task_id: SM-ALW001-20261102-N05-LIVING

## 第一步必须读取
1. `docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/SDD-REVIEW-V1.1.md`（本版唯一正式规格，含产品宪法/SPEC/TASKS/预检/QA/安卓预构建与授权边界）。
2. `docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/prototype/interactive-prototype.html`（真的可点击的手机交互原型；注意其AI/语音输入模拟，不可照搬其演示逻辑当生产接口）。
3. `docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/assets/launcher-icon-current-brand.svg`、`splash-preview-light.svg`、`splash-preview-dark.svg`，均为品牌预览。**生产图标/启动请复用现有Android原生res**；Android12+系统Splash不会把长图文字全部显示。
4. 项目现有 `AGENTS/agent.md`、Git status/diff、`CHANGELOG.md`、`docs/handoff/HANDOFF.md`、N04 V1.3 QA/验收，和旧N05 V1.0文档，以当前真实代码/本V1.1为准。

## 正式施工顺序
S0 全Task前置条件核查和真实ADB预构建安装（保留数据）→ People主页去开发化 → 文字/语音旧友补记AI候选/人工确认 → 海南115地点只读+私有感悟追加/长文分段A/B翻译 → Android原生中英文TTS听读循环 → GPT Voice 单段Prompt复制/复盘回贴 → 全量真机/私有数据/公开PWA零变更QA → 唯一最终Human Gate。

## 视觉及内容的强制使用
- **People页面**：日常真实联系人/搜索/新建/补记；演示3人/9会话及恢复清空只能从设置高级打开。原始Demo文件不丢。
- **地点**：龙兴路来自`socialmate-v1.2/source/places-115.json`的`id=1`，不能改母版；个人感悟独立Mac私有PlaceNotes，以placeId关联，记录原文、来源位置和修订版。
- **英语听读**：一中文对应英语A/B、表达词组，Android真实TTS，不以浏览器预览声线验收；中英切换/停止/循环清楚。
- **GPT练习**：一个段落对应 `recordId/blockId/contentRevision`，中文表达→英文回答→中文整段→英文翻译→复盘手动回贴，旧版报告不混档。
- **Android图标/启动**：保留单气泡adaptive icon、monochrome和原生系统Splash，禁止另建SplashActivity/双气泡回退。ZIP中的四屏PNG为设计方向，实际文字、街景/人物内容不能视为真数据。
- **公开PWA**：禁止修改部署/静态源、115原始内容和已有私人档案；不加第六Tab、不新建数据库或付费服务、不抬高AI两项1元预算。

## 运行和交接说明
- Mac Reader现已落盘此完整UTF8 SDD、真正可打开的HTML原型和3个SVG品牌素材；对外下载的`SocialMate_N05_SDD_V1.1.zip`另附PNG截图与9份细分规格。PDF/PNG不是Mac Reader写文件可直接转入的格式，不要误称这些PNG在Mac项目文件夹中。
- 实际构建、ADB安装、真机TTS/真人GPT Voice尚未由此云端完成，必须由当前Mac工作区唯一主开发者连续执行并留原始证据。
- 如N04当前窗口还在开发，桌面转发员BUSY不投递、不唤醒/开启关闭的Qoder；回执只有真实GUI点击Send后才可记GUI_SENT。

## 实现状态（2026-11-03）

> 本节为实施追加记录，不改动上方正式计划正文。

- 已实现：`aws-polly`（真实云，未配置时 501 `PROVIDER_NOT_CONFIGURED`）与 `aws-polly-fake`（本地替身）两个 provider；5 个声线（zh-CN `Zhiyu` neural；en-US `Ruth`/`Joanna` generative；en-GB `Amy`/`Brian` generative）；语言路由与 `voiceProfileId` 覆盖；mp3/wav 缓存；`aws-polly` 独立 0 元账本；SSML 关闭。
- 后端验收：`verify-n05-tts-provider.mjs` 31/31、0 真实云调用（含 estimate 报价字段），证据 `qa/20261103-polly/backend/`。
- Android：0.8.5 / vc40，自测页与 ADB 命令可切服务商与声线；Note 11 真机用 `aws-polly-fake` 完成 cn/enA/enB/phrase、五声线、循环/停止/切段/缓存重放；真实 Polly 已完成 estimate→原生弹窗→同意/取消（同意后 501、取消不发、合成 0），证据 `qa/20261103-polly/android/`。
- 凭据入口：`.local/aws-polly.env`（gitignored、0600），`service-v040.sh` 已加载；`SM_POLLY_BUDGET_CNY` 默认 0、上限 1000。填完凭据与预算并重启 8791 后才可能真实调用。
- 未完成（需用户授权）：真实 AWS 账号/Region/最小权限 IAM/计费与测试预算；真实 Polly 合成、DescribeVoices、音质试听均 NOT_RUN。
