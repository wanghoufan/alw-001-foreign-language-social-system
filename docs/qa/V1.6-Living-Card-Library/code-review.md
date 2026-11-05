# V1.6 活资料库 独立代码审查（只读）

- 审查对象：本轮未提交改动（`git status` 见下）
- 审查方式：`git diff` + 直接读文件 + 在临时目录跑隔离脚本复现（不触碰真实数据、不修改源码）
- 审查人：code-reviewer（只读）
- 日期：2026-11-05

## 0. 审查范围与基线

```
 M android-poc/app/build.gradle
 M android-poc/app/src/main/java/app/socialmate/dualmic/AsrActivity.java
 M socialmate-prototype/ai-gateway/server.mjs
 M socialmate-v1.2/index.html
 M socialmate-v1.2/source/V1.1-baseline.html
?? socialmate-prototype/ai-gateway/private-cards.mjs
?? socialmate-prototype/ai-gateway/private-cards.test.mjs
```

已核对：`private-cards.test.mjs` 独立运行 7/7 通过；`server-routes.test.mjs` 内**没有**任何 `/v12/api/cards`、`/v12/media`、`/api/ai/draft-en`、`/v12/api/prefs` 用例（见 P2-12）。

## 1. 结论摘要

- **P0 × 2**：并发写入互相破坏（响应与落盘不一致、丢图）；`restore` 覆盖已存在的同 id 卡片（数据丢失）。
- **P1 × 7**：PATCH 可绕开 revision 校验；`deleteMedia` 路径穿越删除；`readMedia` 符号链接读任意文件；媒体 GET 每请求一次归档探测（N+1）；Android 动态基址使白名单/令牌注入随网络切换失效；卡片列表失败后永久空且静默；`/api/ai/draft-en` 无令牌、无写票、无限流。
- **P2 × 14**：校验/限流/可维护性/性能/前端细节，见下。

---

## P0

### P0-1 原子写的临时文件名不唯一：同进程并发写同一目标会互相破坏，导致「返回成功但落盘是另一次写的内容」

**问题**
`atomicWrite` 的临时文件名由 `.<basename>.<process.pid>.tmp` 组成，**不含随机量**。同一进程内两个请求并发写同一个 `card.json` 时共用同一个临时文件：先写者 rename 成功后，后写者 rename 直接 `ENOENT`；或者两者的内容在同一个 tmp 上互相覆盖，最终落盘内容与「返回 200 的那次请求」不一致。

**证据**
`socialmate-prototype/ai-gateway/private-cards.mjs:81-87`
```js
function atomicWrite(file, text, mode = 0o600) {
  const tmp = path.join(path.dirname(file), "." + path.basename(file) + "." + process.pid + ".tmp");
  ...
    .then(() => fs.rename(tmp, file));
}
```
隔离复现（5 轮并发 `create` 同 id，临时目录）：
```
0 OK:A0 | ERR:ENOENT → 落盘: B0
1 OK:A1 | ERR:ENOENT → 落盘: B1
2 ERR:ENOENT | OK:B2 → 落盘: A2
3 ERR:ENOENT | OK:B3 → 落盘: A3
4 ERR:ENOENT | OK:B4 → 落盘: A4
```
即：返回 `OK:A0` 的请求，磁盘上却是 `B0` 的内容；返回失败的一方反而留下了数据。

同类实测（并发上传两张图，同一张卡片）：
```
[ 'ERR:ENOENT', 'OK:m744a102d6f64c79b' ]
卡片media条目数: 1  revision: 2  cover: m7c76eab0f0c472f9
磁盘文件数: 2 [ 'm744a102d6f64c79b.png', 'm7c76eab0f0c472f9.png' ]
```
成功的请求 id 甚至没有进卡片，失败请求的文件却落了盘并成为封面；另一张成为孤儿文件。

**触发条件（现实路径，不是理论）**
- 用户点「保存」后连传 2–6 张图（前端 `smCardUploadPending` 串行，但两次保存/两个窗口、下拉刷新重入、手机与 Mac 同开都会并发）。
- `addMedia` 里「写图片文件」与「写卡片 JSON」是两个独立写操作，且都在同一卡片路径上。
- 重名创建、两个窗口同时 PATCH 也会命中同一 tmp。

