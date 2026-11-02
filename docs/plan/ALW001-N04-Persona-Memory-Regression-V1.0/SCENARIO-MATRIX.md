# N04 三人物永久演示数据 · 逐项测试矩阵

> 这是待执行的验收计划及合成数据清单，不是已经完成的手机测试报告。

| 人物 | 地区/性格（纯虚构） | 既有确认事实 | 第二次会话待确认新记忆 | 确认前专属问题 | 确认后专属问题 |
|---|---|---|---|---|---|
| Oliver Reed (demo-oliver-uk) | 英国·伦敦 / 简短、直接、具体、少闲聊 | Oliver goes strength training three mornings a week.；Oliver is working toward his first strict pull-up. | Oliver is preparing for his first 10-kilometre race in December. | How is the pull-up goal going? / Have you found a routine that works for your three gym mornings? | How is your 10K training for December going? / Are easy runs affecting your gym sessions? |
| Maya Torres (demo-maya-us) | 美国·奥斯汀 / 轻松、积极、开放式、有趣的追问 | Maya designs posters for small local bands.；Maya enjoys small live-music gigs. | Maya is considering a trip to Haikou and wants to try local street food. | Have you made any new posters for local bands? / What's the best small gig you've seen recently? | What kind of Haikou street food would you like to try? / Would you rather explore food stalls or small music venues first? |
| Ji-eun Park (demo-jieun-kr) | 韩国·首尔 / 温和、留停顿、一次只问一件事 | Ji-eun enjoys photographing old streets.；Ji-eun prefers quiet cafes to crowded bars. | Ji-eun is practising English to talk about her photography. | Have you found another old street you'd like to photograph? / Did you try any new quiet cafes recently? | Would you like to practise describing a photograph in English? / What story does your morning-light picture tell? |

## 必须检验并永久留存的 9 套原文
### Oliver Reed — 3 次模拟会话
- [ ] 1. sess_n04_demo_oliver_uk_1 · 2026-10-20T09:00:00.000Z · 6 段 · 包含模拟speaker编号、逐字英文final；待生成 Mac Demo 目录下真实接收的 .md + .json，保存日志与SHA
- [ ] 2. sess_n04_demo_oliver_uk_2 · 2026-10-27T09:00:00.000Z · 6 段 · 包含模拟speaker编号、逐字英文final；待生成 Mac Demo 目录下真实接收的 .md + .json，保存日志与SHA
- [ ] 3. sess_n04_demo_oliver_uk_3 · 2026-11-01T09:00:00.000Z · 6 段 · 包含模拟speaker编号、逐字英文final；待生成 Mac Demo 目录下真实接收的 .md + .json，保存日志与SHA
### Maya Torres — 3 次模拟会话
- [ ] 1. sess_n04_demo_maya_us_1 · 2026-10-20T14:00:00.000Z · 6 段 · 包含模拟speaker编号、逐字英文final；待生成 Mac Demo 目录下真实接收的 .md + .json，保存日志与SHA
- [ ] 2. sess_n04_demo_maya_us_2 · 2026-10-27T14:00:00.000Z · 6 段 · 包含模拟speaker编号、逐字英文final；待生成 Mac Demo 目录下真实接收的 .md + .json，保存日志与SHA
- [ ] 3. sess_n04_demo_maya_us_3 · 2026-11-01T14:00:00.000Z · 6 段 · 包含模拟speaker编号、逐字英文final；待生成 Mac Demo 目录下真实接收的 .md + .json，保存日志与SHA
### Ji-eun Park — 3 次模拟会话
- [ ] 1. sess_n04_demo_jieun_kr_1 · 2026-10-20T04:00:00.000Z · 6 段 · 包含模拟speaker编号、逐字英文final；待生成 Mac Demo 目录下真实接收的 .md + .json，保存日志与SHA
- [ ] 2. sess_n04_demo_jieun_kr_2 · 2026-10-27T04:00:00.000Z · 6 段 · 包含模拟speaker编号、逐字英文final；待生成 Mac Demo 目录下真实接收的 .md + .json，保存日志与SHA
- [ ] 3. sess_n04_demo_jieun_kr_3 · 2026-11-01T04:00:00.000Z · 6 段 · 包含模拟speaker编号、逐字英文final；待生成 Mac Demo 目录下真实接收的 .md + .json，保存日志与SHA

## 用户在手机上的真实操作验收

1. 打开人物：三张演示人物卡直接可见，无需自己运行脚本；任意卡展示人物资料、三条会话与已确认事实。
2. 同一人物第一次进入：两条个性化问题 + 一条通用问题，明确不同来源。人物之间内容不会串档。
3. 回放第二次会话：出现一条「待确认」新事实和源段号，未确认时私人档案不变化；确认后同屏定制问题立即更换。
4. 退出再进：新记忆仍在；把新记忆撤销后回复旧的问题或不再引用；第三次会话可使用新语境。
5. 原文：手机每条可逐字查看、导出.md，在Mac Demo目录找到同名md/json，每句字节层面忠实于合成fixture。
6. 网络断开→outbox待上传→网络恢复→Mac生成md/json；重复上传不生成第二份。
7. 演示管理→清空→退APP重新打开仍为空并展示恢复按钮；恢复→人物3/会话9/基线事实6/待确认3，重复恢复数量不变。
8. 每项留有实际截图、QA JSON/JSONL、APK哈希、设备序列号与最短操作说明。不得拿本清单勾选状态冒充实测。

## 永久证据目录约定
Git内母版：docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/fixtures/demo-personas.json
运行时演示：~/Documents/SocialMate/Demo/People、Demo/Conversations、Demo/QA、Demo/Backups
每轮 QA：新增时间戳目录，不覆盖前一次报告；用户随时可以查看。

## 当前状态
FIXTURES_WRITTEN_AND_STATICALLY_CHECKED — 仅母版及源引用核验通过。APP演示UI/自动导出/清空恢复/真机QA尚未由桌面开发者实施。
