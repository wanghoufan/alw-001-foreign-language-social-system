# T5 证据索引｜最新 APK 端到端验收 + 文档收口

- task_id: SM-ALW001-20261102-N04-V13 / **T5**
- 执行: 2026-11-02 18:16 – 18:36（Asia/Shanghai）
- 设备: Redmi Note 11 5G (`21091116AC`) / Android 11 (SDK 30) / serial `REDACTED-SERIAL`
- 版本: **0.8.1 / versionCode 36**，APK SHA-256 `9971836f0d1cd34afceaf3063f3d8d3cba652faf1f7d3e753dc0d0f03e042296`
- 源码: git HEAD `fc2379c` + 工作树未提交改动（构建时 33 项，收尾 39 项，未 reset / clean / push）
- 结论: **PARTIAL** — `verify-t5.mjs` 退出码 **2**，32 条断言 **28 PASS / 0 FAIL / 4 NOT_RUN**
- 音频: **SYNTHETIC**（macOS `say -v Samantha` → Mac 扬声器 → 手机麦克风），ASR 真实腾讯云 `mock:false`

## 1. 一键复跑

```bash
# 前提：8790/8791/8781/8782 已起，adb reverse 已建立
bash socialmate-v1.2/service-all.sh health
node docs/plan/ALW001-N04-V1.3-Real-Use-Closure/verify-t5.mjs \
  --qa docs/plan/ALW001-N04-V1.3-Real-Use-Closure/qa/20261102-t5 \
  --json docs/plan/ALW001-N04-V1.3-Real-Use-Closure/qa/20261102-t5/t5-report.json
echo $?   # 0=PASS, 1=FAIL, 2=PARTIAL(有 NOT_RUN)
```

本次实跑：`verify-t5.log`（逐条断言），退出码 `2`（`verify-t5.exit`）。

## 2. 构建 / 安装 / 设备

| 文件 | 内容 |
|---|---|
| `build-env.txt` | 构建时间、Git HEAD、dirty 清单、JDK/SDK/Gradle、源码快照哈希 |
| `build.log` / `build-2.log` | `clean :app:assembleDebug` 完整日志（两次） |
| `reproducibility.txt` | 两次构建 APK 与 `classes.dex` 字节一致 |
| `apk.sha256` | APK SHA-256 |
| `apk-metadata.txt` | v2 签名、证书指纹（不含私钥）、dex/arsc/manifest 内部哈希 |
| `install.log` | `install -r` 前后 `dumpsys` 对比（`firstInstallTime` 未变） |
| `device-dumpsys.txt` | 完整包信息 + 权限授予（RECORD_AUDIO granted） |
| `00-device.json` | 设备/版本/HEAD/时区结构化快照 |
| `22-hashes-after-all.txt` | 收尾时 People/Demo 哈希、手机 outbox/exported/state、Mac 归档数 |

## 3. 端到端截图（按时间顺序）

| 文件 | 步骤 | 截图 SHA-256 前 16 位 |
|---|---|---|
| `01-launch.png` | 冷启动首屏（在线） | 4f2586bf0191e702 |
| `02-people-tab.png` | 人物页：3 演示人物 / 9 段 / 54 句 / 待确认 3 | 091daafdbd5588ee |
| `03-oliver-drawer.png` | Oliver 档案抽屉（五分组 + 变更记录） | d20ba74508bb319b |
| `04-group-edit.png` | 分组内单条编辑（EN 视图） | 619a77ec2c126e15 |
| `05-undo-edit.png` | 撤回该条编辑，原文恢复 | ffa31bde60ad8465 |
| `06-edit-zh.png` | 中文视图编辑（zh 字段） | 9c7bc7d8e177a5d2 |
| `07-bulk-move.png` | 批量选择 + 移动到「生活习惯」 | 7e36bd65bff387f6 |
| `08/09/10-*-prep.png` | **修复前**三人专属问题（被「来自XX/职业」占满） | 见文件 |
| `11-demo-cleared.png` | 清空演示 → 0 位 / 0 段 / 0 句 | 48a3b9ddda69911a |
| `12-demo-cleared-restart.png` | 强制重启后仍为空（未自动复活） | aa49f59a53caa814 |
| `13-demo-restored.png` | 恢复 → 3 位 / 9 段 / 54 句 | 33358e29ecd19ce5 |
| `14-oliver-prep-clean.png` | **修复后** Oliver：2 专属（gym / pull-up）+ 1 通用 | 0add602831f791e3 |
| `15-maya-prep-clean.png` | Maya：posters / small gig + 通用 | e67f079e3202c94c |
| `16-jieun-prep-clean.png` | Ji-eun：photographing / café + 通用 | 44c0d40030eeb4ec |
| `31-native-consent-retention.png` | 原生面板：录音同意 + 原文留存均已勾选 | cb985dfcc5a473ee |
| `32-recording-live.png` | 录音中：实时字幕接入 | 74b12f1abbc20e03 |
| `33-pending-card.png` | 待确认候选卡（逐字原文 + speaker unknown + 段号） | db9f3b48a8849f85 |
| `34-confirmed-prep-change.png` | 选 Oliver 确认后：问题即时重算 + 可撤回入口 | e8ab7e3a70883b4b |
| `36-stopped.png` | 停止后：麦克风停、界面回到空闲 | 52e5fe4f2e2024ba |
| `41-history-view.png` | 归档历史页（本机模式，令牌自动注入） | b4ad6afb7ae665dc |
| `42-history-original.png` | 会话详情：逐字原文（tencent） | 162796d45e8e71a4 |
| `43-saf-picker.png` | SAF 保存选择器（建议文件名正确） | 6f629783faed61dc |
| `44-export-saved.png` | 保存完成 | 0a28e7b88ae87268 |
| `50-offline-readonly.png` | 断 `adb reverse` 后原生「离线只读模式」（非白屏） | ad9d363b8a81c87a |
| `51-recovered-online.png` | 恢复通道后回到在线界面 | 2967ad7139ff0cc7 |

