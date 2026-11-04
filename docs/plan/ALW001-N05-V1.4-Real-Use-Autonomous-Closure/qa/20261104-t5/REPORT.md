# V1.4 T5｜定点验收报告（2026-11-04）

status: 本报告只覆盖 V1.4 新增项；V1.3 已通过项（19 段播放器、20 轮 300 项循环、GPT 复盘）不重复验收、不代替本报告结论。

## 0. 环境与版本

| 项 | 值 |
|---|---|
| 设备 | Redmi Note 11（`21091116AC` / serial `REDACTED-SERIAL`），Android 11 / SDK 30 |
| App | **0.8.14 / versionCode 49**（本轮新建），增量 `adb install -r`，未清数据 |
| APK | `android-poc/app/build/outputs/apk/debug/app-debug.apk`，SHA-256 `caf5930fcad61edabcec05085eda87e7792e3e766191060f282d737a02187978` |
| 页面 | `http://127.0.0.1:8791/v12`（Mac 真源 `socialmate-v1.2/index.html`；改页面无需重装 APK） |
| 服务 | 8790/8791 pid 24798、8781 pid 92317、8782 pid 92336 全程 HEALTHY |
| 归档 watch | `com.alw.learning-archive-watch` pid 45168，`--watch --interval 300` |
| 第二台设备 | Redmi 22101316C（Android 14）已连接但未安装本项目 APK → 按计划标 NOT_RUN，未获安装授权 |

**取证手段**：`scripts/sm-cdp.mjs`（adb forward + WebView DevTools 协议）在真机页面内执行表达式；原生队列另写 `files/tts-queue-timeline.jsonl`（`run-as` 拉取），因为 logcat 在休眠态不可靠。

## 1. 结论总表

| ID | 场景 | 结果 | 关键证据 |
|---|---|---|---|
| BG01 | 点循环×3 后熄屏听完 45 项 | **PASS** | `bg01-timeline.jsonl`：45 item_start / 45 item_done / 3 round_done / queue_finished，227.9s，0 重试；全程 `mWakefulness=Asleep` |
| BG02 | 朗读中按 Home 后重开 | **PASS** | Home 后队列进入第 2 轮；重开页面显示「第 2/2 轮 · 第 2/15 项 · 英文 A（后台）」，无重复队列 |
| BG03 | 通知栏暂停/继续/停止 + 结束自停 + 不泄露 | **PASS**（交互用页面同一服务命令验证） | 暂停→通知「朗读已暂停」；继续→恢复推进；停止→服务记录消失、通知记录 0；自然结束→`TtsPlaybackService` 记录 0、通知 0 |
| BG04 | 来电/耳机拔出/音频焦点 | **NOT_RUN** | 现场无耳机、无法制造来电；`AUDIO_BECOMING_NOISY` 属系统保护广播，`am broadcast` 被拒（权限栈回溯）。代码路径已接（AudioFocus + NoisyReceiver，暂停不自动恢复），但**没有真实事件证据，不算 PASS** |
| BG05 | 本机系统 TTS，无 AWS 授权 | **PASS** | 全程 `provider=system`；时间线 0 次云端调用；`segment=cn` 中文、`enA` 英文，未产生 AWS 费用 |
| ARC01 | 新学习记录自动入库 | **PASS** | 08:20:24 放入 `SocialMate-Data/Inbox/qa-fixture-arc01-20261104.md` → 08:23:01 后台自动索引（165s，`lastIndexed=1 lastUnchanged=84`），未执行任何手工归档命令；随后撤销索引并删除样本 |
| ARC02 | Worker 异常/重启/断网恢复 | **PASS** | 见 `qa/20261104-t2/verify-result.json` 7/7 PASS（幂等、改版不覆盖、杀进程补扫、断网仍本地扫描、DEGRADED/NOT_RUNNING 判定、恢复入口） |
| ARC03 | 85 条索引与 P016 归档语义 | **PASS** | 直接读索引：唯一 `self_test` 条目 `lm-fa760f1f00826c3d` 已 `test:true sourceTag:"qa_fixture"`；`--status` 报 `total=85 realTotal=84 testFixtures=1`；`course=0` 维持 NO_SOURCE |
| WIRE01 | 拔 USB 同 Wi-Fi 使用 | **NOT_RUN** | Tailscale Serve 三条路由在 Mac 侧均 200 且 TLS 校验通过（443 `/alw`→8781、8443→8791、10000→8790）；但**手机 Tailscale 已装未登录**（`dumpsys connectivity` 无 VPN 网络），无法做脱 USB 真机验证 |
| WIRE02 | 蜂窝/局域网切换 | **NOT_RUN** | 同上，依赖手机 Tailscale 登录 |
| P01601 | 独立交接完成 | **PASS** | `docs/plan/ALW001-N05-V1.4-Real-Use-Autonomous-Closure/P016-TRANSFER.md`（D1–D4 + C1–C4 + 状态表 + 派单文本） |
| P01602 | P016 自然 22:00 安全投递 | **NOT_RUN** | 无真机自然触发与鉴权落盘证据；ALW 不越权改 P016 |
| HUMAN01 | 用户本人锁屏试玩 | **待用户** | 见 §5 |

