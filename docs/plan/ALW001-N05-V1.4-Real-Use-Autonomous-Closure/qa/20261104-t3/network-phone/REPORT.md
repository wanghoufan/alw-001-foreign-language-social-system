# ALW-001 网络验收报告（手机蜂窝 + Tailscale 访问 Mac mini）

- 执行时间：2026-11-04 10:38 – 10:42 (+0800)
- 执行者：ALW-001 网络验收子代理（只读验证，未改代码、未安装/卸载应用、未写生产数据）
- 目标设备：Redmi Note 12 Pro（型号 22101316C，Android 14）——仅此一台被操作
- 未操作设备：两台手机（序列号已隐去）（全程未出现 adb 调用）
- 目标服务：Mac mini（`mac-mini.tail4e4317.ts.net` / `100.125.100.15`）
  - 8443 → UI（8791）
  - 10000 → ASR（8790）
  - 443 `/alw` → 归档（8781）

## 结论总览

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | WiFi 确实关闭 | PASS | `00-baseline.txt`、`01-wifi-off-connectivity.txt` |
| 2 | VPN 仍在线且底层为蜂窝 | PASS | `01-wifi-off-connectivity.txt` |
| 3 | Tailnet DNS 解析 | PASS | `02-dns-ping.txt` |
| 4 | 三端口 TCP 连通（8443/10000/443） | PASS | `02-tcp.txt` |
| 5 | UI 页面真实加载（非错误页/空白页） | PASS | `03-default-browser.txt`、`03-ui-page.png`、`03-ui-dump.xml`、`03-cdp-ui.txt` |
| 6 | 归档 `/alw/health` 真实加载 | PASS | `04-archive-health.png`、`04-archive-health-dump.xml`、`04-cdp-health.txt` |
| 7 | 环境已恢复 | PASS | `05-restore.txt` |

**总结论：7/7 PASS。手机在关闭 WiFi 开关、仅保留移动数据的状态下，可通过 Tailscale 访问 Mac mini 的 UI、ASR、归档三条私有路由。**

## 逐项说明

### 1. WiFi 确实关闭 — PASS

- 基线：`settings get global wifi_on` = **1**（`00-baseline.txt`）
- 执行 `svc wifi disable`（rc=0）→ `wifi_on` = **0**
- 关闭后等待 12 秒复核（`01-wifi-off-connectivity.txt`）：`wifi_on` = 0，`ip link show wlan0` = `wlan0 no link`

### 2. VPN 仍在线且底层为蜂窝 — PASS

`01-wifi-off-connectivity.txt` 中 `dumpsys connectivity` 原始行：

```
NetworkAgentInfo{network{307} ... ni{VPN CONNECTED extra: } ... underlying{[305]}
  nc{[ Transports: CELLULAR|VPN Capabilities: INTERNET&NOT_RESTRICTED&TRUSTED&VALIDATED&... UnderlyingNetworks: [305]]}
NetworkAgentInfo{network{305} ... ni{MOBILE[NR] CONNECTED extra: ctnet} ... Transports: CELLULAR ... VALIDATED ...}
```

- `Transports: CELLULAR|VPN`：VPN 网络的传输组合含蜂窝，不含 WIFI
- `UnderlyingNetworks: [305]`，而 305 为 `MOBILE[NR] CONNECTED extra: ctnet` 且 `VALIDATED`
- `tun1` 仍 `UP,LOWER_UP`，持有 Tailscale 地址 `100.91.121.33/32`

即：判定依据是传输层/底层网络属性，而非仅看 `wifi_on=0`。

### 3. Tailnet DNS 解析 — PASS

`02-dns-ping.txt`：

```
PING mac-mini.tail4e4317.ts.net (100.125.100.15) 56(84) bytes of data.
64 bytes from mac-mini.tail4e4317.ts.net (100.125.100.15): icmp_seq=1 ttl=64 time=928 ms
64 bytes from mac-mini.tail4e4317.ts.net (100.125.100.15): icmp_seq=2 ttl=64 time=352 ms
2 packets transmitted, 2 received, 0% packet loss
```

MagicDNS 解析到 `100.125.100.15`，ICMP 0% 丢包（延迟 352–928 ms，蜂窝链路正常偏高）。

### 4. 三端口 TCP — PASS

`02-tcp.txt`（手机无 `curl`/`wget`，仅 `nc`；`nc -z` 不支持，改用 `nc -w 5 ... </dev/null; echo rc=$?`）：

| 端口 | 结果 |
|---|---|
| 8443 | `rc=0` |
| 10000 | `rc=0` |
| 443 | `rc=0` |

