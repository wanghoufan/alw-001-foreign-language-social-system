# V1.6 三大活资料库 · 独立 QA 验收报告

- 验收日期：2026-11-05
- 角色：独立 QA（只读验收，不修改源码/配置/文档，不做 git 写操作）
- 设备：Redmi Note 11 5G（21091116AC），serial `WGBMXWDIAIFMPFCQ`，393×791
- 运行环境：组合服务 `127.0.0.1:8791`（进程 96670，未重启）；真机页面 `http://192.168.31.61:8791/v12`
- 被测对象：`/v12/api/cards*`、`socialmate-prototype/ai-gateway/private-cards.mjs`、`socialmate-v1.2/index.html` 卡片模块
- 本次唯一写出的文件：本报告

## 结论概览

| 等级 | 条数 | 说明 |
|---|---|---|
| P0 | 0 | 未发现鉴权绕过、路径穿越、密钥泄漏或服务不可用 |
| P1 | 4 | 数据覆盖丢失、限流修复不彻底、2 项测试有效性/覆盖缺口 |
| P2 | 8 | 契约、体验与报告一致性问题 |

**假通过迹象：有（见第六节）**。146 个单测全绿，但 `/v12/api/cards*` 的 HTTP 层零测试；`window.__errs == []` 不是有效证据。

---

## 一、P1（需修复后再交付）

### P1-1｜同 id 卡片恢复会静默覆盖新建卡（数据丢失）

- **问题**：卡片软删后，`create` 只检查在用目录、不检查回收站；此时可新建同 id 卡片。之后点「恢复」，回收站记录直接原子写回同 id 文件，**新建卡内容被永久覆盖**，回收站记录同时删除。
- **证据**（临时目录独立实例，不碰真实数据）：

  ```
  $ cd socialmate-prototype/ai-gateway && node --input-type=module <<'EOF'
    ... createPrivateCards({root: mktemp}) → create "dup" → softDelete → create "dup" → restore ...
  EOF
  回收站中同 id 时再次 create： dup revision 1 内容 新内容
  restore 后 live: {"title":"原卡","cn":"原内容","en":"orig","revision":3}
  新建卡内容是否被覆盖: true
  trash 是否还在: false
  ```

  代码位置：`private-cards.mjs:221-238`（create 仅 `readJson(fileOf(kind,id))`）、`private-cards.mjs:269-280`（restore 无条件 `atomicWrite` 覆盖）。
- **影响**：用户删除一张卡 → 用同标题再建一张（slug 相同）→ 去回收站恢复旧卡，新卡内容无声消失；与 ACCEPTANCE `CRUD-01/CRUD-03`「旧数据不覆盖」「没有静默永久删除」冲突。
- **修复建议**：`restore` 前检查在用目录：已存在同 id 则返回 `409 CARD_EXISTS`（或恢复为新 id）；`create` 时同时检查回收站同 id，给出「回收站已有同名卡，是否恢复或另建」提示。

### P1-2｜媒体上传“已修复的 429”仍会拒绝第二张（间隔 <200ms）

- **问题**：FINAL-REPORT 称「媒体上传被 429 → 改独立限流桶」已修复，但独立桶仍保留 `minGapMs:200`，连续上传第二张依旧 429。
- **证据**（临时端口独立实例，真实 HTTP）：

  ```
  create: 200
  media#1: 200 {"ok":true,"media":{"id":"m389a95f0c9b87513",...}}
  media#2 立即: 429 {"ok":false,"code":"RATE_LIMITED","error":"操作过于频繁，请稍后再试","retryAfterMs":196}
  media#3 隔250ms: 200 {"ok":true,...}
  ```

  代码位置：`server.mjs:281`（`createRateLimiter({windowMs:60000,max:30,minGapMs:200})`）；对照 `FINAL-REPORT.md:44`。
- **影响**：一次选多张图时，小图或局域网快往返会让第 2 张起被拒；前端 `smCardUploadPending` 仅把提示写进 `#smCardMediaMsg`，保存流程继续并关闭弹窗，用户很可能以为图片都已上传（`index.html:4084-4129`）。与 ACCEPTANCE `IMG-01`「失败不残留异常数据」不符。
- **修复建议**：媒体桶去掉 `minGapMs`（只保留总量/窗口限制），或按“一次保存最多 12 张”的批量子限额放行；前端汇总显示「成功 N 张 / 失败 M 张」，有失败时阻止关闭弹窗。

