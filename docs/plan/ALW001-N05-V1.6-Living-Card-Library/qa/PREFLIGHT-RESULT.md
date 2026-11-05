# V1.6 T0 预检结果

- 时间：2026-11-05 18:40 ｜ 执行：主开发者（单工作区单改动人）
- 基线：Android 0.8.31/66 → 本轮性能修复后 **0.8.32/67**
- 设备：Note 11 5G（21091116AC），393×791
- 结论口径：只写本仓实测到的事实；未实测项标 NOT_RUN。

## 一、三页现状

| 页面 | 数据源 | 现有可写能力 | 缺口 |
|---|---|---|---|
| 海南 | `places-115.json`（115 条只读）+ `SocialMate-Data/PrivatePlaces/<id>/place.json`（现 1 条：`pv-hongcheng-lake-park`） | 私有地点仅 **创建**（`POST /v12/api/private-places`，需 `confirm:true`） | 无编辑/删除/恢复；无覆盖层；无图片上传；`photos[]` 只是字符串占位 |
| 关于我 | `SAV.stories`（localStorage `alw-preview-v1`）+ `Profile/current.json` 同步 | 浏览器端新建/编辑/删除故事、标签 | 无服务端 CRUD、无软删、无跨端一致性；`writeProfile` 整份覆盖、无版本号/锁 |
| 软件作品 | `D.apps`（构建期固定 51 条，含 steps 204） | 无 | 无用户新建/编辑/删除；无封面图；无私有层 |

## 二、后端可复用能力

- 鉴权三层：`peopleToken`（`x-archive-token` 探测）、`requireWriteAuth`（同源 + 一次性写票 `x-sm-write`）、限流（60s/12 次、400ms 间隔）。新增写路由必须同时接入。
- 原子写与权限：`profile-store.mjs`（0600 + tmp + rename）、`place-notes.mjs`（写后回读 sha256）、`people-store.mjs`（`.sm-write.lock` + 备份 + 409 冲突）。
- 路径安全：`private-places.mjs` 的 `ID_RE = /^pv-[a-z0-9][a-z0-9-]{1,31}$/` + `path.resolve` 前缀校验；图片路由 `/v12/img/` 白名单正则。
- 只读静态服务：`/v12`、`/v12/history`、STATIC 白名单已改 `no-cache` + ETag + gzip（本轮）。
- 测试：Node 内置 `node:test`，`node --test *.test.mjs`；`package.json` 无 `test` 脚本。

## 三、必须新增（T1–T5）

1. 统一私有卡片层：`SocialMate-Data/PrivateCards/{places,stories,apps}/<id>.json`，含 `kind/schema/revision/updatedAt/deletedAt/tags/media[]/cn/en/source`。
2. 覆盖层：对 115 地点/旧故事/旧软件的修改写 `overrides/<kind>-<id>.json`，原文件不动，可撤销恢复。
3. 软删与恢复：`deletedAt` + 回收站列表 + 恢复接口；真删需二次确认。
4. 冲突控制：`revision` + `If-Match` 语义，409 返回当前版本。
5. 媒体上传：无 multipart、无 magic 校验、无压缩/EXIF 剥离/缩略图，需自建（不引新依赖则用原生编码 + Node 端校验）。
6. AI 英文草稿：复用 `POST /api/ai/analyze` 的 DeepSeek 账本与 consent；失败只存中文。
7. 聊天关联：`suggestionsNow()` 目前只读 `D.places`/`SAV.stories`，需接入新卡片并可分享。

## 四、构建与验收链路

- 前端：`python3 socialmate-v1.2/build-v12.py` → `index.html`（apps 51 / steps 204 / places 115 / stories 5）。
- 服务：`bash socialmate-v1.2/service-all.sh {health|heal|up|down}`，端口 8790/8791/8781/8782。
- APK：`JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=~/Library/Android/sdk sh android-poc/build-apk.sh`。
- 真机取证：`adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>` + `node scripts/sm-cdp.mjs "<js>"`。
- 备份/恢复：现有 demo 命名空间有 `POST /demo/clear|restore` 与 `demo-store`；三类卡片备份需新做导出/导入。

## 五、本轮已完成（非 T1–T6 范围，但影响体验）

- `/v12` 596,198 → 168,999 字节（gzip），304 命中 0 字节。
- 地点详情/私有地点本地缓存；模拟断网仍显示红城湖 1 条记录/19 段。
- 非 WiFi 且配置局域网地址时自动改走 Tailscale（0.8.32/67）。
- 真机冷启动 `domContentLoaded=295ms`、TTFB 11ms。

## 六、未做 / 待下一轮

- T1–T6 全部未开始；当前只有本文件与 `qa/01-home.png`、`qa/ui-home.xml` 两份取证。
- 未新增任何卡片写接口，未改 `private-places` 行为，未动 115 源与旧故事/软件数据。