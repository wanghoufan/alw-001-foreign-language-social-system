# N06 海南图片与 Android 离线链路审计报告

- 审计角色：N06 素材与代码审计员
- 审计日期：2026-11-09
- 项目根：本仓库根目录（路径已匿名）
- 依据：`docs/plan/P001-N06-HainanGallery-FestivalTopics-V1.0-Approved-20261109.md`（下称“计划”）
- 审计方式：只读代码、数据文件、APK 内容、本机数据库只读副本与既有截图；未启动服务、未打包、未修改生产数据、未提交、未推送、未跑全量测试。
- 证据标记：`【实测】`命令或文件结果；`【静态】`代码路径推断；`【快照】`本机数据库只读副本（已去标识）；`【未验证】`需真机或外部核验。

## 一、结论摘要

1. **正式版“进详情没图”可被代码证实，且与 V5 原型无关。** 公开地点的列表封面走 `/v12/img/.../01.webp`，详情页却调用 `smGallery()`；该函数只读取“活资料库卡片”的 `media`，115 个公开地点不在卡片表中，因此详情页根本不会生成图片 DOM。见 `socialmate-v1.2/index.html:968`、`:1950`、`:4078`、`:4139`。
2. **图片总量不是“够不够用”的问题，而是 70/115 个地点不足 3 张。** 实际 211 张 webp，345 个计划槽位缺 134 个；45 个地点满 3 张，6 个有 2 张，64 个只有 1 张，0 个地点完全无图。封面文件齐全，但“默认至少三张”当前只有 45 个地点能满足。
3. **211 张中有 58 张没有项目内可核查的来源/许可台账。** `PHOTO_MANIFEST.csv` 只有 153 行，且 153 行全部来自 Wikimedia Commons、许可字段齐全；多出的 58 张都是各地点 `01.webp`，生成时间集中在 2026-11-02，未进入 manifest，其中 49 张在 `places.json` 里连来源 URL 都是 `not_found`。不能把它们当作“已确认授权素材”。
4. **Android 离线资源链本身是通的，但构建对缺图是静默的。** 构建把 `docs/成果整理/Hainan-Travel-Guide/images` 复制进 APK `assets/img`，本机 `LocalServer` 提供 `/v12/img/`；当前 0.9.12/vc80 APK 实测含 211 张，页面文件哈希与源码一致。但图片目录被 `.gitignore` 排除，`build.gradle` 在目录不存在时直接跳过复制且不报错；`0.9.1-vc69` APK 即为 0 张图片。换机、fresh clone 或素材目录缺失时，会构建出“列表封面全 404”的包而构建成功。
5. **私有地点存在两条数据链，媒体没有打通。** 卡片式私有地点（`cards.kind=place`，`pv-*`）可带 `media`；`private_places` 表中的私有地点没有 `media/cardMedia/photos`，列表会拼出必然失败的 `/v12/img/Haikou/pv-.../01.webp`，详情图库同样为空。本机数据库只读副本中确有 1 条这样的 `pv-<slug>` 记录，且媒体表无对应行。

## 二、地点与图片清点

### 2.1 公开地点数据

`socialmate-v1.2/index.html:602` 内嵌 `D.places`，共 115 条，ID 1–115 唯一，7 个城市目录，全部 `photos:[1,2,3]`。

| 城市目录 | 地点数 | 实际 webp | 满 3 张 | 2 张 | 仅 1 张 |
|---|---:|---:|---:|---:|---:|
| Haikou | 60 | 94 | 17 | 0 | 43 |
| Sanya | 13 | 27 | 6 | 2 | 5 |
| Wenchang | 10 | 19 | 4 | 1 | 5 |
| Wanning | 10 | 19 | 4 | 1 | 5 |
| Other_Hainan | 8 | 21 | 6 | 1 | 1 |
| Qionghai | 7 | 15 | 4 | 0 | 3 |
| Lingshui | 7 | 16 | 4 | 1 | 2 |
| **合计** | **115** | **211** | **45** | **6** | **64** |

