# N06 阶段 3 · 话题内容补全与字幕主动点词查询

- 日期：2026-11-10
- 版本：**0.9.21（versionCode 89）**
- APK：`android-poc/app/build/outputs/apk/debug/app-debug.apk`，57,144,585 B，SHA-256 `a9c0127243c8b9714280a11080d90a51efc24d76a934a55c3cfc23291688c474`
- 签名：V2 `8e82a797…911cf3`（与 0.9.15 已装包一致）
- 范围：`socialmate-v1.2/index.html`、服务端 `socialmate-prototype/ai-gateway/server.mjs`、Android `DirectCloud.java` / `LocalServer.java`、`build.gradle` 版本；新增验证脚本与内容数据文件。未改 `build-v12.py`，未改 `SocialMate-Data/`。

## 1. 话题内容

### 1.1 话题包（170 条）

| 一级子标签 | 条数 | 页内分组 | 数据文件 |
|---|---:|---|---|
| 日常生活 | 20 | 平铺 | `topics-daily-R1.json` |
| 文化习俗 | 20 | 平铺 | `topics-culture-R1.json` + `topics-culture-R2-add.json` |
| 健身运动 | 46 | 球类 18 / 板类与户外 14 / 体能与日常 12 / 观赛与赛事 2 | `topics-fitness-R1.json` + `topics-ball-R3-add.json` + `topics-board-R3-add.json` |
| 更多 | 84 | 旅行与美食 9 / 影音与游戏 10 / 城市与环保 7 / 宠物与摄影 3 / 工作学习 20 / 家庭与关系 17 / 金钱健康科技 18 | `topics-more-R1.json` + `topics-more-R2-add.json` + `topics-work-R3-add.json` + `topics-family-R3-add.json` + `topics-life-R3-add.json` |

共 **170 条**，页面内 `window.N06_TOPICS`。每条含中英标题、40–70 字中文说明、35–60 词自然英文、2–3 条双语问句、来源 URL、核实日期。卡片可展开「N 条双语话题与来源」，英文问句一键复制。话题不绑定日期，不显示倒计时。

**球类（18）**：足球、篮球、乒乓球、网球、匹克球、羽毛球、排球、沙滩排球、棒球、垒球、板球、橄榄球、高尔夫、台球/斯诺克、保龄球、飞盘、壁球、手球。

**板类与户外（14）**：游泳、游泳安全、徒步、骑行、滑板、冲浪、单板滑雪、双板滑雪、桨板、轮滑/滑冰、室内攀岩、越野跑、山地骑行、露营。

### 1.2 节日来源与日期

- 47 条：**fixed 44 / pending 3**；原来 26 条 pending。
- 仍 pending：`hainan-junpo` 军坡节、`hainan-huanhua` 换花节、`hainan-carnival` 海南欢乐节（无政府公告源，保持待确认；换花节保留元宵日期但状态不改）。
- 修正：`japan-obon` 盂兰盆节 2026/2027 由 8 月 13 日改为 **8 月 15 日**（8/13 是迎魂火起始日），`dateRule` 已注明地区差异。
- 主要来源：香港天文台公历农历对照表、香港政府宪报公众假期、Nager.Date、新加坡人力部、Office Holidays、联合国；维基仅作辅助。
- 补丁文件：`docs/design/n06-s3/festival-sources-R1.json`、报告 `festival-sources-R1.md`。

## 2. 字幕主动点词查询

### 2.1 行为

- 默认不扫描、不高亮、不加下划线或徽章；只有用户点中某个英文词（或长按选区）才查询。
- 只发送该词 + 当前句子（≤400 字），不发送整段聊天；复用现有云端 AI 同意开关，未勾选时只给提示、不发请求。
- 结果卡显示中文解释、可顺势问的中文与英文问句；支持复制英文追问、关闭、改查另一个词、查看原句。
- 查询不停止录音、不改变字幕原文与条数、不切换 ASR 状态；相同「词 + 句子」本地缓存 120 条，不重复计费。
- 查询失败明确显示原因（额度、超时、网络、未配置 Key），不杜撰释义。

### 2.2 实现

| 层 | 文件 | 变更 |
|---|---|---|
| 页面 | `socialmate-v1.2/index.html` | `termPickedWord / termQuery / termCardHTML`；`.v152en[data-term-src]`；结果卡样式与中英文案；缓存写入 `SAV.termCache` |
| 服务端 | `socialmate-prototype/ai-gateway/server.mjs` | 新增 `POST /api/ai/term`：consent、预算、并发闸、9.5s 超时、DeepSeek 记账，返回 `zh/askZh/askEn` |
| 手机直连 | `DirectCloud.java` | 新增 `term()`，走现有 DeepSeek Key、每日 1 元额度与账本 |
| 本地路由 | `LocalServer.java` | `/api/ai/term` → `direct.term()`；手机无 Mac 时也能查 |

