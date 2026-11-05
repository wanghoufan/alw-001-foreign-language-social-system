# CODE REVIEW · SocialMate（ALW-001）

- 审查时间：2026-11-05 ｜ 审查人：代码审查工程师（独立审查，未默认实现正确）
- 审查对象：工作区未提交改动（基线 `5ba9944`），共 2 个代码文件：
  - `socialmate-v1.2/index.html`（+111/-68 行）
  - `socialmate-v1.2/source/V1.1-baseline.html`（与 index.html 逐行同步，diff 除文件头完全一致）
- 参照：`agent.md`（2026-11-05 踩坑）、`docs/handoff/HANDOFF.md` §1.2、`docs/plan/ALW001-N05-V1.5.2-Chat-Compact-Layout/qa/QA-REPORT.md`
- 说明：用户指令中的 `AGENTS.md`、`docs/roles/code-reviewer.md`、`docs/pm/PLAN.md`、`docs/qa/BUGS.md` 在本仓库均不存在（本仓为 `agent.md` 踩坑记录，无角色/计划/BUGS 索引）；任务描述末尾存在乱码，按可辨认部分（全面审查本轮改动 + 更新本文件）执行。

## 一、改动内容界定

本轮未提交改动 = V1.5.2 提交（`5ba9944`）之后的 TTS 修复批次，与 `agent.md` 2026-11-05 踩坑逐条对应：

| # | 改动 | 位置（index.html） | 对应踩坑/动机 |
|---|------|------|------|
| 1 | `applyLang` 语言偏好白名单兜底（非法值回 `zh` 并 persist） | 909-911 | `data-lang` 误写 `SAV.lang` 的善后 |
| 2 | 新增朗读引擎开关（`sm.ttsEngine`：豆包/系统）与统一音色（`sm.ttsVoice`） | 930、1919-1937、1951、2302 | 设置页可切引擎（HANDOFF §1.2） |
| 3 | Web Audio（`AudioContext`+`BufferSource`）替代 `<audio>` 播放 | 2242-2277、2297-2337 | Note 12T 第 2 项起 autoplay 被 blocked |
| 4 | TTS 按钮 `data-lang` → `data-tts-lang`（4 按钮 + 1 消费点） | 4073-4078、4388 | 朗读按钮与界面语言开关同名冲突 |
| 5 | 队列取消/失败/完成时 `smStopAudio()` + 循环按钮状态清理 | 3480、3498、3570 | 停止后按钮状态残留、音频不停 |
| 6 | `smqIgnoreStoppedUntil`（1.5s）忽略重启队列的旧 stopped 回调 | 3596、3616、3654 | 重启队列被旧事件误标中断 |
| 7 | `smqSpeakCurrent` await 后校验 `SMQ!==q` | 3530 | 取消后旧 promise 推进新队列的竞态 |
| 8 | `__ttsEngineLog` 引擎日志（上限 200 条，text 截 24 字符） | 3437-3443 | 真机验收以 engine 日志为准 |

## 二、确认为正确的关键修复

1. **`data-tts-lang` 改名彻底**（全文 rg 核验：仅 4073/4076/4077/4078/4388 五处，无 `data-lang` 残留在这组按钮上）。`closest('[data-lang]')`（index.html:2579）从此无法命中 TTS 按钮，从根上消除「点听词组弹设置」冲突；按钮祖先链无 `data-lang`，冒泡查找安全。
2. **Web Audio 手势时序成立**：`startStudyQueue` ← click 委托同步调用，`smDoubaoSpeak` 的同步段（`smEnsureAudioCtx` 创建/resume，2297-2300）在首次点击的手势调用栈内执行，满足 WebView autoplay 政策；后续复用单例 `smAudioCtx` 不再需要手势。`smPlayBuffer` 有 settled 幂等、duration+3s 兜底超时、`smStopAudio` 竞态防护（onended 判 `smAudioSource===source`）。
3. **`if(SMQ!==q) return`（3530）是必要的竞态闸**：取消队列后，正在 await 的 `smDoubaoSpeak`/native 播放返回时不再误推新队列。
4. **`applyLang` 兜底正确**：`pref`/`SAV.lang` 白名单校验，坏值回 `zh`；`if(SAV)` 防护早期调用。
5. **双文件同步纪律**：`index.html` 与 `source/V1.1-baseline.html` 改动完全一致，无漂移。
6. **安全面无回归**：密钥仍只在服务端（前端仅持 token + 写票据）；`__ttsEngineLog` 仅本地、文本截断；无新增 XSS 面（`dataset.ttsLang` 只进 `startStudyQueue` 的 mode 分支，不进 HTML）。

## 三、问题清单

### P1（建议本轮处理）

