# Mia Chen · Bilingual Conversation Test Script (English Spoken Material)

- 目的：用**英文对话**验证「实时 ASR → 实时建议 → 录音原文 → 归档 → 会后复盘 → 人物档案更新 → 地点推荐」整条链路。
- 场景：海口，周六下午去红城湖公园散步/拍视频；对话中夹一段跨境电商成本话题。
- 角色：你（我）＋ Mia Chen（陈美玲，新加坡华人，跨境电商东南亚市场运营）。
- 时长：3–4 分钟对话；全程约 15 分钟（含配对、复盘、核对）。
- **重要：红城湖是私有地点，归档和复盘也需要令牌。测试前必须先完成第 0 步配对，否则红城湖卡片不出现、归档 401、复盘打不开。**

## 0. Before the test（中文操作说明）

1. **配对手机**：Mac 执行 `curl -s http://127.0.0.1:8791/v12/api/pair/code` 取 6 位码 → 手机「高级设置」→ 输入配对码 → 点「配对这台手机」。成功后显示「配对：已配对…（短期令牌有效）」。
2. 打开 App →「开始实时对话」→ 高级设置确认处于「外出模式」（或本次要测的本机 USB 模式）。
3. 在「人物」页确认能看到 **Mia Chen（陈美玲）**；在「海南」页搜索「红城湖」，确认私有地点已加载。
4. 勾选「对方已知情并同意录音」；如需归档/复盘，再勾选「本轮保存原文，停止后自动同步到我的 Mac」。
5. 两人离手机 0.5–1 米，不要遮挡麦克风；每句说完停 1–2 秒，不要抢话。

## 1. Spoken dialogue（全部用英文说）

> Mia 的台词故意加入 `Shopee / TikTok Shop / GMV / ROI / SKU / campaign` 等英文词，并放入 3 条**新的成本/搬家事实**，用来验证 ASR、建议、复盘候选与档案更新。

| # | You (我) | Mia Chen (对方) |
| --- | --- | --- |
| 1 | Hey Meiling, long time no see. Are you still working at the same cross-border e-commerce company? | Yeah, still doing Shopee and TikTok Shop store operations for the Southeast Asia market. I have to submit a GMV and conversion-rate review every month, and the ROI of this campaign needs another look. |
| 2 | Sounds busy. What else have you been up to besides work? | I've been studying cross-border e-commerce cost management. I'm planning to take a cost management certification exam next month. Right now I'm breaking down the cost structure of each SKU: logistics is about 18%, packaging 6%, and platform commission around 12%. |
| 3 | Do you still have time to get out on weekends? You can't stare at spreadsheets all day. | I do. I want to walk around Hongcheng Lake Park on Saturday afternoon. There's a running track around the lake, lots of people walk there in the evening, and I want to shoot some short video clips. |
| 4 | I've never been to Hongcheng Lake Park. How do you usually plan it? Shall we grab a coffee? | Sure. I'm used to looking at data before talking about feelings. Before we meet, I'd like three specific numbers from you: time, place, and budget. |
| 5 | Let's keep it simple then: Saturday at 3 p.m., the east gate of Hongcheng Lake Park, budget within 200 yuan. How does that sound? | That works. Under 200 is fine. Ideally no entrance fee, and I don't want to travel too far. Actually, I've also been calculating moving costs. A one-bedroom in Haidian Island is around 3,200, which is 600 more than my current 2,600 near Guoxing Avenue. |
| 6 | So are you leaning toward moving or staying? Is Haidian Island far from your office? | I'm still comparing. Haidian Island has a nicer environment, but I live near Guoxing Avenue now, the commute is convenient, and the rent is cheaper. I'll decide after I finish the cost sheet. |
| 7 | Alright, let's not talk about work on Saturday—just walk and take photos. Are you bringing your stabilizer? | Yes. I usually shoot 30-second Haikou lifestyle clips with my phone and a stabilizer and post them on Xiaohongshu. Last time I filmed the morning market at Qilou Old Street; this time I want to film Hongcheng Lake at dusk. |
| 8 | That sounds great. Is your December Semporna trip still on? | Yes, I want to take a one-week annual leave to travel and dive in Semporna, Malaysia. I'm saving up leave and looking for someone to share a boat with. If you're interested, I can send you the budget and itinerary. |
| 9 | I'd love that. See you Saturday. Do you want me to send you the place and budget to confirm first? | Yes, and for anything important, please add one English sentence. If you send it in Chinese plus one English line, I can read it faster. |
| 10 | No problem. Saturday at 3 p.m., east gate of Hongcheng Lake Park, budget 200. I'll send you a bilingual confirmation. | Perfect. See you Saturday. |

