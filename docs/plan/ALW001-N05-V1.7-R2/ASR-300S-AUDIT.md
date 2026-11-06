# ALW-001 V1.7 ASR 300s / 4G 路径审计

- 审计日期：2026-11-06
- 审计范围（只读）：`android-poc/app/src/main/java/app/socialmate/dualmic/{TencentAsrClient,AsrClient,AsrActivity}.java`、`android-poc/app/src/main/java/app/socialmate/dualmic/local/LocalServer.java`、`android-poc/asr-bridge/src/tencent-asr-client.js`、`android-poc/asr-bridge/src/server.js`、`socialmate-v1.2/index.html`
- 约束：未修改任何源码；本文件为本轮唯一新增文件。
- 口径：本报告把「代码可证」与「需真机/真实云环境实测」严格分开；未实测项一律列入第 8 节，不作为结论。

---

## 1. 结论表

| # | 问题 | 结论 | 关键证据 |
|---|---|---|---|
| 1 | Android 直连是否有单会话 300s 上限 | **没有**。整个 Android 客户端（含 `TencentAsrClient` 全部 192 行）无任何 300s 常量、计时器、主动收尾 | `TencentAsrClient.java:20-191`；全仓 `ASR_MAX_SESSION_SECONDS` 只出现在 `asr-bridge/src/server.js:853` |
| 2 | 300s 是否有本地超时/自动结束/主动轮换新会话 | **没有主动轮换**。只有被动断线后由音频循环触发 `reconnectTrack`，每次重连新建一条腾讯会话并重新签名 | `AsrActivity.java:2542-2562`、`AsrActivity.java:2636-2678`、`AsrActivity.java:2467-2477` |
| 3 | 断线重连会无限重建吗 | **不会无限**。同一 track 单飞，退避 1s/2s/4s，最多 3 次；3 次失败即 `stopStreaming` 停录并提示 | `AsrActivity.java:2636-2678`（`attempt <= 3`、`reconnecting.add`） |
| 4 | `finish()` 发 `{"type":"end"}` 后，`final=1` 收尾能否识别 | **能识别**，但 `final=1` 分支在 sentences/result 之前 `return`，**同包若携带最后一句会被跳过**（Java 与 Mac 中继同病） | `TencentAsrClient.java:53-57` 对比 `TencentAsrClient.java:58-64`；`tencent-asr-client.js:417-421` 对比 `:423-429` |
| 5 | 页面 SSE `/api/asr/live` 在 300s 边界是否丢 final | **会丢**。SSE 连接被写死为 `150 × 2000ms ≈ 300s` 后主动结束；页面重连窗口（≥500ms）内到达的 final 被 `publishAsr` 直接丢弃，且无补发 | `LocalServer.java:713-733`（`i < 150`、`Thread.sleep(2000)`）、`LocalServer.java:113-124`（`sseClients.isEmpty()` 直接 return）、`socialmate-v1.2/index.html:1773-1790`（onerror→500ms 起退避） |
| 6 | 停止录音时能否等齐最后 final | **不能**。结束信号是按「整轮一次」的 `CountDownLatch` 计数；300s 自动结束（或任何中途 `session/ended`）会提前把 latch 减到 0，之后用户继续录、再停止时 `await` 立即返回，最后一条 final 可能未入库即关连接 | `AsrActivity.java:2495-2497`、`AsrActivity.java:2726-2735`、`AsrActivity.java:2586-2602` |
| 7 | 手机直连腾讯是否需要 Mac/配对令牌 | **不需要**。direct 分支跳过 token 校验，向 `TencentAsrClient` 传空 token（握手不加 `x-asr-token`），签名在手机本地生成 | `AsrActivity.java:2500-2505`、`AsrActivity.java:2477`、`AsrClient.java:44-49`、`TencentAsrSign.java:34-70` |
| 8 | WiFi→4G 切换时 WebSocket 会重连吗、会重新签名吗 | **会重连、会重新签名**。靠 `setConnectionLostTimeout(20)` 发现半开连接，音频循环 `isAlive()` 为假时触发 `reconnectTrack`；direct 分支每次调用 `TencentAsrSign.createUrl()` 重新签名（`expired = now + 3600`） | `AsrClient.java:31,40`、`AsrClient.java:86-88`、`AsrActivity.java:2556-2559`、`AsrActivity.java:2652`、`TencentAsrSign.java:44-45` |
| 9 | 重连是否有副作用 | **有**。重连窗口内的音频帧直接丢弃；新会话 `start_time` 从 0 开始，`sessionStartMs` 只赋值未读取，导致时间轴倒退、归档时长失真 | `AsrActivity.java:2557-2561`、`AsrActivity.java:136,2524`（变量未被读取）、`TencentAsrClient.java:103-105` |
| 10 | 切后台/锁屏是否直接停录 | **是**。`onStop` 无条件 `stopStreaming("切到后台")`，且清单只有 `mediaPlayback` 前台服务，无麦克风前台服务 | `AsrActivity.java:2882-2890`、`AndroidManifest.xml:39-41` |
| 11 | Mac 中继的 300s 处理 | **有完整实现**：`ASR_MAX_SESSION_SECONDS`（默认 300）定时器 → 发 `error(ASR_SESSION_LIMIT)` → `endSession()` → 等腾讯 final（10s 超时）→ `finalize('ended')` 下发 `session ended` → 20ms 后关闭 | `server.js:853-868`、`server.js:804-839`、`tencent-asr-client.js:298-322`、`server.js:772-802` |
| 12 | 首连失败能否重试 | **不能**。`awaitOpen()` 固定 4s，任一 track 失败即整轮抛错结束，不进入 3 次重连 | `AsrActivity.java:2520-2522`、`AsrClient.java:77-84` |