### P1-3｜FINAL-REPORT 的「冷启动无 JS 错误」证据无效（`__errs` 恒为空）

- **问题**：报告以 `window.__errs == []` 作为 PASS 证据，但仓库源码中不存在 `__errs` 的定义与 `push`；运行时该数组虽存在，却没有任何写入点，因此它永远是 `[]`，无法证明“无未捕获错误”。
- **证据**：

  ```
  $ grep -rn "__errs" . --exclude-dir=node_modules --exclude-dir=.git
  ./docs/plan/.../FINAL-REPORT.md:24
  ./docs/plan/.../FINAL-REPORT.md:53
  $ grep -c "errs" socialmate-v1.2/index.html
  0
  $ node scripts/sm-cdp.mjs "JSON.stringify({undef:window.__errs===undefined,len:Array.isArray(window.__errs)?window.__errs.length:'not-array'})"
  {"undef":false,"len":0}
  ```

  报告位置：`FINAL-REPORT.md:24`。
- **影响**：错误证据不成立，可能是“恒真断言”；真机若出现未捕获异常也会显示 PASS。
- **修复建议**：把 `__errs` 改为真实采集（`window.addEventListener('error')` + `unhandledrejection`，并在页面初始化时显式创建），或验收时改用 CDP `Runtime.exceptionThrown` / `Log.entryAdded`（本次用该方式实测：0 条异常，仅 favicon 404）。

### P1-4｜卡片 HTTP 路由零自动化测试，报告用 store 单测背书

- **问题**：`node --test *.test.mjs` 146 条全绿，但没有任何一条覆盖 `/v12/api/cards*` 路由；卡片测试只覆盖 `private-cards.mjs` 存储层。
- **证据**：

  ```
  $ cd socialmate-prototype/ai-gateway && node --test *.test.mjs
  ℹ tests 146 / pass 146 / fail 0 / skipped 0 / todo 0
  $ grep -c "api/cards" *.test.mjs | grep -v ":0"
  （无输出）
  $ grep -n "^test(" server-routes.test.mjs
  96,116,129,149,170,187,219,250,271,318,325  （无 cards）
  ```

  对照 `FINAL-REPORT.md:14`「旧 revision 写入被 409 拒绝（单测 + 服务端返回）」。
- **影响**：鉴权 401/403、写票、400/404、revision 冲突这些新路由行为只能靠人工；本次已手工复现全部负例（见第三节），但回归无护栏。
- **修复建议**：在 `server-routes.test.mjs` 增加卡片路由用例（无 token 401 / 无写票 403 / 非法 kind、id 400 / 不存在 404 / 无 confirm 400 / 旧 revision 409 / 软删恢复），沿用现有假 archive + 临时目录模式。

---

## 二、P2（建议排期修复）

### P2-1｜PATCH 缺少 revision 时被接受，服务端“必须带 revision”契约不成立

- **证据**：临时实例 `G3b PATCH 不带 revision => 200 {"ok":true,"card":{...,"revision":3}}`；`server.mjs:942-943`、`private-cards.mjs:247` 均为 `if (revision != null && ...)`。前端 `index.html:4059` 在缓存未命中时会传 `revision: undefined`。
- **影响**：并发编辑时可能静默覆盖，而不是返回 409。
- **修复建议**：PATCH 强制要求 `revision`，缺失返回 `400 REVISION_REQUIRED`；前端缓存缺失时先 force load 再编辑。

### P2-2｜写票在校验失败（400/404/409）时即被消费

- **证据**：临时实例中 `E1 POST 非法 kind => 400`，紧接着用同一张票的请求返回 `403 WRITE_TICKET_REPLAYED`；`server.mjs:318-332` 的 `requireWriteAuth` 先 `writeGuard.consume`（`:325`），参数校验在其后才执行。
- **影响**：用户因参数错误失败后直接重试会得到 403；前端每次写重新取票（`index.html:2705-2714`），因此只是多一次失败提示，不致命。
- **修复建议**：参数校验前置；或 consume 失败时返还票据（按 nonce 释放）。

