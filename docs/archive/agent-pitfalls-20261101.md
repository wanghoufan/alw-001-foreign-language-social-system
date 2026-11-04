# 踩坑归档 · 2026-11-01

> 从 `agent.md` 迁出以控制体积（agent.md ≤10KB / 每层 ≤20 条）；原文逐条保留。

- 2026-11-01 · 改动丢失 · 只改 `index.html` 被重建覆盖（曾丢 `/v12/history` 入口），只改 Web 换不掉原生工具栏/图标/启动 · 没进构建链 · 前者写进 `build-v12.py` 后重建并 diff，后者重建 APK + `install -r`。
- 2026-11-01 · 归档补传 · 合成会话进了真实归档 · 改 `shared_prefs` 前没确认进程退出，内存旧 `archive_url` 仍生效 · 先 `force-stop`+`pidof` 确认为空再改，收尾还原令牌并核对真实目录。
- 2026-11-01 · 设备锁定 · 预检报「非授权设备」 · `ADB_SERIAL` 填了型号 `21091116AC`，脚本按 serial 精确匹配 · 先 `adb devices -l` 取 mDNS 名（`adb-REDACTED-SERIAL._adb-tls-connect._tcp`）再传。
- 2026-11-01 · 归档索引 · 新测试全红 · `getSession` 用文件名反推 ID，fixture 名不含 ID 就查不到 · 索引以 JSON 内 `sessionId` 为准，文件名只排序。
- 2026-11-01 · 同源接入 · 手机上取不到数据 · 历史页 8781、私有 UI 8791，跨端口即跨源 · 加只读反代（`/v12/api/archive/*`→8781，仅 GET、令牌透传、未起 503）。
- 2026-11-01 · 字幕假红 · 断言 `#content` 无字幕但页面正常 · 字幕只追加气泡不整页重绘，harness 的 `#messages`/`#content` 是两个独立桩节点 · 可见性断言两处一起看。
- 2026-11-01 · 取内联主逻辑 · `hooks.click is not a function` 误报 · `matchAll(/<script…/).at(-1)` 被 `<script src=... defer>` 顶掉 · 取脚本排除 `src=` 与 `application/json`。
- 2026-11-01 · 截图空白 · CDP 同时用 `clip`+`captureBeyondViewport`，元素滚出视口只截纯色、命令仍返回 0 · 交付前算非白像素占比（<0.05 判空）或先拉高视口。
- 2026-11-01 · 系统浏览器验收 · 点完拿不到证据 · 小米浏览器点 `☆ Want to go` 后跳走、dump 只剩首页，且无 CDP · 交互类改用可控 Chrome+CDP。
- 2026-11-01 · 手机验收抢焦点 · 验证要点的按钮抢走前台（手机同时是日常设备） · 先看 `mCurrentFocus`，必须点按的等空闲或交用户。
- 2026-11-01 · 真机链路 · curl 访问 tailnet 返回 `000` · 工具 shell 的 `HTTPS_PROXY` 把 `*.ts.net` 送进 CONNECT 隧道 · curl 加 `--noproxy '*'`，脚本设 `NO_PROXY=*.ts.net,100.64.0.0/10`。
- 2026-11-01 · WebView CDP · 多个 `webview_devtools_remote_*` 并存、有的连上无响应 · `/proc/net/unix` 残留已退出进程的 socket · 每个 socket 建不同端口 forward，用 `/json/version` 的 `Android-Package` 认领，不取 `tail -1`。
- 2026-11-01 · 手机端布局 · 建议卡在首屏外（y≈917 / 视口 705）没人发现 · 只按桌面思路排 DOM，没量真机视口 · UI 验收加硬指标：关键元素 rect 在视口内 + `scrollWidth==innerWidth`，截图只作辅助。`建议进用户级`
- 2026-11-01 · 需求争议 · 答不出出处 · 接手只读摘要，没建"文件:行"索引 · 先 grep 计划原文贴行号，实现前把出处记进交接文档。`建议进用户级`
- 2026-11-01 · 交接文档 · HANDOFF 涨到 10KB 且 §1 与 §5 重复 · 没区分"状态"与"流水" · §1 只写状态、§5 只写事件，事实进 `docs/architecture-facts.md`，保持 ≤100 行 / ≤8KB。`建议进用户级`
- 2026-11-01 · 临时服务收尾 · 报 `killed: 143` · 143 即 SIGTERM，是 `lsof -ti tcp:<port> | xargs kill` 的正常退出码 · 别当失败重跑。
