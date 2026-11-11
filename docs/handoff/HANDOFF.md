# HANDOFF · SocialMate（ALW-001 外语社交系统）

> 交接：2026-11-11 ｜ 分支 main ｜ **当前：N07 译英/暂停继续/顶栏已装 0.9.32/vc100，中英混说真机链路 PASS，长时与 430px 未测**
> N07 计划：`docs/plan/P001-N07-LiveZhToEn-PauseResume-ChatTopbar-V1.0-Approved-20261111.md`
> N07 原型：`docs/design/n07/n07-prototype.html`（10 张状态截图同目录）
> N06 证据：`docs/design/n06-s3/REPORT.md`、`docs/qa/2026-11-10-n06-s3/`、`docs/design/n06-s4/REPORT.md`

## 0. 常驻指针

- 架构 / 端口 / 版本 / 构建：`docs/architecture-facts.md` ｜ 风险：`docs/risks.md`
- 踩坑：`agent.md`（旧条目归档 `docs/archive/agent-pitfalls-*.md`）
- 版本指针：项目根 `VERSION.md`（真源：`009-软件管家/版本台账.md` §H）
- Android 验收台账：`android-poc/IMPLEMENTATION_STATUS.md`
- N06 计划/数据：`docs/plan/P001-N06-*.md`、`docs/design/n06-s3/`、`docs/design/prototype/n06/`
- 组合服务：`bash socialmate-v1.2/service-all.sh health | heal | up | down`（8790/8791/8781/8782）
- 真机取证：`node scripts/sm-cdp.mjs "<js>"`（先按 PID 重建 `adb forward`，只连 127.0.0.1）
- 设备绑定：`ANDROID_DEVICE_LOCK_PROFILE=codearts-main-alw001`（本轮用 Note 12T Pro，收尾已 release）
- 媒体守卫：中央 `webview-media-control-guard-local-zh`（改 WebView 连续音频必须先调用并出回执）
- 界面偏好：`GET/POST /v12/api/prefs`（`SocialMate-Data/Prefs/ui.json`）

## 1. 当前进展

### 1.1 已收口

- V1.4–V1.7：TTS 前台、Tailscale、单栏聊天、ASR 鉴权/归档/重连、本机 origin + SQLite 真源、加密备份/LAN 同步、手机直连。
- N06 阶段 1–4：五 Tab、海南 13 地点 26 图、47 节日（fixed 44/pending 3）、话题 170 条、主动点词与点词卡 v2；0.9.28/vc96 真机 PASS；细节见 N06 报告。

### 1.2 N07（2026-11-11，0.9.29→0.9.32 真机链路 PASS，含未测）

- **原生暂停/继续**：`pauseRecording()/resumeRecording()/recordingState()`；暂停真停麦与 WS、停前台服务、按段结算 ASR 预算、不结束归档；继续回同一应用层会话。
- **译英**：中文气泡右侧直接是「译英」，点击走 `/api/ai/draft-en`，英文显示在同一气泡下；英文气泡保留英→中「翻译」；空译文块已消除；同 id 不重复请求。
- **顶栏**：人物压成 44px 首字母圆按钮（点开「和谁聊天」面板）；一级「结束」（录音/暂停可见）→ 原「本轮已停止」流程；⋯ 内保留对调/诊断/退出全屏。
- **版式**：字幕区 `flex:2`、建议区 `flex:1`、标签条 50px；真机 392px 实测 449/224/50（≈2.00:1）。
- **实测**（Mac 外放 + 手机收音，真实腾讯 ASR）：中文「我想去海边散步」→ 译英 `I want to take a walk by the sea.`；英文两句识别正确；英文气泡翻译出中文；暂停期间 0 新字幕；继续后同轮追加。
- **APK**：0.9.32/vc100，57,153,821B，SHA `8336ecb6…edfa`；签名 `8e82a797…911cf3` 与已装一致；覆盖安装 Success，SQLite 保留。

### 1.3 旧线 N05（未复验）

- R3（11-07 蜂窝）与 OPPO（11-08，0.9.12/vc80）均 **PARTIAL**；细节 `STATUS-20261107.md`、`agent.md`。

## 2. 下一步

1. **N07 补测**：3 分钟长时中英混测；430px 带「结束」真机量宽；暂停时声学/供应商侧证据。
2. **N07 体验**：说话人仍全为 spk_N→「朋友」，确认是否需要把「我」的判定产品化（目前靠点气泡按钮）。
3. **N06 遗留**：3 条海南节日来源；102 个海南地点单封面；记录保存落库。
4. **旧线**：R3 真人字幕/豆包听音/T4、A08 夹具、LAN 加密需单独授权。

## 3. 未完成 / NOT_RUN

- N07：3 分钟长测 NOT_RUN；430px 含结束按钮 NOT_RUN（改 `wm size` 时系统杀进程，已恢复）；暂停「真停麦」仅有状态+服务+无新字幕三项间接证据。
- `docs/relay/CURRENT_TASK.md` 曾被某子代理越权改写（删 N06 历史、写回「唯一 OPPO 验收」），**尚未修复**，与 `VERSION.md`、本文件冲突时以本文件与台账为准。
- N06：3 条节日、102 地点封面、记录落库未测；点词未在录音中并发实测。
- 真人 30 分钟、音频焦点（BG04）、R3 真人字幕/豆包听音/T4 实景 NOT_RUN。
- 未 push（用户未授权）；本轮改动已本地 commit。

## 4. 红线

- 详见 `docs/risks.md`；密钥只在服务端/Keystore、录音需同意且不入库；MOCK/合成语音/编译通过不得写成真人验收。
- 腾讯 ASR 2 元、P066 ASR 3 元/月、DeepSeek 1 元/日、豆包 2 元/日；不得擅自调大。
- V1.4 与海南资料只读；不 reset/clean 其他会话改动。
- 端口只停本仓库进程；手机操作必须显式 `-s`；push/发布需用户明确指令。
- **`say` 外放 + 手机收音只能证明链路，不得写成真人语音验收；注入 mock ASR 事件必须标注为 mock。**
- 子代理完成后必须 `git status` 核对白名单；越权改动的文件不得直接采信。
- N07：未点选/未点气泡按钮时不得猜「我」；结束与暂停不得互相冒充。

## 5. 三日流水

- 2026-11-09：N06 原型 R2 复评；阶段 2 接入与紧凑化（0.9.13→0.9.15）。
- 2026-11-10：话题 170 条、节日核验、点词查询、取消 AI 同意门禁、点词卡 v2（0.9.28/vc96）。
- 2026-11-11：N07 三路并发（原生暂停/页面译英/设计原型）→ 修中文气泡空块与按钮分流 → 顶栏压缩与一级结束 → 0.9.32/vc100 中英混测通过；登记台账并写 `VERSION.md`。

## 6. 接续提示词

先读 §0–§6：N07 已装 0.9.32/vc100，译英与暂停/继续真机链路通过；下一步只补 3 分钟长测、430px 与说话人归属，并修 `CURRENT_TASK.md`；push 与发布仍需用户明确指令。