### P2-3｜编辑地点卡会把 category/cat 覆盖成“城市/分类”输入值

- **证据**：`index.html:4038-4046` 的 `smCardPayload` 将 `city`、`category`、`cat` 全部取 `#smcCategory`；表单只展示 `c.city`。原卡若有独立 `category`（如「公园」），保存后被 city 值覆盖。
- **影响**：地点分类信息丢失，筛选结果错乱。
- **修复建议**：place 表单拆成“城市”“分类”两个字段并分别回填；或仅在城市字段变化时更新 city，保留原 category/cat。

### P2-4｜卡片加载失败静默且不再重试

- **证据**：`index.html:3959-3961` 的 `catch(e){ SMC.loaded[kind]=true }`，随后 `smCardsLoad` 命中 `loaded` 直接返回空数组。
- **影响**：归档服务短暂 503 或首屏网络抖动时，卡片列表静默变空，且本次会话不再自动恢复（除非手动 force/刷新）；无缓存兜底与错误提示。
- **修复建议**：失败时不置 `loaded=true`（或置错误标记并允许下次重试）；给出「读取失败，点击重试」；可复用私有地点的 `localStorage` 缓存模式。

### P2-5｜部分错误口径与设计不一致

- **证据**：`GET /v12/api/cards/place/QA-UPPER` → `404 {"code":"NOT_FOUND"}`（非法 id 未走 `ID_INVALID` 400，只是不匹配路由正则）；`DELETE .../media`（无 mediaId）→ `405 METHOD_NOT_ALLOWED`（非 400）。
- **影响**：客户端难以区分“路径写错”与“卡片不存在”；错误码不利于排查。
- **修复建议**：路由正则放宽到通用段，再在 handler 内调用 `assertId`/`assertKind` 返回 400；缺 mediaId 返回 400。

### P2-6｜sticky 操作条覆盖“状态 / 说明”字段

- **证据**：`analyzeImage` 复核 `docs/plan/.../qa/13-card-form-fixed.png`：三个按钮（取消/保存/AI 生成英文草稿）均可见，但「状态 / 视角」标签在按钮下方仅部分可见，被 sticky 操作条压住；`index.html:4020` 为 `position:sticky;bottom:0` 的操作条，`:4019` 是紧随其后的「状态 / 说明」字段。
- **影响**：编辑软件作品卡时，状态字段需滚动才能看到，容易被忽略。
- **修复建议**：操作条改为固定 footer + 内容区预留 `padding-bottom`，或把状态字段移到按钮上方。

### P2-7｜favicon 缺失导致控制台 error

- **证据**：CDP `Log.entryAdded` 采集到 `Failed to load resource: 404 (Not Found) http://192.168.31.61:8791/favicon.ico`；其余 0 异常。
- **影响**：控制台噪音，掩盖真实错误；不影响功能。
- **修复建议**：提供 32×32 favicon 或在页面 `<head>` 声明空 data-URI 图标。

### P2-8｜报告状态与真实数据不一致

- **证据**：`ls -la SocialMate-Data/PrivateCards`：`apps/` 为空，`trash/app/v1-6.json`（1049B）存在；`stories/c-2585f970.json`（579B）；`media/v1-6/` 两张 1788B/1816B；权限均为 0600/0700。`FINAL-REPORT.md:13` 仍写 `apps/v1-6.json` 落盘 PASS，未注明该卡已进回收站。
- **影响**：读者无法判断当前是否有可用 app 卡；也说明报告是“当时状态”，不是“当前状态”。
- **修复建议**：报告补“截至 2026-11-05 22:06 的当前数据状态”，或验收后重新截图核对。

---

## 三、本次实际执行的命令清单

> 全部只读；写操作仅发生在 `mktemp` 临时目录与真机 QA 临时卡（已清理，见第五节）。