---

## 2. Android 直连路径逐项审计

### 2.1 会话生命周期（`TencentAsrClient.java`）

```
30-34  构造：super(signedUri, track, "", listener) —— token 传空，手机直连不走配对头
36-48  onMessage：code != 0 → emitError + closeQuietly
49-52  首包（任意正常消息）→ emitSession("ready")
53-57  final == 1 → emitSession("ended") + closeQuietly + return
58-64  sentences / result 解析
77-80  finish()：仅 send({"type":"end"})，无本地计时器、无超时
184-191 closeQuietly：endedSent 幂等
```

- **没有任何 300s 逻辑**：无 `SystemClock` 计时、无 `postDelayed`、无 `Handler`。
- **没有主动轮换**：即使会话已过 300s，也不会主动 `end` 后新建。
- **收尾识别存在（53-57）**，但顺序问题：`final=1` 在 `sentences` 之前 `return`，若腾讯把最后一句与 `final:1` 放在同一包（协议未保证分离），该句被丢弃。中继侧 `tencent-asr-client.js:417-421` 是完全相同的写法，说明这是两端一致的实现选择，不是笔误；但**未实测腾讯是否会把最后一句合并进 `final:1` 包**，故列 P1 而非 P0。
- `sendPcm` 按 6400 字节切片（`TencentAsrClient.java:67-75`），16k/mono 下即 200ms，符合腾讯建议包长。

### 2.2 300s 到点后的实际链路（手机直连）

1. 腾讯侧若主动关闭：`AsrClient.onClose`（`AsrClient.java:69-71`）只上报 `closed(code)`，不重连；
2. 下一帧音频 `client.isAlive()` 为假（`AsrActivity.java:2556`）→ `reconnectTrack`；
3. `reconnectTrack` 每次重试调用 `openAsrClient`，direct 分支重新 `TencentAsrSign.createUrl()`（新 voiceId + 新签名），建新会话（`AsrActivity.java:2652`、`2467-2477`）；
4. 成功后 `clients.remove(lost); clients.add(next)`，音频继续（`2654-2659`）。