- 目录覆盖：115 个期望目录全部存在，无缺目录、无孤儿目录。【实测】
- 封面覆盖：115 个地点全部存在 `01.webp`，无地点完全无封面。【实测】
- 文件完整性：211 个文件全部为 RIFF/WEBP 头，无 0 字节、无小于 5KB 的异常文件。【实测】
- 总大小：56,325,686 字节，约 53.7MB（`du -sh` 为 54M）。【实测】

### 2.2 槽位缺口

- 计划槽位：115 × 3 = 345。
- 实有：211，缺 134。
- 缺 `02.webp`：64 个；缺 `03.webp`：70 个；缺 `01.webp`：0 个。
- 只有 1 张的 64 个地点中，海口占 43 个；海口也是“满 3 张”比例最低的城市（17/60）。

### 2.3 与历史交付台账的口径差异

| 来源 | 声称数量 | 说明 |
|---|---:|---|
| `docs/成果整理/Hainan-Travel-Guide/README.md:14` | 152/345 | 旧版说明，未更新 |
| `docs/成果整理/Hainan-Travel-Guide/docs/DELIVERY_REPORT.md:12` | 153/345 | V3.0 交付时口径 |
| `docs/成果整理/Hainan-Travel-Guide/dist/Hainan_115_Real_Photo_Guide/PHOTO_COVERAGE.md:4` | 153/345 | 与 dist 内 153 个 webp 一致 |
| 当前 `images/` 目录 | **211** | 实有文件数，比 dist 多 58 张 |

58 张增量全部是 `NNN/01.webp`；把 `PHOTO_COVERAGE.md` 的“暂无合规照片”58 个地名与这 58 个无 manifest 记录的地名逐名比对，结果为 58/58 完全一致，可确认是给原缺图地点各补了一张封面。`dist` 内的 153 张与根目录 153 张完全重合，无 dist 独有文件。【实测】

## 三、取图链路对照（公开地点 vs 私有地点）

### 3.1 公开地点列表封面

- 路径拼接：`/v12/img/<cityFolder>/<id 三位>/01.webp`，见 `socialmate-v1.2/index.html:978`。
- 失败处理：`onerror` 给卡片加 `noimg` 并移除 `<img>`，显示首字占位，见 `:987`；占位样式见 `:23-27`。
- 结论：封面链路与磁盘目录结构一致，115 个地点都有 `01.webp`，理论上都能显示；是否在某一台手机上实际显示，仍需真机确认（见“不确定事项”）。

### 3.2 公开地点详情

- `openDetail()` 的地点分支用 `${smGallery(kind,id)}` 插入图片区，见 `socialmate-v1.2/index.html:1950`。
- `smGallery()` 的实现是：`window.__smCards.byId(kind,id)` → 取 `c.media`；`media` 为空直接 `return ''`，见 `:968`。
- `smCardById()` 只查 `SMC[kind]`，见 `:4139`；`SMC` 由 `/v12/api/cards` 填充，见 `:4078`、`:4118-4127`；服务端 `/v12/api/cards` 只返回用户卡片，见 `android-poc/app/src/main/java/app/socialmate/dualmic/local/LocalServer.java:385-392`。
- 115 个公开地点是 `D.places` 的内嵌数据行（`:602`），从未写入 `SMC.place`。
- 因此对公开地点：`byId('place','1')` 为 `undefined` → `media=[]` → `smGallery` 返回空字符串 → 详情页没有图片区。**这不是图片 404，而是根本不渲染 `<img>`。**

### 3.3 聊天分享卡里的地点图片

- `vsShareData()` 对地点使用 `p.photos` 生成 3 个 URL：`/v12/img/.../0<slot>.webp`，见 `socialmate-v1.2/index.html:1146-1147`。
- `originView()` 渲染 `<figure><img ...><figcaption>i / total</figcaption>`，见 `:1194-1196`；图片失败只隐藏 `img` 并给 figure 加 `noimg`，`figcaption` 仍按 3 张计数。
- 结论：公开地点的多图能力只存在于聊天分享/原资料视图，且不检查文件是否存在；详情页没有复用这条逻辑。

