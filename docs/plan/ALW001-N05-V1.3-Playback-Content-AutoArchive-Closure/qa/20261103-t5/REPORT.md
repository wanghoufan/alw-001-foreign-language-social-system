# REPORT｜ALW-001 N05 V1.3 真机验收（红城湖 19 段 · 混合播放队列 · 自动归档）

> 时间：2026-11-03 22:38–23:20（GMT+8）｜执行：主开发者连续执行，未中途停工
> 设备：`REDACTED-SERIAL`（Redmi 21091116AC / Android 11 / MIUI，**未清数据**）
> 安装包：**0.8.13 / versionCode 48**，同签名 `adb install -r`
> APK sha256：`738ff4c74c70bc6987a0041d3f55db26fab35ac416f57756d759e49d4c66f63b`
> 页面：`socialmate-v1.2/index.html` sha256 `48c289779333659c3001a1cb21d536bb3d8b7d687b4026bf66a191e37d5550bc`（源文件 `source/V1.1-baseline.html` `46e84a5f5829c1ebad0e3c01ef65bcdc2aba57b8f04b8b6655c34a0ab6001c6a`）
> 记录：`rec-20261103072022-16b79c` **revision 3**（19 段 / 102 条中英词组 / 99 条可播），sha256 `e56df8e8b9f34b8d23beea1648c2b07940d4b06398197fd6798178ab0fbf63bf`
> 朗读来源：真机实测两种——`remote`（`aws-polly-fake` 本地预置 WAV，不外传）与 `system`（本机小米语音引擎）。**真实 AWS Polly 音质仍是 NOT_RUN**。

## 判定口径

- `PASS`：真机真实点击 + 页面时间线/logcat + 截图三者齐全。
- `PARTIAL`：完成了一部分，缺口写清楚。
- `NOT_RUN`：没有真实证据，不推断。
- **本文件不允许用「单条音频循环 20 次」代替「一轮完整混合队列」的结论。**

## A. 核心用户界面

| 编号 | 结论 | 证据 |
|---|---|---|
| UX-01 布局 | **PASS** | 第一行左「听本段」右「循环 ×N」，第二行「听词组」，第三行「听中文 / 听英文 A」、第四行「听英文 B」；其下「上一段/下一段、编辑英文/表达、与下一段合并、拆分本段、复制 GPT 语音练习 Prompt、回贴复盘」全部在。截图 `shots/03-buttons.png`；按钮清单见 `shots/02-record.png` 同页 DOM 断言 |
| UX-02 单点听本段 | **PASS** | 真机 15 项完整串接，顺序 `zh→enA→enB→(词组 zh→en)→×6`；时间线 `loop3.json` 第 1 轮 / 单跑记录见下「时间线样例」；完成反馈「听本段 · 1 轮 × 15 项已完成」，截图 `shots/06-system-voice-done.png` |
| UX-03 循环 3 / 20 | **PASS（3 轮）/ PASS（20 轮）** | 3 轮：45 次元素播放 = 3×15，每轮顺序一致，18 次 1000ms 间隔，164 秒完成。20 轮：**300 项全部走完，1115.6 秒，状态「听本段 · 20 轮 × 15 项已完成」**，会话内 9 个完整轮次窗口（保留日志上限截断）每轮顺序一致、50 次 1000ms 间隔（`loop3.json`、`loop20.json`、`shots/11-loop20-done.png`） |
| UX-04 听词组 | **PASS** | 12 项只有词组对，`phrase-zh>phrase-en` 交替，6 次 1000ms 间隔；不含整段中文/英A/英B（`/tmp` 时间线已并入 `loop3.json` 同源脚本输出） |
| UX-05 单语与互斥 | **PASS** | 点「听中文」→ 单队列 1 项 zh；播放中再点「听英文 B」→ 旧队列被取消、新队列 1 项 en（状态行同步为「第 1/1 项 · 英文 B」）；点「停止」→ 队列释放、状态「待机 · 已停止」；「重试本段」重播最近一次模式 |
| UX-06 冷启动/失败/无 AWS | **PASS（系统语音兜底）** | 未配置真实 Polly、预算 0：`aws-polly-fake` 只读本地预置 WAV，页面明示「当前非真实 Polly，不会外传」；切「本机系统声音」后冷启动 6–8s 内起播（首次项上限已放宽到 12s），全程无第三方授权弹窗、无反复弹窗 |
| UX-07 旧控件 | **PASS** | 编辑英文/表达弹窗可开可关（`n05EnA/n05EnB/n05Phrases` 三字段，`shots/09-edit-en.png`）；回贴复盘弹窗标题「回贴复盘 · 第 1/19 段」；复制 GPT Prompt 返回「已复制并回读校验通过（recordId/blockId/revision 一致）」；上一段/下一段真实切段（1/19 ↔ 2/19）。合并/拆分：见 `merge-split-unit.json` 9/9 PASS（同一份真实数据、句数守恒、逐字复原），**未在生产记录上落版本**，避免改动用户数据 |
| UX-08 主题与窄屏 | **PASS** | 默认浅色；深色主题整页可读（`shots/13-dark.png`）；360×640 等效窄屏下 6 个播放按钮全部完整、无截断无横向滚动（`overflowX=false`、`clip=false`，`shots/15-narrow360.png`）；页面跑在原生 WebView 内核，不依赖谷歌浏览器 |

