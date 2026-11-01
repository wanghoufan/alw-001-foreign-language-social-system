# ALW-001 N03 SDD V1.1 · 验收表与交付说明

task_id: SM-ALW001-20261101-N03
执行日期: 2026-11-01
设备: Redmi Note 11 5G（21091116AC / Android 11 / serial `adb-WGBMXWDIAIFMPFCQ-1AcFJM._adb-tls-connect._tcp`）
最终 APK: `android-poc/app/build/outputs/apk/debug/app-debug.apk` · 0.6.0（versionCode 15）· SHA-256 `972eed42d9fe1722e9f47d63f0bd69a073878747560eb2392e3dae42d24861b1`

判定口径：PASS = 本轮真机或真实服务实际跑过并有证据；PARTIAL = 主路径已实现并有自动化/单测，但某一环（真机点击写真实数据、特定机型）未跑；NOT_RUN = 未执行，附原因。

---

## 0. Stage0 · 预构建 + 有线 ADB 预览

| 项 | 内容 |
|---|---|
| 脚本 | `docs/plan/ALW001-N03-SDD-V1.1/adb-preflight-preview.sh`（`ADB_SERIAL` 显式锁定 Note 11） |
| 日志 | `socialmate-v1.2/.local/qa/n03-sdd-v11-prebuild-20261101-211046.log` |
| 预构建 APK | 0.5.4（14）· SHA-256 `b5dda555f7c7428556331a9ba5b0b226445502e20c4205eef3e3c8ed18192aca` |
| 安装 | `adb -s … install -r` → `Success`（未 uninstall / 未 pm clear，`firstInstallTime` 保持 2026-10-31） |
| 截图 | `n03-sdd-v11-preview-20261101-211046.png` |
| 判定 | **PASS** |

## 1. P0 可靠性与授权

| 任务 | 资源/代码路径 | 证据 | 判定 |
|---|---|---|---|
| P0-01 留存默认未勾选、三同意独立 | `AsrActivity.java` `retentionConsent.setChecked(false)`、①②③ 分区 + `refreshRetentionHint()`；`SessionArchive.begin(false)` 后 `addFinal` 全部丢弃 | 真机 `n03-qa-consent-215827.png`；`uiautomator` 读取两个 CheckBox 均 `checked="false"`；文案「当前：不留存（默认）· 本轮 0 条写盘、0 条上传到 Mac」 | **PASS** |
| P0-02 断网补传 + 中文四态 | `SessionArchive.java`：`RETRY_DELAYS_MS = 3/10/30/60s`、单飞 `AtomicBoolean.compareAndSet`、`onNetworkAvailable()`；`AsrActivity.registerNetworkRecovery()` 注册 `NetworkCallback`；`describe()` 输出「手机已保存 / 待上传 N 条 / 已同步 Mac / 失败可重试」 | 失败侧：`n03-p002-retry-20261101-215154.png`「手机已保存 0 条 / 失败可重试 · 待上传 1 条」。成功侧：本轮用**临时归档实例（127.0.0.1:8782 + 临时令牌 + /tmp 目录）**，向 App 私有 outbox 放一条合成会话（`provider:mock`，无真人语音），重开 App 后 outbox 清空、文件进入 `exported/`，临时归档收到 `.md`+`.json` | **PASS** |
| P0-03 令牌不再长期存 localStorage | `archive-history.html` 改 `sessionStorage`（关闭即失效）+ 一次性清理旧 `localStorage` 残留；`source/V1.1-baseline.html` `uiToken()/storeToken()` 同样只用 sessionStorage | 真机 CDP：`{token:true(sessionStorage), lsToken:false(localStorage)}`；grep 无 `localStorage` 令牌写入 | **PASS**（方案为短期会话凭证，未引入原生令牌桥） |
| P0-04 权限/限流/注入自动化 | 新增 `server-routes.test.mjs`、`people-slug.test.mjs`、`person-detail.test.mjs`、`prep.test.mjs`、`favorites-store.test.mjs`、`archive-search.test.mjs` | 401 无令牌 / 401 错令牌 / 403 跨源 / 429 写入限流 / 400 路径注入与 `../` / 0600+0700 / 幂等。`cd socialmate-prototype/ai-gateway && node --test` → **124 pass / 0 fail** | **PASS** |

## 2. P1 人物资料与检索