**结论**：手机直连的 300s 完全「被动」。腾讯不关就没有 300s 边界；腾讯关了就靠 3 次重连续命。**与 Mac 中继（自设 300s 主动收尾）行为不一致**，且手机端没有中继的 `asr-budget.js` 预算熔断，长时间使用时成本不入账本。

### 2.3 重连上限与单飞

```java
2639  if (!reconnecting.add(track)) return;      // 同 track 单飞，避免并发重建
2644  for (int attempt = 1; attempt <= 3 && running; attempt++)
2646  Thread.sleep(1000L << (attempt - 1));      // 1s / 2s / 4s
2652  next = openAsrClient(track, baseWithParams, "", token);
2653  if (next.awaitOpen() && running) { ... recovered = true; break; }
2672  else if (running) { asrLink = "lost"; stopStreaming("连接中断"); }
```

- 单次断线最多 3 次，**不会无限重建**；
- 但计数是「每次断线重新从 1 开始」，一轮长录音中多次断线会反复重建（有界但累计次数无上限）；
- 最坏恢复耗时：`(1+4)+(2+4)+(4+4) = 19s` 无字幕（退避 + 每次 `awaitOpen` 4s），期间音频丢弃；
- `reconnecting` 在 `finally` 统一清空（`2577`），不会残留导致下一轮无法重连。

### 2.4 结束等待与 `final` 归档

```java
2495  CountDownLatch endedLatch = new CountDownLatch(Math.max(1, tracks.length));
2726-2735  session/ended 且 clients.contains(client) → endedLatch.countDown()
2586-2592  finally: 所有 client.finish()，然后 endedLatch.await(3000ms)
2599-2604  closeBlocking()，clients.clear()
2605  archive.end()
```

缺陷链条（**P0**）：

1. 单轨时 `latch = 1`；
2. 300s 时中继（或腾讯）发 `session/ended`，该 client 仍在 `clients` 内 → `countDown()` → 计数 0；
3. 客户端重连后继续录 5 分钟；
4. 用户点停止 → `finish()` → `await(3000ms)` 因计数已是 0 **立刻返回**；
5. `closeBlocking()` 立即关闭新会话 → 新会话最后 1~3 秒的 final 未到达；
6. `archive.end()` 收尾 → **最后一句原文不在归档里**，但页面 SSE 可能已显示该句（`publishAsrToPage` 在事件首行且不依赖 latch，`2724`），出现「页面看得到、归档没有」的不一致。

### 2.5 直连仍需满足 Mac 地址格式（遗留耦合）

```java
2408  String base = urlInput.getText().toString().trim();
2412  if (!base.startsWith("ws://") && !base.startsWith("wss://")) {
2413      status.setText("服务端地址必须以 ws:// 或 wss:// 开头"); return;
2415  }
```

`startStreaming()` 在校验模式之前无条件校验 `asr_url`。direct 模式根本不用这个地址，但只要该字段为空或填成 `http(s)://`，点开始即被拦截。默认值 `ws://127.0.0.1:8790/asr`（`71`）能过校验，故实际不阻断，但属于直连与中继的耦合残留（P1，低严重度）。

### 2.6 首连不重试

```java
2520  if (!client.awaitOpen()) throw new Exception("无法连接 腾讯云 ASR（手机直连）（检查网络与 Key）");
2521  ...
2564  catch → status "连接/录音失败" · toast · "本轮未开始；可重试"
```

`awaitOpen` = `connectBlocking(4, SECONDS)`（`AsrClient.java:77-84`）。4G 冷启动、弱网、TLS 握手抖动超 4s 即整轮失败，且**不进入** 3 次重连（重连只在音频循环里）。用户只能手动重开（P1）。

---

## 3. Mac 中继 300s 处理（对照）

