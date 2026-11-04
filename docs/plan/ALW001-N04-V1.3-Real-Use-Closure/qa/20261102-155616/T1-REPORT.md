# T1 验收报告｜原文真实性 + 原生/服务安全最小闭环

task_id: SM-ALW001-20261102-N04-V13 / T1
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
executed_at: 2026-11-02 15:56 – 16:15 (+08:00)
git_head: fc2379c（工作树含本任务改动，未 commit、未 push）
device: Redmi Note 11 5G `21091116AC` / Android 11 / serial `REDACTED-SERIAL`
apk: `app-debug.apk` versionName **0.7.8** / versionCode **33**
apk_sha256: `6bf55e3d64c40fb6eb9c9105483d24eaa4820f2b38b4d7c38d03e2f1baa94a62`
conclusion: **PASS（49/49 断言）**；3 条遗留 Human Gate 见文末

---

## 1. 结论摘要

| 验收项 | 结果 | 证据 |
|---|---|---|
| 逐字一致性 3/3（对 fixture `textOriginal` 逐字符） | PASS | `t1-report.json` → `exactness[]`（`charEqual:true`） |
| 伪造反例 ≥4（越界段/未知 session/错归属/重复/摘要冒充） | PASS，全部 4xx 且 People 零写入 | `t1-report.json` → `A2-*`，`demoPeopleSha`/`realPeopleSha` 前后一致 |
| 跨源 frame / 未知 origin 负例 2 条 | PASS，桥不可用 | `cdp-probe-app-normal.json`、`cdp-probe-load-failure.json` |
| APK 无旧长期令牌 | PASS | `t1-report.json` → `D-apk-strings-no-legacy-token`（`found:false`） |
| clear/restore/confirm 鉴权（同源+CSRF+写授权） | PASS | `t1-report.json` → `B-*`；真机 `device-write-auth.json` |
| 既有三项回归不回退 | PASS（30 / 32 / 39 断言） | `verify-*.log`，退出码均 0 |

verify-t1 汇总：`{"result":"PASS","checks":49,"passed":49,"failed":0}`，退出码 0。

---

## 2. 改动清单

### 2.1 原文真实性（T1-1）

- `socialmate-prototype/ai-gateway/demo-store.mjs`
  - 删除硬编码的 `REPLAY_FINALS` 句子；改为 `REPLAY_REFS`（只存 `sessionId + segmentIndex + section + candidateFact`）。
  - 新增 `fixtureIndex()` / `readExactFromFixture()`：按 `sessionId#segmentIndex` 从母版**唯一源**取 `textOriginal`；段越界 400、session 不存在 404。
  - `injectDemoFinal()`：显式文本必须与母版逐字相同（`SOURCE_TEXT_MISMATCH`），归属必须与母版一致（`SOURCE_OWNERSHIP_MISMATCH`）。
  - `confirmDemoPending()`：写档案前二次核验母版归属与 `sourceExactText`（`SOURCE_OWNERSHIP_MISMATCH` / `SOURCE_TEXT_TAMPERED`），失败 0 写入。
  - 每条候选带 `candidateFact`（摘要）、`sourceExactText`（原文）、`evidenceId`（`sessionId#segmentIndex`）三个独立字段。
  - 修 `buildDemoPrep` 排序：新事实插入档案顶部，同分钟内应按「索引升序 = 更新」，否则确认后专属问题不更新。

### 2.2 原生桥安全（T1-2）

- `android-poc/app/src/main/java/app/socialmate/dualmic/AsrActivity.java`
  - **删除第二个 `setWebViewClient`**（原实现把带 URL 白名单/桥撤销的 client 整个覆盖掉，是本次缺陷根因）。
  - 单一 `WebViewClient`：主框架白名单、子框架非私有 origin 取消、`shouldInterceptRequest` 对非私有 http(s) 子资源返回空响应、`onPageStarted`/`onReceivedError`/`onReceivedHttpError` 立即撤桥、`pageLoadFailed` 标记保证失败页永不挂桥。
  - 关闭 `setAllowFileAccessFromFileURLs`/`setAllowUniversalAccessFromFileURLs`/`setJavaScriptCanOpenWindowsAutomatically`/`setSupportMultipleWindows`；不注册 `WebChromeClient`（无 `onShowFileChooser`）。
  - 桥只在 `loadUrl` 之前挂载（WebView 的 Java 桥仅在文档创建时注入，事后 add 无效——实测）。