**影响**
- 数据错乱：客户端拿到的 200 响应内容与磁盘真实内容不同；卡片 revision/封面指向错乱。
- 孤儿媒体文件永久残留（无清理路径）。
- 用户看到「图片失败」，实际磁盘有文件，后续 `list` 又出现未预期图片。

**修复建议**
1. 临时文件名加入随机后缀：`.<base>.<pid>.<randomBytes(6).hex>.tmp`，并 `fs.rename` 失败时清理 tmp。
2. 目标文件级互斥：按 `file` 路径做 in-process 串行队列（`Map<path, Promise>`），把所有「读-改-写」包在队列里，确保 `update`/`addMedia`/`deleteMedia`/`setCover` 对同一卡片串行。
3. `addMedia` 改成先写媒体文件、再「读最新卡片 → 追加 → 写回」；或把媒体索引单独落文件，避免与卡片 JSON 竞争。

---

### P0-2 `restore()` 无条件覆盖已存在的 live 卡片：删除后同 id 新建，再恢复，新建内容被静默丢弃

**问题**
`restore` 只确认 trash 里存在记录，不检查 live 侧是否已有同 id 文件，直接 `atomicWrite(fileOf(kind,id))` 覆盖。而 `create` 的重复检查只看 live 文件（`readJson(fileOf)`），不看 trash，因此「删除 → 用同 id 新建」是允许的；此后再点恢复，新建卡片被旧回收站记录覆盖。

**证据**
`private-cards.mjs:269-280`
```js
async function restore(kind, id) {
  const trashed = await readJson(trashFile(kind, id));
  if (!trashed) throw new CardError(404, "TRASH_NOT_FOUND", ...);
  await fs.mkdir(dirOf(kind), {recursive: true, mode: 0o700});
  trashed.deletedAt = null;
  ...
  await atomicWrite(fileOf(kind, id), JSON.stringify(trashed, null, 2)); // 不检查目标是否已存在
  await fs.rm(trashFile(kind, id), {force: true});
```
隔离复现：
```
删除后同id新建: NEW
restore后live内容: A   / 返回值: A
```
（`A` 是被删掉的旧卡片，`NEW` 被覆盖且无任何提示、无备份、不可再恢复。）

**影响**
真实数据丢失，且无冲突提示。用户在回收站点「恢复」时，会以为恢复了旧内容，实际上把当前正在用的卡片冲掉了。

**修复建议**
- 恢复前检查 live 是否存在：存在则返回 `409 RESTORE_CONFLICT` 并附 `existingRevision`，由前端提示「同 id 卡片已存在，另存为新卡片 / 覆盖」。
- 覆盖分支必须先 `backup()`，并保留可回退 ID。
- `create` 时同时检查 trash（若 id 在 trash 中，返回 `409 CARD_IN_TRASH`，或强制生成新 id）。

---

## P1

### P1-1 PATCH 省略 `revision` 时直接跳过冲突检测，与文件头契约「PATCH 必须带当前 revision」相反

**证据**
`private-cards.mjs:14`（契约）与 `:247`
```js
 * 卡片一律带 revision（整数）与 updatedAt，PATCH 必须带当前 revision，冲突返回 REVISION_CONFLICT。
```
```js
if (revision != null && Number(revision) !== Number(current.revision)) {
```
前端正好会传 `undefined`：`V1.1-baseline.html:4059-4060`
```js
const cur=smCardById(kind,id);
... body:JSON.stringify({revision:cur?cur.revision:undefined,patch:payload})});
```
实测：
```
PATCH无revision: 2 without-revision
旧revision: REVISION_CONFLICT
```
即：任何绕过前端的调用（或 `cur` 未命中缓存时）可以无条件覆盖他人修改。

**影响** 乐观锁在真实并发下失效，后写覆盖先写，且前端不会提示「已被其他窗口修改」。

**建议** `update` 中把 `revision == null` 视为 `409 REVISION_REQUIRED`；前端在 `cur` 为空时先 `smCardsLoad(kind,{force:true})` 再取 revision，取不到就阻止保存。

---

### P1-2 `deleteMedia` 用卡片数据里的 `entry.file` 直接拼接路径，可删除 media 目录外的文件

