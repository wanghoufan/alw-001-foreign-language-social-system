# HANDOFF 阶段流水归档 · 2026-11-01 ～ 2026-11-03（N05 V1.2 及此前）

> 从 `docs/handoff/HANDOFF.md` 迁出，原文保留。HANDOFF 只留一行指针。
> 迁出时间：2026-11-04（阶段复盘）

## 2026-11-01

真机 WebView + MOCK + 真实腾讯云/DeepSeek 全链；档案 `profile-store` 5/5；归档历史 UI；N02 People 确认链；
`verify-v040.sh` 158 项全绿；1 元预算闸。结论已上提 `docs/architecture-facts.md`。

## 2026-11-02

N03b 0.7.0（中英双语 306 key、海南卡 112/115）；N04 演示命名空间/待确认联动（0.7.3/28）；
N05 S0–S5（后端 22/22、0.8.2/37）。

## 2026-11-03 · N05 V1.2（T0–T6 + 自动归档）

- **T0–T4 完成**：0.8.11/46 上真机；私有地点 `pv-hongcheng-lake-park` 进海南列表（115→116，`places-115.json` SHA 未变）；
  记录 `rec-20261103072022-16b79c` 19 段 / 英 A/B 38 条 / 原文 1148 字；AI 语义分段（DeepSeek）落地并带规则降级；
  `verify-n05-tts-provider` 31/31、0 真实云调用。
- **T5（真机）**：20 次循环实播 `total=20 synthRequests=1`、复放 `cacheHit=true`；中文/英A/英B/词组四类分段各触发；
  缓存元数据带真实 `recordId/blockId/revision`；GPT Prompt 复制后由原生桥回读 `verified=true`；
  同段 3 份 + 另段 1 份复盘并存（4 文件）不覆盖。
- **T6**：①–⑧ 全 PASS（`verify-n05-ui.log` exit=0）；① 待上游恢复后已重跑 PASS；③ 旧断言 `en` 已改为 `enA/enB`。
- **自动学习归档 A0–A4**：`SocialMate-Data/LearningArchive/` 真实索引 33 条（conversation 3 / thought 18 / practice_review 12），
  二次扫描 `indexed=0 unchanged=33`；鉴权/类型白名单/大小上限/幂等/retract 实测；33 条全部 `awaiting_consent` 未外发；
  worker 支持 `--once/--watch/--status`，服务侧 300s 受控轮询。**A5 PARTIAL**（P016 真实投递 NOT_RUN）。
- **TTS 收口 0.8.5→0.8.11**：默认本机系统语音；冷启动挂起 ≤4s 自动播；同意改会话级（只问一次）、未配置不弹框；
  设置页「朗读语音设置」入口；朗读 ID 去中文。
- **新建想法**：分段力度 2/3/4/6 句/段（`localStorage.sm_seg_gran` → `maxSentencesPerBlock`；服务端允许 1–8），
  单条原文上限 20000 字符。
- **S1／S4 已沉淀**（中央仓库，11 个已安装且启用的 Agent 部署，22/22 `diff` SAME）：
  `android-true-device-qa-orchestrator-local-zh`（真机验收编排＋清场，与 CDP／无线 ADB／设备锁三颗分工）、
  `bilingual-segment-qc-local-zh`（机械闸六项＋语义闸四问，自带 `segment_qc.py`）。两者均**不设固定口令**，靠 description 场景命中。
- **红城湖 19 段改双版本**：原文逐字存 `docs/archive/…-逐字版-备份.md`，整理版进 App（`rawInput` 1148→989 字，revision 2，
  旧记录在 `records-archive/`）；填充词 70 处 → 3 处（6.3 → 0.3 / 100 字）。
- **Polly 后端就绪**：`aws-polly`（未配置→501）+ `aws-polly-fake` 替身、5 声线、mp3 缓存、独立 0 元账本。
- 证据：`docs/plan/ALW001-N05-V1.2-Hongcheng-Closure/qa/20261103-t5-t6/REPORT.md`。