- `socialmate-prototype/ai-gateway/server.mjs`
  - `/v12` 响应新增 CSP：`frame-src 'none'; child-src 'none'; object-src 'none'` 等，跨源 iframe 在文档层就不存在。

### 2.3 令牌不进 APK（T1-3）

- `android-poc/app/build.gradle`：删除 `buildConfigField "String","ARCHIVE_TOKEN"`，版本 0.7.8 / vc33。
- 新增 `pairing.mjs`（服务端）：一次性 6 位配对码（5 分钟、单次、仅回环可取）→ `deviceId + deviceSecret`（服务端存 AES-256-GCM 封装副本，密钥由本机 tokenSecret 派生）→ `v1.<deviceId>.<iat>.<exp>.<mac>` 短期令牌（默认 24h，`SM_TOKEN_TTL_HOURS` 可调小，上限 24）→ 撤销。
- 新增 `DevicePairing.java` / `SecureStore.java`（Android Keystore AES-GCM），设备密钥不出 Keystore；未配对/过期/撤销时返回空令牌，`SessionArchive` fail closed。
- `archive-receiver.mjs`：接受 `v1.*` 短期令牌（`verifyToken`），旧静态令牌仅为既有本机脚本保留。
- `SessionArchive.java`：新增 `TokenProvider`，令牌来源 = 手填 > 配对短期令牌 > 空（空则不上传）。

### 2.4 写操作鉴权（T1-4）

- 新增 `demo-write-guard.mjs`：一次性写授权票（HMAC、TTL 120s、单次使用）。
- `server.mjs`：`GET /v12/api/demo/write-ticket` 发票；`final / pending / clear / restore / archive push / 档案编辑` 一律要求 `同源 Origin + x-sm-write 票`，`confirm:true` 仅作意图声明；读演示仍免令牌。
- `socialmate-v1.2/index.html`：`demoApi` 对非 GET 自动取票；未配对时人物页提示改为「未配对：用一次性配对码」(原「未连接」)。

### 2.5 验收脚本

- 新增 `docs/plan/ALW001-N04-V1.3-Real-Use-Closure/verify-t1.mjs`（49 断言，输出 JSON）。
- 新增 `tools/bridge-negative/{serve.mjs, cdp-probe.mjs, write-auth-probe.mjs, run-on-device.sh}`。
- 三个既有验收脚本补「同源 Origin + 写授权票」并改用母版原文（不改断言强度，见 §5）。

---

## 3. 每条验收的真实命令与退出码

| # | 命令 | 退出码 | 结论 |
|---|---|---|---|
| 1 | `node docs/plan/ALW001-N04-V1.3-Real-Use-Closure/verify-t1.mjs --base http://127.0.0.1:8791 --apk android-poc/app/build/outputs/apk/debug/app-debug.apk --bridge-normal qa/<stamp>/cdp-probe-app-normal.json --bridge-failure qa/<stamp>/cdp-probe-load-failure.json --json qa/<stamp>/t1-report.json` | **0** | 49/49 PASS |
| 2 | `node docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-demo-integration.mjs` | **0** | 30 断言 PASS |
| 3 | `node docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-pending-facts.mjs` | **0** | 32 断言 PASS |
| 4 | `node docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-persona-profile.mjs` | **0** | 39 断言 PASS |
| 5 | `node tools/bridge-negative/cdp-probe.mjs --serial REDACTED-SERIAL`（正常场景） | **0** | 私有页桥可用；跨源 frame 无 JS 上下文；外链被取消 |
| 6 | 同上（`ui_url=http://127.0.0.1:18799` 不可达场景） | **0** | 错误页上 `saveText/openRecordingPanel` 均为 `undefined`（桥失效） |
| 7 | `node tools/bridge-negative/write-auth-probe.mjs`（真机 WebView） | **0** | 带票 404 `PENDING_NOT_FOUND`（正常可用）；无票 403 `WRITE_TICKET_REQUIRED` |
| 8 | `gradle assembleDebug`（Gradle 8.11.1 + JDK17 + SDK35，`--offline`） | **0** | 0.7.8 / vc33 |
| 9 | `adb -s REDACTED-SERIAL install -r app-debug.apk` | **0** | Success，`firstInstallTime` 未变（保留数据） |
| 10 | `adb shell dumpsys package app.socialmate.dualmic` | **0** | versionCode=33 / versionName=0.7.8（见 `device-version.txt`） |
| 11 | `bash socialmate-v1.2/service-v040.sh restart` | **0** | 8790/8791 恢复，ASR `mock:false`，预算 0.213634/1 元未变 |

