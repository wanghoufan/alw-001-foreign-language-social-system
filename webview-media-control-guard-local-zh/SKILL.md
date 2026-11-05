---
name: webview-media-control-guard-local-zh
description: 在接入移动端 WebView 连续音频朗读（云端朗读、TTS 排队）时，必须先做三项检查：Web Audio 承载、暂停/继续/停止走统一接口、控制栏吸顶；出现『第二句变系统声、暂停失效、滑下去停不了』时调用。
version: 1.0.0
agent_created: true
---

# 触发场景

接手本项目的 agent 在以下任一情况必须调用本 skill，不依赖用户口播触发：

- 在 Android / iOS WebView 中接入云端 TTS、朗读队列或连续音频播放。
- 出现「第二句变系统声」「暂停失败 TTS_NOT_PLAYING」「滑到第 2 段后停不了」。
- 新增或修改朗读队列、暂停/继续/停止按钮、播放控制栏布局。

# 机制二：媒体接入流程的强制前置检查

本 skill 不是用户口令技能，而是媒体接入流程的前置闸门。任何 WebView 连续音频改动，先按下面三项检查，再动代码。

## 1. Web Audio 承载

- 不要每次 `new Audio()`：WebView autoplay 只允许首次用户手势，第二项起 `play()` 会被 blocked，代码判定失败后回退系统 TTS。
- 使用 `AudioContext` + `BufferSource`：
  - 首次用户点击内同步创建并 `resume()` AudioContext。
  - 后续每项 `decodeAudioData` + `createBufferSource` 连续播放。
  - 新播放前 `stop()` 旧 source；队列 await 返回后校验队列身份，旧队列不得继续播下一项。

## 2. 暂停 / 继续 / 停止走统一接口

- 暂停：`AudioContext.suspend()`。
- 继续：`AudioContext.resume()`。
- 停止：`stop()` 当前 source + 清空队列与 watchdog。
- 不要在云端音频播放时调用原生 TTS 的 `pause`：原生没在播会返回 `TTS_NOT_PLAYING`。
- 原生 TTS 仅作为云端失败后的回退路径。

## 3. 控制栏吸顶

- 播放控制区（倍速/循环/暂停/继续/停止/重试/状态）用 `position:sticky`，`top` 与页面头高度对齐。
- 控制区高度压到 ≤105px，按钮一行四键、32px 高、13px 字。
- 验证：滚动到第 2/3/4 段后，控制栏仍固定在顶部，随时可暂停/停止。

# 验证

- 真机逐项日志：`engine=doubao`、`native=0`，同一队列所有项 `voice` 一致。
- 暂停 → 状态 `paused`；继续 → `playing`；停止 → `idle`，不出现 `TTS_NOT_PLAYING`。
- 滚动到第 2 段后，控制栏 `getBoundingClientRect().top` 等于吸顶位置。

# 强制回执

完成后必须原样输出以下三项回执，任一未写不得报完成：

```text
已用 Web Audio / 暂停路径已核对 / 吸顶已确认
```

# 反例

- 每次 `new Audio()` → 第二项 autoplay blocked，回退系统 TTS。
- 暂停按钮调原生 `pause` → `TTS_NOT_PLAYING`。
- 控制栏不 sticky 或高过半屏 → 滑到第 2 段后无法暂停/停止。

# 维护记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-11-05 | 1.0.0 | 从 N05 阅读页三轮返工沉淀：Web Audio、暂停接口、吸顶控制栏。 |