| 维度 | Mac 中继（`asr-bridge`） | 手机直连（`TencentAsrClient`） |
|---|---|---|
| 300s 上限 | 有，`ASR_MAX_SESSION_SECONDS` 默认 300（`server.js:853`） | 无 |
| 到点动作 | 先发 `error`（`ASR_SESSION_LIMIT`，`server.js:856-866`），再 `endSession()` | 无动作，等腾讯侧 |
| 收尾等待 | `TencentRealtimeSession.end()` 等 `final=1`，超时 10s 发 `ASR_END_TIMEOUT` 并关闭（`tencent-asr-client.js:298-322`） | 仅 `finish()` 发 `{"type":"end"}`，无超时（`TencentAsrClient.java:77-80`）；等待由 Activity 的 3000ms 兜底 |
| 结束信号 | `finalize('ended')` → 下发 `session` + `ended` → 20ms 后 close（`server.js:772-802`） | 收到 `final=1` → `session/ended` → `closeQuietly`（`53-57`） |
| final 同包结果 | `final===1` 先 `return`，跳过同包 sentences（`:417-421`） | 同（`:53-57`） |
| 重连新会话 | 客户端 `reconnectTrack` → 用旧 `x-asr-token` 再连中继，中继新建上游会话并重新签名（`AsrActivity.java:2479`、`2636-2678`） | 客户端重新本地签名直连腾讯（`2472-2477`） |
| 成本控制 | 有 `asr-budget.js`，超限发 `ASR_BUDGET_EXHAUSTED` 后结束（`server.js:870-895`） | 无 |

**关键差异**：300s 是中继的**自设上限**（可用环境变量改），不是腾讯协议强制项。手机直连缺失这一上限，导致两端行为不可互换：同一轮录音在 direct 下可能远超 300s，而 Mac 下每到 300s 必断一次。

---

## 4. 4G / 5G 路径

### 4.1 不需要 Mac / 配对令牌（已确认）

- `stream()` 只在非 direct 时检查令牌：`AsrActivity.java:2502-2505`；
- direct 客户端 token 传空串：`AsrActivity.java:2477` → `AsrClient.java:36-49`，空 token 不写 `x-asr-token`；
- 签名 URL 完全在手机本地生成：`TencentAsrSign.java:34-70`，`expired = now + 3600L`（`44-45`）。

**唯一仍依赖 Mac 的部分**：`urlInput` 的地址格式校验（2.5）与归档上传（`SessionArchive` 需要令牌，失败时保留本地 `current.json` / outbox，见 `SessionArchive.java:325-350, 240-270`）。即「识别不需要 Mac，归档上云仍需要」。

### 4.2 网络切换（WiFi → 4G）

- 探测：`setConnectionLostTimeout(20)`（`AsrClient.java:31,40`），最长约 20~30s 才发现半开连接；
- 触发点：音频循环里 `!client.isAlive()` → `reconnectTrack`（`AsrActivity.java:2556-2559`）；
- 重新签名：direct 分支每次 `reconnectTrack` 都重新 `createUrl()`，签名 1 小时有效与新时间戳，**不存在签名过期导致重连失败的问题**（`TencentAsrSign.java:44-45`、`AsrActivity.java:2652`）；
- 代价：断开期间的音频帧被丢弃（`2557-2561`），无回补；恢复后 `startMs` 从 0 起算，时间轴倒退（`TencentAsrClient.java:103-105`、`AsrActivity.java:136/2524` 未使用 `sessionStartMs`）；
- 若 3 次都失败：停录并提示「连接中断，本轮已停止」（`2672-2676`）。

**Mac 中继路径的额外风险**：`asrToken` 在 `stream()` 开头只取一次（`2501`），重连一直复用同一字符串（`2558`）。若配对令牌有效期短于断线时刻，重连会连续 401 三次后停录。手机直连不受此影响。

### 4.3 切后台 / 锁屏

```java
2882-2886  onStop() { ... stopStreaming("切到后台"); }
2887-2889  /* 前台麦克风刻意不可用 */
```