| 任务 | 资源/代码路径 | 证据 | 判定 |
|---|---|---|---|
| P1-01 人物 Tab 统一正式源 | `source/V1.1-baseline.html` `people()/probePeople/renderRemotePerson`；`GET /v12/api/people`、`GET /v12/api/people/<slug>`（`person-detail.mjs`） | 真机人物页显示「私有在线 · 正式主档 · 已连接 Mac mini 人物主档 · 1 位」；详情抽屉列出已确认事实（带 Session 来源）/人工段落/上次联系/会话记录；`n03-qa-person-220210.png` | **PASS** |
| P1-02 slug 自动建议 + 确认后建人 | `people-store.suggestSlug()` / `createPersonFile()`；路由 `GET …/slug-suggest`、`POST /v12/api/people`（本轮补齐，`confirm:true` 必填）；前端 420ms 防抖建议 + 「高级：手动修改标识」 | 真机/接口：`Anna Lee→anna-lee`、`张三→person-20261101-d662`、重名给 `-2`；`POST` 单测覆盖未确认 400、`../escape` 400、成功 0600/0700、重复返回 `existing:true` | **PARTIAL**：真机上未实际点「确认新建」，避免在你的正式 `SocialMate-Data/People` 造人；服务端与界面链路均已测 |
| P1-03 历史按人/词/日期检索分页 | `archive-history.mjs searchSessions()`、`archive-receiver /api/archive/sessions`、`archive-history.html` 搜索/人物/日期/每页/加载更多 | 真机 `/v12/history`：令牌面板、「命中 2 个会话」、默认只显示日期/段数/归属、UTC 说明；`n03-qa-history-220614.png` | **PASS** |
| P1-04 已确认事实精准撤回 | `person-detail.revokePersonFact()` + `POST /v12/api/people/<slug>/facts/revoke`；前端二次确认弹层 | 单测：只删目标 `sm-src` 块、人工段落保留、重复撤回 `alreadyRemoved`、无法定位来源 409 `SOURCE_UNMAPPABLE`、备份+原子写 | **PARTIAL**：真机未点撤回（会改你的真实主档）；逻辑与 409/幂等均有自动化 |

## 3. P2 社交价值

| 任务 | 资源/代码路径 | 证据 | 判定 |
|---|---|---|---|
| P2-01 见面前准备（≤3 条，本地规则） | `person-detail.buildPrep()` + `GET …/prep`；人物详情「见面前准备」区 | 真机详情显示「最多 3 条 · 本地规则，不上云」+ 空态文案「还没有已确认的资料…」；0 次外部请求 | **PASS** |
| P2-02 一条接话 + 一条追问 | `coachPlan()/planNow()/suggCard()/showRecs()`；本轮追加手机端 `layoutCoach()`：窄屏把接话卡移到字幕正下方，`chatsetup` 折叠成一行 | 真机实测两张卡：`自然接话：That sounds great! …` / `继续追问：Do you prefer running by the sea or in a park?`，各自带 复制/朗读/☆收藏；未优化前卡在 y≈917（屏外），优化后 `[450,604]`、`[610,746]`（视口 705），`n03-qa-chatcards-v2-222128.png` | **PASS** |
| P2-03 收藏表达 | `favorites-store.mjs` + `GET/POST/DELETE /v12/api/favorites`；聊天卡「☆ 收藏」→「关于我 · 我的收藏表达」 | 真机收藏一句 → 关于我页出现该条（英文+中文释义+来源+日期）→ 取消收藏后列表回到空态；`n03-qa-favorites-220506.png` | **PASS** |

## 4. P3 体验收口