为避免把"工具退出码恒为 0"误判为通过，补做了两类对照：

- **负向对照**：`100.125.100.15:59999` 与 `:1` 均返回 `nc: connect: Connection refused` / `rc=1`，证明 rc 语义可信
- **协议层实证**：向 8443 与 443 发送明文 HTTP，均返回 `HTTP/1.0 400 Bad Request — Client sent an HTTP request to an HTTPS server.`，说明请求确实抵达真实 TLS 服务端，而非黑洞

### 5. UI 页面真实加载 — PASS

- 默认浏览器（`03-default-browser.txt`）：`com.android.browser/.BrowserActivity`，`isDefault=true`——系统自带浏览器，**未使用 Google Chrome**
- `03-ui-page.png`（288,693 字节），截图时前台为目标浏览器
- `03-ui-dump.xml` 无障碍树实际文本包含：`SocialMate · 外语社交助手`、`APP / PWA 优先`、`找到 26 款`、`P002 人生物种测试`、`P005 亲缘图谱`、`P011 我的地点`、`P016 懒得打字`、`P019 拍照点助手`、`P020 拉伸换边计时器`、`P025 拉伸训练`、`P026 夜间补光灯` 等
- 独立交叉验证（`03-cdp-ui.txt`，浏览器 WebView DevTools 默认 socket，只读）：`document.title` = `SocialMate · 外语社交助手`，`document.body.innerText` 含 26 款卡片列表，`querySelectorAll('[class*=card],article,li')` = 53

判定为应用内容真实渲染，非错误页、非空白页。

### 6. 归档 `/alw/health` 真实加载 — PASS

- `04-archive-health.png`（72,593 字节）
- `04-cdp-health.txt`（只读 CDP 取值）：

```
document.readyState       : complete
location.href             : https://mac-mini.tail4e4317.ts.net/alw/health
document.body.innerText   : {"ok":true,"service":"socialmate-archive","auth":"required"}
```

`ok:true` 且 `service` 为 `socialmate-archive`，为服务端真实返回的健康 JSON（`auth:"required"` 为该路由的鉴权声明，符合预期）。

### 7. 环境已恢复 — PASS

`05-restore.txt`：

```
settings get global wifi_on     : 1
settings get global mobile_data : 1
settings get global airplane_mode_on : 0
dumpsys wifi : Wi-Fi is enabled / curState=EnabledState / curState=DisconnectedState
tun1 : 100.91.121.33/32（VPN 仍在）
```

与测试前基线一致（基线即为 WiFi 开关开启但 `wlan0` 处于 `NO-CARRIER / DOWN`，未连接任何 WiFi）。测试中新增的浏览器页面已 `am force-stop com.android.browser` 关闭，主机侧 `adb forward tcp:19222` 已移除，设备侧临时 `uiautomator` dump 文件已删除。

## 需要如实说明的边界

1. **基线时 WiFi 开关已为开但未连接任何 WiFi 网络**（`wlan0` 为 `NO-CARRIER / DOWN`）。因此本次"关 WiFi"改变的是开关状态，并非断开一个正在承载流量的 WiFi 网络。不过第 2 项证据（`Transports: CELLULAR|VPN` + `UnderlyingNetworks: [305] = MOBILE[NR]`）独立成立，验证结论不受此影响。
2. **UI 页面 readyState 抓取时为 `loading`**（页面大图仍在拉取），但 DOM 文本已完整渲染 26 款卡片，且此前 10 秒截图正常。不构成失败。
3. **ASR（10000）仅验证到 TCP 层**，未发起业务请求（避免产生转写数据）。
4. **未单独验证 IPv6 路径**，本次全部走 IPv4 Tailscale 地址。
5. 主机侧存在一条**非本次创建**的映射 `tcp:9226 → webview_devtools_remote_29925`；为免误清他人会话，未移除。本次仅创建/移除了 `tcp:19222`。

## 剩余风险

- 小米浏览器 WebView 调试 socket 当前默认开启，本次才能以 CDP 读到 DOM。若后续 ROM 更新关闭该能力，而页面又是纯文本 JSON（无障碍树不暴露内容），浏览器层取证将退化为仅截图，存在取证盲区。
- 蜂窝链路延迟波动较大（ICMP 352–928 ms，首包近 1 秒）。移动弱网下 UI 首屏与 ASR 建连可能明显变慢，不属缺陷，但需在体验预期中说明。
- 本次未覆盖"手机真正离开家庭 Wi-Fi 覆盖范围、跨基站/切网"的动态场景；仅在固定位置关开关验证。