运行服务时的私有路径：8791 只监听 `127.0.0.1`；未新增公网入口、未改腾讯 ASR/DeepSeek 各 1 元预算、未动 8781/8782。

---

## 4. 关键证据节选

### 4.1 逐字一致性（3/3）

| slug | sessionId | 段 | 母版 `textOriginal` | 逐字符 |
|---|---|---|---|---|
| demo-oliver-uk | sess_n04_demo_oliver_uk_3 | 1 | `I keep the runs easy after heavy lifting days.` | 相同 |
| demo-maya-us | sess_n04_demo_maya_us_3 | 5 | `Maybe food first, then some live music.` | 相同 |
| demo-jieun-kr | sess_n04_demo_jieun_kr_3 | 3 | `The shadows on the walls.` | 相同 |

旧的三句（如 `Oliver keeps his runs easy on the days after heavy lifting.`）现在作为 `candidateFact` 摘要保留，**提交为原文会被 400 `SOURCE_TEXT_MISMATCH` 拒绝**（`A1-stale-paraphrase-rejected-*`）。

### 4.2 伪造反例（4xx + 零写入）

| 反例 | 结果 |
|---|---|
| 段号 99（只有 6 段） | 400 `SOURCE_SEGMENT_OUT_OF_RANGE` |
| `sess_forged_9999` | 404 `SOURCE_SESSION_UNKNOWN` |
| Oliver 的段写进 Maya | 400 `SOURCE_OWNERSHIP_MISMATCH` |
| 未归属候选按 Oliver 确认（实为 Maya 的段） | 403 `SOURCE_OWNERSHIP_MISMATCH` |
| 重复最终事件 | 200 但 `added:false / duplicate:true`（幂等） |

`SocialMate-Data/People` 与 `SocialMate-Data/Demo/People` 的 sha256 在整组负例前后完全一致（见 `t1-report.json`）。

### 4.3 原生桥真机取证（CDP，App 自身 WebView）

正常场景（`cdp-probe-app-normal.json`）：
- `01-current-url = http://127.0.0.1:8791/v12`
- `02` → `{"hasBridge":true,"saveText":"function","openRecordingPanel":"function"}`（正常功能保留）
- `04a` 执行上下文只有 `http://127.0.0.1:8791` 与一个 `://`（CSP 拦截后的空白错误帧）→ **18793 没有任何 JS 上下文**
- `04b` 帧树子帧为 `chrome-error://chromewebdata/`，`securityOrigin=://`
- `05` 顶层跳转 `18793/evil.html` 被取消，`href` 仍为私有地址

加载失败场景（`cdp-probe-load-failure.json`）：错误页上 `SocialMateAndroid.saveText/openRecordingPanel` 均为 `undefined`（logcat：`onPageFinished … failed=true` → `detached`）。

> 说明：`window.SocialMateAndroid` 这个空对象在撤桥后可能仍存在，但已无可调用方法——判定标准是「方法不可调用」，报告中不声称对象消失。

### 4.4 APK 静态扫描

