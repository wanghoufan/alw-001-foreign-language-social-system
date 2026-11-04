# ALW-001 N04 V1.3｜真实使用交付闭环 · 桌面开发者入口

task_id: SM-ALW001-20261102-N04-V13
project: ALW-001
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
approved_at: 2026-11-02T14:22:00+08:00
approved_by: USER_EXPLICIT_APPROVAL_PLAN_1
status: APPROVED_EXECUTION_PACKAGE
mode: SINGLE_MAIN_DEVELOPER_CONTINUOUS

start_here: docs/plan/ALW001-N04-V1.3-Real-Use-Closure/README.md
plan: docs/plan/ALW001-N04-V1.3-Real-Use-Closure/PLAN.md
preflight: docs/plan/ALW001-N04-V1.3-Real-Use-Closure/PREFLIGHT.md
acceptance: docs/plan/ALW001-N04-V1.3-Real-Use-Closure/ACCEPTANCE.md
qa_ledger: docs/plan/ALW001-N04-V1.3-Real-Use-Closure/QA-LEDGER.md
prior_sent: SM-ALW001-20261102-N04-PERSONAS
task_relation: CONTINUATION
latest_code_baseline: T1–T5 已完成；当前 0.8.1 / versionCode 36，APK SHA-256 9971836f…042296（2026-11-02 18:17 真机构建+安装）
human_gate: FINAL_ONLY

**获批内容：用户 2026-11-02 明确回复“同意 方案 1”，范围严格为五项 T1–T5 和一次性全阶段前置检查。本文件可直接交由当前 ALW-001 的唯一主开发者连续执行，不等重新批准。**

## 执行命令（不是让用户手工操作）
先读 `PLAN.md`、`PREFLIGHT.md`、`ACCEPTANCE.md`，再读根 `AGENTS.md` / `agent.md` / `CHANGELOG.md` / `docs/handoff/HANDOFF.md` / N04 历史QA和真实源码，执行“原始证据→失败复现→最小修复→自动回归→ADB真机→新证据→继续下一Task”。**不准停在子任务、Review、QA、阶段检查点等待用户说‘继续’。**

执行次序：S0前置条件实测 → T1逐字溯源与安全 → T2真实ASR final与人物记忆 → T3手机归档 → T4拔USB后Tailscale与Mac自恢复 → T5最新APK安装、全部可做真机QA和文档收口。只有需要用户亲自登录、验证码、授权、费用/不可逆操作、真人录音同意或最后签收时才集中一次询问；没有阻塞的其它Task继续。

**特别保留**：N04已通过三人物9会话54句、持久化演示、2条专属+1条通用、演示清空恢复、9对Mac Demo归档、0.7.4阶段人物编辑/批量/撤销的既有功能与证据。不得重写、删除演示母版、将已测模拟标真人。最新Git status存在未提交：
- `socialmate-prototype/public-share.html`
- `socialmate-prototype/public-share.js`
- `socialmate-prototype/sw.js`
绝不覆盖他人修改，不做 git reset/clean/强制提交或推送。当前已发送旧N04任务和回执原样保留，新的 GUI_SENT 由固定桌面转发员真实点击后才写。

技术/隐私禁止项：服务不公开、凭证不入日志、不绕过TLS、不加预算（腾讯ASR和DeepSeek各1元），人物事实必须**用户确认**，未经录音/原文留存同意不能暗中录音或留存；spk_0 != 实名；不能擅自申请付费服务、发布APP、要求用户手动运行终端或转发一大段文档。

**项目入口/工件**：
- `android-poc/app/build.gradle` 现 **0.8.1(36)**；真机已安装同版本并通过 T5 端到端（`qa/20261102-t5/`）。文中 0.7.7(32) / 0.7.4(29) 均为历史值，不代表当前状态。
- `socialmate-prototype/ai-gateway/demo-store.mjs` 的 `REPLAY_FINALS` 与fixture 3句逐字错配，T1优先修复。
- `docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/qa/20261102/` 有原始合成数据QA、截图、9对Mac Demo清单；保留，不覆盖。
- `docs/plan/ALW001-N04-Remaining-Closure-V1.2.md`与`-PREFLIGHT.md`是旧草案/调查基线，本V1.3已批准并覆盖其过时版本陈述。

**终验标准**：`ACCEPTANCE.md`所有可自行完成项通过，出现未测原因可独立复核；不能只给“BUILD SUCCESS”或截图，要做到用户外出不用USB也能打开APP，至少用受控真实ASR final证明记忆/归档链，离线和服务恢复可自愈，QA永久留档。完成前不要宣称发布/真机验收成功。