- 清单只有 `TtsPlaybackService`（`foregroundServiceType="mediaPlayback"`，`AndroidManifest.xml:39-41`），**没有** `FOREGROUND_SERVICE_MICROPHONE` / `foregroundServiceType="microphone"`；
- 因此：接电话、切到微信、锁屏 → `onStop` → `running=false` → 音频循环退出 → `finally` 收尾 → **本轮结束**；
- 出门使用时只有 `FLAG_KEEP_SCREEN_ON`（`AsrActivity.java:182`）保底，即「必须亮屏、前台、插着耳机/麦克风才能连续录」；放口袋里必停。
- 这是显式设计（注释写明 deliberately impossible），但对 V1.7「4G 出门」场景是硬限制，需产品口径确认（见 P1-5）。

---

## 5. 页面 SSE `/api/asr/live` 的 300s 边界

### 5.1 服务端写死 300s

```java
723  for (int i = 0; i < 150 && sseClients.contains(out); i++) {
724      Thread.sleep(2000);
725      out.write(": heartbeat\n\n");
727  }
730-732  finally { sseClients.remove(out); }
```

`150 × 2000ms ≈ 300s` 后循环退出，`handle()` 的 try-with-resources 关闭 socket → 页面 `onerror`。

### 5.2 断连窗口内 final 被丢弃

```java
113-124  publishAsr: if (event == null || sseClients.isEmpty()) return;
         for (out : sseClients) { write/flush; catch → remove }
```

- 无历史缓冲、无 `Last-Event-ID`、无序号补发；
- 页面重连：`onerror` → `close()` → `scheduleAsrReconnect()` 首次延迟 `500ms`（`index.html:1773-1790`）；
- 该 ≥500ms 窗口内的 `final` 与 `session/ended` 均丢失，且页面无法回补。

### 5.3 与腾讯/中继 300s 边界的重合

- SSE 起算点 ≈ 页面 `connectLiveASR()`（录音开始后）；
- 中继 300s 起算点 ≈ 会话创建（同一时刻）；
- 两者都以「300s」为单位，**几乎同秒触发**：同一瞬间既有会话收尾的最后一句 final，又有 SSE 断连。
- **结论：300s 边界丢 final 不是理论风险，是每 300s 至少发生一次的确定性窗口**（P0-1）。

补充：SSE 断开时 `session/ended` 也会丢，页面会一直停在 `ready` 状态直到下一条事件或再次建立连接，`asrInterim` 文案不会提示「会话已结束」。

---

## 6. 必须补的代码项

### P0（2 项，不修就丢数据）

**P0-1｜SSE 300s 断连窗口丢 final**
- 位置：`local/LocalServer.java:723`（`i < 150`）、`:113-124`（`publishAsr`）
- 改法（择一，均需不改协议）：
  1. 把 SSE 心跳循环改成「只在 socket 真正不可写时退出」，不再以 150 次计数主动结束；
  2. 若必须保留周期性重建，则在 `publishAsr` 侧加一个短环形缓冲（如最近 200 条事件 + 单调 `seq`），SSE 建连时用 `Last-Event-ID` 回补；
- 验收：见 7.2。

**P0-2｜结束等待 latch 被 300s 中途耗尽早停，丢尾部 final 归档**
- 位置：`AsrActivity.java:2495-2497`、`:2726-2735`、`:2586-2602`
- 改法：
  1. 把「整轮一次 latch」改为「按当前活跃 client 集合收敛」：停止时对 `clients` 快照逐条等待其 `session/ended`（各自 3s 超时）；
  2. 或在收到 `session/ended` 时仅对**当下仍为 active 的 client** 计数，重连替换后重建等待集合；
- 验收：见 7.3。

### P1（7 项）

**P1-1｜手机直连缺 300s 自设上限与预算熔断，与中继行为不一致**
- 位置：`TencentAsrClient.java`（无实现）、`AsrActivity.java:2467-2477`
- 建议：在 `stream()` 侧加本地 `sessionElapsed` 计时，到 300s（可配置）主动 `finish()` 后静默重建新会话，并复用中继的 `ASR_SESSION_LIMIT` 语义；同时补手机端用量记账（至少记录音频秒数到本地状态）。