**证据**
`private-cards.mjs:374-386`
```js
const entry = (card.media || []).find((m) => m.id === mediaId);
if (!entry) throw new CardError(404, ...);
await fs.rm(path.join(mediaDir(card.id), entry.file), {force: true});
```
`readMedia` 对文件名有严格正则（`:391`），`deleteMedia` 没有。隔离复现（改卡片 JSON 的 `entry.file` 为 `../../victim.txt`）：
```
deleteMedia 执行完毕
victim 是否还存在: false
```

**影响** 任何能改写卡片 JSON 的路径（本机同步工具、备份还原、未来的导入/覆盖层功能、并发写坏的文件）都会变成任意文件删除。当前触达需要本地写权限，故列 P1 而非 P0。

**建议** 删除前复用 `readMedia` 同一套 basename 正则校验 `entry.file`；只允许 `m[a-f0-9]{16}\.(jpg|png|webp)`，并 `path.resolve` 后断言以 `mediaDir(cardId)+sep` 开头。

---

### P1-3 `readMedia` 不校验符号链接，media 目录内的软链接可读任意本机文件

**证据** `private-cards.mjs:388-400` 只有 basename 正则与 `path.join`，无 `fs.realpath`/`lstat` 校验。隔离复现（在 `media/s1/` 下建 `m0000000000000000.png` 指向 `secret.txt`）：
```
symlink读取: TOP-SECRET
```
**影响** 目录权限 0700 只挡其他系统用户，挡不住同用户下同步/备份/脚本投放的软链接。属于纵深防御缺口（当前需要本地写权限，故 P1）。

**建议** 读取前 `fs.realpath(file)`，断言其父目录仍是 `mediaDir(cardId)` 的 realpath；或用 `fs.open` + `O_NOFOLLOW`。

---

### P1-4 每张图片 GET 都做一次归档服务 token 探测（每图一次 8781 往返）

**证据**
`server.mjs:995-999`
```js
if(cardMediaFileMatch&&req.method==="GET"){
  const token=await peopleToken(res,"读取卡片图片");
```
`peopleToken`（`server.mjs:650-670`）每次都对 `http://127.0.0.1:8781/api/archive/session/__token_probe__` 发起一次 HTTP 请求。

**影响** 一张卡片 12 张图 → 12 次额外往返；三页列表每次 `smCardsLoad` 又各一次。弱网/归档服务刚启动时，图片墙会持续转圈；`peopleToken` 对 503 也不做短时缓存，属于「每请求重复 I/O」。

**建议** 进程内对有效 token 做 30–60s 的校验结果缓存（token 字符串做 key，只存 hash + 过期时间）；或在 `/v12/media` 用「一次性签名 URL/短时 cookie」替代逐请求探测。

---

### P1-5 Android 白名单与桥校验使用随网络变化的 `effectiveUiBase()`，WiFi→蜂窝切换后存量页面被判跨源

**证据**
`AsrActivity.java:970-985`（`effectiveUiBase` 在非 WiFi 且配置为私有 LAN 时返回 Tailscale 基址），而 `isPrivatePanelUrl` 直接调用 `privateUiBase()`：
`AsrActivity.java:1231-1241`
```java
Uri base = Uri.parse(privateUiBase());   // = effectiveUiBase()
return uri.getScheme()/host/port 与 base 相等;
```
该函数被 `shouldOverrideUrlLoading`（`:807-809`）、`shouldInterceptRequest`（`:833`）、`onPageFinished`（`:850-856`）、`injectAccessToken`（`:1253`）以及所有 `@JavascriptInterface` 的 page 校验（`:1352,1361,1373,1400,1426,1437...`）使用。

**影响** 用户开着 WiFi 从 `192.168.x.x:8791` 打开页面后掉到蜂窝网络：页面仍在 LAN origin，但白名单基址已变 Tailscale →
- 页面内 `location` 导航被交给外部浏览器（离开 App）；
- `onPageFinished` 判定「非私有」→ 撤销/跳过桥注入与令牌注入；
- 桥接口全部按 page 校验失败返回，表现为「网页里点保存/导出无反应」。

（本条依据代码路径推导，**待确认**：需真机实测「WiFi 页面 → 关 WiFi → 点内链/保存」是否如上表现。）

**建议** 白名单与桥校验固定使用「加载时的基址」（在 `loadUrl` 前快照一份 `sessionUiBase`），只有显式重新加载时才更新；`effectiveUiBase` 仅用于下一次导航目标。

---

