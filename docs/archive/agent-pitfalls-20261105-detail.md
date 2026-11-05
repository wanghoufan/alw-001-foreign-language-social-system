# 2026-11-05 踩坑明细（V1.5.2 朗读/控制栏/整理）

> 从 `agent.md` 迁出以控制 10KB 预算，原文保留；细则另见 `docs/risks.md` 的「N05 V1.5.2」小节。

- 2026-11-05 · 沉浸高度 · 真机建议区撑到 976px、页面溢出 · 真机 WebView 不支持 `100dvh`，同规则后一条无效声明覆盖了 `100vh` 回退 · 先写 `100vh`，再用 `@supports(height:100dvh)` 覆盖；真机复测比例 0.500。`建议进用户级`
- 2026-11-05 · 新增样式块 · v152 规则部分失效 · 上一块 `v151-realuse` 的 `</style>` 被一并替换，v152 被吞进上一块 · 插入新 `<style>` 时保留前置 `</style>`，并确认 `querySelectorAll('style')` 含新 id。`建议进用户级`
- 2026-11-05 · Note 12T 豆包朗读 · 第 2 项起变系统声、重复点击叠加、循环无反馈 · `<audio>` 每次新建元素被 autoplay 拦截；旧 source 未 stop；循环按钮无 `.on` · 改 Web Audio 连续播放、切换前 `smStopAudio`、循环按钮加高亮与提示；统一音色用 Tina（英文音色读中文会空音频）。`建议进用户级`
- 2026-11-05 · N05 暂停 · 点暂停报 `TTS_NOT_PLAYING` · 豆包走 Web Audio，按钮却调原生 `pause` · 改 `AudioContext.suspend()/resume()`，原生仅回退。`建议进用户级`
- 2026-11-05 · N05 控制栏 · 滚到第 2 段后无法暂停、控制区占半屏 · 未吸顶且按钮过大 · `position:sticky;top:56px`，压到 105px、一行四键。
- 2026-11-05 · 中文整理 · 19 段实为原始转写，含口水词/残句 · 只改 blk-2/4/11/17 并备份，revision+1；其余检查后保持原样。

## 豆包 TTS 鉴权（2026-11-05，原文迁移）

- 控制台给的是 **API Key**，请求头必须 `X-Api-Key` + `X-Api-Resource-Id: seed-tts-2.0`；旧 `X-Api-App-Id` + `X-Api-Access-Key` 返回 401 `45000010`，`volc.service_type.10035` 返回 403 `45000030`。
- 密钥只进 `socialmate-prototype/ai-gateway/.env` 的 `SM_DOUBAO_API_KEY`；填写文档 `docs/DOUBAO-TTS-KEY.md` 填完即清空。

## 密钥填写（项目补充，原文迁移）

- 规则见 `~/.codeartsdoer/AGENTS.md` 第三节「文件与敏感信息」：先给官方获取链接 → 建完整文档 → 密钥字段放最底部 → 打开文档给用户填；已完成不重复。
- 本项目 TTS 密钥：填写文档 `docs/DOUBAO-TTS-KEY.md`；真实值只进 `socialmate-prototype/ai-gateway/.env`（已 gitignore），`.env.example` 只留空值。

## 音色持久化与预算闸（2026-11-05，原文迁移）

- 2026-11-05 · 朗读音色 · 换网络后音色回默认 Tina，同一句英文 B 当天扣 5 次共 0.0282 元 · 局域网与 Tailscale 各自一套 localStorage，音色又是缓存键的一部分 · 音色/引擎改由 `/v12/api/prefs` 服务端持久化并在启动时拉取；缓存键含偏好时，偏好必须跨入口一致。`建议进用户级`
- 2026-11-05 · 豆包额度 · 播到一半突然变系统声 · 1 元预算用尽返回 402 后代码自动回退原生 TTS · 额度不足/限流必须停止并提示，只有用户显式选「系统语音」才回退；预算上调（1→10 元）单独留痕。`建议进用户级`
- 2026-11-05 · QA 取证目录 · `git add docs/plan/.../qa` 会把 241M `logcat-real.log` 一起带入吗 · `.gitignore` 的 `*.log` 只忽略文件，未跟踪目录仍整体显示，稍不留神按目录 add · 大型取证目录在目录级加 `qa/<task>-device/` 忽略或先 `git add -n` 预览；提交前用 `git diff --cached --stat` 复核体积。`建议进用户级`