### 3.4 私有地点

存在两条链：

1. **卡片式私有地点（`cards` 表，`kind=place`，ID `pv-*`）**
   - `smCardMerge()` 把卡片合并进 `D.places`，并附带 `cardMedia`、`coverMediaId`，见 `socialmate-v1.2/index.html:4082-4092`。
   - 列表封面通过 `smCardCover()` 读取卡片媒体，随后用带 `x-archive-token` 的请求取 blob，见 `:967`、`:4156-4172`。
   - 详情图库可通过 `smGallery()` 读到同一 `media`，理论上可用。
2. **`private_places` 表的私有地点**
   - 合并函数只写入 `id/cnName/enName/city/category/cn/en/photoNote/location/map/private`，**不写 `photos`、`cardMedia`、`coverMediaId`**，见 `:2913-2921`。
   - 列表封面 `smCardCover(p)` 返回 `null`，回落到公开路径；`id` 为 `pv-...`，`padStart(3,'0')` 后仍是 `pv-...`，拼出 `/v12/img/Haikou/pv-.../01.webp`，见 `:978`。
   - 该路径在 Android `LocalServer` 会因 assets 中无此文件返回 404（`LocalServer.java:571-575`）；在 Mac 网关会因不匹配 `\d{3}` 返回 400（`socialmate-prototype/ai-gateway/server.mjs:1484-1485`）。
   - 详情图库同样走 `byId('place','pv-...')`；副本中没有同 ID 卡片，故图库为空。若同时存在同 ID 的 `cards(kind=place)`，行为另见“不确定事项”第 6 条。
   - 本机数据库只读副本中该私有地点记录存在，但其 JSON 的 `photos=[]`、`cardMedia=null`、`coverMediaId=null`，媒体表无对应行。【快照】

**ID 结论**：公开地点用数字 ID + 3 位补零；私有卡片用 `pv-<slug>`；`private_places` 也用 `pv-<slug>`，但它与 `cards` 不是同一张表，媒体不共享。当前没有统一的“图片来源”解析函数，封面、详情、分享各自拼路径。

## 四、可证实的缺图原因

### R1（P0，静态可证）公开地点详情从不读取公开图片

- 证据：`socialmate-v1.2/index.html:968`、`:1950`、`:4078`、`:4139`。
- 影响：所有 115 个公开地点，无论磁盘有多少张图，详情页都没有图库。用户看到的“列表有封面、详情没图”与现象完全一致。
- 边界：这不是图片文件缺失，也不是权限问题；即使把 345 张补齐，当前详情仍不会显示。

### R2（P0，实测可证）70 个地点不足 3 张

- 证据：211 个文件；缺 64 个 `02.webp`、70 个 `03.webp`；45/115 满 3 张。
- 影响：计划要求“默认至少三张（已有多少有效就显示多少）”；当前只有 45 个地点能达到 3 张，64 个只能显示 1 张，6 个显示 2 张。若新图库按 `p.photos` 无条件请求 3 张，70 个地点会出现破图/空框。
- 相关数据不一致：所有地点都写死 `photos:[1,2,3]`（`:602`），但该数组表示“计划槽位”，不是“磁盘实有文件”。

### R3（P0，快照可证）`private_places` 私有地点没有媒体字段

- 证据：`:2913-2921` 只合并文本字段；本机数据库副本中的 `pv-<slug>` 记录无 `photos/cardMedia/coverMediaId`，媒体表无对应行。
- 影响：此类私有地点的封面请求必然失败（Android 本机 404；Mac 网关 400），随后显示首字占位，详情无图。若用户把“私有地点”理解为可配图卡片，当前数据链没有兑现。
- 注意：通过“新建地点卡片”创建的 `pv-*` 卡片不属于这条链，它有 `media`，两者需要在设计上合并或明确区分。

