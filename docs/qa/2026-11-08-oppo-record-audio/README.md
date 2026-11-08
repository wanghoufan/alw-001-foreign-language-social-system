# OPPO 新机录音 / 语音链路验收（2026-11-08）

- 设备：OPPO PLG110，Android 17 / ColorOS 17
- 版本：0.9.9 / vc77（页面字号线缩与导航留白修复版）
- 结果：录音、ASR 直连、AI 接话、豆包 Web Audio 通过；原生朗读队列失败（系统无 TTS 引擎）

## 1. 录音与实时字幕

- `requestRecording()` → `isRecording()=true`，页面显示「正在听」。
- 腾讯直连实时字幕：录制期间收到 11 条 final（环境中文语音，非外放英文），停止后 `isRecording()=false`、状态 `off`。
- 首次失败原因：`SocialMateRec: recording failed: 未配对或令牌失效` —— 新机 `asr_mode` 默认 `mac`，未切换到腾讯直连。
- 处置：`setAsrMode('direct')` 回读 `{"ok":true,"mode":"direct","ready":true}`，`shared_prefs` 写入 `asr_mode=direct` 后录音成功。

## 2. AI 接话

- DeepSeek 直连正常：接话 2 条、追问 2 条、换题 3 条，中文释义按钮可用。

## 3. 豆包 Web Audio（聊天页实际朗读路径）

- `smDoubaoSpeak()` 返回 true，`__ttsLastDoubaoError=null`，`AudioContext=running`。
- 播放中：`source=true / running`；暂停：`paused=true / suspended`；继续：`running`；停止：`source=false`。
- 3 句连续文本一次合成播放通过，无 `NotAllowedError`。

## 4. 原生朗读队列（学习页「听本段」）

- `SocialMateTts.startQueue()` → `outcome=failed`，`queueControl('pause')` 返回 `TTS_NOT_PLAYING`。
- 日志：`speak request ... provider=system`、`queue_failed code=TTS_INITIALIZING message=系统 TTS 正在初始化`。
- 根因：OPPO 未设置默认系统 TTS（`tts_default_synth=null`，无标准 TTS 引擎包），原生队列回退系统 TTS 后无法初始化。
- 影响：学习页「听本段」在当前 OPPO 上无声；聊天页豆包 Web Audio 不受影响。

## 5. 学习页控制栏吸顶

- `.n05controls`：`position=sticky`，滚动 0 / 800 / 1800 时 `top` 恒为 426。
- 按钮：暂停 / 继续 / 停止 / 重试本段；最小字号 15px。
- 高度 162px，高于 skill 建议的 120px 上限，但未超半屏。

## 证据

- `key-log-lines.txt`：录音失败与 TTS 失败关键日志。
- `logcat-rec-failure.txt`、`logcat-tts-failure.txt`：原始日志（体积较大，可清理）。

## 回执

```text
【WebView 音频控制回执】
Web Audio 承载：PASS
暂停/继续/停止统一接口：PASS
控制栏吸顶：PASS
队列身份校验：NOT_RUN
证据路径：docs/qa/2026-11-08-oppo-record-audio/
结论：PARTIAL（Web Audio 与录音通过；原生队列因系统无 TTS 失败）
```

## 未完成 / 待修

1. 原生朗读队列需增加豆包 provider，或在系统 TTS 不可用时回退 Web Audio（否则 OPPO 学习页无声）。
2. 外放英文语音被环境中文盖过，英文 ASR 识别本轮未单独验证。
3. 控制栏 162px 可压到 ≤120px。