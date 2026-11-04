# N05 V1.1 · S5 UI 联调验收报告（2026-11-03 重跑）

- 项目：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统`
- 被测页面：`socialmate-v1.2/index.html`（由 `socialmate-v1.2/source/V1.1-baseline.html` 经构建生成）
- 后端：8790/8791/8781/8782（`bash socialmate-v1.2/service-all.sh health` → `RESULT: HEALTHY（4/4）`，退出码 0）
- 真机：`REDACTED-SERIAL`（21091116AC / Android 12），已装 `0.8.2 / vc37`
- 验收脚本：`socialmate-v1.2/verify-n05-ui.mjs`（CDP 驱动真实 8791 页面）
- 总体结论：**PASS（8/8，退出码 0）**

## 一、逐项结果

| 项 | 结果 | 断言要点（实际值） |
|---|---|---|
| ① 旧友补记 | PASS | 3 段输入 → 候选 ≥3 → 勾掉 1 条后未写入；确认后人物事实 +2、另一人物 `00-profile.md` sha 不变（`8a92119c…`）；未确认时主档 sha 不变 |
| ② 地点活档案 | PASS | 10 段粘贴 → 10 段；每段 `rawInput.slice(span.start,span.end)===sourceText` 且 `cnSentences.join('')===sourceText`；英 A/英 B 全部渲染；`places-115.json` sha 前后均为 `0412673d14737e85…`；重开记录段数一致 |
| ③ 分段听读 | PASS | 浏览器无桥时面板显示「当前环境无原生语音」、点击提示同文案、不生成桥对象（不假成功）；桥桩收到 3 次调用，语言依次 `zh / en / en`；切段后 `stop()` 被调用且当前段变为第 2 段 |
| ④ GPT 练习 | PASS | Prompt 含 `placeId=1`、`recordId=rec-20261103003114-89a031`、`blockId=blk-1-649442b8`、`contentRevision=2`；不含甲乙姓名/slug/令牌；同段回贴 2 次 → 复盘文件数 +1（最终 12 份），两份并列，旧文件 sha 不变 |
| ⑤ 错匹配 | PASS | 从错误地点 placeId=2 进入 → 手选 `placeId=1` → 记录 `rec-20261103003120-d49a42` 只出现在「龙兴路」，placeId=2 记录列表中不存在 |
| ⑥ 失败路径 | PASS | `aiConsent=false` → `CONSENT_REQUIRED` 降级（非 `RATE_LIMITED`）+ 手工切句 1 句 + 原文逐字保留 |
| ⑦ 合并/拆分/编辑 | PASS | 段数 10→9（合并）→10（拆分）→10（编辑）；全程逐字回溯成立；句子总数始终 10；合并 span 连续覆盖原两段、拆分两段 span 首尾相接；编辑后 blockId/原文/句数不变，版本 4→5 |
| ⑧ 主题（附加） | PASS | 默认浅色；浅色/深色/跟随系统三项齐全；深色跨刷新保持；字体/阅读设置面板正常 |

## 二、命令与退出码

| 命令 | 结果 |
|---|---|
| `python3 socialmate-v1.2/build-v12.py` | 退出码 0（apps 51 / steps 204 / places 115 / stories 5） |
| `bash socialmate-v1.2/service-all.sh health` | 退出码 0，4/4 HEALTHY |
| `node socialmate-v1.2/verify-n05-ui.mjs`（第 1 次，日志 `ui-run7.log`） | 退出码 1：⑦ 拆分等待超时（合并后立即拆分触发 400ms 写间隔，`RATE_LIMITED`） |
| `node socialmate-v1.2/verify-n05-ui.mjs`（第 2 次，日志 `ui-run8.log`） | **退出码 0，8/8 PASS** |

运行时长约 2 分 19 秒（脚本内置两次 62s 等待，用于避开 60s/12 次写限流窗口）。

## 三、真机截图（`qa/20261102-s5ui/`）

| 文件 | 内容 |
|---|---|
| `20261103-device-01-memory.png` | 补记面板：虚构人物「N05 UI 测试甲」+ 3 段原文（未确认、未写主档） |
| `20261103-device-02-place-records.png` | 龙兴路地点档案：我的游玩记录 12 条（倒序、私有、不进 115 源） |
| `20261103-device-03-listening.png` | 分段听读：第 1/10 段、原文/中英 A/B、中文/英A/英B/听词组/循环/上下段，含合并/拆分/编辑入口 |
| `20261103-device-04-gpt-practice.png` | GPT 练习：回贴复盘弹层，归属 `recordId/blockId/contentRevision` 明示 |
| `20261103-device-05-gpt-prompt-area.png` | 附加：复制 GPT Prompt / 回贴复盘 / 练习复盘列表 |
| `20261103-web-01..04-*.png` | CDP 侧同四项的证据截图（390×844，2x） |

真机原生桥复核：`SocialMateTts.status()` → `state=ready, engine=com.xiaomi.mibrain.speech, zhAvailable=true, enAvailable=true`；点击「中文」回执「第 1/10 段 · 中文 voice · 循环 1 次」。

## 四、本轮修复

1. `source/V1.1-baseline.html` · `mergeBlocks`：原先把「前段末句 + 空隙 + 后段首句」并成一句，句子数 -1，后端按原文句数校验会返回 `SEGMENT_LOSS_DETECTED`。改为保留独立句子、把段间空隙前挂到后段首句，合并/拆分均满足句数守恒与逐字复原。已重新构建 `index.html`（退出码 0）。
2. `verify-n05-ui.mjs`：③ 增加「无桥不假成功」断言；⑤ 改为从错误地点进入、手选 placeId=1（龙兴路）；⑦ 改为合并/拆分/编辑 + 句数守恒（原主题项降为 ⑧ 附加）；合并与拆分之间固定 900ms 写间隔。

## 五、数据与边界

- `SocialMate-Data/People` 真实档案 41 文件聚合 sha：运行前/后均为 `78482d07840f5f3b41e8b1c857b592e03fcaf3c57713d970b405efc4953534d3`（未变）。
- `socialmate-v1.2/source/places-115.json`：`0412673d14737e85c9554c1cb9b4990bafb4d6b71082f330ced518c128a836e9`（未变）。
- 测试数据均为虚构并保留：人物 `n05ui-a` / `n05ui-b`；`PlaceNotes/1`、`PlaceNotes/2` 下本次测试记录与复盘 JSON。
- 未 commit / push；未跑全量回归；未改预算；未改 `ai-gateway/**`、`android-poc/**`、`public/**`、`public-share.*`、`sw.js`、`places-115.json`。

## 六、遗留项

1. **浏览器无原生 TTS**：③ 在浏览器只能验证「降级不假成功 + 桥参数」；真机已确认桥 `ready` 与 `zh/en` 语音可用，但未逐句做听感/音质验收（需人工听）。
2. **旧复盘正文不回传**：真机列表只显示 4 条旧报告的元信息（时间/版本/已保存），正文提示「未在本机缓存；旧报告仍保留在后端」。后端确有正文，前端缺少按需拉取入口，建议后续补 `GET` 报告正文。
3. **写限流无自动重试**：服务端要求相邻写间隔 ≥400ms；用户快速连点合并/拆分可能看到 `RATE_LIMITED`。脚本已用 900ms 间隔规避，UI 层未加重试/禁用。
4. **测试记录堆积**：龙兴路下现有 12 条虚构测试记录（含多次运行产物），按要求保留并标注为虚构，不作清理。
5. **脚本耗时**：为避免 60s/12 次写限流，单次验收固定等待约 2 分钟；适合按需跑，不适合高频 CI。