### R4（P1，实测可证）构建对缺图静默通过

- 证据：`android-poc/app/build.gradle:17`（仅当目录存在才声明输入）、`:28-30`（仅当目录存在才复制）；`.gitignore:56` 排除整个 `images/`。
- 实测：`release/SocialMate-0.9.1-vc69-debug.apk` 的 `assets/img/` 为 0 个；`0.9.12-vc80` 为 211 个。
- 影响：fresh clone、换机、清理本地忽略目录后构建，APK 可以成功产出但没有任何图片；列表全部回落首字占位。这个机制足以解释“某个原型/某个环境里全部缺图”，但不能解释当前 `0.9.12` 详情页缺图（R1 才是当前主因）。

### R5（P1，静态可证）分享卡无条件请求 3 张

- 证据：`:1146-1147` 由 `p.photos` 生成 3 个 URL；`:1194-1196` 每张都输出 `i / total`。
- 影响：64 个只有 1 张的地点会出现 1 张真图 + 2 个空 figure，6 个只有 2 张的地点出现 1 个空 figure；字幕仍按总数显示 `1 / 3`、`2 / 3`、`3 / 3`。未做视觉验收，但 DOM 行为可直接从代码判定。

### R6（P2，静态可证）当前卡片图库不是轮播/全屏

- 证据：`.smcgal` 只有 CSS grid（`:595-596`），`smGallery()` 只输出 `<img>`（`:968`）；全文件搜索 `smcgal` 仅这 3 处，未发现点击放大、左右滑动、全屏层或手势处理。
- 影响：即使把公开地点接进 `smGallery`，得到的也是缩略图网格，不满足计划里的“左右滑动、点击全屏、上一张/下一张”。

### R7（P2，静态可证）缺图时没有“真实缺图提示”

- 证据：列表 `onerror` 只显示首字占位（`:987`），详情直接不渲染图片区（`:1950`）。
- 影响：计划要求“无图/损坏时显示真实缺图提示，不静默隐藏整个图库”；当前是静默降级，用户无法区分“这个地点只有 1 张”与“图片加载失败”。

## 五、图片来源与许可的可核查状态

### 5.1 有台账的 153 张

- `docs/成果整理/Hainan-Travel-Guide/data/PHOTO_MANIFEST.csv` 共 153 行，`status` 全部为 `approved`。
- 许可分布：CC BY-SA 4.0 57、CC BY 3.0 38、CC BY-SA 3.0 27、CC0 22、CC BY 4.0 6、CC BY-SA 2.0 2、CC BY 2.0 1。
- `source_page` 域名 153/153 为 `commons.wikimedia.org`；含 `creator`、`license_or_permission`、`attribution`、`sha256`。
- 这些是“台账记录”，本次未逐条访问外网复核页面内容；只能确认项目内有完整字段，不能替代在线复核。【未验证】

### 5.2 无台账的 58 张

- 211 − 153 = 58；58 张全部是某个地点的 `01.webp`，与 V3 报告中“58 处暂无合规照片”的数量一致。
- 在 `places.json` 中对应槽位的状态：49 张为 `not_found`（`source_url=null`），9 张为 `linked_to_online_source_not_downloaded`（有新闻/门户链接，但明确标注“未下载”）。
- `places.json` 的 `local` 字段写的是 `images/<city>/<id>/01.jpg`，磁盘实际是 `.webp`；说明它也不是这批 webp 的下载台账。
- 9 个有链接的来源域名包括 `finance.sina.com.cn`、`hypebeast.com`、`hi.people.com.cn`、`hnhk.wenming.cn` 等；这些页面是否有再分发许可，项目内没有记录。**不能据此判断侵权，也不能据此判断可用。**
- 58 张的 mtime 集中在 2026-11-02 00:15–08:00，晚于 V3 打包（2026-10-31）；项目内未找到对应的下载脚本、日志或授权清单。

