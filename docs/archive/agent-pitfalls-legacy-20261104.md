# ALW-001 踩坑归档 · 低频/历史条目（2026-11-04 阶段复盘迁出）

> 从项目根 `agent.md` 迁出，原文保留。主文件只留一行指针，避免体积超限。
> 这些条目仍然有效，只是不再每轮都要读；相关主题再次出现时回来看这份。

## 音频 / 设备

- BOYA mini USB 声明 2 声道但输出 dual-mono；L/R 只差 1–6 LSB，别只看 `getChannelCount()==2` 就判分轨。
- 优先 `UNPROCESSED`；`MIC` 源的 AGC/NS 会掩盖左右差异。
- BOYA 在 `dumpsys audio` 枚举为 `USB_DEVICE`、路由可核对，但 A/B 仍可能 `-180 dBFS` 静音；先查发射器开机/配对/静音。
- 削波说明接收器增益高；先降增益再评判。

## 端口 / 清理

- 8787 被 Docker `keep-fitness` 占用；`lsof -ti tcp:8787` 同时返回 `com.docker` 与 `node`，kill 前看 `COMMAND`（曾误杀代理，`open -a Docker` 恢复）。
- ASR 桥接用 8790；收尾先停 node、移除 `adb reverse`、删手机临时 APK/XML。
- Note 11 单 USB-C：插 BOYA 就失去 USB 数据，需无线 ADB 或扩展坞；无线 `adb reverse` 挂在当前 transport，重连要重建。
- WebView CDP socket 名带应用 PID；重启 App 后必须重新 `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`。
- DeepSeek 记账按 usage × 官方高峰价；ledger 在 `.local/ai-budget.json`，改预算/清账本属用户授权。
- 用 `ASR_FORCE_MOCK=1` 重启后，切回真实前确认无残留，`/health.mode` 必须是 `tencent`。

## 深色模式 / 配色

- 布局固定浅色（`0xFFF5F7F8`/`0xFFFFFFFF` 写死），**不能**让主题继承深色 `Theme.Material`：`values-night` 必须保持 Light，否则白字白底。
- 新控件不依赖主题默认字色，`text()` 已 `setTextColor(0xFF1C293A)`；CheckBox/Spinner/EditText 单独补色（Spinner 自定义 `getView` 与 `getDropDownView`）。