## 4. API / 存储前后摘要

| 文件 | 内容 |
|---|---|
| `10-oliver-before-edit.json` / `11-oliver-after-edit.json` | 编辑前后档案（facts + changelog） |
| `20-hashes-before-clear.txt` | 清空演示前：`People` `78482d07…`、`Demo` `56e221ba…` |
| `21-demo-status-before-clear.json` | 清空前 demo status（3/9/54/3） |
| `22-hashes-after-all.txt` | 收尾：`People` **仍为** `78482d07…`（未写真实档案）、`Demo` `ee241688…`（新增 1 条事实 + 变更记录） |
| `30-asr-budget-before.json` / `31-asr-budget-after.json` | ASR 账本：`0.198227 → 0.210249`（+¥0.012022，1 次调用，上限 1 元未改） |
| `35-oliver-after-confirm.json` | 确认后 Oliver 档案（6 条事实 + 新专属问题） |
| `40-mac-archive-verify.txt` | Mac `.md/.json` 内容 + SHA-256（逐字一致） |
| `t5-ui-steps.log` | 每一步的时间戳、CDP 返回值、安装/重启/离线/恢复记录 |
| `t5-console.log` | `verify-t5.mjs` 内部命令与退出码流水 |

Mac 归档原件：`~/Documents/SocialMate/Conversations/2026/11/SocialMate-2026-11-02-102615-sess_20261102T102615_e52f2f.{md,json}`
（`md` SHA-256 `df46d547640f59fd8bba0d228d1b0c4f2b4c4d922f9c3a6ee20f34ce749d978d`；`json` `75c0776e…`）

手机侧导出：`/sdcard/Download/SocialMate-sess_20261102T102615_e52f2f.md`（319 B，逐字含 `Should try surfing in my arm.`）

## 5. `verify-t5.mjs` 断言分布（32 条）

| 组 | 条数 | 说明 |
|---|---|---|
| preflight | 6 | 版本 0.8.1/36、APK SHA 对齐、`install -r` 保留数据、HEAD 快照、可重复构建、签名证书 |
| demo | 5 | 3/9/54、三人列表、2 专属+1 通用、事实不串人、真实 People 哈希未变 |
| session | 6 | outbox 清空 + ack 201、exported+ack、Mac md/json、逐字/mock:false/时间戳、md 含原文、SAF 可读、预算 ≤0.05 |
| offline | 2 | 离线只读证据存在、离线不显示成功 |
| sec | 5 | 无票 403、跨源 403、伪造段号 400、未配对 401、APK 无令牌 |
| docs | 3 | 三份文档含 0.8.1、HANDOFF ≤8KB/≤100 行、无「当前 0.6.6/0.7.0」 |
| notrun | 4 | Tailscale 授权、物理拔线、第三方查看器、真人双人 |

## 6. 本轮修复（含前后对比证据）

1. **`socialmate-v1.2/index.html` · `demoApi()`**：写票一次性，客户端不再缓存复用 → `08/09/10`（修复前连续两次写失败）对比 `04`–`07`（修复后单次点击成功）。
2. **`socialmate-prototype/ai-gateway/demo-store.mjs` · `buildDemoPrep()`**：对话来源事实优先 + `textEn` 匹配问句模板 → `08`–`10`（模板问句）对比 `14`–`16`（真实可用问句，与 fixture `expected.beforeCustomized` 一致）。

## 7. 不覆盖声明

本目录为新建；`qa/20261102-155616`（T1）、`qa/20261102-t2`（T2）、`qa/20261102-171216`（T3）、`qa/t4-20261102-175042`（T4）全部原样保留。汇总见 `../QA-LEDGER.md`。
