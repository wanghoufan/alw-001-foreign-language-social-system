<!-- USER_APPROVED 2026-11-03 | ALW-001 | N05 V1.3 | continuation not dispatch proof -->
# ALW-001 N05 V1.3｜真实学习播放器、红城湖内容与自动归档最终收口

status: USER_APPROVED_STAGED_WAITING_RELAY
approved_date: 2026-11-03
approval: USER_REPLY_1
task_id: SM-ALW001-20261103-N05-V13-UX-ARCHIVE
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
baseline_at_review: Android 0.8.12 / versionCode 47 (2026-11-03); runtime must reverify
target: ANDROID_PRIVATE_APP_AND_MAC_PRIVATE_BACKEND
mode: ONE_MAIN_DEVELOPER_CONTINUOUS
human_gate: FINAL_ONCE
no_new_learning_center: true

## 一句话成果
红城湖真实19段学习页符合用户已经批准的播放布局和中文→英文A→英文B→常见表达混合队列；中英词组先中文、静音1秒、再英文；高质量逐条译文与私有照片齐备；Mac mini五类自动分类归档继续稳定运行，P016跨项目缺口如实隔离。**不是做新学习中心或重新造已经通过的底层TTS**。

## 开工先读（有序）
1. 本 `README.md` → `PREFLIGHT.md` → `SPEC.md` → `TASKS.md` → `ACCEPTANCE.md` → `RELAY-STAGED.md`。
2. `docs/handoff/HANDOFF.md`，`android-poc/IMPLEMENTATION_STATUS.md`，`docs/plan/ALW001-N05-V1.2-Hongcheng-Closure/qa/20261103-t5-t6/REPORT.md`，`docs/plan/ALW001-N05-V1.2-Hongcheng-Closure/ADDENDUM-AUTO-LEARNING-ARCHIVE-V1.0.md`，现有 `docs/risks.md`。
3. 代码务必核对 `socialmate-v1.2/source/V1.1-baseline.html` 的 `renderRecord`、`ttsSay`、`tts-loop-seg`、`phrases`、`TtsPlaybackController`、`SocialMate-Data/PrivatePlaces/pv-hongcheng-lake-park/records/rec-20261103072022-16b79c.json`、`learning-archive.mjs`、`learning-archive-worker.mjs`。
4. 自主检查和继续T1–T5，真实QA、失败修复后再交唯一最终Human Gate。先做T1混合播放逻辑；不得用20次单语音循环PASS抵消产品FAIL。

## 当前源证据与真正缺口
- 已通过：红城湖19段、整理版revision2、逐字原版已备份；0.8.12底层播放器循环20次仅合成1次；Prompt复制验证和多份复盘并存；Mac自动学习索引33项（二次扫描不重复）。
- **未完成**：UI当前按钮顺序仍是中文/英A/英B/听词组/循环本段，循环本段代码实际只循环中文；词组按字符串拼接朗读，缺中英配对和1秒间隔；缺优先级最高的「听本段」按钮。UI/完整混合音序不满足已批准规范。
- 红城湖 `place.json` 的 `photos: []`；record修订版 `placeId: null`，要补可靠归属迁移（不能损伤原始和复盘记录）。
- AI索引33条：conversation3/thought18/practice_review12；self_test0/course0。P016每天22:00工作机制已有历史真实推送，但自然定时闭环、鉴权安全与失败ack未验收；不可标全部自动化PASS。
- AWS Polly真实声线未授权，API预算0；手机Tailscale无USB端到端、耳机等部分NOT_RUN，不得偷偷越权补充。


## 固定执行红线
- 单一现有主开发者连续完成本阶段，内部QA不要求逐个用户审批，**只在真实最终验收与任何必要付费/云隐私授权时请求用户**。不重做N05 V1.2 T0–T4和已通过的底层T5/T6测试；先核实最新HEAD、工作树和当前手机已安装版本，再增量补足。
- 只在SocialMate Android私有WebView、Java原生TTS与Mac本机服务/私有数据目录内改动；不得触碰公开海南 PWA、115个公开地点、V1.4作品资料；保留Android现有应用数据，禁止清空、卸载或重置。每次安装应使用同签名 `adb install -r`，目标serial必须核对。
- 不擅自修改P016「懒得打字」项目；需修P016导出可靠性/未鉴权HTTP时给独立项目主管精确需求和测试接口，不跨项目写码。绝不把旧 18791 无鉴权明文接收扩大至真实聊天或其他私有资料。
- 用户真实原文逐字保存、任何AI加工另存版本与溯源；人物档案必须用户确认；个人笔记/真人聊天不得未经明确相关授权传云；AWS Polly预算默认0、不索要密钥、不把假语音当真实音质。DeepSeek预算维持现有1元闸门，不清账本或提高限额。
- 禁止误伤当前其他开发者的dirty文件、reset/clean、误杀服务、改原有ASR/录音权限，禁止在没有用户明确授权下commit/push/release。仅真实UI/ADB视频+日志+源文件hash才能标完整用户体验PASS。
