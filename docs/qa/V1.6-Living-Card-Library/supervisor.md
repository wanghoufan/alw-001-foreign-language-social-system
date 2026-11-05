# V1.6 三大活资料库 · Supervisor 复核报告（只读）

- 角色：独立 supervisor（总把关）
- 日期：2026-11-05
- 项目根：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统`
- 输入：`code-review.md`、`product-review.md`、`qa-report.md`、`docs/plan/ALW001-N05-V1.6-Living-Card-Library/`（README/SPEC/ACCEPTANCE/FINAL-REPORT）
- 只读声明：本轮未修改源码/配置/文档，未执行 `git add/commit/push/reset/clean`，未重启服务、未改手机应用；唯一新增文件是本报告。
- 复核方式：亲自读代码 + 在 `mktemp` 临时目录跑隔离实例复现（不触碰 `SocialMate-Data/` 真实数据）+ 对三份报告做归并重定级。

## 0. 结论摘要

- **整体判定：需打回（当前不可发布）。**
- 去重后：**P0 × 4、P1 × 13、P2 × 10 组**。
- 三份报告相互印证多于冲突；但存在两类系统性问题：
  1. **图片链路「能传不能看」**：服务端落盘成功、前端列表/详情从不渲染，多图还会被限流拒绝且静默关窗。
  2. **验收证据本身不可信**：`window.__errs == []` 在源码中无写入点、`/v12/api/cards*` 零 HTTP 测试、报告称「媒体 429 已修复」但实现仍拒绝 200ms 内的第二张。
- **Supervisor 新增发现**：`source/V1.1-baseline.html` 与实际服务的 `socialmate-v1.2/index.html` 已漂移，重建会回退两项线上修复（详见 P1-7）。

---

## 1. 抽查记录

抽查优先覆盖两份报告中的全部 P0 与「假证据」类结论；复现均在临时目录，命令可重跑。

### 抽查 1｜并发写共用同一临时文件（code-review P0-1）— **确认**

证据：`socialmate-prototype/ai-gateway/private-cards.mjs:81-87`

```js
const tmp = path.join(path.dirname(file), "." + path.basename(file) + "." + process.pid + ".tmp");
```

临时文件名只有 `pid`，无随机量；同一进程内并发写同一目标共用同一 tmp。

复现（临时目录，两个并发 `create` 同 id）：

```
race: [ 'OK:A', 'ERR:ENOENT' ]
磁盘内容: B BBB revision: 1
落盘是否等于成功方: false
```

并发上传两张图（同一卡片）：

```
media race: [ 'OK:m0c2a718cc4ad6cd4', 'ERR:ENOENT' ]
卡内media条目: 1  revision: 2  磁盘文件数: 2 [ 'm0c2a718cc4ad6cd4.png', 'm36b33da0c1698970.png' ]
```

判定：**确认**。返回 200 的一次并未落盘，失败方内容反而落盘；成功请求的图片 id 不在卡片里，另一张成为永久孤儿文件。属于数据错乱 + 假成功。

### 抽查 2｜`restore()` 覆盖在用同 id 卡片（code-review P0-2 / qa-report P1-1）— **确认**

证据：`private-cards.mjs:269-280`（restore 只查 trash，不查 live）；`:221-235`（create 只查 live，不查 trash）。

复现（create → softDelete → create 同 id → restore）：

```
删除后同id新建: NEW 新内容
restore 返回: OLD 旧内容 rev: 3
restore 后 live: OLD 旧内容
trash 剩余: []
新建内容是否被覆盖: true
```

判定：**确认**。两份报告描述一致，且可稳定复现；新建卡内容无提示、无备份、不可再恢复。

### 抽查 3｜图片上传「假成功」（product-review P0-1 / qa-report P1-2）— **确认**

证据链（逐点核对）：

- 私有卡媒体字段只在 `smCardMerge` 被写入：`V1.1-baseline.html:3922`、`:3942`（`cardMedia:c.media||[]`）。
- 全文件 `cardMedia` 只有上述 2 处赋值，**无任何读取点**（`grep -n "cardMedia"` 仅 3922/3942）。
- `placeCard` 固定拼公开图 `/v12/img/<city>/<id3>/01.webp`（`:959-968`），私有 id（`c-*`/`pv-*`）必然 404 后回退首字占位；`appCard`（`:952`）与 `storyCard`（`:971`）完全不渲染图片。
- 详情页只渲染 `buttons + smCardDetailActions`（`:4212-4215` 仅「编辑/删除」），三个分支均无图片区（`:1920`）。
- `smCardPaintMedia` 只被 `smCardOpen` 调用一次（`:4030`），即**只在编辑弹层里能看到图**。
- 媒体限流：`server.mjs:281` `createRateLimiter({windowMs:60000,max:30,minGapMs:200})`，任何间隔 <200ms 的第二次上传直接 429（qa 实测 `retryAfterMs=196`）。
- 失败被静默：上传错误只写 `#smCardMediaMsg`（`:4125-4127`），随后 `smCardSave` 照常 `closeModal()`（`:4073-4074`），用户看不到失败。

