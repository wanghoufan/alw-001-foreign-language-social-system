# ALW-001 N05 V1.4｜日常使用与无人值守可靠性收口

status: USER_APPROVED_FOR_LOCAL_DELIVERY
approved_date: 2026-11-04
approval: USER_REPLY_1
task_id: SM-ALW001-20261104-N05-V14-REALUSE
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
development_mode: ONE_MAIN_DEVELOPER_CONTINUOUS
scope: ANDROID_PRIVATE_APP_AND_MAC_PRIVATE_SERVICES
human_gate: FINAL_ONCE

## 本阶段成果
使已通过N05 V1.3真实中英朗读的SocialMate，可以锁屏放入口袋继续听、Mac mini按计划自动接收分类、手机不插USB独立使用；P016「懒得打字」只进行跨项目安全交接。不是新的学习中心或重新造播放器。

## 读取顺序
1. 本README → PREFLIGHT → SPEC → TASKS → ACCEPTANCE → QUEUE-RECONCILIATION → RELAY-STAGED。
2. docs/handoff/HANDOFF.md、docs/risks.md、android-poc/IMPLEMENTATION_STATUS.md、docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t5/REPORT.md。
3. docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t3-t4/T3-T4-REPORT.md 与同目录P016-HANDOFF.md。
4. Android原生AsrActivity.java、TtsPlaybackController.java、AndroidSystemTtsAdapter.java、AndroidManifest.xml、socialmate-v1.2/source/V1.1-baseline.html与index.html。Mac侧learning-archive-worker.mjs、learning-archive.mjs、service-all.sh和已有LaunchAgent、Tailscale配置。N04无线使用旧证据先复用。

## 目前真实基线
- Android 0.8.13 / versionCode48，APK SHA-256 738ff4c74c70bc6987a0041d3f55db26fab35ac416f57756d759e49d4c66f63b。
- 红城湖19段，词组102条中99条可播放；3轮45项、20轮300项真机混合队列已PASS。用户最终人工试听待做。真实Polly NOT_RUN，照片NO_SOURCE。
- 当前Activity切后台/锁屏时队列被中断，只修好了中断反馈；后台持续朗读尚未实现。
- LearningArchive共85条：conversation3/thought43/practice_review38/self_test1/course0；唯一self_test是QA fixture，不是真P016手机传来。11月2日旧watch实例不再自动扫描，靠手动once补到85。
- 手机不插USB、清adb reverse后的Tailnet访问及蜂窝环境NOT_RUN。P016现有22:00代码及18791收件存在D1–D4安全、失败投递/跨天问题，未真实联合验收。

## 执行与交付
按TASKS T0–T5依序连续完成能自主做的部分；定点真机/后台QA写本目录qa新子目录；更新HANDOFF和风险。不得未经授权做付费、隐私上传或新账号。最终只发一次真实用户试玩请求。

## 不可突破的边界
- 单一主开发者连续实施；只在用户专属登录、明确隐私/付费授权、最终真实Human Gate请用户介入。禁止重做N05 V1.3已经真机通过的19段混合语言播放器、20轮300项循环和GPT复盘。
- 不增加学习中心Tab、课程管理、公开PWA功能；不得改公开海南115地点/V1.4作品资料/他人已确认档案。原始逐字文本不可覆盖，派生版分层留版本。
- 禁止Git reset/clean、覆盖其他开发者dirty工作、盲杀服务、清除手机数据、自动commit/push/release。设备必须校验serial和安装签名，增量adb install -r。
- 真实AWS Polly预算仍为0，未经用户额外明确授权不调用真实Polly、不外传个人想法/聊天原文；DeepSeek和腾讯云现有1元闸不增加。不得把fake音频当Polly真人音质。
- P016独立项目只读交接、不擅自改源码/重启未鉴权18791；真实聊天留存需双方同意。服务仅走现有安全内网/Tailscale HTTPS与配对鉴权。
