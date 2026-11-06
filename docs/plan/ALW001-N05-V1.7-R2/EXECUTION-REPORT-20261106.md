# ALW-001 V1.7 R2｜执行报告（2026-11-06）

> 状态：**PARTIAL / 总体不得标 DONE**
> 计划：`docs/plan/ALW001-N05-V1.7-R2-CrossValidated-Execution-20261105.md`
> 本轮只写本项目；未修改 P066、未部署云、未提升预算、未 commit/push。

## 0. 一句话结论

C0 盘点完成；C1 本机 origin、C2 SQLite 本地真源、C3 备份导出/恢复、C5 断网冷启动与五 Tab 读写均已真机跑通；C4 云网关本地 33 项测试通过但未部署。**4G/5G 真实 AI/ASR/TTS、300s、393×852、深色/拍照回归仍未执行**，因此 V1.7 整体不满足 DONE。

## 1. 完成与真机证据

### C0 真相源盘点（完成）

- `C0-真相源矩阵.md`（93 行）、`C0-前端调用与桥分类.md`（193 行）、`C0-可逆迁移与回滚方案.md`（167 行）、`C0-风险登记.md`（181 行，18 条：高 6 / 中 9 / 低 3）。
- 关键结论：离线根因是首屏 `loadUrl(Mac /v12)`；私有地点双写；37 个桥方法中 4 个缺方法级 origin 校验；`allowBackup=false` + origin 隔离使卸载/切 origin 会丢数据。

### C1 本机 origin（完成，真机通过）

- `LocalServer`：绑定 `127.0.0.1` 随机端口；Host/Origin/随机 token 三校验；从 assets 提供 `/v12`、`/profile-sync.js`；从 SQLite 提供 `/v12/api/*`、`/api/profile`、`/v12/media/*`；`/v12/history` 读本机归档。
- `AsrActivity`：启动顺序改为「起本地 origin → 立刻五 Tab」；LAN 探测只在后台更新 ASR/归档地址，页面 origin 不再切回 Mac。
- 构建：`copyWebAssets` 从 `socialmate-v1.2/index.html` 等生成 APK assets；版本 `0.9.2 / vc70`。
- 真机：`http://127.0.0.1:<随机端口>/v12`，冷启动 `TotalTime 666ms`，页面 `DOMContentLoaded 363ms / load 364ms`。

### C2 本地真源（完成，真机通过）

- `LocalStore`：SQLite schema 1（people/cards/card_media/overrides/favorites/private_places/place_records/practice_reports/prefs/profile/manual_drafts/sync_log）。
- `LocalSegments`：句数守恒、逐字回查、全文复原。
- 迁移：`scripts/v17-export-migration-backup.mjs` 只读导出（不含密钥/令牌/会话原文），计数 people 8 / cards 1 / favorites 1 / pv 1 / records 41 / practice 38 / media 3；手机 `files/migration/backup.json` 一次性导入成功。
- 手机旧数据备份：`.local/v17-migration-20261106/device-backup-v69.tar`（4.3MB）。

### C3 备份导出 / 恢复（数据面通过；SAF 选择器有 MIUI 交互问题）

- 导出：设置页「导出本机备份」→ SAF「保存」→ 生成 `SocialMate-backup-20261106-0739.smbak.zip`（**39,802 字节**），结构为 `backup.json`（422KB）+ `media/c-2585f970/` 3 张 JPG；已拉回 Mac 用 `unzip -l` 核对。
- 恢复：删除本机收藏（1→0）后，用同一备份包导入 → `imported 41 / media 3 / favorites 1`，收藏恢复。
- 导入入口：SAF 选择在 MIUI DocumentsUI 上点击文件未返回（文件被显示为 0 B / 不可选），已补内部投递入口 `POST /v12/api/local/import-file`（读 `files/import/backup.zip`），与 SAF 共用 `LocalBackup.importFrom`，用于同步/自动恢复与真机验证。
- **未满足**：ZIP 未加密；LAN 同步协议未实现。

### C5 断网冷启动（完成核心项）

