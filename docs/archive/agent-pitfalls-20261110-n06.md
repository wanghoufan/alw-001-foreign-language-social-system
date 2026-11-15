# 踩坑归档 · 2026-11-10（N06 体验修正 0.9.21）

> 自 agent.md 迁移，原文未改；被 2026-11-15 复盘归档，结论已并入 agent.md 的通用条目与 risks.md。

## 2026-11-10 体验修正（0.9.21）

- 2026-11-10 · 点词提示勾选 · 页面根本没有该复选框，`cloudConsentChecked()` 恒 false，自动接话也从未触发 · 改版删了 UI 但门禁代码残留 · 取消门禁代码而不是把复选框加回来；移除前先 grep 所有 `cloudConsent/translateConsent/ttsConsent/aiConsent`。`建议进用户级`
- 2026-11-10 · 翻译/接话 401 · APK 内 `/api/ai/*` 要求 `x-archive-token`，页面直连 fetch 未带 · 之前被 consent 门禁挡住没暴露 · 所有 `/api/ai/*` 页面请求统一带 `uiToken()`，并用真机回读验证。`建议进用户级`
- 2026-11-10 · 接话显示 `[object Object]` · 真实 AI `reply` 是对象，渲染按字符串拼接 · 门禁取消后 AI 首次真正触发 · 新增 `aiReplyParts()` 兼容字符串/对象，网页断言检查无 `[object Object]`。`建议进用户级`
- 2026-11-10 · 点词卡字号被放大 · 卡片内 p 继承全局 `p{font-size:19px!important}`，四问每条 134px、整卡 961px · 全局字号下限规则优先级最高 · 卡片作用域加 `!important` 覆盖；改完用 CDP 量 scrollHeight，目标 ≤ 视口。`建议进用户级`
- 2026-11-10 · 复制提示受浏览器限制 · JS 合成 click 无用户手势，`execCommand('copy')` 与 clipboard 都被拒 · 真机验证不能用 `element.click()` 判剪贴板 · 用 CDP `Input.dispatchMouseEvent` 派发真实输入再读 toast；真实手指点击可正常复制。`建议进用户级`
- 2026-11-10 · 英文问句断行难看 · 复制按钮与问句同行挤占 232px 宽 · 长英文在窄栏被挤成「it?」 · 按钮移到中文行右侧，英文独占整行；先量宽再调布局。`建议进用户级`

