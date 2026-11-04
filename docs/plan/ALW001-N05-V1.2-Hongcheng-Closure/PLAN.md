<!-- ALW-001 N05 V1.2 / USER_APPROVED_2026-11-03 / ANDROID_ONLY / single developer -->
# PLAN｜N05 V1.2 开发顺序、已知事实与治理

status: USER_APPROVED
## 0. 已核实的项目事实（2026-11-03）

- Mac mini 根：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统`。直接检查 `android-poc/app/build.gradle`：**源码当前 0.8.9 / versionCode 44**；此前 `docs/handoff/HANDOFF.md` 仍记 0.8.5/40，是过期记录；**不能把源码版本号等于真机已安装/已验收**。下阶段先读当前构建、ADB `dumpsys` 和最新 QA，按证据更新文档。
- 真实文稿已在 `docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/content/20261103-红城湖公园-实测文稿.md`：**19 个原始话题段**、约 18,762 UTF-8 字节、13,768 个 JavaScript 字符单位，包含原话、英文 A/B、惯用表达。原话逐字保存，不用 AI 偷改。当前第 2、3、18 段表达有缺口，第 4/18 段英文 A 原始表达中断，第 2/3 段某些 B 文句也待润色；第 4 段有两条 B 方案，不能默默丢掉。需逐段做质量清单。
- `socialmate-prototype/ai-gateway/place-notes.mjs` 每条记录目前硬上限 **20,000 JavaScript 字符单位**，超出报 `413 RAW_INPUT_TOO_LARGE`；原稿 13,768 单位可以作为一条原文导入，但解析正确性另论。`study-blocks.mjs` 的 `segmentRawInput()` **没有调用 AI**：只按空行/标点切句、默认每块 4 句，参数范围约 3–6 句，且严格不跨原始空行；当前 UI 没有可理解的语义分段粒度设置。复杂混排 Markdown 会被当普通文本，无法可靠配对中文—英文 A/B—表达。
- `socialmate-v1.2/source/places-115.json` 的既有 115 个地点中**未找到“红城湖”或 Hongcheng**。服务端 `assertPlaceId()` 限定 1–115，不能把红城湖强行写到龙兴路 `id=1`，也不能为了这项私有资料修改公开 PWA。
- UI 的中文/英 A/英 B 按钮实际调用原生 `SocialMateTts`；但 `TtsPlaybackController.java` 在真实 Polly 模式且本次会话未授权时进入 `consent_pending`，`AsrActivity` 调用 `TtsConsentDialog.show()`，故出现弹窗。`qa/20261103-polly/android/README.md` 已证明：当前真实 Polly **无凭证、预算 0**，确认弹窗后返回 `501 PROVIDER_NOT_CONFIGURED`，云合成 0 次；`aws-polly-fake` 播放/缓存测试成功不等于 Amazon 真人声线已开通。
- 后端人物补记、地点私有记录、双语播放器与 GPT 回贴已经有代码；N05 UI 测试记录 8/8、Polly 假适配器通过，但红城湖 19 段未被证明已正式入库/音质验收。完整 S6 和实际 AWS Polly 仍需 QA。源码脏工作树存在其它正在开发修改；禁止清空、reset、并发改同一文件。

## 5. 独立主开发者连续任务链（用户批准后执行）

| Task | 实施 | 完成必须有的证据 |
|---|---|---|
| **T0 预检与预构建** | 读取最新真实Git、QA、Android build.gradle；一次性A/B/C/D审计；ADB `devices -l` → Gradle预构建 → `adb -s <真实serial> install -r` 保留现有数据 → `dumpsys` 与截图 | 真实命令/退出码/APK SHA、Android版本、Git未提交文件清单；不能声称源码0.8.9就是已装0.8.9 |
| **T1 修正朗读交互** | 撤出按朗读弹窗；设置中的一次性AWS透明授权/撤销；点播/缓存直接播放、准备中、失败提示、停止/循环；不自动低质TTS | 真机逐按中文/英A/英B/短语/循环、无重复弹窗；AWS未配只提示不乱请求；安全负例 |
| **T2 红城湖私有地点** | 在 Android 私有地点命名空间创建“红城湖公园”，不使用1–115；合并显示于海南列表、支持编辑/图库/时间线 | 打开“海南→红城湖”、可看到基础档案+私有游玩记录；原115与PWA前后SHA相同 |
| **T3 真实素材与双语翻译** | 把真实19段按来源/状态逐条归档；补译 A/B/短语与校审；逐段核对；收集合法图片并记授权 | 19/19中文原文逐字匹配；19/19有可用中英A/B、表达完整或明确待确认；图片有可验证来源/许可及年代，不造假 |
| **T4 真AI语义分段** | 结构化识别中英配对、三档粒度、手调边界、真实DeepSeek/明确规则兜底、超长批次处理、草稿恢复 | 红城湖全稿一键粘贴→预览→调整→保存，0丢失/0重复/原文hash不变；测试20k边界、100k目标/批次恢复、断网、重复句子合法 |
| **T5 学习闭环** | 中文/英A/英B/短语、Amazon神经/生成式语音优先、允许的缓存反复播、GPT Voice单段Prompt、复盘手工回填/版本 | 实测选至少3块，循环20次仅一次音频合成（缓存命中）、生成Prompt内recordId/blockId/revision正确、两份复盘不覆盖；真实AWS仍按授权判NOT_RUN |
| **T6 全量安卓QA收口** | 按内容/阅读/翻译/AI/声音/外出/安全逐项验证，修复后复测，更新HANDOFF/CHANGELOG/QA，保留N04已有结果 | 新APK SHA +保留数据安装+真机截图/真实音频/服务端日志/负例、缺口明确PASS/PARTIAL/NOT_RUN；最终唯一Human Gate |

**执行纪律**：单一主开发者连续“读取→分析→修改→单测→ADB真机→修复→复测→下一Task”，普通问题不再中途向用户追问；付费、第三方数据传输、外部2FA、不可逆破坏性操作仍需用户明确授权，不能以“不中断”为由越权。每个Task先复用已实现功能，不把已经通过的S0–S5从零重做。

## 接续纪律

开工先看最新 Git/QA/Android 已装版本。旧阶段 S0-S5 已有通过证据，严禁整段重做；按新任务实际差异增量完成。AWS 真实云费用默认 0，先 Fake + 本地缓存/播放；外部账号/付款是人审点，但不阻塞其余可做工作。

**云转桌接力**：先保护旧 Amazon Polly 正式 `READY` 任务，不覆盖。之后单独按 `RELAY-STAGED.md` 登记新任务，须经真实 Computer Use GUI 才能标 `SENT`。


**共同约束**：只改 Android 私有 SocialMate 与 Mac 私有后端；不改公开 PWA、公开 115 个地点或任何既有真人档案；保留旧 N04/N05 已通过证据，不 reset/clean 工作树，不擅自 AWS/DeepSeek 付费、对外传输或提交真实文稿到公开 Git。
