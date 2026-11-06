# ALW-001 V1.7 本机架构实现说明

> 目标：Mac 关机/不可达时，手机仍能打开五 Tab 并读写本地资料。
> 本文只写已落地结构；未部署/未验证项见 `EXECUTION-REPORT-20261106.md`。

## 1. 启动路径

```
MainActivity（Launcher）
  └─ AsrActivity.onCreate
       ├─ LocalStore.get(this).importMigrationIfPresent()   // files/migration/backup.json 一次性导入
       ├─ LocalServer.start()                               // 127.0.0.1:随机端口
       ├─ buildUi() → showSocialMatePanel()
       │    └─ loadUrl(http://127.0.0.1:<port>/v12)
       └─ 后台 discoverLan(900) → 只更新 ASR/归档地址，不重建界面
```

- 页面 origin 默认本机；`ui_mode=mac` 时才回旧 Mac 页面。
- Mac 地址仍用于：配对 `/v12/api/pair/*`、短期令牌刷新、会话归档上传、ASR WebSocket。
- 页面不再依赖 Mac 加载；LAN 探测失败不阻塞首屏。

## 2. 本地 HTTP 路由（LocalServer）

| 方法 | 路径 | 数据源 |
|---|---|---|
| GET | `/v12` | APK assets `v12/index.html` |
| GET | `/profile-sync.js` | APK assets |
| GET | `/health` | 无鉴权健康检查 |
| GET | `/api/asr/live` | SSE，接收原生 ASR 事件广播 |
| GET/PUT | `/api/profile` | SQLite `profile` |
| GET/POST | `/v12/api/prefs` | SQLite `prefs` |
| GET/POST | `/v12/api/people` | `people` |
| GET | `/v12/api/people/:slug` | `people.detail_json` |
| GET | `/v12/api/people/:slug/prep` | 本地规则 |
| POST | `/v12/api/people/:slug/facts/revoke` | 删除单条事实 |
| POST | `/v12/api/people/:slug/facts/draft` | 本地规则拆分草稿 |
| POST | `/v12/api/people/:slug/facts/confirm` | 追加确认事实 |
| GET/POST | `/v12/api/favorites` | `favorites` |
| DELETE | `/v12/api/favorites/:id` | `favorites` |
| GET/POST | `/v12/api/cards` | `cards` |
| GET/PATCH/DELETE | `/v12/api/cards/:kind/:id` | `cards`（CAS revision + 软删） |
| POST | `/v12/api/cards/:kind/:id/restore` | 恢复 |
| POST/DELETE | `/v12/api/cards/:kind/:id/media` | `card_media` + 私有文件 |
| POST | `/v12/api/cards/:kind/:id/cover` | 封面 |
| GET/PUT | `/v12/api/cards/:kind/:id/override` | `card_overrides` |
| GET | `/v12/media/:cardId/:file` | `files/local-media/` |
| GET/POST | `/v12/api/private-places` | `private_places` |
| GET | `/v12/api/places/:id` | `place_records` + `practice_reports` |
| POST | `/v12/api/places/:id/records` | `place_records`（分段 + CAS） |
| POST | `/v12/api/places/match` | 115 地点本地匹配 |
| POST | `/v12/api/places/:id/records/:rid/blocks/:bid/practice` | `practice_reports` |
| GET | `/v12/history?session=` | `files/archive/*` |
| GET/POST | `/v12/api/local/backup` | 导出/导入 JSON |
| GET | `/v12/api/local/sync-state` | dirty 计数 |
| POST | `/v12/api/tts/synthesize` | 云端网关（未配置 503） |
| GET | `/v12/api/tts/audio/:id` | `cache/local-tts/` |
| POST | `/api/ai/translate\|draft-en\|analyze` | 云端网关（未配置 503） |

鉴权：数据接口必须带 `x-archive-token`（启动随机生成并注入 `sessionStorage`）；静态页面、`/health`、`/api/profile`、`/api/asr/live` 允许无 token；Host 必须是 `127.0.0.1:<port>`。

## 3. SQLite schema 1

```
people(slug PK, list_json, detail_json, created_at, updated_at, dirty)
cards(kind, id, json, revision, deleted_at, updated_at, dirty, PK(kind,id))
card_overrides(kind, id, json, revision, updated_at, PK(kind,id))
card_media(card_id, media_id, file, mime, bytes, sha256, PK(card_id,media_id))
favorites(id PK, en_norm UNIQUE, json, created_at, dirty)
private_places(id PK, json, revision, updated_at, dirty)
place_records(place_id, record_id, json, revision, updated_at, dirty, PK(place_id,record_id))
practice_reports(report_id PK, place_id, record_id, block_id, json, updated_at, dirty)
prefs(k PK, v, updated_at)
profile(id=1, json, updated_at)
manual_drafts(draft_id PK, slug, batch_id, raw_input, items_json, created_at, deleted_at)
sync_log(id, at, action, entity, entity_id, detail)
meta(k PK, v)
```

媒体文件：`files/local-media/<cardId>/<file>`。备份包：`backup.json` + `media/**`。

## 4. 迁移

```bash
# 1) Mac 8791 在线时导出（只读；不含密钥/令牌/会话原文）
node scripts/v17-export-migration-backup.mjs

# 2) 推到手机私有目录（一次性）
adb push .local/v17-migration-20261106/migration-backup.json /data/local/tmp/backup.json
adb shell run-as app.socialmate.dualmic mkdir -p files/migration
adb shell run-as app.socialmate.dualmic cp /data/local/tmp/backup.json files/migration/backup.json

# 3) 启动 App：自动导入一次并改名为 backup.imported-<ts>.json
```

图片：`.local/v17-migration-20261106/media/<cardId>/` 推到 `files/local-media/`。

## 5. 云端网关配置（未部署）

`shared_preferences: socialmate-config`

| key | 含义 |
|---|---|
| `cloud_gateway_url` | 云端网关基地址（https） |
| `cloud_gateway_token` | 设备短期令牌 |

未配置时本地服务对 AI/TTS 返回 503，不阻塞页面。

## 6. 回滚

1. 不卸载旧包、不清数据。
2. 需要回 Mac 模式：`adb shell run-as app.socialmate.dualmic` 修改 `shared_prefs/socialmate-config.xml` 的 `ui_mode=mac`，或走设置页模式切换。
3. 旧版本 APK：`release/SocialMate-0.9.1-vc69-debug.apk`；手机旧数据备份见 `.local/v17-migration-20261106/device-backup-v69.tar`。
4. 回滚前先用 `/v12/api/local/backup` 导出本机 JSON。