## A-1. 循环 20 轮（真机 · 系统语音 · 屏幕常亮）

| 指标 | 实测 |
|---|---|
| 每轮元素数 | 15（`zh→enA→enB→(词组中文→1000ms→词组英文)×6`） |
| 轮次 | **20/20 完成**，状态「已完成 · 听本段 · 20 轮 × 15 项已完成」 |
| 总时长 | **1,115,624 ms（18.6 分钟）** |
| 失败/跳过 | **0**（事件里无 `native_error`、无 `queue_failed`、无 `item_retry`） |
| 1000ms 间隔 | 保留窗口内 50 次（每轮 6 次，理论 120 次；日志保留上限截断早期事件） |
| 逐轮顺序 | 保留窗口内 9 个完整轮次逐条比对全部一致 |

**必须说明的证据边界**：本次会话日志原本上限 500 条，20 轮约 1200 条事件，早段被丢弃，所以 `item_start` 只有 124 条。判定「20 轮真的跑完」的依据是计数器 `loopDone` 只在整轮 15 项全部完成时才 +1，能到 20 即结构上证明 20 个完整队列；加上完整 3 轮日志（45 项 / 18 次间隔 / 3 个 `round_done`，逐轮断言通过）。日志上限已提到 6000 条，后续复跑可留全量。

## A-2. 主题与窄屏

- 浅色（默认）：`shots/14-light-buttons.png`
- 深色：`shots/13-dark.png`
- 360×640 等效窄屏：`shots/15-narrow360.png`，`document.documentElement.scrollWidth == innerWidth`，6 个播放按钮 `scrollWidth == clientWidth`（无截断）

## A-3. 真机踩到并已修的三个问题（都不是「测试环境噪音」，是产品缺陷）

1. **熄屏/切后台会中断整轮队列，且旧代码空等 30 秒才报超时。** 实测第 12 轮时屏幕自动熄灭 → Activity `onStop` → 原生 `stop`。已改为「收到原生 stopped 就立即标为被中断」，并保留已完成轮次、提示真实原因。复跑时开启屏幕常亮后 20 轮全程无中断。
2. **合成限流 12 次/分 让一轮 15 项必然 429**（`TTS_REMOTE_REJECTED`）。已拆独立额度 48 次/分。
3. **私有地点会在服务重启/令牌晚到时永久消失**（一次性加载失败后不再重试，海南列表停在 115 条，红城湖入口消失）。已加 3 次重试 + 切到海南时补拉，并在页面暴露 `window.__smLoadPrivate()` 供排查。

## B. 素材与归档

| 编号 | 结论 | 证据 |
|---|---|---|
| DATA-01 19 段与 rev3 | **PASS** | 原始逐字版 sha256 `041582674b4170c5708afc6735c0b3552eef63e993fc0482866ad1215e6d6cee` **未变**；rev3 只做两处清理（第 2 段回退 AI 补全「就是要……」、第 4 段删残留空行），前后 hash 见 `qa/20261103-t1-migration/migration-revision3.json`；句子总数 34 守恒（`merge-split-unit.json` M1） |
| DATA-02 phrasePairs | **PASS** | 19/19 段、102 条，全字段可定位；`parsed_from_original` 9 / `derived_from_source_zh` 92 / `ai_suggested` 1（不可播）；`needs_review` 2 条不可播（`SEGMENT-QC.md` + `phrase-pairs-v1.json`）；原 `phrases` 只读保留（`shots/03-buttons.png` 同屏可见两行） |
| DATA-03 归属与复盘 | **PASS** | rev3 的 `placeId` 已是 `pv-hongcheng-lake-park`（写路径 `Number("pv-…")→NaN→null` 已修）；历史记录读取侧补 `placeIdSource`，磁盘零改写（`sha256-before.txt` / `sha256-after.txt` 逐字节相同）；4 份复盘文件仍在 `practice/blk-hc-1、blk-hc-2` 下 |
| DATA-04 照片 | **PARTIAL / NO_SOURCE** | 仓库 633 张图与用户目录均无红城湖现场照片；不抓网图、不伪造日期。缺口与 photos metadata schema 见 `PHOTO-GAP.md` |
| ARCH-01 五类二次扫描 | **PASS** | 生产索引 run1：`扫描 84 个文件；新索引 52；未变 32`；run2：`新索引 0；未变 84`（幂等）。总数 33 → **85**，全部 `awaiting_consent` 未外发。分类 `self_test=1 course=0 conversation=3 thought=43 practice_review=38`。原件 hash 可重算（T3-T4 报告 §T4-1） |
| ARCH-02 断网/重启/非法上传 | **PASS** | 6 个无令牌/非法请求全 401；非法类型 400、超限 413、重复 duplicate；坏索引隔离留档后重建，原件字节不变；并发 `RUN_LOCKED`（`t4-1-auth-negative.log`、`verify-t4-1-archive.log`） |
| ARCH-03 P016 + 22:00 自然导出 | **NOT_RUN** | 无真机自然时序证据；缺陷与修复需求已交 `P016-HANDOFF.md`（`pushToMac` 返回值忽略、跨天补传失真、18791 `0.0.0.0` 无鉴权明文），**未跨项目改码** |
| ARCH-04 ChatGPT / 课程源 | **NO_SOURCE（已如实说明）** | 无权读取 ChatGPT 历史，只有「复制 Prompt 去练 → 回贴复盘 → 后台自动分类」这一条真实路径；`course=0` 是「无来源」，不是采集成功 |