判定：**确认**。图片能落盘、能在编辑弹层看到，但**保存后列表与详情都看不到**；多图还会被 429，失败无提示且弹窗关闭。IMG-01 / UI-03 无法验收。

### 抽查 4｜私有卡存在两套编辑入口，旧入口静默回滚（product-review P0-2）— **确认**

证据：

- 关于我详情**同时**渲染新入口与旧入口：`:1920` story 分支 `...detailActions('story',id)...<button class="btn" data-editstory="...">`。
- 旧入口 `editStory` 读改 `SAV.stories`（`:1986`），保存分支 `savestory` 只 `persist()` 写 localStorage（`:2040`）。
- 每次合并都把私有卡从本地数组剔除并从服务端重建：`smCardMerge` `:3928` `SAV.stories=SAV.stories.filter(s=>!s.smCard)` → `:3929-3933` 重新 push 服务端行。

判定：**确认**。私有卡（`smCard:true`）经旧入口编辑后提示「已保存」，下一次 `smCardsLoad`/重开页面即被服务端版本覆盖，用户修改静默消失。

### 抽查 5｜卡片分享能力（product-review P0-3）— **确认缺失**

```
$ grep -n "navigator.share" socialmate-v1.2/source/V1.1-baseline.html
4621:  if(!ok&&navigator.share){
4622:    try{ await navigator.share({title:'GPT 语音练习 Prompt',text:text}); ok=true; }catch{}
```

只出现在 GPT Prompt 场景；卡片详情按钮为「复制英文 / 加入聊天参考」（`:1919`），无分享动作、无原生桥。ACCEPTANCE 末句要求用户「按三个 Tab 分别新建一条并**分享一次**」，CHAT-01 明确要求分享后返回录音不重置。

判定：**确认**。属未交付的验收项（定级见 P1-5，理由见第 3 节）。

### 抽查 6｜验收证据可信度（qa-report P1-3/P1-4 + FINAL-REPORT）— **确认不成立**

```
$ grep -rn "__errs" (源码/产物)
（0 命中；仅 FINAL-REPORT.md:24、:53 提到）
$ grep -c "api/cards" *.test.mjs
所有文件均为 0
```

- FINAL-REPORT:24 用 `window.__errs == []` 作为「冷启动无 JS 错误」PASS 证据，但源码无定义、无 push，数组恒空，不构成证据。
- FINAL-REPORT:20「媒体 429 已修复」与实现矛盾（`minGapMs:200` 仍在）。
- FINAL-REPORT:13「`apps/v1-6.json` 落盘 PASS」在 qa 复核时文件已位于 `trash/app/`。

判定：**确认**。FINAL-REPORT 不能作为发布依据，必须用 CDP 异常采集 + 路由测试重采。

### 抽查 7｜源文件与线上产物已漂移（Supervisor 新增）— **确认**

```
$ diff socialmate-v1.2/source/V1.1-baseline.html socialmate-v1.2/index.html
589c589, 626c626, 1920c1920, 2031c2031, 4977c4977
```

行为差异（不止数据集）：

- `:2031`：index 为 `if(S.tab!=='chat')setTab(...)`，source 为无条件 `setTab(...)` → 重建会丢掉「点关联卡不跳走聊天页」的修复，直接影响 CHAT-01「返回录音不重置」。
- `:1920`：index 地图查询用 `a.cnName+' '+a.city`，source 硬编码 `+' 海口'`。
- `build-v12.py:7` 明确 `SRC = source/V1.1-baseline.html`，即**重建会用落后版本覆盖 index**。