### 5.3 台账口径建议

- 在接入详情图库前，必须先把 58 张逐张补进统一 manifest（来源页、作者、许可、用途、校验和）；补不齐的应从正式包剔除或明确标注“来源待核”，不能用“文件已在目录里”当作授权。
- 当前 `README.md:14` 的 152、交付报告的 153、实际的 211 三个口径并存，需收敛到一个以文件系统/ manifest 为准的权威数字。

## 六、Android 离线资源链路核查

链路与实测结果：

| 步骤 | 位置 | 核查结果 |
|---|---|---|
| 构建复制页面 | `android-poc/app/build.gradle:24` | `socialmate-v1.2/index.html` → `assets/v12/index.html` |
| 构建复制图片 | `build.gradle:28-30` | `images/` → `assets/img/` |
| APK 实际内容 | `release/SocialMate-0.9.12-vc80-debug.apk` | `assets/img/` 211 个；`assets/v12/index.html` 存在 |
| 页面一致性 | `unzip -p ... assets/v12/index.html \| shasum -a 256` | `d3f9ae95…a6c1c`，与源码相同 |
| 图片一致性 | 抽检 `Haikou/001/01.webp` | APK 内与磁盘同为 `13ae0cce…17eaa` |
| 本机页面路由 | `LocalServer.java:51`、`:221-223` | `GET /v12` 返回 `ASSET_PAGE` |
| 本机图片路由 | `LocalServer.java:565-577` | `GET /v12/img/...` → `assets.open("img/"+rel)`；缺失返回 404 |
| 页面 origin | `AsrActivity.java:1070-1078`、`:1086-1087` | 本机模式加载 `localBaseUrl + /v12` |
| 子资源放行 | `AsrActivity.java:885-895` | 同 origin 放行，跨 origin 返回空响应 |
| 网关（Mac/PWA） | `socialmate-prototype/ai-gateway/server.mjs:1480-1496` | 从 `docs/成果整理/Hainan-Travel-Guide/images` 读取；路径必须匹配 `<city>/\d{3}/<file>.webp` |

结论：

1. 对公开数字 ID，Android 离线链是完整的：APK 内有图、路由可读、同源不被拦截、封面路径匹配。
2. 对 `pv-*` 私有 ID，Android 路由允许该字符串但没有对应 asset，返回 404；Mac 网关更早一步以 400 拒绝，因为不匹配三位数字目录。两个运行环境的错误码不同，前端却统一按“图片失败”处理。
3. 构建没有“图片数量下限”断言：`build.gradle` 未检查 `assets/img` 文件数，也未在复制后校验；`build-apk.sh` 未发现 `images/img/webp/211` 相关断言。故 R4 的静默缺图是结构性的。

## 七、旧 V5 原型核查

- 在本项目内按文件名搜索 `*v5*`、`*V5*`：无结果。【实测】
  - `find . -type f \( -iname "*v5*" -o -iname "*V5*" \) -not -path "*/node_modules/*" -not -path "./.git/*"`
- 在 git 全历史文件名中搜索 `(^|/)v5`、`v5[._-]`：无结果。【实测】
  - `git log --all --pretty=format: --name-only | sort -u | grep -iE "(^|/)v5|v5[._-]"`
- 在本机常见用户目录做有界文件名搜索，也没有 SocialMate/海南/V5 命名的 HTML。【实测】
- 仓内最接近的独立原型是：
  - `docs/plan/ALW001-N05-V1.5-Chat-UX/prototype.html:6`，标题“ALW-001 聊天页 V1.5 原型”，只做聊天页。
  - `docs/plan/ALW001-N05-V1.5.2-Chat-Compact-Layout/prototype.html:6`，标题“N05 V1.5.2 聊天录音页 · 布局草图 v2”，只做聊天布局。
  - `docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/prototype/interactive-prototype.html:39`，有海南地点详情，但只有文字卡片，没有照片/图库实现。