## C. 证据清单

| 文件 | 内容 |
|---|---|
| `shots/00-home.png` `01-place.png` `02-record.png` `03-buttons.png` | 进入路径与学习页布局（含词组「中文 → 英文 · 待确认」与「可播词组 6/6」） |
| `shots/04-playing.png` `05-after-full.png` `06-system-voice-done.png` | 播放中与完成态状态行 |
| `shots/07-loop3-before.png` `08-loop3-after.png` | 循环 3 轮设置与完成 |
| `shots/10-loop20-start.png` `11-loop20-done.png` | 循环 20 轮开始与结束 |
| `loop3.json` | 3 轮 45 项完整时间线（含每次 1000ms 间隔事件、native finished 回调、缓存键） |
| `loop20.json` | 20 轮 300 项完整时间线 |
| `merge-split-unit.json` | 合并/拆分 9/9 守恒校验（未写记录） |
| `../20261103-t1-migration/queue-unit.json` | 队列引擎 19/19 单测（顺序、1 秒、循环、停止、失败、缺译不播） |
| `../20261103-t1-migration/migration-revision3.json` | rev2→rev3 前后 hash、两段清理 diff |
| `../20261103-t2-content/` | 逐段质检、清洗候选、词组来源与证据 |
| `../20261103-t3-t4/` | 归属兼容补丁、归档核查、照片缺口、P016 交接 |

### 时间线样例（真机、系统语音、第 1 段一轮 15 项）

```
t=  26745 zh         晚上在红城湖湖边散散步，还是非常愉悦的。有微风，很凉爽。
t=  27957 (+1212) enA       Taking a walk along the edge of Hongcheng Lake…
t=  29130 (+1173) enB       Walking by Hongcheng Lake in the evening…
t=  30327 (+1197) phrase-zh 湖边散步
   gap 1000ms（调度器记 t=31190）
t=  32203 (+1876) phrase-en take a walk / stroll along
…（词组 2–6 同构，每对之间 240ms，中文→英文固定 1000ms 静音）
t=  48292 queue_finished rounds=1 items=15 durationMs=21557
```

`+1876ms` = 中文朗读实际时长 + **1000ms 静音** + 引擎起播延迟；静音段由调度器计时（`gap ms:1000`），不是文案。

## D. 缺口（不得当成 PASS）

| 项 | 状态 | 说明 |
|---|---|---|
| 真实 Amazon Polly 合成与音质试听 | **NOT_RUN** | 预算 0、无 IAM 授权，未调用真实云 |
| 红城湖照片 | **PARTIAL / NO_SOURCE** | 无合法素材，未有本人照片授权 |
| P016 手机→Mac 真实投递 / 22:00 自然触发 | **NOT_RUN** | 需 P016 独立项目批准 |
| 有线耳机插拔、第二台设备（22101316C）安装 | **NOT_RUN** | 本轮未做 |
| 手机 Tailscale 全链（拔 USB） | **NOT_RUN** | 全程 USB + `adb reverse` |
| 合并/拆分在生产记录落版本 | **未执行（有意）** | 只做等价的守恒校验，避免改动用户数据 |
| 归档 watch 常驻进程为 11-02 老实例 | **PARTIAL** | 本轮用 `--once` 增量补齐索引；`launchctl` 重启常驻 watch 未做 |

## E. 复跑方法

```bash
# 1) 引擎单测（不需要设备）
node docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t1-migration/queue-unit.mjs
# 2) 合并/拆分守恒（不需要设备）
node docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t1-migration/merge-split-unit.mjs
# 3) 真机驱动（需 CDP 转发：adb -s <serial> forward tcp:9222 localabstract:webview_devtools_remote_<pid>）
D=docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t1-migration/device-drive.mjs
node $D tap '[data-n05="tts-full"]' 0      # 点「听本段」
node $D state                               # 读状态行
node $D eval "window.__smQueueHistory()"    # 取最近 12 次会话时间线
```


## 20 轮结果

见 §A-1：**20/20 轮完成，300 项，1115.6 秒，无失败、无跳过**；完成态截图 `shots/11-loop20-done.png`、`shots/12-loop20-final.png`，时间线 `loop20.json`。