判定：**确认**。属发布流程风险（修复只存在于产物、不在源），必须先把修复回写 source 再重建。

---

## 2. 三份报告的去重映射

| 归并项 | 来源（原始编号） | 说明 |
|---|---|---|
| P0-1 并发原子写互毁 | code P0-1 | 仅 code 报告提出；已复现 |
| P0-2 restore 覆盖 | code P0-2 + qa P1-1 | 两报告同一问题，qa 定 P1，此处升 P0（真实数据丢失） |
| P0-3 图片链路假成功 | product P0-1 + qa P1-2 + product P1-6 | 三条合并为同一用户故事：看不到图 + 多图 429 + 失败静默 |
| P0-4 旧编辑入口静默回滚 | product P0-2 | 独立问题，保留 P0 |
| P1-1 乐观锁可绕过 | code P1-1 + qa P2-1 | 两报告同一代码点，统一为 P1 |
| P1-2 媒体删除/读取越界 | code P1-2 + code P1-3 | 同一「媒体路径不可信」根因，合并 |
| P1-3 AI 英文接口无鉴权 + 同意闸绕过 | code P1-7 + product P1-5 | 服务端无票 + 前端硬编码 `consent:true` + 价格直出，合并 |
| P1-4 卡片列表失败静默 | code P1-6 + qa P2-4 | 合并 |
| P1-5 分享缺失 | product P0-3 | 降为 P1，见定级说明 |
| P1-6 备份恢复 + 覆盖层入口未交付 | product（DATA-01/CRUD-02）+ FINAL-REPORT:34-35 | 两项均为已批准验收项未实现，合并 |
| P1-7 源/产物漂移 | Supervisor 新增 | 三份报告均未发现 |
| P1-8 地点字段覆盖 | qa P2-3 | 升 P1（会覆盖已有 category/cat 字段） |
| P1-9 字号低于硬下限 | product P1-1 | 违反全局强制规范 |
| P1-10 验收证据不可信 | qa P1-3 + qa P1-4 + qa P2-8 + FINAL-REPORT | 合并为「报告不可作发布依据」 |
| P1-11 列表/表单 UX 未达验收 | product P1-2 + P1-3 + P1-4 | 首屏密度、软件卡无图整段英文、表单校验，合并 |
| P1-12 主题默认 light | product P1-10 | 违反全局默认 SYSTEM |
| P1-13 Android 基址漂移 | code P1-5 | 代码路径成立，真机未验，保留待确认 |

其余产品/QA/代码 P2 条目按主题合并到第 3 节 P2 组，不逐条堆叠。

---

## 3. 重定级清单

### P0（真正阻塞发布，4 条）

#### P0-1 并发写共用同一临时文件：200 响应与磁盘内容不一致，产生孤儿图片

- **影响面**：任何同卡片并发写（两窗口、手机+Mac、连传多图、下拉重入）。客户端拿到 200 却丢失内容；卡片 revision/封面指向错乱；媒体目录永久残留孤儿文件，无清理路径。
- **最小修复**：临时名加 `randomBytes` 随机后缀，并按目标路径加进程内串行队列（`Map<path, Promise>`）包住所有「读-改-写」。

#### P0-2 `restore` 无条件覆盖在用同 id 卡片：删除 → 同 id 新建 → 恢复，新卡静默丢失

- **影响面**：所有走到回收站恢复的用户；数据丢失且无提示、无备份、不可再恢复。
- **最小修复**：restore 前检查 live 存在则返回 `409 RESTORE_CONFLICT`（附 `currentRevision`），覆盖分支必须先备份；create 同时检查 trash。

#### P0-3 图片链路假成功：列表/详情从不渲染私有图片，多图 429，失败静默关窗

- **影响面**：IMG-01、UI-03 全部无法验收；用户以为上传失败而重复上传，或以为已保存实际缺图；孤儿文件与服务端媒体条目错位。
- **最小修复**：列表按 `coverMediaId` 渲染缩略图（blob URL）、详情增加图片区；媒体桶去掉 `minGapMs`（或按「一次保存最多 12 张」批量放行）；上传失败阻止关闭并汇总「成功 N / 失败 M」。

