# ALW-001 聊天页 UX V1.5

## 开发入口

- 项目根：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统`
- 现有实现：`socialmate-v1.2/source/V1.1-baseline.html`（页面）、`android-poc/app/src/main/java/app/socialmate/dualmic/AsrActivity.java`（原生桥）
- 构建：`sh android-poc/build-apk.sh`
- 组合服务：`bash socialmate-v1.2/service-all.sh health`
- 真机取证：`node scripts/sm-cdp.mjs --port <port> "<js>"`
- 当前基线：Android 0.8.28 / versionCode 63；ASR 上游 P066 流式（`mode=p066`）；归档、复盘、人物档案已闭环。

## 现状

- 聊天页是两栏工具台：左栏字幕+录音，右栏建议+资料；调试/连接/配置入口混在首页。
- 建议只有「自然接话」1 张 + 「继续追问」1 张，`planNow()` 用 `slice(0,1)` 截断候选。
- 字幕列表随对话变长，需要用户一直往下拖；新字幕会重建建议区。
- 关联资料在右侧，只有地点/软件/关于我，没有当前人物卡；信息密度高。

## 目标

把聊天页改成「现场交流优先」的单栏界面：

1. 顶部只留录音/连接状态、对话对象和停止按钮。
2. 字幕只显示最近 2–3 句，固定高度；历史可展开/收起。
3. 接话建议是主区域，四类方向、每类多个候选。
4. 关联资料保持可见，默认精简预览。
5. 英文为主、中文解释按需展开；操作按钮不堆叠。
6. 阅读建议时不被新字幕刷新打断。
7. 调试/端口/模型细节收进设置的高级诊断。
8. 浅色默认、深色可用，字号/触控/安全区达标，不新增一级 Tab。

## 本轮交付

- `prototype.html`：独立手机端原型，可交互切换深浅色、展开历史、四类建议、资料卡、阅读冻结。
- `SPEC.md`：布局/交互/状态/数据规格。
- `TASKS.md`：实施与整改清单。
- `ACCEPTANCE.md`：真机验收标准。
- 现有聊天页增量改造 + APK 0.8.29 / vc64。
- QA 证据：原型自检、长对话 DOM 压测（≥100 句）、短时 P066 真机回归。