- **R1｜统一音色与「中文朗读声线」的方向性风险** — `smDoubaoSpeak` 现在只用 `S.v152.voice`（index.html:2318），不再按文本语言分派 `voiceZh`/`voiceEn`。用户选英文音色（Tim/Dacey/Stokie）后，「听中文」会用英文声线读中文。这与 `agent.md` 2026-11-04 踩坑「中文词组被英文声线朗读（lang=en text=晚上散步）」的修复结论（段类型一律由 `lang` 推导）方向相反。当前默认 Tina（中英混）不受影响，风险仅在主动切换后暴露，且用户无从得知「选英文音色会影响中文朗读」。建议二选一：①按文本 `zh` 判定回退到中英混/中文音色；②设置页明确提示「该音色将同时用于中文与英文」。需产品拍板。
- **R2｜文档与实现错位**：`HANDOFF.md` §1.2 仍写「设置页支持中文小何/云舟/Tina、英文 Tim/Dacey/Stokie」（暗示中英分选），`qa/QA-REPORT.md:94` 写「中英各 3 个选项 + `S.v152.voiceZh` 同步」，而实现已是「中英统一」单选且 `voiceZh/voiceEn` 不再参与播放。凡进对外文档的结论必须回源核对——两处需随本轮改动更新。

### P2（可接受，需记录）

- **R3｜长文本分段不响应取消**：`smDoubaoSpeak` 的 for 循环（>1800 字符分段，2313-2329）无 AbortController；队列取消后仍会继续合成并计费下一段。朗读文本通常短，概率低，但与预算纪律相关，建议加取消检查或 AbortSignal。
- **R4｜`smqIgnoreStoppedUntil` 1.5s 窗口误伤真实中断**（3596/3654）：重启队列后立刻切后台，真实 stopped 被忽略，队列空等 watchdog 才以 timeout 失败——不会挂死，但中断原因失真（报 `TTS_ITEM_TIMEOUT` 而非 stopped）。可接受，记录即可。
- **R5｜循环按钮全局点亮**：`qa('[data-n05="tts-loop-full"]')`（3481/3499/3571/3609）跨所有 block/记录 toggle，非当前段的循环按钮也被点亮/清除。轻微 UI 精度问题。
- **R6｜`sm.ttsVoice`/`sm.ttsEngine` 无白名单校验**（930、1919-1937）：localStorage 垃圾值将直接作为 `voiceProfileId` 发给服务端。服务端应兜底（不在本轮 diff），前端建议同样加白名单。

### P3（可维护性）

- **R7** `smAudioEl`（2241）成死变量：`<audio>` 播放代码已删，无任何读写。
- **R8** 注释失实：2240 行「朗读（只用系统语音，不联网）」与现状（联网调豆包）相反，误导后续维护。
- **R9** change 监听中 `ttsVoiceZh`/`ttsVoiceEn` 分支（1933-1936）成死分支：openSettings 已不渲染这两个控件；`voiceZh/voiceEn` 状态与 localStorage 同步是纯冗余，建议整体移除或注明保留原因。
- **R10** I18N 不一致：`tip('已切换朗读音色')`（1925）、`tip('豆包朗读')`（2341）、设置页「朗读引擎」「朗读音色（中英统一）」标签（1951）硬编码中文，未走 `t()`；英文界面下将出现中文，与 fc2379c「全量中英跟随」的要求不一致。
- **R11** `let smqIgnoreStoppedUntil` 声明（3616）在使用（3596）之后，靠事件回调时序避开 TDZ，建议声明上移到队列函数区顶部。

## 四、回归与测试覆盖

- 服务端无改动（`git status` 仅前端 + 文档）；服务端 `voiceProfileId` 校验、豆包双记账修复在 ai-gateway 侧，不在本轮范围。
- 自动化测试盲区：`test/acceptance.test.mjs` 仅覆盖 `server.mjs` API；前端 TTS 改动无任何自动化测试，完全依赖真机手测。真机证据在 `qa/t10-device/`（22-26 号 WebAudio JSON 存在；本轮审查确认文件存在，未逐条回读断言内容）。
- 静态核验通过：`node --check` 未做（HTML 内联脚本），已用 rg 完成 5 类关键引用核验（ttsLang、voiceZh/voiceEn、smAudioEl、data-lang、smDoubaoSpeak 调用点）。

## 五、结论

本轮改动的 4 个核心修复（data-tts-lang、Web Audio、SMQ 竞态闸、applyLang 兜底）**实现正确且与踩坑闭环对应**，可以保留；P1 两项（R1 音色方向性需产品确认、R2 文档错位需更新）建议在提交前处理；P2/P3 可随下轮收口。未发现会阻塞提交的安全或数据一致性缺陷。