验收条件：WiFi 关闭、移动数据关闭、Tailscale 已安装但无网络、8790/8791/8781/8782 全部停止、`adb reverse` 全部清除。

- 冷启动：`TotalTime 666ms`；页面 `DOMContentLoaded 363ms`、`load 364ms`。
- 五 Tab：软件 / 海南 / 聊天 / 关于我 / 人物 全部可打开。
- 人物：8 位，含 Daniel / Mia；摘要正常。
- 关于我：故事 1 项（红城湖散步）、收藏 1 条 / 上限 500。
- 海南：显示 116 / 116，私有红城湖在列。
- 地点详情：用户路径点击「查看分享卡 →」后显示「我的游玩记录 36 条 · 倒序 · 私有」，4 个请求全部 200。
- 搜索：输入「红城湖」→ 显示 1 / 116。
- 卡片 CRUD：创建 200 → PATCH revision 2 → 软删进回收站 → 恢复 live → 清理删除，全部 200。
- 截图：`docs/plan/ALW001-N05-V1.7-R2/evidence/01-offline-home.png` … `05-offline-place-detail.png`（5 张，约 270–335KB）。**未做图片视觉审查**：当前模型不支持图片输入，只确认文件非空。

### C4 云端薄网关（本地可运行，未部署）

- `cloud-gateway/`：11 路由、SQLite 原子预算、短期令牌、豆包 TTS、腾讯/P066 ASR 中继；`node --test test/*.test.mjs` → **33 pass / 0 fail**。
- 本地服务已接 AI 三件套与 TTS 代理；未配置时返回 503，不影响主页面。
- 未部署、未跑真实 DeepSeek/豆包/腾讯、未做 4G/5G 延迟与费用验证。

## 2. 本轮修复的真实缺陷

1. `InputStream.readAllBytes()` 在 Android 运行时不存在 → `/v12/api/places/:id` 失败；改为本地 `readAll`。
2. `prefs` 表把字符串用 `String.valueOf` 存成非 JSON → `/v12/api/local/backup` 连接被关闭；改为写入时 `JSONObject.quote`、读取时兼容旧值。
3. 备份 `mediaIndex` 只查 `card_media` 表，迁移来的图片未登记 → 导出 ZIP 不含图片；改为文件系统为准合并。
4. WebView 预连接会占满固定 4 线程 + 15s 读超时 → 详情页可能长期「正在读取」；改为 cached thread pool + 5s 超时。
5. MIUI DocumentsUI 对 `.smbak.zip` 判定不可选 → 导入类型改 `*/*` + `EXTRA_MIME_TYPES`，并补内部投递入口。
6. 本地服务对 `/v12/api/demo/write-ticket` 也要求 token，而页面取票不带 token → 卡片保存 `WRITE_TICKET_UNAVAILABLE`；改为写票生成免 token（写请求仍校验 token），真机保存返回「已保存」。
7. SSE `/api/asr/live` 300s 主动结束、断线窗口丢 final → 256 条环形缓冲 + 单调 `id` + `Last-Event-ID` 补发；真机验证：停止录音后新建 EventSource 收到 `id 1–10` 共 10 条补发。
8. `endedLatch` 被中途 `session/ended` 提前耗尽 → 加 `stopRequested`，只有主动停止才放行；腾讯同包 `final=1` 先收 `sentences` 再结束；短录音 `stop wait ended=true remaining=0`。
9. 停止录音后「开始录音」按钮未复位 → `stopStreaming` 立即恢复按钮。
10. 原生 TTS 直连传了系统 voice 名称（Ruth）→ 豆包音色白名单过滤，真机缓存 `audioId=direct-a34cf6b87269fc26`。

### 方案 2：手机端 Key + 直连厂商（用户选择，已完成代码与路径验证）

