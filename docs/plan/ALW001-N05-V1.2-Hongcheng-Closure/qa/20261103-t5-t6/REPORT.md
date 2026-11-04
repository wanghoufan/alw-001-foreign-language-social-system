# N05 V1.2 T5/T6 + 自动学习归档 A0–A6 验收报告

日期：2026-11-03｜设备：Redmi Note 11（`REDACTED-SERIAL`，Android 13）｜APK：0.8.12（versionCode 47，sha256 `edbec3b9…7749f7`）
服务：8790 ASR / 8791 私有 UI+AI / 8781 归档 / 8782 demo —— `RESULT: HEALTHY（4/4）`

## 一、结论

| 项 | 结论 | 说明 |
|---|---|---|
| T5 20 次循环 | PASS | 真机播放 `loop finished total=20 synthRequests=1`；复放命中缓存 `cacheHit=true` |
| T5 四类分段朗读 | PASS | 真机 `cn / enA / enB / phrase` 各触发一次；`enB` 用 en-GB Brian，其余 en-US Ruth / zh-CN Zhiyu |
| T5 真 cache key | PASS | 缓存元数据含真实 `recordId=rec-20261103072022-16b79c`、`blockId=blk-hc-1`、`revision=2` |
| T5 GPT Prompt 回读 | PASS | 真机点“复制 GPT 语音练习 Prompt”→ `promptMeta.verified=true`；由原生桥写入并回读比对（不把剪贴板内容交给网页） |
| T5 两份复盘不覆盖 | PASS | 同段 3 份 + 另段 1 份并存，4 个独立文件；同段不同 revision 标 `stale-version` 不覆盖 |
| T6 ①–⑧ | **PASS（8/8）** | 见 `verify-n05-ui.log`（exit=0） |
| A0–A4 | PASS | 见第四节 |
| A5 | PARTIAL | API 级安全/幂等/离线保留全部实测；P016 手机→Mac 真实投递与 22:00 自然触发 **NOT_RUN** |

## 二、T5/T6 证据

- `verify-n05-ui.log`：逐项 PASS/FAIL 原文。
- `device-0812-hongcheng-private.png`、`device-0812-hongcheng-19blocks.png`：真机私有地点与 19 段记录。
- `device-0812-tts-record.log`、`device-0812-tts-cache-metadata.json`：四类分段与真实 key 的缓存元数据。
- `practice-reports-coexist.json`：4 份报告并存明细。
- 设备侧 Prompt 回读：`{"meta":{"revision":2,"verified":true},"toast":"已复制并回读校验通过…"}`。

### 本轮修掉的真实缺陷

1. WebView 无 `clipboard-read`，原实现复制后无法回读 → 新增 `SocialMateAndroid.copyToClipboard()`（只写这段 Prompt、当场回读比对）与 `clipboardMatches()`；真机 verified=true。
2. 练习复盘 `status` 只接受 `draft/confirmed/stale-version`，前端传 `pass/review` 被静默改成 `confirmed` → 已放宽白名单并实测 `status=pass` 落盘。
3. 旧复盘在后端只回 ID 与时间，UI 显示“正文未在本机缓存” → 聚合接口补 500 字 `excerpt`，UI 直接渲染，旧报告可读。

## 三、T6 未通过项（如实）

- 上一轮 ①/③ 失败均已定位并关闭：
  - **①**：DeepSeek 上游短时 HTTP 503（`PROVIDER_ERROR`），降级手工切句正常；上游恢复后重跑，`ai.mode=deepseek`、3 条候选、latency 1630ms，PASS。
  - **③**：自动化断言写的是旧契约 `l==='en'`；实际英 A/英 B 必须带 `enA/enB`，真机据此选 en-US(Ruth)/en-GB(Brian)。断言已改为 `enA/enB`，PASS。

## 四、自动学习归档 A0–A6

- **A0**：只读核对 P016 `PracticeAutoExport.kt` / `PracticeAutoExportWorker.kt` / `scripts/mac/export-receiver.py`（18791，明文无鉴权）。未修改 P016。
- **A1**：`SocialMate-Data/LearningArchive/`（index.json/index.jsonl、processed、quarantine、runs、inbox）。真实索引 **33** 条：conversation 3、thought 18（含红城湖私有地点与 PlaceNotes）、practice_review 12；self_test/course 明确 `EMPTY / NO_SOURCE`。
- **A2**：`x-archive-token` 必需（无 token 401）、类型白名单（未知类型 400 `INVALID_SOURCE_TYPE`）、大小上限（413 `TOO_LARGE`）、同哈希幂等（`unchanged`）、`retract` 可回退、扫描 0 外网请求（`learning-archive.test.mjs` 9/9、`practice-private.test.mjs` 3/3）。
- **A3**：`learning-archive-worker.mjs --once/--watch/--status`，`service-all.sh` 受控 300s 轮询；二次扫描 `indexed=0 unchanged=33`；离线来源保留、不丢档。
- **A4**：非授权文本一律 `local_only` + `awaiting_consent`（当前 33 条全部待同意）；AI 不可用时保留规则整理，不冒充已由 AI 完成。
- **A5**：API 侧投递/重复/冲突/恶意名/超限/0 元预算已覆盖；**手机→Mac 真实 P016 投递与 22:00 自然触发未执行**（P016 接收器明文无鉴权，需独立项目批准；不得扩大用途）。
- **A6**：HANDOFF / risks 已更新；未新建学习中心 UI，未动 115 公共地点与已通过 T0–T4。

## 五、复现命令

```bash
bash socialmate-v1.2/service-all.sh up && bash socialmate-v1.2/service-all.sh health
node socialmate-v1.2/verify-n05-ui.mjs
node socialmate-prototype/ai-gateway/learning-archive-worker.mjs --status
```