**P1-2｜重连窗口丢音频 + 时间轴倒退**
- 位置：`AsrActivity.java:2557-2561`、`:136/2524`、`TencentAsrClient.java:103-105`
- 建议：`emit()` 时给 `startMs/endMs` 加 `sessionStartMs + 累计偏移`；`sessionStartMs` 当前是死变量（只赋值不读取）；重连期间保留一小段 PCM 环形缓冲，握手后补发（注意腾讯对超时音频的接受度需实测）。

**P1-3｜首连 `awaitOpen` 4s 失败即整轮失败且不重试**
- 位置：`AsrClient.java:77-84`、`AsrActivity.java:2520-2522`
- 建议：首连复用 `reconnectTrack` 的退避（至少 2 次），或按网络类型（蜂窝）放宽到 8~10s。

**P1-4｜`final=1` 包跳过同包 sentences/result**
- 位置：`TencentAsrClient.java:53-57`、`tencent-asr-client.js:417-421`
- 建议：先处理 `sentences/result` 再判断 `final`；或实测确认腾讯不合并后再保留现状并加注释与回归用例。

**P1-5｜切后台/锁屏即停录（4G 出门的核心限制）**
- 位置：`AsrActivity.java:2882-2890`、`AndroidManifest.xml:39-41`
- 建议：如产品要求「口袋长录」，需新增 `foregroundServiceType="microphone"` 的前台服务承载 `AudioRecord`（Android 14 需 `FOREGROUND_SERVICE_MICROPHONE` 权限 + 通知），并同步调整 `onStop` 不停止录音。此条涉及产品口径，见第 9 节 C 项。

**P1-6｜direct 模式仍被 `ws://` 地址格式拦截**
- 位置：`AsrActivity.java:2408-2415`
- 建议：`directAsrMode()` 为真时跳过 `asr_url` 校验与写入，仅保留 Key 完备性检查。

**P1-7｜Mac 中继重连复用开局令牌**
- 位置：`AsrActivity.java:2501,2558`、`DevicePairing.java:77-86`
- 建议：`reconnectTrack` 每次调用 `currentAccessToken()` 重新取（内部会做临近过期刷新），而非复用 `stream()` 开头的快照。（仅影响 Mac 路径，4G 直连不受影响。）

---

## 7. 可执行验收步骤（本轮可做，不需要真实 4G）

### 7.1 静态断言（5 分钟内）

```bash
# 1) Android 端确认没有 300s 实现
rg -n "300|MAX_SESSION|ASR_SESSION_LIMIT" android-poc/app/src/main/java --glob '!**/build/**'
# 期望：无 ASR_SESSION_LIMIT / 无 300s 计时器命中

# 2) 确认 SSE 写死 150×2s
rg -n "i < 150|Thread.sleep\(2000\)" android-poc/app/src/main/java/app/socialmate/dualmic/local/LocalServer.java

# 3) 确认 direct 不走 token
rg -n "directAsr|asrToken|openAsrClient" android-poc/app/src/main/java/app/socialmate/dualmic/AsrActivity.java
```

### 7.2 P0-1 验证（SSE 300s 丢 final，可在页面 Console 复现，不改代码）

1. 启动 Mac 中继 mock 模式（无腾讯 Key 时自动 mock：`android-poc/asr-bridge`）；
2. 手机进入录音页，点「开始实时对话」，确认 `S.asrStream` 已就绪；
3. 在 WebView 调试 Console 执行：

```js
// 模拟 300s 到期那一刻的 SSE 断开（服务端 finally 移除订阅者）
S.asrStream.close(); S.asrStream=null;
```

4. 在 500ms 重连窗口内，让原生产生一句 final（继续说话即可）；
5. 重连后检查页面气泡：**该句缺失**，而后端归档 `current.json` 里存在该句 → 证明窗口丢 final；
6. 附加验证服务端路径：临时把 `ASR_MAX_SESSION_SECONDS` 与 SSE 计数按 300s 跑一次真实长录音（≥310s）观察同样现象。