结论：**项目内不存在可确认的“V5 独立 HTML 原型”文件，无法核查它的缺图原因。** 当前正式版的详情缺图由 R1 独立造成，不能归因于 V5 原型；若 V5 在项目外，需要用户提供文件路径后再单独比对。

## 八、与计划的差异清单

| 计划要求 | 当前可核查状态 | 证据 |
|---|---|---|
| 列表封面与详情共享同一真实图片 ID/数据源 | 未达成：封面 `/v12/img`，详情 `__smCards.media`，分享 `p.photos`，三条路径 | `index.html:978`、`:968`、`:1146-1147` |
| 详情默认至少 3 张，已有多少显示多少 | 未达成：公开详情 0 张；数据上仅 45/115 有 3 张 | `:1950`、`:968`；211 文件/345 槽位 |
| 左右滑动、点击全屏、上一张/下一张 | 未达成：仅有 grid 缩略图，无交互代码 | `:595-596`、`:968` |
| 无图/损坏显示真实缺图提示 | 未达成：列表首字占位，详情不渲染图库 | `:987`、`:1950` |
| 封面与详情不拿其他地点图片冒充 | 代码未发现跨地点复用；但 58 张来源未登记，无法排除 | `PHOTO_MANIFEST.csv` 153 行；`places.json` |
| 复用既有 211 张，不重复下载 | 目录已有 211 张，但详情未使用；58 张来源不明 | 本报告 2.1、5.2 |
| 私有地点关联既有图片 | 卡片式可带 media；`private_places` 无 media | `:2913-2921`；本机数据库副本 |
| Android 离线可看图 | 公开数字 ID 链路通；当前 APK 含 211 张 | `unzip -l`；`LocalServer.java:565-577` |

## 九、不确定事项

1. **当前 0.9.12 真机上的列表封面是否全部正常显示，未在本轮实测。** 代码和 APK 内容支持“应显示”，但没有本轮真机截图；`docs/plan/ALW001-N05-V1.7-R2/evidence/04-offline-hainan.png` 显示某地点为首字占位，但该截图时间为 2026-11-06 07:49，早于 vc70 重打包（2026-11-07 08:27），且 R2 报告自述“未做图片视觉审查”，不能拿它证明当前版本失败。
2. **58 张无台账图片的来源、作者、许可、地点正确性均未核实。** 只能确认文件存在且是可解码 WebP；不能确认它们是否确实拍摄于对应地点，也不能确认是否允许再分发。
3. **58 张是否由某个一次性脚本从新闻页下载并转 webp，项目内没有记录。** `places.json` 的 `status` 仍写“未下载”，与实际文件矛盾；无法还原处理过程。
4. **153 张 manifest 图片的在线许可页未逐条访问。** 本报告只核对项目内台账字段，未把台账当成已完成的线上法律核验。
5. **V5 原型文件不存在于本项目。** 其缺图原因无法证实；如文件在项目外，需要另行提供。
6. **`private_places` 与 `cards(kind=place)` 同 ID 时是否会重复渲染或取错记录，未做运行时验证。** 代码上 `smMergePrivatePlaces()` 与 `smCardMerge()` 都会向 `D.places` 推送 `pv-*`，数据同时存在时存在重复项风险，需用真实数据复现。
7. **分享卡 3 张中缺 2 张时的实际视觉表现未截图验证。** R5 是从 DOM 生成逻辑推断，未在真机确认空 figure 的高度与观感。
8. **Android 各厂商 WebView 对 blob URL、懒加载和同源图片的差异未测试。** 本轮不涉及真机操作。

## 十、复现命令与结果

以下命令均为只读；在项目根执行。