#### P0-4 私有卡存在两套编辑入口：旧「编辑这段话」只写 localStorage，随后被服务端数据覆盖

- **影响面**：所有从关于我详情改私有卡的用户；「已保存」后内容回滚，属静默数据丢失，与「保存成功才关闭」合同冲突。
- **最小修复**：`smCardById(kind,id)` 命中时隐藏 `data-editstory` 按钮，旧入口只对纯本地种子故事开放；两条保存路径都要显式标注落点。

### P1（影响可用性/数据安全/验收合同，13 条）

| 编号 | 问题 | 影响面 | 最小修复（一句话） |
|---|---|---|---|
| P1-1 | PATCH 省略 `revision` 直接跳过冲突检测（`private-cards.mjs:247`；前端 `:4059` 会传 `undefined`） | 跨窗口编辑后写覆盖先写，且不提示 | `revision == null` 返回 400/409，前端缓存未命中先 force load |
| P1-2 | `deleteMedia` 直接拼 `entry.file`（`:379`）可删 media 目录外文件；`readMedia` 不校验软链接（`:388-400`） | 任何能改卡片 JSON 的路径变成任意文件删除/读取 | 复用 basename 正则 + `path.resolve` 前缀断言；读取前 `realpath` 或 `O_NOFOLLOW` |
| P1-3 | `/api/ai/draft-en` 无 token、无写票、无独立限流（`server.mjs:548`）；前端写死 `consent:true`（`:4177`）并把「约 0.0003–0.001 元」显示给用户（`:4173`） | 局域网内任意设备可消耗 DeepSeek 预算；违反「默认不自动调用付费 API」 | 对齐 `/v12/api/*`：先 `peopleToken` 再 `requireWriteAuth`；接既有 consent 闸，移除价格文案 |
| P1-4 | 卡片列表首次失败即置 `loaded=true` 且静默（`:3959-3961`），本会话不再重试 | 断网恢复/服务重启后用户看到「卡片全没了」，误判数据丢失 | 失败不置 loaded；记录错误态并显示「读取失败，点此重试」 |
| P1-5 | 卡片分享缺失（`navigator.share` 仅 GPT 场景 `:4621`） | CHAT-01 与 ACCEPTANCE 最终「分享一次」无法完成 | 详情加「分享」主按钮（Web Share + 原生桥兜底），分享后返回不重置录音 |
| P1-6 | 备份/恢复（DATA-01）与覆盖层前端入口（CRUD-02）未实现（FINAL-REPORT:34-35） | 重装/换机无兜底；用户改不了既有 115 地点/旧资料的覆盖版本 | 至少实现三类卡+媒体+删除状态的导出/导入与覆盖层入口 |
| P1-7 | `source/V1.1-baseline.html` 落后于 `index.html`（`:2031`、`:1920`），构建脚本以 source 为源 | 一次重建就会回退「关联卡不跳走聊天页」等修复 | 把 index 现有修复回写 source，并在构建后自动 diff 关键行为 |
| P1-8 | `smCardPayload` 把 `city/category/cat` 全部取 `#smcCategory`（`:4038-4046`） | 编辑地点卡会把「公园」等分类覆盖成城市值，筛选错乱 | 表单拆「城市 / 分类」两字段分别回填，或仅城市变化时更新 city |
| P1-9 | 字号低于强制下限：`--reading-body:16px`、`--reading-en:18px`、`--reading-meta:14px`（`:80`），`.btn/.formlabel` 12-13px，`.sup` 10px | 中文/英文正文偏小一档，按钮与表单标签违规，影响可读性 | 正文≥19px、其他正文类≥15px、标题≥23px、删除<14px 散点 |
| P1-10 | 验收证据不可信：`__errs` 恒空、`/v12/api/cards*` 零 HTTP 测试、429「已修复」不成立、报告状态过时 | 发布会基于无效 PASS | 换 CDP `Runtime.exceptionThrown` 采集；补路由用例；报告标注取证时点 |
| P1-11 | 三页列表与表单 UX 未达 UI-01/EN-01/CRUD-01：首屏 35-40% 才见卡；软件卡无图+整段英文；标题非必填、无未保存确认、重名静默建新卡 | 首屏内容不优先，误关丢草稿，同名卡重复 | 压缩顶部为搜索+分类两行；软件卡改「图标+中文名+一句用途」；标题必填 + dirty 确认 + 重名提示 |
| P1-12 | 主题默认 `light`（`:1` 内联脚本、`:934` `SAV.theme??='light'`），深色无截图证据 | 系统深色用户首次进入仍浅色，违反默认 SYSTEM | 默认 `system` 并跟随 `prefers-color-scheme`，补深色真机截图 |
| P1-13 | Android 白名单/桥校验统一用随网络变化的 `effectiveUiBase()`（`AsrActivity.java:970-985`、`:1011-1012`、`:1231-1241`） | WiFi→蜂窝后存量页面可能被判跨源，表现为保存/导出无反应 | 加载时快照 `sessionUiBase`，白名单与桥校验只用快照；**需真机确认** |

