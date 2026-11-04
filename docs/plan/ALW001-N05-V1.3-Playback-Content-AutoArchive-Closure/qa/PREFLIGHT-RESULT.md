# PREFLIGHT-RESULT｜ALW-001 N05 V1.3 前置依赖落地结果

> 生成：2026-11-03 ｜ 主开发者连续执行（无中途停工）
> 状态口径：`READY` 可自主完成并已做 / `FALLBACK` 用替代路径完成且已标注 / `BLOCKED` 硬阻塞需外部授权 / `NOT_RUN` 未取得真实证据

## 1. 环境与基线核对

| 项 | 结果 | 证据 |
|---|---|---|
| 设备 serial | `REDACTED-SERIAL`（Redmi 21091116AC / Android 11 / MIUI） | `adb devices`，第二台 `indq5xfi6hovay4d`（22101316C / Android 14）无本应用 |
| 安装前版本 | 0.8.12 / versionCode 47 | `dumpsys package app.socialmate.dualmic` |
| 本次安装版本 | **0.8.13 / versionCode 48**，同签名 `adb install -r` 覆盖，未清数据 | 安装输出 `Success`；`firstInstallTime=2026-10-31` 未变 |
| APK sha256 | `738ff4c74c70bc6987a0041d3f55db26…`（完整值见 QA 报告 §C） | `shasum -a 256` |
| 组合服务 | 8790/8791/8781/8782 全部 OK（pid 单进程 + 两个 archive） | `service-all.sh health` → `RESULT: HEALTHY（4/4）` |
| `adb reverse` | `tcp:8791 / 8790 / 8799` 均在用（HANDOFF 已记录仍在用，未清） | `adb reverse --list` |
| JDK / SDK | JDK17 `Homebrew 17.0.20.1`；Android SDK `~/Library/Android/sdk` | 编译命令与 `BUILD SUCCESSFUL` |
| 工作树 | 改动前 95 项未提交改动全部保留；本轮未 `reset` / `clean` / 未 commit | `git status --porcelain` |

## 2. 用户参与点分类落地

| 外部资源 | 结论 | 本轮实际做法 |
|---|---|---|
| 真机 Note11 | **READY** | 自主完成同签名覆盖安装、19 段真实页面点击与播放验收；全程未清数据、未卸载 |
| AWS Polly 真实云 | **FALLBACK（音质 NOT_RUN）** | 预算仍 0、无密钥、未调用真实 Polly。真机先用 `aws-polly-fake`（本地预置 WAV，不外传文本）验证调度，再切「本机系统语音」验证真实中文/英文声线。Polly 音质仍是 NOT_RUN，未写成 PASS |
| DeepSeek 提取中英表达 | **不调用（READY via 本地规则）** | 词组配对全部离线完成：原串直接拆分 9 条 + 取自用户原话的中文 92 条 + 1 条 AI 建议（标 `ai_suggested` 且不可播）。**零云调用**，未外传原文 |
| P016 懒得打字 | **BLOCKED（跨项目）** | 只读核查，产出 `P016-HANDOFF.md`（缺陷位置 + 复现 + 预期 + 验收接口）；未改 P016 一行代码，未碰 18791 |
| Mac mini Tailscale / 手机未登录 | **NOT_RUN** | 本轮全部经 USB + `adb reverse`；无 USB 全链仍未验证，不写成通过 |
| 红城湖照片授权 | **BLOCKED（无合法素材）** | 仓库 633 张图与用户目录均无红城湖现场图；不抓网图、不伪造拍摄日期。标 PARTIAL，给出 photos metadata schema 草案 |
| 非本人信息/双方录音同意 | **READY（本轮不涉及）** | 本轮只读既有 19 段本人原话，未新增真人录音 |

## 3. 本轮新增/修正的事实

1. **`placeId: null` 根因**：写路径 `Number("pv-…") → NaN → null`。已修为私有地点保留字符串 id（`place-notes.mjs`），并在读取侧补 `placeIdSource`，历史记录零字节改写。
2. **TTS 合成限流与产品冲突**：原 `12 次/60 秒、最小间隔 400ms` 会让一轮完整混合队列（15 项）必然 429。已拆出朗读专用额度 `48 次/60 秒、150ms`，其余接口额度不变；缓存命中不消耗额度。
3. **系统语音首次朗读冷启动**：小米引擎冷启动实测 6–8 秒，原 6 秒队列上限会误判失败。已把「首次项上限」提到 12 秒，并让超时按可重试处理（不跳过、不假装完成）。
4. **原生 → 网页状态回调此前实际未送达**：旧代码依赖给注入对象挂 `onState` 属性，页面从未定义。已改为派发到页面定义的 `window.SocialMateTtsHost.onState`，并保留旧通道兜底 —— 这是「用真实音频完成回调推进队列」能成立的前提。

## 4. 未越过的红线

- 未做全量回归（未跑 `verify-v040.sh` / `test-ui.mjs` 等），只做定点校验与真机验收。
- 未 commit / 未 push / 未发布。
- 未改公开海南 PWA、115 个公开地点、V1.4 资料；`places-115.json` SHA 未变。
- 未提高 DeepSeek 1 元闸门，未清账本；未把任何真人聊天或个人笔记外传。
