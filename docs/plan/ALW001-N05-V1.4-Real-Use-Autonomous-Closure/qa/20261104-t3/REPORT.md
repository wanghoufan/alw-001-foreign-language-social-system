# T3 · Tailscale 外出 / 断 WiFi 实测（2026-11-04）

- 版本：Android **0.8.15 / versionCode 50**，APK SHA-256 `21f6857695bbc5fa27a08add27b48d8d0cc133b1819644aecd6df4486a00aca9`
- 结论：**网络层与页面/实时字幕层 PASS**；归档写入因设备未配对返回 401，属授权前置未完成，不是 Tailscale 通路失败；蜂窝下原生录音开录未重新授权，未复测。
- 本轮修复：外出模式下 SSE 实时字幕与 AI 建议被 `127.0.0.1:8791` origin 白名单拦截（BLOCKER）；WebView 短期令牌只注入一次、不覆盖旧值。

## 1. 环境

| 项 | 值 |
| --- | --- |
| Mac 节点 | `mac-mini.tail4e4317.ts.net` / `100.125.100.15` |
| Serve 路由 | 443 `/alw`→8781；8443→8791；10000→8790 |
| 主测手机 | Redmi Note 12T Pro（23054RA19C，Android 15），Tailscale `100.94.116.99` |
| 旁证手机 | Redmi Note 12 Pro（22101316C，Android 14），Tailscale `100.91.121.33` |
| 组合服务 | 8790/8791/8781/8782 全部 HEALTHY |

## 2. 结果

| # | 项目 | 结果 | 证据 |
| --- | --- | --- | --- |
| T3-01 | Mac 侧三条 Tailscale 路由 | PASS | `app-phone/20-mac-routes.txt`：8443 `/v12`、8443 `/api/asr/status`、443 `/alw/health`、10000 `/health` 均 200 |
| T3-02 | 经 Serve 的 ASR wss 握手 | PASS | 本机 Node 客户端 `wss://…:10000/asr` 56ms open、收到 session、`mock=false`、1000 正常结束 |
| T3-03 | 旁证手机断 WiFi + 蜂窝 + Tailnet | PASS 7/7 | `network-phone/REPORT.md`：WiFi 关闭、VPN 底层 `CELLULAR`、DNS 2/2、8443/10000/443 TCP 通、系统浏览器加载 UI 与 `/alw/health` |
| T3-04 | 主测手机断 WiFi + 蜂窝 | PASS | `app-phone/12-wifi-off.txt`=`0`；`17-vpn-cellular.txt` `Transports: CELLULAR|VPN`；`13-tailscale-status.txt` active relay `sfo` |
| T3-05 | 外出模式页面真实加载 | PASS | `16-cdp-cellular.json`：`href=https://…:8443/v12?live=1`、`online=true`、26 张卡片 |
| T3-06 | 实时字幕 SSE（修复前） | FAIL | 修复前 CDP：`asrState=off`、`asrStream=false`，页面文案「实时识别未连接」 |
| T3-07 | 实时字幕 SSE（修复后） | PASS | `asrState=ready`、`asrStream=true`，页面显示「实时字幕 / 字幕已接入」 |
| T3-08 | 页面内同源 ASR 状态请求 | PASS | CDP `fetch('/api/asr/status')` 返回 200，`combined=true` |
| T3-09 | 原生 ASR 走 `wss://…:10000`（WiFi 下） | PASS | 录音会话期间 `/api/asr/status` `activeSessions=1`，停止后 0 |
| T3-10 | 断 WiFi 后原生录音再开录 | NOT_RUN | 为避免未经同意的麦克风采集，未再次开录；T3-09 与 T3-04/06/07 分别证明两端 |
| T3-11 | 归档读取（页面带令牌） | BLOCKED | 返回 401 `UNAUTHORIZED`、`tokenLen=0`；App 无 `socialmate-pairing` 预置，设备未配对。通路本身已到达归档服务 |
| T3-12 | 经 Tailscale 无线 ADB 安装 0.8.15 | PASS | Wi-Fi 关闭、蜂窝下 `adb install -r` Success，安装后 `versionName=0.8.15`、`versionCode=50` |
| T3-13 | 测试后恢复 | PASS | `wifi_on=1`，VPN 底层恢复 `WIFI`；已移除临时 CDP 映射 |

## 3. 根因与修复

1. **SSE / AI origin 白名单（BLOCKER）**
   - `socialmate-v1.2/source/V1.1-baseline.html:1136-1142`、`1188-1195` 只接受 `http://127.0.0.1:8791` / `http://localhost:8791`。
   - 外出地址是 `https://mac-mini.tail4e4317.ts.net:8443/v12`，因此 `connectLiveASR()` 与 `requestRealAI()` 直接 return，原生死活与页面无关：字幕永远不出现、AI 建议永远 `blocked`。
   - 改为复用页面已有的 `HTTP_UI` 协议判断（`http:`/`https:`），不绑定 host；`build-v12.py` 重新生成 `index.html`。
2. **WebView 令牌只注入一次**
   - `AsrActivity.java:1101` 原先 `if(!sessionStorage.getItem(...))` 才写；重新配对/换令牌后旧值不被覆盖，页面永久 401。
   - 改为无条件 `setItem`；仍只在私有 origin 注入、仍只进 sessionStorage。
3. **版本**：0.8.14/49 → **0.8.15/50**，构建 `BUILD SUCCESSFUL`，安装包哈希见上。

## 4. 证据文件

- `app-phone/`：`10-live-cellular.png`（蜂窝下实时字幕页）、`12-wifi-off.txt`、`13-tailscale-status.txt`、`14-asr-status.json`、`15-apk-sha256.txt`、`16-cdp-cellular.json`、`17-vpn-cellular.txt`、`18-app-version.txt`、`20-mac-routes.txt`、`21-mac-wss.json`
- `network-phone/`：旁证手机 7/7 报告与原始截图/UI 树
- `code-audit.md`：外出链路静态审查（含未修项与优先级）

## 5. 未完成 / 风险

- **归档写入未验**：设备未配对（用户未允许本轮输入配对码）；需在 Mac 生成一次性码并在 App「配对这台手机」后复测上传 2xx。
- **蜂窝下原生录音未重新开录**：尊重麦克风授权边界；已有 Wi-Fi Tailscale 下原生 `activeSessions=1` 与蜂窝下页面/SSE 双证，但未把二者合到同一条录音会话。
- **AI 建议未实测**：会消耗 DeepSeek 预算，本轮只验证了同一白名单已解除，未发起真实模型请求。
- **ASR 端点无鉴权**：`wss://…:10000/asr` 仅靠 tailnet ACL；同 tailnet 设备可开流消耗 ASR 预算（`code-audit.md` T-11）。
- **ASR 断线不重连**：`AsrClient.setConnectionLostTimeout(0)` 且无重连，WiFi→蜂窝切换后可能半开连接不可见（T-05，未修）。
- **令牌 401 不自动刷新**：`SessionArchive` 遇 401/403 直接判 AUTH，不刷新重试（T-04，未修）。