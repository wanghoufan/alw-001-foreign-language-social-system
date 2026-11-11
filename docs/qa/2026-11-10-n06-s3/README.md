# N06 阶段 3 · 真机取证（2026-11-10）

- 设备：OPPO PLG110（Android 17 / ColorOS 17；序列号不记录）
- 装机：**0.9.21 / versionCode 89**（覆盖安装，未卸载）
- APK：`android-poc/app/build/outputs/apk/debug/app-debug.apk`，57,144,585 B
- SHA-256：`a9c0127243c8b9714280a11080d90a51efc24d76a934a55c3cfc23291688c474`
- 签名：V2 `8e82a7975008e8ec87ff0f2ecadf495b5263effa34aaec9ab6f135ebea911cf3`（= 0.9.15 已装包）

## 证据

| 项 | 结果 | 证据 |
|---|---|---|
| 安装 | `install -r` Success；vc89 / 0.9.21（连续覆盖：内容扩充 → 取消同意门禁 → 修接话渲染） | dumpsys |
| 数据保留 | `socialmate-secure.xml` 710B、`socialmate-config.xml` 282B、`socialmate_local.db` 217,088B，装前后一致 | run-as ls |
| 话题 › 日常生活 | 20 卡 / 60 复制按钮 | CDP |
| 话题 › 文化习俗 | 20 卡 / 45 复制按钮 | CDP |
| 话题 › 健身运动 | 46 卡 / 137 复制按钮；4 组（球类 18 / 板类与户外 14 / 体能与日常 12 / 观赛与赛事 2） | CDP；`06-fitness-balls.png` |
| 话题 › 更多 | 36 卡 / 108 复制按钮 | CDP |
| 节日 | 47 卡；待确认 3、已核对 44 | CDP；`03-festival-verified.png` |
| 点词查询（无同意） | 点 `capoeira` → 直接返回中文解释 + 英文追问；页面无「勾选」提示；字幕与消息条数不变；`asrState=off` | CDP；`08-term-no-consent.png` |
| 按需翻译（无确认） | 点翻译 → 直接返回中文，无 `window.confirm` | CDP；`09-translate-direct.png` |
| 自动接话（无同意） | 直接请求，接话显示真实英文，无 `[object Object]` | CDP；`10-coach-fixed.png` |
| AI 同意控件 | 页面 0 个 | CDP |
| 版本可查 | 设置 › 高级诊断「版本 0.9.21（构建 89）· N06 阶段 3」 | CDP |
| 页面布局 | 话题页 20 条卡片、中英说明、来源行可展开；无横向溢出 | `02-topics-daily.png` |
| 文化习俗页 | 20 卡 / 45 复制按钮 | `04-topics-culture.png` |
| 健身球类 | 球类 18 条，含乒乓球/网球/匹克球/羽毛球/排球/棒球/板球 | `06-fitness-balls.png` |
| 更多页 | 36 卡 / 108 复制按钮 | `05-topics-more.png` |
| Mac 服务端 | `POST /api/ai/term` 真实 DeepSeek 返回（latency 2527ms，tokens 218，mode=real-ai） | curl |

## 真机回读原文（摘）

```text
packs: daily 20, culture 20, fitness 46, more 84, festival 47 (pending 3, ok 44)
topicCount 170
firstCard 通勤日常 Commuting
firstSource 来源：https://www.gov.uk/government/statistics/national-travel-survey-2023 · 核实：2026-11-10
term: clickedWord=capoeira, state=ok
zh: capoeira 是巴西的一种武术，结合了舞蹈和音乐。这句话的意思是：我开始练卡波耶拉了。
askEn: Do you want to know about the moves or the music part?
subtitleUnchanged=true, messages=1, asrState=off
version: 版本 0.9.21（构建 89）· N06 阶段 3
```

## 前置体检回执

```text
【前置体检回执】
体检是否执行：已执行
逐项结果：①灭屏 通过（screen_off_timeout=1800000 原值未改；stay_on 临时设 usb，收尾恢复 7）②端口 通过（8790/8791/8781/8782 HEALTHY；forward 9223 原指向旧 socket，已重建为本轮进程）③服务 通过（4/4）④反向映射 通过（reverse 空，未占他人条目）
结论：允许开跑；收尾已清场
```

## 覆盖安装守卫回执

```text
已核对签名：是（新包与已装包均为 V2 证书 8e82a797…911cf3，apksigner 比对一致）
已核对版本递增：是（versionCode 83 → 89，versionName 0.9.15 → 0.9.21，dumpsys 回读 89/0.9.21）
已核对 Key 与本地库保留：是（secure.xml 710B、config 282B、socialmate_local.db 217,088B，装前后一致）
```

## 点击门禁回执

```text
【点击门禁回执】
安全区判定：本轮页面交互均走 CDP 元素点击/合成点击，未用 adb input tap
点击与回读：①话题子标签 daily→20 卡 ②culture→12 卡 ③fitness→20 卡 ④more→24 卡 ⑤festival/all→47 卡、待确认 3 ⑥字幕点词→解释卡出现并回读中文/英文追问
破坏性按钮：无（未点保存、未点删除、未改真实人物档案）
结论：点击操作可信
```

## 清场

- `forward tcp:9223` 已移除；他人 9461/9462 未动；`reverse --list` 空。
- `stay_on_while_plugged_in=7`（原值）；`screen_off_timeout=1800000`（原值）。
- App 已 `force-stop` 后重启，页面内存中的测试会话已清；未写业务库。
- 无本任务临时文件残留在设备。

## 未验证

- 聊天页「允许发给云端 AI」复选框的真实勾选路径（本轮用页面状态注入 `cloudConsent=true` 验证链路）。
- 录音进行中点词查询（避免打断真机 ASR 会话）。
- 游玩记录保存写入落库、长时后台保活（不属本轮改动）。