```bash
# 1. 图片总数与格式
find "docs/成果整理/Hainan-Travel-Guide/images" -type f -name "*.webp" | wc -l
# → 211
find "docs/成果整理/Hainan-Travel-Guide/images" -type f | sed 's/.*\.//' | sort | uniq -c
# → 211 webp
du -sh "docs/成果整理/Hainan-Travel-Guide/images"
# → 54M

# 2. 期望槽位 vs 实有（解析 index.html 内嵌 D.places）
python3 - <<'PY'
import json,os
s=open('socialmate-v1.2/index.html',encoding='utf-8').read()
i=s.find('"places": [')+len('"places": ')
depth=0;instr=False;esc=False
for k in range(i,len(s)):
    ch=s[k]
    if instr:
        if esc: esc=False
        elif ch=='\\': esc=True
        elif ch=='"': instr=False
        continue
    if ch=='"': instr=True
    elif ch=='[': depth+=1
    elif ch==']':
        depth-=1
        if depth==0: end=k+1;break
places=json.loads(s[i:end])
root='docs/成果整理/Hainan-Travel-Guide/images'
missing=[(p['id'],'%02d.webp'%n) for p in places for n in p['photos']
         if not os.path.exists(os.path.join(root,p['cityFolder'],'%03d'%p['id'],'%02d.webp'%n))]
print('places',len(places),'slots',sum(len(p['photos']) for p in places),'missing',len(missing))
# → places 115 slots 345 missing 134
PY

# 3. 台账 vs 实际
python3 - <<'PY'
import csv,os
rows=list(csv.DictReader(open('docs/成果整理/Hainan-Travel-Guide/data/PHOTO_MANIFEST.csv',encoding='utf-8-sig')))
print('manifest rows',len(rows))
# → 153
PY
find "docs/成果整理/Hainan-Travel-Guide/dist" -type f -name "*.webp" | wc -l
# → 153（根目录比 dist 多 58 张，全部为 01.webp）

# 4. APK 离线资源
unzip -l release/SocialMate-0.9.12-vc80-debug.apk | grep "assets/img/" | wc -l
# → 211
unzip -l release/SocialMate-0.9.1-vc69-debug.apk | grep "assets/img/" | wc -l
# → 0
unzip -p release/SocialMate-0.9.12-vc80-debug.apk assets/v12/index.html | shasum -a 256
shasum -a 256 socialmate-v1.2/index.html
# → 两者均为 d3f9ae95cfae46795aedb9d04afca5660e7cc73eb4a0fc44f129f4f2232a6c1c

# 5. 图片目录是否入库
git check-ignore -v "docs/成果整理/Hainan-Travel-Guide/images/Haikou/001/01.webp"
# → .gitignore:56:docs/成果整理/Hainan-Travel-Guide/images/

# 6. 设备数据库副本中的私有地点
# 该副本含真实私有地点名称与 ID，本轮仅做只读核对，不在此复现查询命令与具体记录。

# 7. V5 文件搜索
find . -type f \( -iname "*v5*" -o -iname "*V5*" \) -not -path "*/node_modules/*" -not -path "./.git/*"
# → 无输出

# 8. 58 张封面与 V3 缺图名单逐名比对
python3 - <<'PY'
import re,csv,json,os
txt=open('docs/成果整理/Hainan-Travel-Guide/dist/Hainan_115_Real_Photo_Guide/PHOTO_COVERAGE.md',encoding='utf-8').read()
sec=txt.split('## 暂无合规照片的地点（按城市）')[1].split('## 只有 1–2 张的地点')[0]
names=set()
for line in sec.splitlines():
    if line.strip().startswith('- **'):
        for n in re.split('[、，,]',line.split('：',1)[1]):
            if n.strip(): names.add(n.strip())
man=list(csv.DictReader(open('docs/成果整理/Hainan-Travel-Guide/data/PHOTO_MANIFEST.csv',encoding='utf-8-sig')))
manc={(int(r['place_id']),r['slot']) for r in man}
places=json.load(open('docs/成果整理/Hainan-Travel-Guide/data/places.json',encoding='utf-8'))
un=set()
for p in places:
    ph=(p.get('photos') or [{}])[0]
    if str(ph.get('slot'))=='1' and (p['id'],'1') not in manc:
        f='docs/成果整理/Hainan-Travel-Guide/images/%s/%03d/01.webp'%(p['city_folder'],p['id'])
        if os.path.exists(f): un.add(p['name'])
print(len(names),len(un),'diff',len(names^un))
# → 58 58 diff 0
PY
```