```
TOK=$(cat socialmate-v1.2/.local/archive-token)        # 48 字符，未打印
unzip -p app-debug.apk 'classes*.dex' | strings -a | grep -c "$TOK"   → 0
```
`build.gradle` 无 `ARCHIVE_TOKEN` buildConfigField；Java 源码无 `BuildConfig.ARCHIVE_TOKEN`。

### 4.5 写鉴权（真机）

`device-write-auth.json`：`{"withTicket":{"status":404,"code":"PENDING_NOT_FOUND"},"withoutTicket":{"status":403,"code":"WRITE_TICKET_REQUIRED"}}`
→ 同源 POST 携带合法票可正常进入业务逻辑；只带 `confirm:true` 被拒。

---

## 5. 对既有验收脚本的改动（透明记录）

三个脚本的断言强度未降低，改动原因都是「旧写法依赖了本次被修掉的缺陷」：

1. `verify-demo-integration.mjs` / `verify-pending-facts.mjs`：POST 现在需要同源 Origin + 一次性写票，脚本补 `writeTicket()`；票每次现取，不绕过限流（仍按 `retryAfterMs` 等待）。
2. `verify-pending-facts.mjs`：注入文本改为从 fixture 读 `textOriginal`（原来写的是改写句，正是 T1 要禁的行为）；未归属用例改用母版真实段而不是伪造 `sessionId`。
3. `verify-pending-facts.mjs` 两处过时期望值校正：
   - `baseline-facts-2` → `baseline-facts-5`（当前种入 = 3 条人设字段 + 2 条对话事实；旧值早于「人设字段入档」）。
   - `B-profile-written` 改为断言档案含本次返回的 `factId` 标记（比「包含某句文本」更强，且不受中英翻译影响）。
4. `verify-persona-profile.mjs`：POST 补票与 Origin；原有的跨源 403 负例保留且仍带有效票（证明拒绝原因是 Origin 而非缺票）。

---

## 6. 未完成 / 需要你本人授权（Human Gate）

1. **旧长期令牌轮换（不可逆）**：目前 `.local/archive-token` 仍是 8781 的静态校验密钥，也仍被本机脚本使用。撤销它需要同时改 `archive-service.sh` 的 `SM_ARCHIVE_TOKEN`、本机脚本与配对签名密钥（`tokenSecret()` 目前就取这份文件），属于会影响现网 8781 的不可逆操作 → **等你在 8781 可重启的窗口内确认后执行**。
2. **8781 归档接收端未重启**：新代码已支持 `v1.*` 短期令牌，但按红线不重启 8791 以外的进程；下一次 `archive-service.sh restart` 后才会生效（旧静态令牌行为不变，不影响当前使用）。
3. **手机首次配对未做**：配对需要你在 Mac 上取一次性码（`GET /v12/api/pair/code` 仅回环可见），再在手机「录音与留存设置 → 配对这台手机」输入一次。当前设备处于未配对状态 → 上传/写档案 fail closed（人物页提示「未配对」）。
4. **NOT_RUN**：真人双人说话人分离、BOYA 硬件、Tailscale 无 USB 外出使用、macOS 自启动 —— 属 T2–T5，本轮未涉及。
5. 未 commit、未 push、未发布（本任务禁止）。

---

## 7. 回滚方式

- 代码：`git checkout -- android-poc socialmate-prototype socialmate-v1.2/index.html docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0`（会同时丢弃本任务改动；如需保留，按文件粒度回滚）。
- 设备：`adb -s REDACTED-SERIAL install -r <上次 0.7.7 APK>`；`dumpsys package` 的 `firstInstallTime` 显示数据未被清除。
- 演示数据：`POST /v12/api/demo/restore {"confirm":true}`（需同源 + 写票），母版 `fixtures/demo-personas.json` 只读未被修改。

---

## 8. 目录说明

`qa/20261102-155616/superseded-approach/` 是最早一次「把 ui_url 指向替身页」的取证尝试，结论被 CDP 真机取证取代（其中一次实际连到了 MIUI 浏览器的 WebView，`inFrame:false` 即为该假象）。保留但**不作为结论依据**。