## 2. BG01 细节（本阶段核心）

队列来源：红城湖公园第 1 段，`循环 ×3`，计划 15 项/轮 = 中文 → 英A → 英B → 6×(词组中文 → 1000ms → 英文)。

- 事件计数：`queue_start=1，item_start=45，item_done=45，round_done=3，queue_finished=1`（共 95 行）
- 每轮 15 项，`idx` 严格 0…14 递增，三轮 kind 序列完全一致：`zh>enA>enB>(phrase-zh>phrase-en)×6`
- 总时长 **227.9 秒**（`durationMs=227907`），`item_retry=0`，无漏项、无跳过
- 熄屏验证：开始前 `input keyevent 26` → `mWakefulness=Asleep`；跑到第 2 轮时复检仍为 `Asleep`；`PARTIAL_WAKE_LOCK 'SocialMate:tts-queue'` 由本进程持有
- 前台服务：`dumpsys activity services` → `TtsPlaybackService isForeground=true foregroundId=4711`，`foregroundServiceType=mediaPlayback`
- 未使用「屏幕常亮」作弊（该 App 的 `FLAG_KEEP_SCREEN_ON` 与朗读无关，且实测屏幕确实进入 Asleep）

完整原始时间线：`qa/20261104-t5/bg01-timeline.jsonl`

## 3. 本轮发现并修掉的两个真缺陷

### 3.1 「听词组/听中文/听英文」误弹「显示与阅读设置」（用户报告）

- 根因：学习页朗读按钮用了 `data-lang="phrases|zh|enA|enB"`，与「界面语言切换」的 `[data-lang]` 选择器撞名。`smNewClick()` 先命中语言分支 → 把 `SAV.lang` 写成 `phrases/zh/enA` 并 `openSettings()`。
- 修复：按钮属性改为 `data-tts-lang`；`[data-lang]` 分支加白名单（仅 `zh|en|system`）且排除 `[data-n05]`；启动时修复历史被写坏的 `SAV.lang`。
- 真机验证：修前点击 → `modalOpen` 弹出；修后 → `modalOpen=false`、`lang=zh` 不变、朗读正常开始（第 2/12 项）。**需重装 APK 之外无额外操作，页面为服务端真源，刷新即生效。**

### 3.2 原生队列把中文词组丢给英文声线

- 根因：跑 `TtsQueueRunner` 时按 `kind` 映射成 `segment=phrase`，`defaultLocale(phrase)` 落到 `en-US`，真机日志出现 `lang=en text=晚上散步`。
- 修复：段类型一律走 `SpeakRequest.segmentOfLang(item.lang)`，与 V1.3 网页调用 `speakTextWithIds(text, lang, …)` 完全一致（`zh→cn`、`en→enA`），缓存键与声线不变。
- 复测：时间线 `segment=cn` 对应中文项、`enA` 对应英文项；日志 `system speak lang=zh … text=很凉爽`。

## 4. 未做/不能做（如实标注）

| 项 | 原因 |
|---|---|
| BG04 真实来电/耳机 | 无耳机、无法制造来电；保护广播被系统拒绝 |
| 第二台 Android 14 机 | 未获安装授权（计划要求），标 NOT_RUN |
| 真实 Amazon Polly | 预算 0、无授权；本轮全部本机系统 TTS |
| 照片素材 | 红城湖 `photos:[]`，NO_SOURCE |
| P016 真实投递 | 跨项目，需 P016 自行批准与真实设备自然触发 |

## 5. 需要用户做的一件事（Human Gate）

手机装 0.8.14 后，打开红城湖第 1 段 → 选「循环 ×3」→ 按电源键熄屏放口袋，听完 3 轮后确认：音质、顺序（中文→英A→英B→词组中英交替）、通知栏控制是否顺手、整体能不能当「走路听课」用。

若要做 T3 无 USB 验证，还需**一次性**在手机上登录 Tailscale（应用已安装，当前未登录）——这是唯一需要你动手的前置。