1. `ls -la`、`ls docs`、`ls socialmate-prototype`、`ls -la socialmate-prototype/ai-gateway`
2. `cat socialmate-v1.2/service-all.sh | head -60`、`ls socialmate-v1.2`
3. `adb devices -l`、`adb -s WGBMXWDIAIFMPFCQ shell echo ok`
4. `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8791/v12` → 200；`lsof -nP -iTCP:8790 -iTCP:8791 -iTCP:8781 -iTCP:8782 -sTCP:LISTEN`
5. `node --check socialmate-prototype/ai-gateway/{server.mjs,private-cards.mjs,private-cards.test.mjs,demo-write-guard.mjs}`、`node --check scripts/sm-cdp.mjs` → 全部 OK
6. `curl -s -D- -o /dev/null -H "Accept-Encoding: gzip" http://127.0.0.1:8791/v12`
   → 200，`Cache-Control: no-cache`、`ETag: "e2d98a6490a93b96"`、`Content-Encoding: gzip`、`Vary: Accept-Encoding`
7. `curl ... -H 'If-None-Match: "e2d98a6490a93b96"'` → `304 Not Modified`
8. `cd socialmate-prototype/ai-gateway && node --test *.test.mjs` → `tests 146 / pass 146 / fail 0 / skipped 0 / todo 0`
9. 独立实例（`node --input-type=module` + `createHandler({port, archive: fakeArchive, privateCardsRoot: mktemp})`）：
   - `A1 GET cards 无 token` → 401 `TOKEN_REQUIRED`
   - `A2 错误 token` → 401 `UNAUTHORIZED`
   - `A3 正确 token` → 200
   - `B1 非法 kind` → 400 `KIND_INVALID`；`B2 空 kind` → 400
   - `C1 不存在 id` → 404 `CARD_NOT_FOUND`
   - `D1 有 token 无写票` → 403 `WRITE_TICKET_REQUIRED`；`D2 无 Origin` → 403 `ORIGIN_REQUIRED`
   - `E1 非法 kind` → 400；`E2 非法 id` → 400 `ID_INVALID`
   - `F1 DELETE 无 confirm` → 400 `CONFIRM_REQUIRED`；`F2 confirm=1 不存在` → 404
   - `G1 新建` → 200 revision 1；`G2 PATCH rev=1` → 200 revision 2；`G3 旧 rev` → 409 `REVISION_CONFLICT currentRevision=2`
   - `G3b PATCH 不带 revision` → 200 revision 3（见 P2-1）
   - `G5 DELETE confirm=1` → 200；`G6 includeDeleted=1` → count 1；`G7 restore` → 200 revision 5；`G8 列表` → count 1
   - `H1 覆盖层 PUT /place/12/override` → 200；`H2 DELETE override` → 200
10. 媒体限流独立实例：`create 200` / `media#1 200` / `media#2 立即 429 retryAfterMs=196` / `media#3 隔250ms 200`
11. 同 id 恢复独立实例：覆盖结论见 P1-1
12. `adb -s WGBMXWDIAIFMPFCQ forward tcp:9223 localabstract:webview_devtools_remote_18450`；`curl http://127.0.0.1:9223/json/list`
13. `node scripts/sm-cdp.mjs`（只读探测 + 真机 CRUD）：
    - 基础：`{"title":"SocialMate · 外语社交助手","ready":"complete","bridge":true,"android":true,"errs":[]}`
    - 卡片加载：`{"place":[],"story":["c-2585f970"],"app":[]}`
    - 新建清零：`{"heading":"新建关于我","title":"","cn":"","tags":""}`（编辑态为「红城湖散步」）
    - 新建保存：`{"saved":"已保存","smcCount":2,"apiCount":2,"domArticles":7,"countText":"7 项","dupIds":[]}`
    - 编辑保存：`{"msg":"已保存","revision":2,"cn":"QA 编辑后的中文内容","smcCount":2,"apiCount":2,"domArticles":7}`
    - 删除：`{"smcCount":1,"apiCount":1,"apiAllCount":2,"domArticles":6,"countText":"6 项"}`
    - 回收站：`{"trashText":"回收站 · 关于我\nQA-V1.6-验收临时卡 ... 恢复"}`
    - 恢复：`{"restored":true,"revision":4,"smcCount":2,"domArticles":7,"countText":"7 项"}`
    - 清理后：`{"smcCount":1,"countText":"6 项","errs":[],"privatePlacesOK":true,"privatePlacesCount":1,"redLake":true,"bridge":true}`
    - 海南回归：`{"title":"海南","count":"显示 116 / 116","red":true,"articles":116}`
