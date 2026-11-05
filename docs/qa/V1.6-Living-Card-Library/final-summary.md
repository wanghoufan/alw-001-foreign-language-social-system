# V1.6 分角色审查 · 主代理汇总

- 日期：2026-11-05 ｜ 范围：工作区未提交改动（`private-cards.mjs`、`server.mjs`、前端 V1.6 模块、`AsrActivity`、构建与文档）
- 角色报告：`code-review.md`、`product-review.md`、`qa-report.md`、`supervisor.md`
- 本文件由主开发者汇总，判定不外包；**本轮未改任何代码、未 commit/push/部署**。

## 一、主代理抽查（不照抄子代理）

| 结论 | 抽查方式 | 结果 |
|---|---|---|
| 原子写临时名冲突 | 读 `private-cards.mjs:80-85`：tmp 名 = `.<basename>.<pid>.tmp` | 确认：同进程并发写同一卡片会互踩 |
| restore 覆盖在库卡 | 读 `:269-279`：未检查 `fileOf(kind,id)` 是否存在 | 确认 |
| PATCH 可省略 revision | 读 `:247`：`if (revision != null && …)` | 确认：不传 revision 即跳过冲突检测 |
| 图片未渲染 | `grep coverMediaId`：仅 `smCardFilesHtml` 使用；`placeCard/appCard/storyCard` 均无 | 确认 |
| 双编辑入口 | 读 `:1986 editStory` 与 `:2040` 委托；写的是 `SAV.stories` + `persist` | 确认：服务端卡片会被 `smCardMerge` 覆盖 |
| 媒体限流仍 429 | 读 `server.mjs:281`：`minGapMs:200`；QA 实测 `retryAfterMs=196` | 确认 |
| `__errs` 证据 | `grep __errs` 源码 0 命中 | 确认：该变量是 CDP 临时注入，不是产品埋点，不能作为“无 JS 错误”的产品级证据 |
| source/index 漂移 | 对 4 个关键标记分别 grep source 与 index | 未发现漂移；supervisor 的该条不成立 |

## 二、最终分级清单

### P0（阻塞必修）

1. **并发写数据错乱**：`atomicWrite` 临时文件名只含 pid + basename，同一卡片并发写会互相覆盖，实测出现「返回 OK:A、落盘是 B」与孤儿图片。
   证据：`private-cards.mjs:80-85`；`code-review.md` P0-1。
2. **恢复覆盖在库同 id 卡**：`restore()` 不检查在库记录，删除→同 id 新建→恢复会把新建内容静默冲掉且无备份。
   证据：`private-cards.mjs:269-279`；`qa-report.md` P1-1（我复核为 P0，因为直接丢数据）。
3. **图片“假成功”**：卡片列表与详情都不渲染封面/图片；连续上传第二张仍被 200ms 限流拒绝；上传失败时弹层直接关闭，用户以为成功。
   证据：`V1.1-baseline.html:952/967/3993`；`server.mjs:281`；`product-review.md` P0-1。
4. **双编辑入口丢数据**：关于我详情同时有「编辑」（服务端卡片）与「编辑这段话」（只写 localStorage），后者保存后会被下一次 `smCardMerge` 回滚。
   证据：`V1.1-baseline.html:1920/1986/2040`、`:3937`；`product-review.md` P0-2。
5. **卡片分享未交付**：详情只有「复制英文 / 加入聊天参考」，无中/英/图片分享，ACCEPTANCE 的 CHAT-01 未达标。
   证据：`V1.1-baseline.html:1919`；`product-review.md` P0-3；`supervisor.md`。

### P1（重要应修）

1. PATCH 不传 `revision` 可绕过冲突检测（`private-cards.mjs:247`；code-review P1-1）。
2. `deleteMedia` 用调用方传入的 `file` 拼接路径，实测可删 media 目录外文件（code-review P1）。
3. `readMedia` 对符号链接不设防，实测可读任意文件（code-review P1）。
4. `/api/ai/draft-en` 无令牌、无写票，任何人可烧 DeepSeek 预算（code-review P1）。
5. 媒体 GET 每张图都向 8781 探测令牌，图片多时首屏变慢（code-review P1）。
6. 卡片列表请求失败后永久空列表且静默，无提示/重试（code-review P1）。
7. 字号低于全局下限：移动端正文 16/18px、底部导航 11.5px、部分标签 12–14px（product-review）。
8. 新卡片路由零测试：`server-routes.test.mjs` 未覆盖 `/v12/api/cards*`，146 个测试全绿不代表新路由可用（qa-report P1-4）。
9. `window.__errs` 被当作验证证据，但它是临时注入、页面重载即失效；FINAL-REPORT 的表述需改（qa-report P1-3）。
10. 报告与事实不符：`apps/v1-6.json` 已进回收站仍写 PASS；媒体 429 写“已修复”但实测仍在（qa-report P1-2、P1-4）。
11. Android 非 WiFi 自动切 Tailscale 后 origin 变化，`isPrivatePanelUrl`/桥白名单可能不匹配（code-review，待真机确认）。
12. 覆盖层前端入口、备份/恢复未交付（ACCEPTANCE 未达标）。

### P2（建议优化）

1. `atomicWrite`/`backup` 在多个 store 重复实现，建议抽公共 `fs-utils`。
2. `TEXT_CACHE` 无条目上限（当前仅 3 个文件，风险低）。
3. `smCardPaintMedia($('#modalbody'))` 中 `#modalbody` 不存在，回退 `document.body`，属无效代码。
4. 回收站没有“彻底删除”，长期会积累。
5. 按钮文案「＋新增」与「＋新建」不一致。
6. 前端错误提示多为 `tip()` 瞬时 toast，缺少可回看的失败原因。

## 三、整体判定

**需打回**。P0 有 5 条，其中 2 条是静默丢数据（并发写、恢复覆盖），1 条是“看起来成功实际没图”，1 条是双入口回滚，1 条是验收项未交付。

建议处理顺序：restore 冲突 → 原子写 → 图片渲染/限流/失败提示 → 双编辑入口 → 分享 → P1 鉴权与穿越 → 测试与报告修正。

## 四、发布前最小验证清单

```bash
cd socialmate-prototype/ai-gateway && node --test private-cards.test.mjs
# 并发：同一 id 同时 5 次 update，最终 revision 必须递增且内容一致
# 恢复：删除→同 id 新建→恢复，必须 409 而不是覆盖
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8791/v12/api/cards?kind=app   # 无 token 401
# 图片：上传 3 张，列表与详情都能看到封面；第 2、3 张不得 429
```

真机：新建→加 3 图→列表可见封面→详情可见图片→删除→恢复→再编辑，全程无丢字、无回滚。