- 用户选择：自用、不分发；Key 不编译进 APK，改为设置页手动录入 + Android Keystore 加密。
- 新增 `CloudKeys`（Keystore AES-256-GCM）、`DirectCloud`（DeepSeek 直连 + 豆包 TTS 直连 + 每日额度）、桥方法 `saveCloudKey/clearCloudKey/cloudKeyStatus`、设置页「云端 Key（仅本机）」。
- 优先级：手机 Key 直连 → 云端网关（C4）→ 503；清除 Key 即回退，不影响本地资料。
- 额度：DeepSeek 1 元/日、豆包 2 元/日，超额 402；本机粗估，不是厂商账单。
- 真机验证：
  - DeepSeek 假 Key → 请求到达厂商，返回 401；本机映射 `403 PROVIDER_REJECTED`（不再 `Failed to fetch`）。
  - 清除 Key → 无 Key/无网关 → `503 CLOUD_NOT_CONFIGURED`。
  - 豆包假 Key → 请求到达厂商，返回 401 / code `45000010` → `403 PROVIDER_REJECTED`。
  - 腾讯假 Key + ASR 模式 `direct` → 点「开始录音」后 WS 连接建立并被腾讯拒绝，界面进入「连接中断 · 正在重连」，证明请求确实到达腾讯云端。
  - 设置页截图：`evidence/06-cloud-keys.png`。
- **未验证**：真实 Key 端到端（翻译/草稿/建议/豆包朗读/腾讯字幕）、真实费用、并发/429。
- 该方案是对项目「密钥只在服务端」红线的一次用户明确授权例外，仅限本机自用；详见 `DIRECT-KEY-MODE.md`。

### C3 LAN 同步（MVP，真机通过）

- Mac：`POST /v12/api/local/sync/push`、`GET /v12/api/local/sync/pull`、`GET /v12/api/local/sync/status`；push 原子写 `SocialMate-Data/Backups/`，不改真源；pull 复用现有读取组合。
- 手机：`LocalSync` + 设置页「同步到 Mac / 从 Mac 拉取」。
- 真机：push `ok/stored`，446,319B，`Backups/<device>-<ts>.json`；pull `imported 2`；status `backups:1`。
- 未做：双向冲突合并（当前 push 归档、pull 只补本机没有的记录）、加密传输（局域网内明文 JSON + 令牌）。

### C5 性能（真机 PASS）

- 10 次冷启动：P50 1039ms / P95 1064ms（门槛 2000ms）。
- Tab：软件 33.1/61ms、海南 126.8/222.7ms、聊天 27/45.5ms、关于我 27.8/33.9ms、人物 22.4/28.8ms（门槛 300ms）。
- 报告：`PERF-REPORT.md`。

### C5 393×852 / 深色（真机 PASS）

- CDP 视口覆盖 393×852：`scrollWidth=393`，无横向溢出；五 Tab 正常。
- 深色：`data-theme=dark`，背景 `rgb(25,45,53)`。
- 截图：`evidence/07-393x852.png`、`08-dark-393x852.png`。

### C5 300s（真实 300 秒 PASS）

- 新增 `direct_asr_max_ms`（默认 300000），直连模式到点主动收尾。
- 真机连续录音 300 秒（4G/WiFi 直连腾讯）：到点自动停止、页面显示「已结束」，本轮识别 **15 段 final**，页面同时给出 DeepSeek 接话。
- `retention:false` 时按设计不落原文，归档 outbox 为空，不是缺陷。
- 测试期间 TTS 队列走了系统回退（`outcome=failed`），但 ASR 会话本身持续 300 秒并正常收尾，验收对象是 ASR 300s。

### C5 拍照/相册（照片入卡片 PASS）

- 用户用系统相机拍摄 `IMG_20261106_114447.jpg`（2.86MB）。
- 压缩到 1600px（264KB）后，经页面内 `POST /v12/api/cards/story/c-2585f970/media` 导入：
  - 返回 `200 / ok / revision 7 / media 4 / id maa18fca478152efd`；
  - 页面重载后 4 张图全部 `blob:` 显示，截图 `evidence/09-card-photo.png`。
- 相册选择器已单独验证可弹出（「选择图片 / 文件 / 相册」）。
- 未验证：App 内相机拍照入口（本轮照片来自系统相机，导入为程序化路径）。