14. CDP `Runtime.enable` + `Log.enable` 采集（自建 WebSocket）：`exceptions: []`，`logs: [{"level":"error","text":"... 404 ... favicon.ico"}]`
15. 私有数据回归：`public-share.html`/`public-share.js`/`public-places.js` 中 `红城湖` 命中 0；`GET /v12/api/cards?kind=story` 无 token → 401；`GET /v12/media/v1-6/...jpg` 无 token → 401
16. `ls -la SocialMate-Data/PrivateCards` 及其子目录（只读，核对权限 0600/0700 与文件大小）
17. 测试有效性核查：`grep -n "\.skip|\.todo|\.only" *.test.mjs`（无测试跳过）、`grep -c "api/cards" *.test.mjs`（0）、`grep -rn "__errs"`（仅 FINAL-REPORT 命中）
18. `analyzeImage` 复核 `13-card-form-fixed.png`

---

## 四、真机操作结果（新建 → 编辑 → 删除 → 恢复）

| 步骤 | DOM / 接口结果 | 判断 |
|---|---|---|
| 新建前基线 | 关于我列表 6 项；私有 story 卡 1 张（`c-2585f970`） | — |
| 新建（表单） | 标题/中文/标签均为空，分类默认「生活」；编辑旧卡后关闭再新建，字段不残留 | 新字段已清零 ✅ |
| 保存新建 | DOM 7 项、`apiCount=2`、`smcCount=2`、`dupIds=[]` | 无计数翻倍 ✅ |
| 编辑 | `revision` 1→2，内容更新；DOM 仍 7 项、`apiCount=2` | 无重复卡 ✅ |
| 删除 | DOM 6 项、`apiCount=1`、`includeDeleted=1` 为 2；抽屉二次确认生效 | 进回收站 ✅ |
| 恢复 | `restored=true`、`revision=4`、DOM 回 7 项 | 恢复正确 ✅ |
| 清理 | QA 卡再次删除，DOM 回 6 项；`trash/story/qa-v1-6.json` 保留在回收站 | 已清理 ✅ |
| 乐观更新 | 代码路径均为「等接口返回 → force reload → render」，实测未出现先加后删/重复渲染 | 未发现 ✅ |

---

## 五、未能验证的项及原因

| 项 | 原因 |
|---|---|
| AI 英文草稿 `/api/ai/draft-en` | 真实计费接口，本次未获调用授权；只读验收不发起付费请求 |
| 真实相册选图 / 相机拍照 / 上传到真实卡片 | 验收要求明确禁止上传图片到真实卡片；相机能力 FINAL-REPORT 自认未接入 |
| 停 8791 后的真实断网离线缓存 | 禁止重启/停止组合服务（用户正在使用） |
| 系统选择器（PickerActivity / ChooserActivity） | 需要人工在手机上点击系统 UI，CDP 无法代劳且本次未获授权 |
| 393×852 视口、深色模式表单 | 未切换视口/主题，避免改动用户手机设置 |
| 备份 / 恢复（导出导入，DATA-01） | 功能未实现（FINAL-REPORT 第三节已承认） |
| 聊天页「加入聊天参考 / 中文分享」完整联动 | 只验证了按钮与检索命中，未走一次完整录音+点击流程 |
| `source('story',id)` 返回英文 | 该条 CDP 调用被拒绝权限；`byId` 命中已验证 |
| 全量视觉审查 | 只抽查 `13-card-form-fixed.png`；图片模型仅描述可见内容，未做像素级比对 |
| 卡片媒体渲染（真机显示图片） | media 读取需 token，真机当前无卡片媒体；未上传 |

---

## 六、FINAL-REPORT 逐条复核与“假通过”评估