### 7.3 P0-2 验证（latch 提前耗尽，用环境变量把 300s 缩短，不改代码）

```bash
# 用运行参数而不是改源码，把中继上限缩到 20s
ASR_MAX_SESSION_SECONDS=20 node android-poc/asr-bridge/src/server.js   # 按实际启动脚本调整
```

1. 手机连中继（mac 模式），开始录音；
2. 录到第 21~25 秒会收到 `ASR_SESSION_LIMIT` 与会话结束，客户端自动重连新会话（观察 `status` 出现「重连」）；
3. 继续录 10 秒，然后点停止；
4. 检查 `SessionArchive` 的当前会话 JSON：**第 25 秒之后、停止前最后 1~3 秒的 final 缺失**（因为 latch 在 20s 时已归零，`await` 立即返回）；
5. 对照修后版本：`await` 应逐条等待当前活跃 client 的 ended，尾句应入库。

### 7.4 P1-2 验证（时间轴倒退）

1. 录 30 秒后拔网线/开飞行模式 5 秒再恢复；
2. 观察重连后页面新气泡的时间戳：**会从小值重新开始**（如从 0.5s 起），归档 segment 的 `startMs` 同样回退；
3. 断言：同一 session 内 `startMs` 应单调不减，现版本不满足。

### 7.5 P1-5 验证（切后台即停）

```bash
adb -s <serial> shell input keyevent KEYCODE_HOME
# 观察 Android logcat（流式写文件，不用 -d）与页面状态：
# 期望现状：录音停止、status 变为「正在停止…（切到后台）」
```

锁屏同理（`KEYCODE_POWER`）。若产品口径允许口袋录音，此项应转为失败。

### 7.6 4G 首连耗时（可半真机）

1. 手机关 WiFi、只留 4G，冷启动 App（清后台）；
2. 点开始，记录从点击到「已连接」的耗时；
3. 若出现「无法连接 腾讯云 ASR（手机直连）（检查网络与 Key）」，说明 4s `awaitOpen` 不够 → P1-3 成立。

---

## 8. 本轮无法验证的真实 4G / 300s 项

| # | 项 | 为什么本轮无法验证 | 建议验证方式 |
|---|---|---|---|
| 1 | 腾讯云真实 300s 行为：是否主动断、断前是否发 `final=1` | 本机无腾讯 Key、无 300s 真实长连；只读代码无法证明服务端策略 | 真机 + 真实 Key，连续录 320s，抓 WS 帧（adb 流式 logcat + 客户端事件日志） |
| 2 | 腾讯 `final=1` 包是否携带最后一句 `sentences/result` | 同上，需真实报文 | 真实长连接录到收尾，记录 `final:1` 包原始 JSON |
| 3 | 腾讯 ASR 是否响应 WebSocket ping/pong | `setConnectionLostTimeout(20)` 依赖服务端 pong；文档未验证 | 真机直连 30s 静音，观察是否每 20s 误判断连 |
| 4 | WiFi→4G 切换的实际恢复时延与丢句量 | 需真实网络切换 | 录音中开关飞行模式 3 次，统计重连耗时、丢句数、`startMs` 回退 |
| 5 | 锁屏/切后台在各厂商 ROM 上的 `onStop` 触发时机 | 需真机（红米/小米自带浏览器场景同理） | 小米/红米真机锁屏后看 `running` 与通知栏 |
| 6 | 双轨 A/B 在 4G 下同时建两条 wss 的成功率与费用 | 需真实 Key 与流量 | 双轨录 5 分钟，记录两条连接事件与未定价额 |
| 7 | P0-1 的实际丢句概率（而非可复现性） | 需 ≥300s 真实长录多次采样 | 连续 3 轮 310s 录音，统计每轮丢句数 |
| 8 | 中继配对令牌 TTL 与 300s 重连的实际冲突 | 需看服务端签发逻辑（本轮未审计 `asr-bridge` 之外的令牌签发） | 读服务端 token 签发 TTL，或长录 >TTL 观察 401 |