关键静态位置：

- `socialmate-v1.2/index.html:968`：`smGallery` 只读卡片 `media`，无 `media` 返回空。
- `socialmate-v1.2/index.html:1950`：公开地点详情插入 `smGallery(kind,id)`。
- `socialmate-v1.2/index.html:4139`：`smCardById` 只查 `SMC`。
- `socialmate-v1.2/index.html:978`：列表封面拼 `/v12/img/.../01.webp`。
- `socialmate-v1.2/index.html:2913-2921`：`private_places` 合并不写媒体字段。
- `android-poc/app/build.gradle:17`、`:28-30`：图片目录存在才复制，无失败断言。
- `android-poc/app/src/main/java/app/socialmate/dualmic/local/LocalServer.java:565-577`：`/v12/img/` 从 APK assets 读取。
- `android-poc/app/src/main/java/app/socialmate/dualmic/AsrActivity.java:885-895`：同源子资源放行，跨源拦截。

## 十一、未完成项

1. 未做本轮真机验收：没有启动任何设备，没有截图证明当前 0.9.12 列表封面/详情图库的真实表现。
2. 未逐张视觉核验 211 张图片与地点的对应关系；未核验 58 张无台账图片是否错配。
3. 未在线复核 153 张 Wikimedia 源页与许可；未核验 9 个新闻/门户链接的授权状态。
4. 未还原 58 张增量图片的生成脚本与下载日志；项目内没有找到对应记录。
5. 未验证 `private_places` 与 `cards(kind=place)` 同 ID 时的运行时行为。
6. 未验证分享卡缺图时的实际视觉表现；未验证各厂商 WebView 的 blob/懒加载差异。
7. 未找到 V5 原型文件，无法完成其缺图原因的对照审计。

## 十二、建议（仅设计结论，未实施）

1. **先修详情取图，而不是先补图。** 为公开地点增加统一的 `placePhotos(place)` 解析：按 `cityFolder` + 三位 ID + 实际存在的 `01/02/03.webp` 返回可用 URL；封面、详情、分享都调用同一函数，杜绝三条路径各自拼。
2. **把“计划槽位”改成“实有清单”。** 构建时或运行前扫描 `images/<city>/<id>/`，生成每个地点的 `availablePhotos`；不要把 `photos:[1,2,3]` 当作文件一定存在。详情按实有数量显示，0 张时明确提示“该地点暂无照片”，不要静默隐藏整个区域。
3. **图库交互单独实现。** 轮播/全屏/手势/键盘/alt 文本需要新增视图层，不能复用当前 grid；全屏层应支持上一张/下一张和退出。
4. **先补 58 张的授权台账，再决定是否入正式包。** 未登记来源的图片不应进入用户可见的正式地点详情；如无法补齐，保留首字占位或使用明确标注的“待补图”。
5. **给构建加硬断言。** `copyWebAssets` 完成后检查 `assets/img` 的文件数/关键文件（例如 115 个 `01.webp`），不满足直接失败；至少输出可核对的计数，避免再次出现“构建成功但 0 张图”。
6. **统一私有地点模型。** 明确“私有地点”是否等同“地点卡片”；若等同，`private_places` 与 `cards(kind=place)` 应共用媒体字段/ID；若不等同，列表应识别 `pv-*` 且无媒体时直接显示明确的“未配图”，不再请求必然 404 的公开路径。
7. **分享卡按实有图片生成。** 过滤不存在的 URL，标题按实际可用张数计数，避免 `1 / 3` 但只有 1 张的错位。