| FINAL-REPORT 条目（行号） | 本次结果 | 说明 |
|---|---|---|
| `:12` 页面加载与缓存 | **可复现 ✅** | 200 + gzip + ETag；If-None-Match 304 |
| `:13` 新建软件作品卡落盘 | **当前不可复现 ⚠️** | `apps/` 为空，文件在 `trash/app/v1-6.json`；当时成立，当前状态已变 |
| `:14` 编辑与版本冲突 | **部分可复现 ✅** | store 单测 409 + 临时实例 HTTP 409 均成立；但路由无自动化测试（P1-4） |
| `:15` 删除进回收站 | **可复现 ✅** | 真机 7→6，`trash/` 出现 |
| `:16` 回收站恢复 | **可复现 ✅** | 真机回到 7，revision 3→4 |
| `:17` 新建关于我卡/双语同屏 | **可复现 ✅** | `c-2585f970` 存在；列表文本中英双显 |
| `:18` 按 id 检索 | **部分可复现 ✅** | `byId` 命中；`source()` 未验证（权限拒绝） |
| `:19` AI 英文草稿 | **未验证** | 真实计费未调用 |
| `:20` 图片压缩与上传链路 | **未验证 + 风险 ⚠️** | 媒体桶 200ms 仍拒第二张（P1-2）；真实卡片未上传 |
| `:21` 系统选择器弹出 | **未验证** | 需人工点击 |
| `:22` 真实断网离线缓存 | **未验证** | 禁止停服务 |
| `:23` 视觉审查 | **部分复核 ⚠️** | 抽查 13：三按钮可见，但状态字段被 sticky 条压住（P2-6） |
| `:24` 冷启动无 JS 错误 | **证据无效 ❌** | `__errs` 无定义/无 push 可查（P1-3）；本次改用 CDP 实测 0 异常 |

**假通过迹象（明确存在）**

1. `window.__errs == []` 是恒空断言，却被当作“无 JS 错误”的 PASS 证据（P1-3）。
2. 146 个测试全绿，但新接口 `/v12/api/cards*` 零 HTTP 测试，报告却用“单测”背书服务端行为（P1-4）。
3. 报告称媒体 429「已修复」，实际仍会拒绝 200ms 内的第二张图（P1-2）。
4. `apps/v1-6.json` 已进回收站，报告仍按当前时态写 PASS（P2-8）。

**未发现假通过的部分**：`private-cards.test.mjs` 的 7 条用例有真实断言（revision、冲突、文件权限 0600/0700、媒体真实落盘大小、路径穿越拒绝），不是只查状态位；`node --test` 无 `skip/todo/only`，无 `console.log` 冒充断言。

---

## 七、验收安全结论

- 鉴权：无 token 401、错误 token 401、有 token 无写票 403、跨源/无 Origin 403，全部符合预期。
- 参数：非法 kind 400、非法 id 400（POST）、不存在 id 404、删除无 confirm 400。
- 私有性：公开静态产物中 `红城湖` 命中 0；`/v12/api/cards` 与 `/v12/media/*` 无 token 均 401。
- 存储：真实目录 0700、文件 0600；`media/v1-6` 两张 1788B/1816B，与报告「1.8KB」一致。
- 本次未发现 P0；组合服务未重启，8791 一直可用。

---

## 八、清理与残留

- 真机新建的 QA 卡 `qa-v1-6`（「QA-V1.6-验收临时卡」）已完成删除→恢复→再删除，列表回到 6 项。
- 残留：`SocialMate-Data/PrivateCards/trash/story/qa-v1-6.json`（569B，回收站）；如需彻底清除，请开发者在后续维护中处理，本次未做硬删除。
- 未向真实卡片上传任何图片；`media/v1-6/` 为之前已有文件，未改动。
- 临时目录实例均已 `fs.rm`；`adb forward` 保留在 9223（可用于后续取证，不影响业务）。

## 九、建议修复顺序

1. P1-1 恢复覆盖（数据丢失，改动小、收益最大）
2. P1-2 媒体限流（直接影响多图上传体验）
3. P1-4 补 `/v12/api/cards` HTTP 路由测试（防止回归）
4. P1-3 换掉 `__errs` 假证据，改为 CDP/真实采集
5. P2-1、P2-3、P2-4、P2-2 → P2-5/6/7/8