### 2.3 取消 AI 同意门禁（2026-11-10 用户要求）

- 删除聊天页「允许把字幕发送给云端 AI」复选框与 `S.session.cloudConsent` 门禁；自动接话、术语查询、按需翻译都不再要求勾选或弹窗。
- 删除翻译按钮的 `window.confirm`、豆包朗读的费用确认；删除 N05 记忆整理与地点匹配里的 AI 同意复选框。
- 页面请求继续带 `consent:true`（接口字段），语义改为「用户点击即同意」，不再是 UI 步骤。
- APK 内 `LocalServer` 对 `/api/ai/*` 校验 `x-archive-token`；此前翻译与接话请求未带令牌会 401，现统一带 `uiToken()`，手机端不再依赖 Mac。

### 2.4 接话卡片修复

真实 AI 返回 `reply` 为对象 `{topic,reply,questions,share}`，旧渲染把对象当字符串，页面出现 `[object Object]`。新增 `aiReplyParts()` 统一取值，接话、追问、分享与复制按钮均按字符串渲染。

## 3. 验证

### 3.1 网页层（8791，无头 Chrome）

`node socialmate-v1.2/verify-n06-s3.mjs` → **PASS 22/22 · 5 图**
结果 `socialmate-v1.2/n06-s3-result.json`，截图 `socialmate-v1.2/qa/n06-s3/`。

覆盖：默认无标注、点击取词、只发一次且只送词与句、中文与英文追问、字幕与 ASR 不变、关闭、缓存命中不重复请求、无任何同意控件仍直接查询、翻译按钮无确认直连、接话无 `[object Object]`、卡内改查、四个话题包条数（20/20/46/84）与复制问句、健身四组与球类含乒乓/匹克球/网球/羽毛球、更多七组、节日 47 / 待确认 3、375/393/430/520 无横向溢出、0 JS 异常。

### 3.2 Mac 服务端真实调用（2026-11-10 00:50）

重启组合服务（新 pid 47691）后直连验证：

```text
POST /api/ai/term {"term":"berimbau","context":"We use a berimbau when we practise capoeira.","consent":true}
→ ok=true, mode=real-ai, provider=deepseek, model=deepseek-flash, latencyMs=2527
→ usage: prompt 150 / completion 68 / total 218
→ zh: Berimbau 是一种巴西的单弦乐器，在卡波耶拉（巴西战舞）里用来伴奏。
→ askEn: How is this instrument usually played?
```

说明：网页验证用页面内 mock（0 费用），本条为服务端真实 DeepSeek 调用，证明 `/api/ai/term` 路由、预算闸与记账均生效。

### 3.3 安装包与真机（OPPO PLG110）

- 覆盖安装守卫：签名一致；vc83→89、0.9.15→0.9.21（0.9.16 查词+首批内容、0.9.17 补文化/更多、0.9.18 补球类/板类/职场/家庭/金钱健康科技、0.9.20 取消同意门禁并补 AI 令牌、0.9.21 修接话渲染）；`socialmate-secure.xml` 710B、`socialmate-config.xml` 282B、`socialmate_local.db` 217,088B 装前后一致。
- 真机回读：话题 20/20/46/84；健身页 4 组（球类 18）；更多页 7 组；节日 47（待确认 3、已核对 44）。
- 真机无同意门禁：页面 0 个 AI 同意复选框；点 `capoeira` 直接返回中文解释；点翻译直接返回中文；自动接话返回真实英文且无 `[object Object]`。
- 设置页「版本 0.9.21（构建 89）· N06 阶段 3」。
- 点词查询真实链路：点 `capoeira` → DeepSeek 返回解释「capoeira 是巴西的一种武术，结合了舞蹈和音乐」+ 英文追问，字幕与消息条数不变、`asrState=off`。
- 证据：`docs/qa/2026-11-10-n06-s3/`。
- 内容抽检：话题来源 `gov.uk`、`nhs.uk`、`mom.gov.sg` 本轮实抓均 200；文化习俗首条与「第一次做客」「公筷与敬酒」已读，均写明「各地差异很大，不要默认」。

## 4. 未完成 / 未验证

- 真机**未在录音进行中**并发点词（避免打断真机 ASR 会话）。
- 用户侧不再有任何 AI 同意勾选；服务端接口字段 `consent:true` 保留。
- 3 条海南节日仍待政府公告；海南其余 102 个地点仍是单封面。
- 游玩记录保存写入落库仍未实测。
- 未 commit、未推送、未部署。