### P1-6 卡片列表首次失败后永久缓存空结果，且错误完全静默

**证据**
`V1.1-baseline.html:3948-3964`
```js
if(SMC.loaded[kind]&&!force)return SMC[kind];
try{
  const d=await demoApi('/v12/api/cards?kind='+kind,{token:uiToken()});
  ...
  SMC.loaded[kind]=true;
}catch(e){
  SMC.loaded[kind]=true;   // 失败也标记已加载，且不记录/不提示错误
}
```
`smCardNew`（`:4033-4036`）会先 `await smCardsLoad(kind)` 再打开表单，因此失败后新建表单仍可打开，但已有卡片在本次会话内不会再出现，除非关页面重开或走到 `force:true` 的保存/删除路径。

**影响** 断网后恢复网络、或 8791 刚重启时，用户看到「卡片全没了」，且没有任何「读取失败」提示，误判为数据丢失。

**建议** 失败时不要写 `SMC.loaded[kind]=true`；记录 `SMC.error[kind]`，列表顶部显示「读取失败，点此重试」，并给 `smCardsLoad` 加一次短退避重试。

---

### P1-7 `/api/ai/draft-en` 不校验归档令牌、不校验写票、无独立限流（可被局域网内任意设备消耗 DeepSeek 预算）

**证据**
`server.mjs:548-556`
```js
if(url.pathname==="/api/ai/draft-en"&&req.method==="POST"){
  const body=await readPayload(req,20000);
  if(body?.consent!==true) return json(res,403,{...CONSENT_REQUIRED});
```
对比本轮新增的 `/v12/api/*` 路由，全部先 `peopleToken`，写操作再 `requireWriteAuth`（如 `:906-913`、`:923-935`）。而入口的 `originOK`（`server.mjs:258-268`）对**没有 Origin 的请求直接放行**：
```js
if(!origin)return true;
```
服务只做 `isPrivateIp` + 同源，因此同一局域网（或 Tailscale 网段）内任意设备用 `curl -H 'Content-Type: application/json' -d '{"text":"...","consent":true}'` 即可直接调用并扣账本。该实现与既有 `/api/ai/translate`（`:498`）一致，属于**沿用既有安全债**，但本轮复制了它。

**影响** 花钱接口无身份门槛；`lastRequestAt` 的 1200ms 只防连点，不防持续轮询（每分钟约 50 次 × 0.0003–0.001 元）。

**建议** 对齐 `/v12/api/*`：先 `peopleToken`，再 `requireWriteAuth`；或至少要求 `x-sm-write` 写票。同时把 `originOK` 对「无 Origin 的 POST」收紧（只允许回环）。

---

## P2

### P2-1 媒体/覆盖层的魔数校验过弱，5 字节伪 JPEG、24 字节伪 PNG 会被接受

**证据** `private-cards.mjs:113-127`：JPEG 只要求 `FF D8`；PNG 只要求前 4 字节魔数，随后直接读偏移 16/20，不校验 `IHDR`。实测：
```
接受假JPEG: {"id":"m...","file":"m....jpg","mime":"image/jpeg","bytes":5,"width":0,"height":0,...}
```
（PNG 伪数据同样通过，`width/height` 为 0。）
**影响** 「服务端校验 magic bytes」的宣传与实现不符；非图片内容可入库，前端 `<img>` 解码失败后显示空白；同时也让 `width:0/height:0` 绕过 4096 边长限制。
**建议** PNG 校验 `IHDR`（bytes 12-15 为 `IHDR`）并拒绝 0 尺寸；JPEG 要求扫描到 SOF 或至少 `sizeof(buf) >= 128`；`size.width === 0` 视为非法。

### P2-2 `MAX_CARDS_PER_KIND` 只统计 live，回收站无上限；卡片上限用 429 语义不当
**证据** `private-cards.mjs:224`（`list(kind)` 不含 deleted）与 `:326`（媒体 429）。回收站可无限增长，`stats()` 每次全量读两遍目录（`:402-410`），500 张卡片即 1000+ 次读盘。**建议** 上限包含 trash 或加 trash 清理策略；条目上限用 `409`，仅真正限流用 `429`，并补 `Retry-After`。

### P2-3 `putOverride` 无 revision 校验，并发覆盖不可检测
**证据** `private-cards.mjs:283-297`：直接 `...(current.values), ...patch`。两个窗口同时改同一覆盖层，后写全量覆盖。**建议** 与 `update` 对齐：接受 `revision` 并返回 409。

