# V1.6 活资料库 · 独立复审（re-review）

- 日期：2026-11-05 ｜ 复审人：独立 re-reviewer（只读）
- 复审对象：工作区未提交改动（`private-cards.mjs`、`server.mjs`、`server-routes.test.mjs`、`socialmate-v1.2/index.html`）
- 只读声明：未修改任何源码/测试/文档（唯一新增文件即本报告）；未执行 git add/commit/push；未重启或停止 8790/8791/8781/8782；未改动手机应用。
- 方法：不采信整改说明，独立跑测试 + 临时目录/随机端口独立实例做真实 HTTP 验证 + 前端源码核对 + 真机只读 CDP 取证。

## 0. 环境与基线

| 项 | 实测 |
|---|---|
| 全量测试 | `cd socialmate-prototype/ai-gateway && node --test *.test.mjs` → **tests 158 / pass 158 / fail 0**（原 146，新增 12） |
| 独立实例 | `mktemp -d` 作 `SM_PRIVATE_CARDS_DIR` 等全部存储根，随机端口，假归档客户端；**未碰 `SocialMate-Data`，未占 8791** |
| 运行实例版本 | 8791 pid 49409 启动 23:26:35，晚于 `server.mjs`(22:50)、`private-cards.mjs`(22:53) 的修改 → 运行实例已加载后端整改；`/v12` 页面由 8791 提供且含新前端 |
| 真机 | Redmi Note 11 5G `WGBMXWDIAIFMPFCQ`，页面 `http://192.168.31.61:8791/v12`，`scripts/sm-cdp.mjs --port 9223`（复用已有 forward，未新建、未清理他人映射） |

## 1. 原 P0 逐条判定

### P0-1 并发写数据错乱 —— **已关闭**

代码：`private-cards.mjs:83-95` 临时名 = `.<base>.<pid>.<自增>.<randomBytes6>.tmp`，失败清理；`97-109` 按目标文件路径串行队列；`276-284` create 的查重+写入在锁内；`295` update、`319` softDelete、`332` restore、`396` addMedia、`438` setCover、`480` deleteMedia 全部入锁。

独立实例实测（真实 HTTP）：

```text
并发 10 次 PATCH（同一 revision）: 200×1 / 409(REVISION_CONFLICT)×9 / 其他 0
落盘 title = 唯一成功响应 title（responseMatchesDisk=true），final revision=2
stories/ 目录 .tmp 残留 = []
并发 5 张图: 5×200，media=5，cover 已设
并发 5 次同名 create: 200×5，id 全唯一（c-xxx / -2..-5），磁盘 5 条，无 .tmp
```

### P0-2 restore 覆盖同 id 在库卡 —— **已关闭**

代码：`private-cards.mjs:335-341` 锁内先读在库文件，存在即 `409 RESTORE_CONFLICT` + `currentRevision`，不写不删回收站。

实测：删除→同 id 新建「新卡」→ restore：

```text
restore = 409 RESTORE_CONFLICT，currentRevision=1
restore 后 live title = 新卡（未覆盖）；trash/story/r1.json 仍存在
```

### P0-3 图片假成功 —— **已关闭**

- 列表封面：`index.html:965` `smCardCover`；`967` appCard、`984` placeCard（私有卡不再拼公开路径）、`991` storyCard 均渲染 `img[data-smc-card]`。
- 详情图库：`index.html:1940` 三类详情插入 `smGallery`，`4010-4025` 用 blob URL 填充，`4034` paintDetail。
- 连续上传：`index.html:4159-4175` 429 自动重试（最多 3 次，读 `retryAfterMs`）；`4182-4216` 逐张串行、失败文件保留在选择框。
- 失败不静默：`4147-4150` 有失败即**不关闭弹层**并提示「已保存 N 张，失败 M 张」；`4027-4046` 列表读取失败显示「离线：显示上次数据 / 读取失败 + 重试」。
- 实测：独立实例连续 5 张全 200（无 429），列表返回 cover，`GET /v12/media/...` 200 `image/png`，无令牌 401。
- 真机只读取证：

```text
关于我列表 img[data-smc-card]: src=blob:http://192.168.31.6…，display=block，337×180
详情图 3 张: 174×116，src 均为 blob；卡片 media=3，cover=m1803720b99123111
smCardErrHost 为空，无错误条
```

### P0-4 双编辑入口 —— **已关闭**

- `index.html:4382-4385` 详情管理区只有「编辑 / 删除」，无「编辑这段话」。
- 真机：详情按钮 = 复制英文、加入聊天参考、复制中文、复制英文、分享图片、编辑、删除；`document.querySelectorAll('[data-editstory]').length = 0`。
- `self.editThis`（645/807）仅剩未被引用的字典项；`editStory` 只由「新增」入口 `data-action="addstory"` 调用。
- 注意：详情出现两个「复制英文」（旧 `common.copyEn` 与新分享按钮），属 P2 体验瑕疵，非 P0 未关闭。