### P2（优化/可排期，按主题合并为 10 组）

1. **媒体校验与配额**：JPEG 只验 `FFD8`、PNG 不验 `IHDR`（`private-cards.mjs:113-127`），5 字节伪图可入库且 `width/height=0` 绕过边长限制；卡片上限只统计 live，回收站无上限；`stats()` 每次全量读两遍；条目上限用 429 语义不当。
2. **覆盖层一致性**：`putOverride` 无 revision（`:283-297`）；`getOverride/deleteOverride` 不校验 kind（`:313-320`）。
3. **字段可清空性**：`cnName/enName/title` 用 `raw.X || base.X`（`:166-168`），传空串回落旧值，用户删不掉标题。
4. **本地副本与 schema**：`smCardMerge` 把私有卡片写进 localStorage（`:3934`）；前端读 `c.steps` 但 `normalizeCard` 不保存 steps（`:153-181`）。
5. **资源回收**：`SMC.media` blob URL 只增不减，删除图片后不 revoke（`:3967-3980`）；地点缓存无 TTL、写失败静默吞 QuotaExceeded（`:4227-4237`）。
6. **桌面端降级**：无桥时卡片模块返回空但按钮仍渲染（`:3950`、`:953-954`），点击只能看到「未配对」。
7. **服务端细节**：写票在参数校验失败/405 时已被消费（`server.mjs:318-332`、`:923-975`）；媒体 `mime` 与扩展名可能不一致（`:347`）；`TEXT_CACHE` 无上限、失效键只有 mtime+size、`gzipSync` 同步阻塞；`draft-en` 与 `translate` 约 40 行重复、kind 白名单两处各写一遍；每张图 GET 都做一次 8781 token 探测（`server.mjs:995-999`）。
8. **错误与文案**：非法 id 落到 404 而非 400、缺 mediaId 落到 405；开发话术「公开 PWA / 中文真源 / P002 / 0.0003–0.001 元」直出；「仅本机草稿 · 未同步 Mac」对所有卡片无条件显示；空态无新建入口、三页新建按钮命名不一致；关键按钮文案硬编码中文未走 i18n。
9. **视觉细节**：海南移动端缩略图 190px（SPEC 建议 80–108px）；私有地点详情仍渲染 Google/高德搜索链接；表单 sticky 操作条遮挡「状态/说明」字段；favicon 404 噪音。
10. **结构缺口**：详情没有「更多经历」分段追加入口（EN-01 的完整内容只能塞在一段里）；测试缺并发写、restore 冲突、越界 file、软链接、假图、路由负例用例。

---

## 4. 整体判定

**需打回（不可发布）。** 判定理由（5 条）：

1. 两处 P0 会造成真实数据丢失/错乱（并发写互毁、restore 覆盖），且均已用隔离实例稳定复现，不是理论风险。
2. 图片链路端到端假成功：上传 200、落盘成功，但列表与详情永远看不到；多图还会 429 且失败静默关窗，IMG-01/UI-03 无法验收。
3. 私有卡旧编辑入口提示「已保存」后被服务端数据覆盖，属静默数据丢失，直接违反「保存成功才关闭 / 旧数据不覆盖」合同。
4. 已批准验收项未交付：CHAT-01 分享、DATA-01 备份恢复、CRUD-02 覆盖层入口；ACCEPTANCE 末句「三个 Tab 新建一条并分享一次」走不通。
5. 验收报告存在无效证据（`__errs` 恒空、新路由零测试、429「已修复」不实），且 source 与线上产物已漂移，一次重建就会回退修复——报告不能作为发布依据，必须重测。