### P2-4 `deleteOverride` / `getOverride` 不校验 kind
**证据** `private-cards.mjs:313-320`：`deleteOverride` 无 `assertKind`，`overrideFile` 只 `assertId`。当前外部路由正则限定了 kind，暂无远程触达；但内部契约与 `listOverrides/putOverride` 不一致。**建议** 统一 `assertKind`。

### P2-5 `cnName/enName/title` 无法清空
**证据** `private-cards.mjs:166-168` 用 `raw.X || base.X`，传 `""` 会回落到旧值；而同文件的 `cn/en/city/category/cat/tags` 用 `=== undefined ? base : raw` 可清空。前端 `smCardPayload` 又把空串转成 `undefined`。**影响** 用户删掉标题点保存，标题原样保留。**建议** 统一成 `undefined` 判定。

### P2-6 前端 `smCardMerge` 把私有卡片写进 localStorage，且 app 卡片 `steps` 字段服务端不保存
**证据** `V1.1-baseline.html:3934` `try{persist()}catch{}`（私有中文/英文落地 localStorage，与「私有数据只在本机私有库」的表述存在双份存放）；`:3941` 读取 `c.steps`，但 `normalizeCard`（`private-cards.mjs:153-181`）**没有 steps 字段**，私有作品步骤永远为空。**建议** 明确是否允许离线副本；若允许，在 UI 标注；`steps` 要么纳入 schema，要么删掉前端读取。

### P2-7 媒体 blob URL 只增不减，删除图片后不回收
**证据** `V1.1-baseline.html:3967-3980`：`SMC.media[key]=url`，全文件无 `revokeObjectURL`（仅上传前的本地预览 `:4104` 有 revoke）。图片删除后 `SMC.media` 仍持有旧 blob。**建议** `deleteMedia` 成功后按 key 删除并 `revokeObjectURL`；页面卸载时统一 revoke。

### P2-8 地点离线缓存无 TTL/容量上限，写入失败被静默吞掉
**证据** `V1.1-baseline.html:4227-4237`：只存 `savedAt`，`smPlaceCacheRead` 不检查过期；`smPlaceCacheWrite` 的 `catch{}` 吞掉 QuotaExceeded。**影响** 长期使用后 localStorage 满，后续所有卡片/偏好写 localStorage 全部静默失败；离线时可能展示数天前的记录且无「过旧」提示。**建议** 加 7 天过期提示、只保留最近 N 个地点、失败时 `tip()`。

### P2-9 桌面浏览器打开 `/v12` 时卡片模块整体不可用，但按钮仍渲染
**证据** `V1.1-baseline.html:3950` `if(!window.SocialMateAndroid||!uiToken())return [];`；而 `software()/hainan()/self()`（`:953-972`）无条件渲染「＋新建 / 回收站」。**影响** 桌面端点了按钮只能看到表单，保存提示「未配对」。**建议** 无桥环境隐藏卡片入口或明确提示。

### P2-10 `/v12/media`、`/v12/api/cards` GET 无限流；`GET .../:kind/:id/media/:mediaId` 落到 405 且已消费写票
**证据** `server.mjs:923-975`：`write=true` 的判定包含所有 POST，先 `requireWriteAuth`（消费一次性票），再按 action 分派；`POST .../:kind/:id`（无 action）与 `GET .../restore` 都会落到 `405`，但 POST 已经吃掉了用户的写授权票。**影响** 误触后下一次真实保存要多取一次票（前端有自动重取，用户无感但会多一次往返）。**建议** 先判定 action/method 组合合法，再消费票。

### P2-11 媒体简化实现与前端/文档不一致
**证据** `smCardUploadPending` 统一切 JPEG 0.82、长边 1600（透明底会变黑），服务端 `mime` 参数只记录不使用；`private-cards.mjs:347` 的 `mime` 与扩展名可能不一致（PNG 文件声明 `image/jpeg` 时 `entry.mime` 为 jpeg，`readMedia` 返回 png）。**建议** 服务端以扩展名推导为准，忽略或覆盖客户端 mime。