### P0-5 卡片分享缺失 —— **已关闭**

- `index.html:1939` `buttons()` 已挂 `shareActions`；`4318-4327` 生成「复制中文 / 复制英文 / 分享图片」；`4328-4368` 图片走 `navigator.share({files})`，不可用时复制英文+图片说明兜底；`2060` 已接线 `card-share-zh/en/img`。
- 真机详情三按钮可见，`[data-act=card-share-zh]` 数量 1，有图时「分享图片」出现。

## 2. 原 P1 抽查

| 抽查项 | 判定 | 证据 |
|---|---|---|
| PATCH 缺 revision 必须 400 | 已关闭 | `private-cards.mjs:298-302`；实测 400 `REVISION_REQUIRED` + `currentRevision=2`；测试 `server-routes.test.mjs:453-466` |
| deleteMedia 路径穿越 | 已关闭 | `private-cards.mjs:452-475` 只按 mediaId 正则 + readdir 匹配；实测把卡片 `media[0].file` 伪造成 `../../escape.jpg` 后删除，**外部 escape.jpg 仍在**，只删 media 目录内匹配文件；编码穿越 `..%2f..%2f` 直接 405 |
| readMedia 符号链接 | 已关闭 | `private-cards.mjs:495-524` lstat 拒绝 symlink + realpath 前缀校验；实测 symlink→/etc/passwd 返回 404 `MEDIA_NOT_FOUND`，响应体不含 passwd 内容 |
| `/api/ai/draft-en` 无令牌 401 | 已关闭 | `server.mjs:571-579`；实测 无令牌 401 `TOKEN_REQUIRED`、错令牌 401 `UNAUTHORIZED`、有令牌无 consent 403 `CONSENT_REQUIRED` |
| 媒体连续上传不 429 | 已关闭 | `server.mjs:282` `mediaRateLimit` 默认 `minGapMs:0`（上限 30/分钟）；实测 5 连传全 200；测试 `server-routes.test.mjs:518-538` |
| 新路由零测试 | 已关闭 | 新增 12 条（鉴权/写票/revision/恢复冲突/媒体/并发/draft-en/私有隔离/坏 JSON），断言为强断言（并发用例断言 5 worker 全部成功、revision=6、磁盘与响应一致） |
| 每图探测令牌 | 已关闭 | `server.mjs:336-355` 30s TTL、只缓存成功、实例级 Map |
| 列表失败静默 | 已关闭（代码层） | `index.html:4027-4046`；真实断网场景未复现 |
| 真实运行实例鉴权 | 已关闭 | `curl 8791/v12/api/cards?kind=app` 无令牌 → 401 `TOKEN_REQUIRED` |

## 3. 仍未关闭 / 遗留（不属本轮 P0，但影响完整验收）

1. **覆盖层前端入口、备份/恢复未交付**（`remediation.md:42-44` 自认；ACCEPTANCE CRUD-02 与 DATA-01 仍未达标）。
2. **Android 非 WiFi 切 Tailscale 后 origin/白名单** 未做真机断网验证（remediation P1-11）。
3. **字号下限**部分关闭：底部导航 15px、`.tag` 15px、`.n05mini` 17px 已达标（真机实测），但 `index.html:5` 的 `.hero p{font-size:12px}`、`.top .sup{font-size:9px}` 等仍在媒体查询中低于全局下限，未做全站审计。
4. **详情重复「复制英文」按钮**（旧 copyEn + 新 share-en），建议合并。
5. **双份页面仍有内容漂移**：`index.html` 与 `source/V1.1-baseline.html` 存在 4 处实质差异（`hainan.info` 文案、地点地图 query 用 `a.city` vs 固定「海口」、`profile-sync.js`/`demo-fixture` 注入、`setTab` 条件）。上轮 supervisor 称「漂移不成立」，实际存在，但不影响本次 P0/P1 结论。
6. **上传失败弹层不关** 仅源码核对，未在真机做破坏性复现（遵守只读约束）。

## 4. 整体结论

**可发布**：原 P0 共 5 条全部独立复核关闭（并发写、restore 覆盖、图片假成功、双编辑入口、分享），抽查的 4 条 P1（revision、路径穿越/符号链接、draft-en 鉴权、连续上传）也全部关闭，158 项测试全绿。

发布说明中须列明仍未关闭的 P1：覆盖层/备份恢复未交付、Tailscale origin 未验证、字号未全站达标、详情重复按钮、index/source 漂移。