补充：本次未发现鉴权绕过、路径穿越（HTTP 入口正则）或密钥泄漏；`/v12/api/cards*` 的 401/403/400/404/409 负例经 qa 手工验证成立。问题集中在**写一致性、媒体闭环、验收证据**三条线。

---

## 5. 发布前必须验证的最小清单

> 全部可复现；除真机项外均用临时目录/临时端口，不触碰真实数据、不重启 8791。

1. **并发写一致性**
   ```bash
   cd socialmate-prototype/ai-gateway && node --input-type=module -e '…并发 create 同 id + 并发 addMedia…'
   ```
   通过判据：成功方内容 == 磁盘内容；`card.media.length` == 媒体目录文件数；无 `ENOENT`、无孤儿文件。

2. **恢复冲突**
   隔离实例：`create → softDelete → create 同 id → restore`。
   通过判据：restore 返回 `409 RESTORE_CONFLICT`；新建内容仍在；trash 记录保留。

3. **图片闭环（真机，厂商自带浏览器 + CDP）**
   新建 → 保存 → 编辑 → 连选 2 张 → 保存。
   通过判据：两次上传均 200；列表出现缩略图；详情可看大图；删除后列表/详情同步消失；任一失败时弹窗不关闭且提示「成功 N/失败 M」。

4. **旧编辑入口**
   打开私有卡详情。通过判据：不出现 `data-editstory` 按钮（或改后执行 `smCardsLoad(kind,{force:true})` 内容不回滚）。

5. **分享**
   详情点分享，选中/英/图/链接。通过判据：系统分享面板出现；返回后聊天录音状态、会话未被重置。

6. **乐观锁与鉴权**
   隔离实例：PATCH 不带 revision、旧 revision、无 token、无写票、无 Origin、`POST /api/ai/draft-en`。
   通过判据：分别为 400/409、409、401、403、403；`draft-en` 未带票返回 401。

7. **媒体路径安全**
   篡改临时卡片 JSON 的 `entry.file` 为 `../../victim.txt` 后调 `deleteMedia`；在 media 目录放软链接后调 `readMedia`。
   通过判据：两者均被拒绝（400/404），victim 文件仍存在。

8. **列表失败可恢复**
   切到隔离端口实例并让它 503 → 打开卡片页 → 恢复实例 → 点重试。
   通过判据：出现「读取失败 / 重试」提示；重试后卡片出现；不出现「全没了」。

9. **备份/恢复**
   导出 → 清空隔离目录 → 导入。
   通过判据：三类卡、标签、中英、图片、删除状态一致；不覆盖 115 静态种子。

10. **源/产物一致**
    ```bash
    python3 socialmate-v1.2/build-v12.py && diff …（关键行为）
    ```
    通过判据：`S.tab!=='chat'`、`a.cnName+' '+a.city` 等修复仍在；地点数为 115 而非 23。

11. **测试与证据**
    `cd socialmate-prototype/ai-gateway && node --test *.test.mjs`。
    通过判据：全绿，且新增 `/v12/api/cards*` 路由负例 + 并发/restore/越界/软链/假图用例；真机异常改用 CDP `Runtime.exceptionThrown`/`Log.entryAdded` 采集并落盘，报告不再引用 `__errs`。

12. **真机 UX 回归**
    393×791 与 393×852：新建三页各一条 → 编辑 → 加图 → 删除 → 恢复；同时检查字号（正文≥19、按钮/表单≥15、标题≥23、无<14）、深色主题、输入法不遮保存、WiFi→蜂窝后内链与保存仍可用。

---

## 6. 局限与未取证

- 未操作真机、未重启服务：`P1-13`（Android 网络切换）只有代码路径推导，判「待真机确认」。
- 未调用真实计费 AI：`/api/ai/draft-en` 的鉴权问题由代码确认，未发起实际扣费请求。
- 未做深色、393×852、输入法遮挡、APK 重装回归的实测；这些只进入清单，不作为「通过」证据。
- 媒体 429 的 200ms 行为由代码 + qa 实测共同确认，本轮未重复起 HTTP 实例。