### P2-12 `TEXT_CACHE` 无淘汰、缓存键只有 mtime+size；gzip 首次同步
**证据** `server.mjs:134-156`：`TEXT_CACHE` 为模块级 `Map`，无上限；失效条件 `mtimeMs !== 或 size !==`，若文件被等长覆盖且 mtime 未变（如 `cp -p`）会持续返回旧内容；`gzipSync` 同步执行。实测 `611,674 → 174,525` 字节，`gzipSync` 单次 **10.3ms**（首请求阻塞，可接受）。**建议** 缓存加条目上限与 `Content-Length`；失效条件补 `ino`/`ctimeMs`；gzip 改用 `zlib.gzip` 异步或在启动时预压缩。

### P2-13 重复实现与常量重复定义
**证据** `server.mjs:548-595` 与 `:498-545` 的 draft-en/translate 约 40 行结构完全重复（仅 prompt、字段、上限不同）；kind 白名单在 `server.mjs:899` 与 `private-cards.mjs:24` 各写一遍。**建议** 抽 `runDeepSeekJson({prompt,schemaKey,maxTokens})`；kind 从 `private-cards` 导出 `KINDS`。

### P2-14 测试覆盖缺口与命名/注释
- `server-routes.test.mjs` 无任何卡片路由、媒体路由、`draft-en` 用例；`private-cards.test.mjs` 无「并发写」「restore 冲突」「越界 file 删除」「符号链接」「假 JPEG」用例。
- `assertId` 报错文案「只能是小写字母数字与连字符」但实际要求首位为小写字母或数字（`[a-z0-9]` 开头），文案与正则不一致（`private-cards.mjs:25,48`）。
- `stats()` 内 `list` 调用两次（`:405-406`），注释称「只数本 kind」，实现是两遍全量读。
- `MAX_MEDIA_BYTES`/`MAX_IMAGE_EDGE`/`MAX_CARDS_PER_KIND` 等魔法数集中在文件头尚可，但 `server.mjs` 里 `9*1024*1024`、`64000`、`4000` 散落，建议常量表。

---

## 已核实无问题的点（避免误报）

1. **路径穿越（HTTP 入口）**：`/v12/api/cards/...` 与 `/v12/media/...` 的正则均限制 `[a-z0-9][a-z0-9-]{0,63}`，`assertId` 二次校验；`readMedia` 用 `path.basename`，`../etc/passwd` 被 `MEDIA_PATH_INVALID` 拒绝（测试 `:113-116` 已覆盖）。
2. **新路由鉴权**：`/v12/api/cards`、`/v12/api/cards/:kind/:id`（PATCH/DELETE/POST）、`/override`、`/prefs` 都先 `peopleToken`，写路径再 `requireWriteAuth`；唯一的例外是 P1-7 的 `/api/ai/draft-en`。
3. **JPEG 头解析不会死循环/越界**：`private-cards.mjs:115-126` 的 `while (offset + 9 < buf.length)` 中 `offset += 2 + length` 至少前进 2；`readUInt16BE(offset+7)` 有长度前置条件保护。畸形输入只会返回 `{width:0,height:0}`（该点的问题见 P2-1）。
4. **base64 上限**：`text.length > ceil(6MB*4/3)+64` 与 `readPayload(9MB)` 与 `buf.length > 6MB` 三重限制自洽。
5. **前端 XSS 面（新卡片模块）**：`smCardForm`/`smCardFilesHtml`/`smCardTrash`/`smCardDetailActions` 中来自服务端的 `id/file/title/cn/en/tags` 均经 `esc()`；`smCardPaintMedia` 用 `img.src = blobURL` 而非 `innerHTML`。仅 `data-kind` 直接拼接（来源为受控常量/服务端白名单），记为纵深项（P2-11 合并项）。
6. **`/v12`、`/v12/history`、静态白名单的 CSP 不变量**：改为 `sendTextCached` 后 CSP 仍随每个 200/304 响应下发，内容未变。
7. **版本号一致**：`android-poc/app/build.gradle` `versionCode 69 / versionName 0.9.1` 与 `CHANGELOG.md` 的「0.9.1 / 69」一致。

## 复现方式（供复核，均为临时目录，未触碰真实数据）

```bash
cd socialmate-prototype/ai-gateway
node --input-type=module -e '/* 见 P0-1/P0-2/P1-1/P1-2/P1-3 代码块 */'
node --test private-cards.test.mjs   # 7/7 通过
```