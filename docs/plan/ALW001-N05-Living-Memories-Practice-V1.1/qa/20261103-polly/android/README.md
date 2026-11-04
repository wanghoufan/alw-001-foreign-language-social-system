# N05 Polly · Android 真机验收（2026-11-03）

> 范围：`aws-polly-fake` 本地替身真机验收。真实 `aws-polly` 未获 AWS 授权，**NOT_RUN**，不得把本文件当成真实 Polly 音质通过。
> 设备：Redmi Note 11 5G（Android 11，serial `REDACTED-SERIAL`）。
> 后端：8791 于 11:12 重启后加载新路由；`realProvidersConfigured=0`、`realCloudCallsThisBuild=0`。

## 1. 构建与安装

| 项 | 值 |
|---|---|
| versionName / versionCode | `0.8.5` / `40` |
| APK | `android-poc/app/build/outputs/apk/debug/app-debug.apk` |
| 字节数 | 307840 |
| SHA-256 | `66318df341129d45a6aa6f3f6ca4cbf159ef3d774c08c27578b06b5f84e92c22` |
| 安装 | `adb -s REDACTED-SERIAL install -r` → `Success`，`dumpsys package` 回读 vc39/0.8.4 |

构建方式：`gradle --no-daemon --console plain :app:clean :app:assembleDebug`，全部 task executed（非 UP-TO-DATE）；`aapt2 dump badging` 复核通过；0.8.5 追加真实 Polly estimate/consent 弹窗。

## 2. 线上 providers 契约

`GET /v12/api/tts/providers`（带本机归档令牌，令牌未落证据）：

- `aws-polly`: `enabled=true`、`configured=false`、`reason=CREDENTIALS_NOT_FOUND`、`region=ap-northeast-1`
- `aws-polly-fake`: `enabled=true`、`configured=true`
- `providerBudgets.aws-polly`: `limitCny=0`、`spentCny=0`、`exists=false`
- `policy.realProvidersConfigured=0`、`policy.realCloudCallsThisBuild=0`
- 无令牌 → `401 TOKEN_REQUIRED`

原始 JSON：`providers-live.json`、`providers-after.json`。

## 3. 真机播放结果（aws-polly-fake）

| 段 | locale | 声线 | audioId | 结果 |
|---|---|---|---|---|
| cn | zh-CN | Zhiyu | `tts-2b791032d865175dd4b731f13bbad242` | 200，19244 B，600ms |
| enA | en-US | Joanna（覆盖） | `tts-64d5702003f663d6e2ade2d10f533760` | 200 |
| enA | en-US | Ruth（覆盖） | `tts-3844fd88ea08eee244a1dfbeb74b77c6` | 200 |
| enB | en-GB | Amy（服务端默认） | `tts-a49e0f491f0e63cf1c84888e8132c04c` | 200 |
| enB | en-GB | Brian（覆盖） | `tts-75534926303936ab870702f02a18f7d0` | 200 |
| phrase | en-US | Joanna | `tts-eb6a3dc46fcc1d6e48435835d554ca18` | 200 |

- 服务端唯一合成 **9 次**（`stats.syntheses=9`），客户端 `synthRequests=9`；同段重复播放走客户端缓存 `cacheHit=true`、**不新增合成**（日志 `remote cache hit ... synthRequests=9`）。
- 循环：`loop 1/5` → `5/5` 全部完成；`cmd stop` 返回 `{"ok":true,"state":"stopped"}`，停止后音频轨 `AT::remove`。
- 音频轨证据：`11-audio-flinger-playing.txt` 中 `AT::add` / `AT::remove`，`16000 Hz`、电平 `-27`，播放态成立。
- 音频 SHA：`audio-shas.txt`（从 TtsCache 元数据读取，6 个 audioId 均为 `audio/wav`、19244 B，逐个带 `audioSha256`）。
- 切段：`cmd segment --ei index 1`、`cmd next`、`cmd previous` 均返回 OK（日志见 `logcat-tts.txt`）。

## 4. 负例

| 用例 | 结果 |
|---|---|
| `en-US + Zhiyu`（跨 locale） | `{"ok":false,"code":"UNKNOWN_VOICE","httpStatus":400,"allowed":"Ruth / Joanna"}` |
| provider=system 且系统声音未手动开启 | `TTS_SYSTEM_FALLBACK_NOT_ENABLED`，**不会自动降级** |
| serverProvider=aws-polly（真实云，未配置且未同意） | `TTS_REMOTE_REJECTED` / 403 `CONSENT_REQUIRED`；未发起任何 AWS 请求 |
| 后端直测 aws-polly（显式同意后） | `501 PROVIDER_NOT_CONFIGURED`，附 region/reason，无凭据 |

真实 AWS 合成、DescribeVoices、真实音质试听均 **NOT_RUN**。

## 4-b. 真实 Polly 显式同意 UI（0.8.5）

目的：真实 `aws-polly` 在把学习文本发给第三方前，必须先展示「服务商/区域/引擎/字符数/估价/摘录」，用户点「同意并朗读」后才发 `explicitConsent:true`。该流程本身不产生 AWS 调用。

| 用例 | 结果 |
|---|---|
| 触发 | `serverProvider=aws-polly` + `speak enA` → `state=consent_pending`，随后弹窗 |
| 弹窗内容 | 服务商 Amazon Polly；区域 ap-northeast-1；引擎 generative；字符 49；预计 ¥0.007350；摘录 `The street is lively today, shall we tak…`；提示「当前 AWS 尚未配置…不会产生费用」 |
| 点「同意并朗读」 | 日志 `consent granted` → 后端 501 `PROVIDER_NOT_CONFIGURED`；**合成请求 0**、无 AWS 调用 |
| 点「取消」 | 日志 `consent_cancelled`；界面显示「已取消发送；没有产生任何云请求。」；无合成 |
| 线上报价 | `POST estimate=true` 返回 `region/engine/configured=false/charCount/estimatedCostCny/willTransmitTextExcerpt`，且不落盘、不建账本 |

证据：`20-consent-dialog.png/.xml`、`21-consent-confirmed-result.png/.xml`、`22-consent-cancel-dialog.png/.xml`、`23-consent-cancelled.xml`、`24-consent-cancelled-message.png/.xml`、`logcat-consent.txt`、`apk-sha256-consent.txt`；后端报价字段由 `../backend/` 的 P9-b 断言覆盖。

> 真实 AWS 合成/音质试听仍 NOT_RUN；本轮只证明「同意前不发送、确认后明确报未配置、取消不发送」。

## 5. 证据文件

- `10-selftest-playing.png`（1080×2400，自测页播放态）
- `10-selftest-playing.xml`（uiautomator，含 provider / 远端声音 / aws-polly-fake）
- `11-audio-flinger-playing.txt`
- `12-tts-prefs.xml`（provider=remote、remote_provider=aws-polly-fake、en-US=Ruth、en-GB=Brian、loop=5、system_fallback=false）
- `13-version.txt`、`apk-sha256.txt`
- `logcat.txt` / `logcat-tts.txt`、`providers-live.json` / `providers-after.json`
- 后端证据：`../backend/`（30/30，0 真实云调用）

## 6. 诚实说明

- 早期两条未加引号的 ADB `--es text` 被设备 shell 按空格截断（只送到 "The" / "take"），已作废，不计入本验收；最终证据以 `chars=49 / 63 / 11` 的请求为准。
- 本文件只证明 **协议、缓存、播放控制、语言路由、假声线切换** 在真机成立，不证明 Polly 真实音质。
- 未跑全量回归、未 commit/push、未修改公开 PWA 与真实 People/PlaceNotes。