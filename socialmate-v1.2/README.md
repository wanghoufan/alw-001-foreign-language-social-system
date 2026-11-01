# SocialMate V1.2.1 · 正式 UI（内容优先、可调字号、真实 AI 可选）

- `index.html`：正式 UI 单文件，布局与交互继承 `source/V1.1-baseline.html`，未重新设计。
- `build-v12.py`：把基准的 23 条预览地点替换为正式 115 条，并修正地点地图按各自城市查询。
- `test-ui.mjs` / `test-topics.mjs`：Chrome CDP 真点击测试（五 Tab、自动卡、详情、返回、四档手机宽度、深浅色；5 话题回归）。
- `screenshots/`：聊天前、开始确认、跑步建议、地点详情、返回聊天、五 Tab、深色。
- `source/`、`vendor/ws`：自包含构建与测试依赖。
- `dist/SocialMate-V1.2-UI.zip`：私有交付包（不部署、不公开）。

## 打开与复现

双击 `index.html`；或 `python3 build-v12.py && node test-ui.mjs && node test-topics.mjs`。

## 边界

- 未调用腾讯云、未录音、未部署。
- 公开分享需剔除人物与聊天，本目录仅供私人演示。
- 未做真机软键盘与厂商自带浏览器验收。

## 2026-10-31 · ChatGPT 直接接管后的整改 V1.2.1

- 正式 socialmate-v1.2/ 及其构建源 source/V1.1-baseline.html 已同步修订。重新构建不会恢复绿色首屏宣传框。
- 五个一级页面内容优先：搜索、标签、资料卡与会话先出现。
- 右上角齿轮：整体字号标准/较大/大字/超大，英文专用字号标准/加大/特大，布局紧凑/舒适/宽松；偏好存当前浏览器 localStorage。
- 默认中文正文 16px，英文阅读 18px，次要标签 14px。放大后自然换行；卡片间距与字号独立。
- 关于我：分类与自定义标签统一筛选，新建或编辑时可填写分类和多个标签。当前个人内容仍只存在浏览器本地，尚未与 Mac 正式 Markdown 同步。
- 正式 V1.2 已连接真实 AI 网关：本地 file:// 使用规则演示；私有 http://127.0.0.1:8791/v12 允许用户主动选择 DeepSeek 官方 Flash、V4 Pro 或 OpenCode Go Flash，明确勾选云端文字发送同意后调用真实模型，失败明确回退。
- Key 只在私有服务端；默认不传私人故事；不修改 android-poc 或 ASR 桥接代码。
- 数据仍为 51 软件、204 演示步骤、115 地点。未部署到公网。

## 直接测试

1. 在项目根目录运行：node --test socialmate-v1.2/test-display-and-ai.mjs
2. 运行：python3 socialmate-v1.2/build-v12.py
3. 再运行同一条 Node 测试，证明重新构建不会恢复旧 UI。
4. 启动已配置 API Key 的私有 ai-gateway/server.mjs，再从 http://127.0.0.1:8791/v12 验证真实模型 UI。

本次已执行 V8 兼容环境下的 8/8 组代码级测试逻辑；Mac mini 上的真实 Node 测试、浏览器视觉及红米厂商原生浏览器验收仍须执行。旧 ui-test-result.json / phone-test-result.json 是改版前记录，不能冒充 V1.2.1 验收。


## V0.4.0 开发版：前台单手机一屏录音＋AI（**源代码已写，APK 未验收**）

新版本解决了此前的结构性断点：安卓 ASR 录音和正式 V1.2 对话界面不需要在两个 APP 间来回切换。`AsrActivity` 中启动录音会保持当前 Activity 在前台，同时覆盖一个 WebView，显示 `http://127.0.0.1:8791/v12`；顶部可返回录音控制或重新加载。

Mac mini 同一个进程通过 `live-server.mjs` 启动 8790 ASR 和 8791 AI/页面，只在内存里转发 ASR 事件；没有保存或公开任何私人字幕。正式网页点击「连接实时字幕」后，由 `/api/asr/live` 接收临时/最终字幕；云端模型必须单独获得用户本轮同意，且只针对真实 `final` 调用，不对 mock/interim 计费。

### 构建和启动（Mac mini）

```sh
cd "/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统"
bash socialmate-v1.2/verify-v040.sh
# 手机已 adb 连接时：
bash socialmate-v1.2/run-live-v040.sh --phone
# 无手机时可以先调试 Mac 上的页面：
bash socialmate-v1.2/run-live-v040.sh
```

Android 0.4.0 APK 源码位于 `android-poc/`。编译后的 APK 预计仍为 `android-poc/app/build/outputs/apk/debug/app-debug.apk`，请以实际构建输出为准（本轮未执行 Mac Gradle）。两个 `adb reverse` 分别是 8790 ASR、8791 UI/AI，少一个都不能完整联动。

### 当前边界

- Mac mini 不具备本聊天直接调用的终端执行入口，所以这里只能声称写入代码和 V8 测试；不能声称已经完成 0.4.0 APK 或新版真机 QA。
- 仅本地/ADB 转发开发版；离开电脑后使用仍需独立解决 Tailscale/HTTPS、鉴权、Android 连通性和 Mac 服务常驻启动。
- 已存在的腾讯 ASR 与 DeepSeek/OpenCode Go 真 API 记录属于上一版后端成果；正式 0.4.0 同屏端到端仍待实际验证。


## V0.4.0 · 本机真实编译结果和手机下一步

- Mac mini 实际在 2026-10-31 23:25 运行 `verify-v040.sh` 成功，88/88 Node 测试通过，12 个核心断言通过，HTML 重建 115 地点成功，Gradle 构建 APK 成功。参考 `.local/qa/verify-20261031-232512.log`。
- APK 在 `android-poc/app/build/outputs/apk/debug/app-debug.apk`；SHA-256 `02bbba7a444813767acdc21e2efc015e37889ca42fde38dbe7bb7f1123cef92f`。以上为终端日志证据，暂未安装到手机。
- 下一步仅需将一台红米手机以 USB 连接 Mac mini，开启 USB 调试并批准信任，然后在项目根执行 `bash socialmate-v1.2/install-phone-v040.sh`。它会检查 APK、安装保留数据的调试版、根据情况启动本地私有服务、反向映射 8790/8791、打开 APP，并产生 `.local/qa/phone-install-*.log`。
- 如果显示 BLOCKED: no authorized Android phone，只需在手机上批准调试授权后重新运行，不需要重新编译。安装有旧签名不一致时不自动卸载，交由用户决定如何保护原 App 数据。
- 安装成功 **不等于录音和 AI 真机验收成功**。要实际确认字幕与推荐，还需在手机中打开 ASR 实验页、同意录音、选择 mix 开始，再在 SocialMate 页面开始会话并连接实时字幕。模型服务是否为真正的 Tencent/DeepSeek 由脚本健康状态输出标示，不能把 mock 视为真识别。
- 目前为 USB ADB reverse 开发测试；正式脱离 USB 外出使用，仍需安全私有网络（如 Tailscale）、鉴权与常驻服务。禁止公开私人 transcript SSE。