---

## 9. 需要产品/用户拍板的事项

**A｜4G 出门是否必须支持「锁屏/口袋长录」**
1. 【建议】明确降级：只支持「亮屏 + 前台麦」连续录，文案与验收都按此口径，不改前台服务；
2. 支持口袋长录：需新增 `microphone` 类型前台服务（含通知、权限、耗电与合规说明），并调整 `onStop`。

**B｜手机直连是否需要与中继一致的 300s 自设上限**
1. 【建议】补 300s 主动轮换 + 手机端用量记账，保持两端行为一致、成本可见；
2. 不补：允许单会话长连，接受成本不可见与两端行为差异（需确认腾讯侧实际限制后再定）。

---

## 附录：本次引用行号索引

| 文件 | 行号 | 内容 |
|---|---|---|
| `AsrClient.java` | 31, 40 | `CONNECTION_LOST_SECONDS=20`、`setConnectionLostTimeout` |
| `AsrClient.java` | 44-49 | `x-asr-token` 仅非空时注入 |
| `AsrClient.java` | 77-84 | `awaitOpen` = `connectBlocking(4s)` |
| `AsrClient.java` | 86-88, 94-96 | `isAlive()`、`finish()` |
| `TencentAsrClient.java` | 30-34, 67-75 | 构造（空 token）、6400 字节切片 |
| `TencentAsrClient.java` | 53-57 | `final=1` 收尾（先于 sentences） |
| `TencentAsrClient.java` | 77-80 | `finish()` 仅发 end |
| `TencentAsrClient.java` | 184-191 | `closeQuietly` |
| `AsrActivity.java` | 71-76 | `DEFAULT_URL` / `TRAVEL_ASR_URL` |
| `AsrActivity.java` | 136, 2524 | `sessionStartMs`（只赋值未读取） |
| `AsrActivity.java` | 182 | `FLAG_KEEP_SCREEN_ON` |
| `AsrActivity.java` | 2408-2415 | 无条件 `ws://` 校验 |
| `AsrActivity.java` | 2460-2464, 2467-2477 | direct 判定与本地签名 |
| `AsrActivity.java` | 2495-2497 | 整轮 latch |
| `AsrActivity.java` | 2500-2505, 2520-2522 | 跳过令牌、首连 4s 失败即整轮失败 |
| `AsrActivity.java` | 2542-2562 | 音频循环 + `reconnectTrack` 触发点 |
| `AsrActivity.java` | 2574-2604 | finally：finish → await 3s → close |
| `AsrActivity.java` | 2636-2678 | 重连 3 次 / 1-2-4s 退避 |
| `AsrActivity.java` | 2723-2739 | session ended → countDown |
| `AsrActivity.java` | 2781-2803 | `publishAsrToPage` |
| `AsrActivity.java` | 2882-2890 | `onStop` 停录 |
| `local/LocalServer.java` | 63, 113-124 | `sseClients`、`publishAsr` 无缓冲 |
| `local/LocalServer.java` | 194-197, 713-733 | `/api/asr/live`、300s 写死 |
| `asr-bridge/src/server.js` | 772-802 | `finalize` 下发 `session ended` |
| `asr-bridge/src/server.js` | 804-839 | `endSession` 等 final |
| `asr-bridge/src/server.js` | 853-868 | 300s 主动上限 |
| `asr-bridge/src/tencent-asr-client.js` | 298-322 | `end()` 10s 超时 |
| `asr-bridge/src/tencent-asr-client.js` | 417-421 | `final===1` 先 return |
| `socialmate-v1.2/index.html` | 1551-1560 | 页面 session 处理 |
| `socialmate-v1.2/index.html` | 1758, 1773-1790 | EventSource / 500ms 起退避重连 |
| `AndroidManifest.xml` | 16-19, 39-41 | 权限与仅 mediaPlayback 前台服务 |