## 2. What to watch during recording

| 观察点 | 预期 |
| --- | --- |
| Real-time ASR | 每句 1–4 秒内出字幕；英文句子基本完整，中英地名（Hongcheng Lake Park / Qilou Old Street / Haidian Island / Guoxing Avenue）能被识别或接近 |
| Numbers | `18% / 6% / 12% / 3,200 / 2,600 / 600 / 200` 尽量正确；错一两个可接受，但原文里要能看见 |
| Speakers | 出现两个说话人聚类编号；**不要**把编号直接当成“我/她”，归属在复盘时人工选 |
| Suggestions | 说完 1–2 句后出现接话/追问建议；本轮不勾云端 AI，本地建议即可 |
| Place cards | 说到「Hongcheng Lake Park」后出现红城湖公园卡片；说到「Qilou Old Street / coffee / dusk photos」可能出现骑楼老街、世纪公园、海口湾、龙兴路咖啡等卡片（按关键词匹配，不要求固定张数） |
| Transcript / archive | 停止后状态应为「已同步 Mac」，归档历史能看到本轮逐字原文 |

## 3. Stop → review → update Mia's profile

1. 点「停止录音」→ 等归档状态变为「已同步 Mac / 已同步」。
2. 点「本轮原文与复盘」→ 打开 `/v12/history?session=…`。
3. 点「生成本地复盘（不调用 AI）」；未授权时不要点「用云端 AI 生成复盘」。
4. 在候选卡片里，把**Mia 说的、值得长期保存的事实**人物选成 `Mia Chen（陈美玲）`。
5. 建议本轮确认 2–3 条：
   - “I'm planning to take a cost management certification exam next month.” → `工作 / 学习`
   - “A one-bedroom in Haidian Island is around 3,200, 600 more than my current 2,600.” → `共同点` 或 `海南生活`
   - “I want to walk around Hongcheng Lake Park on Saturday afternoon.” → `对方近期计划`（一次性安排，可不保存）
6. **不要勾选/保存**：
   - 你自己说的句子（不能归到她档案）。
   - 已有的“Shopee/TikTok Shop”“GMV/ROI”“Semporna diving”“Qilou Old Street”“Chinese-English mix”“time/place/budget”等旧事实，避免重复。
   - “Saturday 3 p.m., east gate”这种一次性约定，不要写进长期偏好。
7. 点「确认保存到本机档案」→ 到「人物」页打开 Mia Chen，核对新增行与来源标记。
8. 可直接看 `SocialMate-Data/People/Mia-Chen/00-profile.md`，确认只追加、不覆盖原文。

## 4. Pass criteria

- **PASS**：英文 ASR 可用且关键数字/术语大体正确；至少 1 条建议出现；红城湖卡片出现；归档 2xx；本地复盘生成候选；至少 2 条 Mia 的新事实写入她的档案；旧事实不重复。
- **PARTIAL**：字幕/建议可用，但红城湖卡片缺失（先查配对和私有地点加载）或归档未同步。
- **FAIL**：无字幕、无建议、复盘打不开或写入别人档案。

## 5. Troubleshooting

- **No Hongcheng Lake card**：先确认已配对，再打开「海南」页搜索红城湖；私有地点没有令牌不会加载。公共地点（世纪公园、海口湾、骑楼老街）不受影响。
- **Review 401 / won't open**：未配对或令牌过期；重新配对后重开「本轮原文与复盘」。
- **No subtitles**：确认在 `?live=1` 实时页，SSE 显示「字幕已接入」；本轮已修外出 https 的 SSE 白名单。
- **Speaker IDs drift**：`spk_N` 只是聚类编号，不是身份；档案归属必须人工选 `Mia Chen`。
- **Number errors**：先看原文是否保留数字；英文百分比、金额连读容易识别错，属于 ASR 质量观察项，不是链路失败。