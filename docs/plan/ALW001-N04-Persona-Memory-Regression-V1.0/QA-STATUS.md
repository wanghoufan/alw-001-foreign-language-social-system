# N04 逐次验收状态（云端交接基线）

**记录时间**：2026-11-02
**审查依据**：Mac Mini Project Reader真实读取源码/旧验收/旧日志、云端写入并回读N04母版与SDD。本文件不等于桌面构建/手机运行结果。
**规则**：QA运行只追加新时间戳报告与截图，不覆盖这一条历史；不能将NOT_RUN改为PASS而没有原始证据。

| 测试 | 当前状态 | 已有依据 / 所缺证据 |
|---|---|---|
| 3人物9会话54段合成母版 | **PREPARED** | fixtures/demo-personas.json已写入、JSON结构/来源静态交叉验证通过；待桌面运行verify-fixtures.mjs |
| 3人默认在手机人物Tab可见 | **NOT_RUN** | 尚未由桌面开发者集成到真实WebView和Mac演示存储 |
| 3人专属2题+通用1题 | **NOT_RUN** | 预期问句已写入fixture，但尚未见实际API和手机截图 |
| 会话final→候选→用户确认→即时更新 | **NOT_RUN** | 已有复盘确认底层，但没验证当轮记忆缓存实时刷新 |
| 9份Mac Demo Markdown+JSON | **NOT_RUN** | 已提供9会话原文母版，尚未调用真实接收端生成长期归档 |
| 断网补传与Mac回读 | **历史部分PASS；本轮NOT_RUN** | N03历史合成归档曾成功，本轮要做演示模式0.7.0完整复验 |
| 手机Markdown保存可读 | **历史部分PASS；本轮NOT_RUN** | N03历史SAF导出已测试，本轮需在三人模式操作 |
| 清空演示副本、重启、恢复、幂等 | **NOT_RUN** | 本轮首次正式纳入产品要求 |
| 清空/恢复后真实档案hash不变 | **NOT_RUN** | 必须在隔离情况下完成且保留hash |
| 0.7.0完整APK/ADB真机对应 | **NOT_RUN** | 源码versionCode25，但当前日志与手机工件尚未一一配对 |
| 真人双人/BOYA分离准确率 | **POSTPONED** | 需要两位真人及实际知情同意，不得模拟冒充 |

## 开发者实际完成后必须持续落盘的证据

Mac：~/Documents/SocialMate/Demo/QA/N04-<时间戳>/
包含 persona-comparison.json、memory-timeline.jsonl、archive-inventory.json、clear-restore.json、actual-ui-screenshots、test-report.md、gradle-build.log、adb-install.log、apk.sha256。

**必须保持母版不受“清空演示”的影响，记录真实屏幕中至少3张人物卡及9段历史入口。**
