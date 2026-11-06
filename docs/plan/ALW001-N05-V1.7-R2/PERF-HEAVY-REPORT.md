# ALW-001 V1.7 重负载性能测量报告（录音 + 豆包朗读）

> 由 `scripts/v17-perf-heavy.mjs` 自动生成。
> 生成时间：2026/11/6 12:35:45
> 总体结论：**NOT_RUN**
> NOT_RUN 原因：未检测到录音中状态（原生 isRecording、页面 asrState、可见文案均无信号）；按口径标 NOT_RUN，未采样

## 1. 执行命令

```bash
SM_SERIAL=<设备序列号> node scripts/v17-perf-heavy.mjs \
  --port 9934 --package app.socialmate.dualmic --activity .MainActivity \
  --samples 5 --cold-precondition first
```

前置条件：手机解锁亮屏，应用在「聊天」页处于「正在听 / 录音中」；如需测双负载，先手动触发豆包朗读。脚本不代点「开始录音」。

真机序列号只从 `SM_SERIAL` 或 `--serial` 读取，不写入本报告。

## 2. 设备与环境

| 项目 | 值 |
| --- | --- |
| 设备 | Xiaomi 21091116AC |
| Android | 11（SDK 30） |
| ABI | arm64-v8a |
| 屏幕 | Physical size: 1080x2400 |
| 应用 | 0.9.2（versionCode 70） |
| WebView | Chrome/94.0.4606.85 |
| 页面 | http://127.0.0.1:33151/v12?live=1 |

## 3. 门槛与口径

| 指标 | 门槛 | 口径 |
| --- | --- | --- |
| 冷启动到可操作 | ≤ 2000ms | `force-stop` → `am start -W` 的 TotalTime + 页面 `loadEventEnd`（保守上界） |
| 录音中 Tab 切换 | ≤ 300ms | 点击导航到两次 `requestAnimationFrame` 完成，且主内容有子节点、高度大于 0、当前 Tab 已切换 |

统计使用近邻秩法：P95 = 升序第 `ceil(0.95 × n)` 个；n=5 时 P95 等于最大值。

## 4. 前置状态检测（只读）

| 项目 | 值 |
| --- | --- |
| 录音中 | 否（信号：无） |
| 原生桥 isRecording | false |
| 页面 asrState | error |
| 会话存在 | 是 |
| 录音 pill 文案 | — |
| 朗读可检测 | 是 |
| 朗读播放中 | 否 |
| 页面可见 | visible |

冷启动前置口径为 `first`：仅首轮要求录音中，后续样本不再阻断，启动后恢复情况见第 5 节。

## 5. 冷启动样本（录音中前置）

未执行：没有连接到测试设备，或测量在完成前中止。不写入推测数据。

## 6. 录音中 Tab 切换样本

未执行：没有连接到测试设备，或测量在完成前中止。不写入推测数据。

## 7. 结论

总体结论：**NOT_RUN**（本机耗时 0.8s）

- 冷启动：未测
- 录音中 Tab 切换：未测

## 8. 未验证项与限制

- `force-stop` 会终止录音与朗读；冷启动只能保证「启动前处于重负载状态」，无法保证启动全程录音连续。启动后是否恢复单独记录，不据此伪造。
- 冷启动 `cold` 是 `TotalTime + load` 的保守上界，不是端到端触控可操作时刻；入口 `MainActivity` 会立即跳转 `AsrActivity`，TotalTime 只覆盖入口活动。
- 朗读状态来自 `SocialMateTts.queueState()`（`running` 且未暂停）或页面 `[data-tts-state=playing]`，只代表采样时点，未做音频级校验，也未验证豆包声线内容。
- 录音状态来自原生桥 `SocialMateAndroid.isRecording()`、页面 `S.asrState`（ready/mock 且有 session）、可见文案；任一信号命中即视为录音中，信号来源已逐条记录。
- Tab 切换以两次 rAF 代表下一帧提交；未覆盖点击后的异步数据补渲染（如海南私有地点的 setTimeout 补渲染）。
- 样本数为 5 时 P95 等于最大值，统计粒度有限；如需更稳的 P95，请提高 `--samples`。
- 测量期间要求手机解锁、亮屏、应用在前台；否则 rAF 不触发，样本记为无效。
- 系统后台负载、缓存状态、电池策略会影响绝对数值；本报告只代表当次运行环境。
- 未覆盖长时间录音的内存增长、音频丢帧、TTS 队列切换与熄屏播放。
- 脚本只读页面状态，未写 localStorage、未改产品数据；Tab 点击只改变页面内存中的当前页。
