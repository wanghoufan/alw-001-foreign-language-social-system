# 外出模式（Tailscale）整链路代码审查

- 审查对象：Android 0.8.15（versionCode 50）；服务端 8790/8791/8781
- 方式：静态审查 + 本轮真机证据；未运行的项标「需真机验证」
- 严重度：`BLOCKER` 该场景核心不可用/无法恢复；`MAJOR` 明显缺陷需绕行；`MINOR` 体验/边缘；`OK` 代码确认无问题

## 1. 问题清单

| 编号 | 严重度 | 摘要 | 位置 | 本轮状态 |
| --- | --- | --- | --- | --- |
| T-01 | BLOCKER | 外出实时字幕 SSE 被 origin 白名单拦截 | `source/V1.1-baseline.html:1136-1142` | **已修**：改用 `HTTP_UI` |
| T-02 | BLOCKER | 外出 AI 建议被同一白名单拦截 | 同上 `1188-1195` | **已修**：改用 `HTTP_UI` |
| T-03 | BLOCKER→已修 | WebView 令牌只在 sessionStorage 为空时注入，重配对后仍用旧令牌 | `AsrActivity.java:1101` | **已修**：无条件覆盖 |
| T-04 | MAJOR | 归档 401/403 不刷新令牌、不重试 | `SessionArchive.java:523-526` | 未修；本轮真机即 401 |
| T-05 | MAJOR | ASR WS 关闭断线检测、无自动重连，首连仅等 4s | `AsrClient.java:26,55-61` | 未修 |
| T-06 | MAJOR | 连接/录音失败只写进已收起的隐藏面板 | `AsrActivity.java:423-428,1841-1843` | 未修 |
| T-07 | MAJOR | 网络恢复只补传归档，不自动重载 WebView | `AsrActivity.java:173-187,807-818` | 未修 |
| T-08 | MAJOR | 默认归档地址是 Tailscale，ASR/UI 默认是本机，三处初始不一致 | `SessionArchive.java:53-54`、`AsrActivity.java:56-58` | 未修 |
| T-09 | MAJOR | `isPrivatePanelUrl` 端口严格相等；默认端口/重定向会撤桥 | `AsrActivity.java:1073-1085` | 需真机复验 |
| T-10 | MAJOR(安全) | 导出的 `TtsSelfTestActivity` 可被改 `remote_base`，可能把短期令牌发往任意主机 | `AndroidManifest.xml:43-46`、`TtsSelfTestActivity.java:678-680` | 未修 |
| T-11 | MAJOR(安全) | ASR 端点无 Origin/令牌校验，仅靠 tailnet ACL | `asr-bridge/src/server.js:257-279,77` | 未修 |
| T-12 | MINOR | 录音中切模式不重建 ASR 连接且无提示 | `AsrActivity.java:873-892` | 未修 |
| T-13 | MINOR | URL 归一化边界（query、`/V12`、子路径）会拼坏 | `AsrActivity.java:842-854` 等 4 处 | 未修 |
| T-14 | MINOR | `isTravelMode` 只看 UI 是否 https，不校验三地址一致 | `AsrActivity.java:858-866` | 未修 |
| T-15 | MINOR | 外出场景错误文案仍提示 adb reverse/USB | `AsrActivity.java:1871` | 未修 |
| T-16 | MINOR | 离线快照不校验来源 base 与新鲜度 | `AsrActivity.java:921-945` | 未修 |
| T-17 | MINOR | 手机时钟偏差 >120s 令牌刷新永久 401，原因被吞 | `pairing.mjs:206-210` | 未修 |
| T-18 | MINOR | 多处正文 <15sp，违反全局字号下限 | `AsrActivity.java:424,430,483,804` 等 | 未修 |
| T-19 | OK | wss 使用系统默认 SSLSocketFactory + HTTPS 主机名校验，无 trust-all | `AsrClient.java` + Java-WebSocket 1.5.7 | — |
| T-20 | OK | `usesCleartextTraffic=false`，明文只放行回环 | `AndroidManifest.xml`、`network_security_config.xml` | — |
| T-21 | OK | 未配对/无令牌时上传 fail closed | `SessionArchive.java:395-410` | 真机 401 未伪造成功 |
| T-22 | OK | `/alw` 前缀剥与不剥都能命中归档路由 | `archive-receiver.mjs:170` | 真机 `/alw/health` 200 |
| T-23 | OK/需复验 | 同源判断已支持 Tailscale Host/`x-forwarded-host` | `server.mjs:208-219` | 页面 GET 200；写路径未验 |
| T-24 | OK | 归档走 443 HTTPS，证书走系统默认校验 | `SessionArchive.java:500-513` | — |

## 2. 本轮实测补充

- 前端白名单确实导致 `asrState=off`、无 `/api/asr/live` 请求；改成 `HTTP_UI` 后同一蜂窝网络下变为 `ready` + `stream=true`，页面显示「字幕已接入」。
- 设备未配对时页面 `sessionStorage` 无令牌，`/v12/api/archive/sessions` 返回 401；说明网络/证书/反代通，授权前置缺失。
- Tailscale Serve 10000 的 WebSocket Upgrade 已用本机 Node `ws` 客户端验证；手机原生 `AsrClient` 在 Wi-Fi Tailscale 下 `activeSessions=1`。蜂窝下未重新开麦，故未合并成同一会话。

## 3. 建议顺序

1. T-04（401 自动刷新一次）→ T-03 已修，配套页面 `__smAfterToken` 仍需实现/接线。
2. T-05/T-06（断线可见与重连）→ T-07/T-09。
3. 安全项 T-10（release 关闭导出）与 T-11（ASR 握手令牌/Origin 白名单）。
4. 其余 MINOR 随版本收口。