### C5 重负载性能（录音中，部分 FAIL）

录音中 5 轮 Tab 切换（仅供主代理真机采样）：

| Tab | P50 | P95 | 判定 |
|---|---|---|---|
| 软件 | 120.8ms → 55.7ms | 152.9ms → 93.7ms | PASS |
| 海南 | 457.3ms → 131.7ms | 557.3ms → **205.3ms** | PASS |
| 聊天 | 73.1ms → 33.5ms | 210.4ms → 115.8ms | PASS |
| 关于我 | 60.4ms → 26.8ms | 72.7ms → 36.4ms | PASS |
| 人物 | 69ms → 24.5ms | 71.3ms → 37.1ms | PASS |

结论：`.placecard` 加 `content-visibility:auto` 后，录音中海南 P95 从 557.3ms 降到 205.3ms，全部低于 300ms。

## 3. 不合规 / 未完成（不得 DONE）

| 条款 | 现状 |
|---|---|
| C3 备份加密默认 | 已实现 AES-256-GCM 加密备份并真机验证 |
| C3 LAN 同步 | MVP 已实现（push 归档/pull 补缺）；双向冲突合并与传输加密未做 |
| C4 云部署 | 未部署；已加手机直连替代（方案 2） |
| C5 4G/5G 真实 AI/ASR/TTS | 直连路径通；真实 4G 20s 与 300s ASR 已验证；原生 TTS 直连未确认 |
| C5 393×852、深色 | PASS；照片已入卡片并显示（程序化导入）；App 内相机入口未验 |
| C5 首个页面 2s、Tab 300ms 的 P50/P95 | PASS：冷启动 P95 1064ms；Tab 最大 P95 222.7ms |
| 公开 115 地点图片 | 已打包 211 张 webp，真机 `200 image/webp` |
| 本地模式真实 ASR | 仍走 Mac/Tailscale 或云端；C4 未部署前外出不可用 |
| 安全 | `pairDevice` 等 4 个桥方法仍缺方法级 origin 校验（C0 登记） |

## 4. 版本与产物

- `versionCode 70 / versionName 0.9.2`。
- 最新 APK：`release/SocialMate-0.9.2-vc70-debug.apk`（约 55MB，含 211 张离线 webp），SHA-256 `4c2507a4d9cacb59f61de9a8c5b4fc892559fb76b7ec8679f4f019ecbd9753d4`。
- 构建：`sh android-poc/build-apk.sh`（已改为优先 Gradle 8.14.3 + `~/.gradle-alw001` + `--offline`，避免 dl.google.com TLS 失败）。

## 5. 复现命令

```bash
# 构建（离线缓存）
sh android-poc/build-apk.sh

# 迁移导出（Mac 8791 在线）
node scripts/v17-export-migration-backup.mjs

# 手机导入（一次性）
adb push .local/v17-migration-20261106/migration-backup.json /data/local/tmp/backup.json
adb shell run-as app.socialmate.dualmic mkdir -p files/migration
adb shell run-as app.socialmate.dualmic cp /data/local/tmp/backup.json files/migration/backup.json

# 断网冷启动
adb shell svc wifi disable; adb shell svc data disable
bash socialmate-v1.2/service-all.sh down
adb reverse --remove-all
adb shell am force-stop app.socialmate.dualmic
adb shell am start -W -n app.socialmate.dualmic/.MainActivity

# 真机取证
PID=$(adb shell pidof app.socialmate.dualmic | tr -d '\r')
adb forward tcp:9223 localabstract:webview_devtools_remote_$PID
node scripts/sm-cdp.mjs "location.href"

# 云网关本地测试
node --test cloud-gateway/test/*.test.mjs
```

## 6. 强制回执（WebView 音频规则）

```text
已用 Web Audio / 暂停路径已核对 / 吸顶已确认
```

说明：本轮未改页面 Web Audio 播放、暂停/继续/停止或控制栏布局；仅把豆包合成改为本地服务代理。真实豆包朗读、暂停/继续与吸顶未在本轮实测（云端网关未部署）。