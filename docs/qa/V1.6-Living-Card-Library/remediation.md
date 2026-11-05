# V1.6 整改记录（对应上一轮 P0/P1）

- 日期：2026-11-05 ｜ 版本：0.9.1/69（前端/后端整改，无原生改动，未重装 APK）
- 原则：只修审查确认的问题；不新增功能；不 commit/push/部署。

## P0 整改

| # | 问题 | 处理 | 证据 |
|---|---|---|---|
| P0-1 | 并发写临时文件冲突 | `atomicWrite` 临时名加自增序号 + `randomBytes(6)`；同目标路径进程内串行队列（`withCardLock`），覆盖 create/update/softDelete/restore/media | `private-cards.mjs:83-111,165`；并发 10 次 update 最终 revision 连续、无 ENOENT |
| P0-2 | restore 覆盖同 id 新卡 | 锁内先查在库，存在则 `409 RESTORE_CONFLICT` + `currentRevision`，不写不删 trash | `private-cards.mjs:329-352`；HTTP 实测 409，新卡内容保留 |
| P0-3 | 图片假成功 | 三类列表卡与详情渲染封面/图库（blob URL）；上传串行 + 429 自动重试（最多 3 次）；失败不关弹层并留失败文件；媒体限流去掉 200ms 间隔；列表失败显示「离线：显示上次数据 / 读取失败 · 重试」 | 前端 `smCardCover/smGallery/smCardUploadOne/smCardSyncList`；真机：列表 1 张封面、详情 3 张图、连续 3 图无 429 |
| P0-4 | 双编辑入口回滚 | 详情只保留「编辑」（统一卡片编辑），移除「编辑这段话」UI 入口（`editStory` 保留但无入口） | 真机详情 `编辑这段话=false`、`编辑=true` |
| P0-5 | 分享缺失 | 详情新增「复制中文 / 复制英文 / 分享图片」；图片优先 `navigator.share`，不可用则文本兜底 | 真机详情三个按钮可见；有图时「分享图片」出现 |

## P1 整改

| # | 问题 | 处理 |
|---|---|---|
| 1 | PATCH 可省略 revision | 缺 revision → `400 REVISION_REQUIRED`；前端保存前若无缓存先 GET 单卡取 revision（`V1.1-baseline.html:4115-4126`） |
| 2 | deleteMedia 路径穿越 | 只按 `mediaId` 正则 + 目录 readdir 匹配，`lstat` 普通文件、父目录必须等于 mediaDir |
| 3 | readMedia 符号链接 | `lstat` 拒绝 symlink；`realpath` 前缀校验 |
| 4 | draft-en 无鉴权 | 要求 `x-archive-token`（401），前端已带头 |
| 5 | 每图探测归档令牌 | 30s TTL 缓存「有效」结果，失败不缓存，缓存实例级不跨实例 |
| 6 | 列表失败静默 | 失败不置 loaded，记录 error 并重绘；有数据提示「离线：显示上次数据」，无数据提示失败；重试刷新三类 |
| 7 | 字号低于下限 | `.mobilebar button` 11.5→15px、`.tag/.previewtag/.formlabel/.n05mini` →15px；`.cardbottom small` 保持 14px（非关键元信息） |
| 8 | 新路由零测试 | 新增 12 条（鉴权、revision、恢复冲突、媒体、并发、draft-en、私有隔离、坏 JSON），后端全量 158 通过 |
| 9 | `__errs` 假证据 | 改为 CDP 注入监听并如实标注「临时注入」；产品内不埋点 |
| 10 | 报告与事实不符 | 本文件与 `FINAL-REPORT.md` 修正：测试卡在回收站、媒体 429 为整改前状态 |
| 11 | 非 WiFi 切 Tailscale 后 origin 变化 | 未验证，保留为 P1（需真机断网确认） |
| 12 | 覆盖层入口 / 备份恢复 | 仍未交付，保留为 P1 |

## 真机回归（整改后）

- Note 11 5G，0.9.1/69，页面最新构建。
- 关于我：列表封面图 1 张（blob），无错误条；详情 3 张图、复制中文/英文/分享图片可见。
- 编辑保存：revision 5→6，3 张图保留，提示「已保存」。
- 连续上传 3 图：`已上传 3/3`，无 429。
- 失败提示（模拟接口 503）：显示「离线：正在显示上次数据 重试」。
- 底部导航字号 computed `15px`。

## 仍未完成

- 相机拍照、覆盖层前端入口、备份/恢复、393×852、真实相册选图人工点选、深色主题截图。