| 任务 | 资源/代码路径 | 证据 | 判定 |
|---|---|---|---|
| P3-01 五 Tab / 宽度 / 深浅 / edge-to-edge | `V1.1-baseline.html` 调色板 #F5F7F3/#0C7766/#1E3C54/#DDE5E7、safe-area、`@media` 断点、`#n03-mobile-compact`；原生 `applyInsets()/applyWebInsets()` | 真机 393dp：5 个 Tab `scrollWidth==innerWidth` 无横向溢出；深色 `bg #192D35 / fg #B4C6CA`（≈7:1）+ `n03-qa-dark-221038.png`；headless 360/390/412/430 由前端 QA 覆盖（32/32 不溢出） | **PASS**（软键盘遮挡 **NOT_RUN**：本机输入法 `mInputMethodWindowVisibleHeight=0`，键盘面板不绘制，构造不出遮挡） |
| P3-02 自适应图标 + 系统 SplashScreen | 源 `assets/socialmate-icon.svg`、`ic_launcher_foreground.xml`、`ic_launcher_monochrome.xml`、`ic_launcher.xml`、`splash-light/dark.svg` → 目标 `res/drawable/ic_socialmate_foreground.xml`、`res/drawable/ic_socialmate_monochrome.xml`、`res/values/colors.xml`、`res/mipmap-anydpi-v26/ic_launcher.xml`+`ic_launcher_round.xml`、`res/values-v31/styles.xml`（`windowSplashScreenBackground`/`AnimatedIcon`）+ Manifest `android:icon`/`roundIcon` | `aapt2 dump badging`：`application-icon-160:'res/mipmap-anydpi-v26/ic_launcher.xml'`；`aapt2 dump resources` 见 `(v31)`/`(night-v31)` 各含 `0x0101062c`/`0x0101062d`；真机应用信息页图标 `n03-appicon-20261101-215415.png`；SVG 导出 1024/512 PNG `.local/qa/icons/` | **PASS**（集成与 API 30 图标渲染）；Android 12+ 的启动画面实拍 **NOT_RUN**（本机 Android 11 无该 API） |
| P3-03 WebView 内 Markdown 安全导出 | `AsrActivity.SaveTextBridge`（`@JavascriptInterface` + `trustedPageUrl` origin 校验）+ `DownloadListener`（blob/data）+ `ACTION_CREATE_DOCUMENT`；前端 `download()` 优先调 `window.SocialMateAndroid.saveText` | 真机 CDP `typeof window.SocialMateAndroid.saveText === 'function'`；SAF 弹窗 `n03-saf-20261101-215057.png`、保存成功 `n03-saf-saved-20261101-215108.png`、`.md` 保留扩展名 `n03-saf-md-20261101-215256.png`；清单未申请 `WRITE_EXTERNAL_STORAGE` | **PASS** |
| P3-04 全量回归 | `verify-v040.sh`（本轮新增 2c 步：N03 新增 6 个测试文件） | `socialmate-v1.2/.local/qa/verify-20261101-222138.log`：**215 项 Node 全通过** + **12 项 Android 核心断言** + Gradle `BUILD SUCCESSFUL`；`verify-v040.sh` 末尾 `PASS`。另：`qa-people-e2e.mjs` **10/10**，`asr-bridge npm test` **40/40** | **PASS** |
| P3-05 文档与交接 | 本文件、`CHANGELOG.md`、`socialmate-v1.2/QA.md`、`docs/handoff/HANDOFF.md`、`android-poc/IMPLEMENTATION_STATUS.md`、`.workbuddy/memory/2026-11-01.md` | — | **PASS** |

---

## 5. 使用者怎么点（真机路径）

1. 桌面图标 **SocialMate**（新自适应图标）→ 首页「开始实时对话 →」。
2. 录音页自上而下：① 录音知情同意（每次都要勾）② **本轮原文留存（默认未勾，下面灰条写着「不留存（默认）· 0 条写盘」）** ③ 云端 AI 传文字在聊天页单独授权。「开始实时对话」才会开麦。
3. 「查看聊天与推荐」→ 聊天页：字幕在上，**两张卡紧跟其下**（自然接话 / 继续追问），每张有 复制 / 朗读 / ☆ 收藏；「会话设置」一行可展开换人物、连实时字幕、用示例句。
4. 停止录音后「本轮原文与复盘」→ 历史页（`/v12/history`）：首次粘一次归档令牌（本次会话有效），可按关键词/人物/日期搜、分页、点开才看原文、可导出 .md（会走系统文件选择器，不需要存储权限）。
5. 「人物」Tab：私有在线时直接读 Mac 主档，点开某人 → 见面前准备（≤3 条）+ 已确认事实（带来源）+ 人工段落；每条事实可「撤回这条」（二次确认）。
6. 「关于我」：我的收藏表达（复制/朗读/取消收藏）。

## 6. 仍需用户自己做的少量后置项

- 真人双人对话录音验收（本轮全部为合成/演示数据，未录你的真实语音）。
- 在 Android 12+ 机型上拍一张系统启动画面（本机 Android 11 无该 API）。
- 若要真正「新建人物」或「撤回某条事实」写进正式主档，请自己在界面确认执行；本轮只用临时目录/单测验证，未改动真实档案。
- iPhone / OPPO 无设备场景、腾讯云与 DeepSeek 真实付费链路的时延复测（预算账本未被重置：ASR 0.129189 / 1 元，DeepSeek 0.213634 / 1 元）。

## 7. 本轮踩到并已处理的问题

- 归档成功侧验证时，一次 App 私有配置改写未生效，导致一条**合成**会话被写进真实归档目录；已删除该 `.md/.json` 并按真实令牌恢复 App 配置，真实归档目录内容与操作前一致。
- 手机端接话卡原本排在整段对话下方（y≈917，屏外），已改为窄屏内联到字幕与输入框之间，并把会话设置折叠。
- 三处历史断言按新契约更新（字幕改为「只追加气泡」不整页重绘；新增受限原生桥；方法限制 405→401 的语义变化）。
