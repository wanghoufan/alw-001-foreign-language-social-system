# 踩坑归档（2026-11-05 阶段复盘迁出，原文保留）

## 验收 / 证据

- 2026-11-03 · TTS UI 验收 · 点「朗读」远端一律 400 `blockId 不合法` · 只跑过 ADB 捷径，UI 把中文标签当 ID · 验收必须走真实点击路径；ID 字段一律 ASCII。`建议进用户级`
- 2026-11-03 · 隐藏功能 · 设置页存在但用户进不去 · 桥接已暴露、页面从未调用 · 新开关必须同时补 UI 入口并点击验证。`建议进用户级`
- 2026-11-03 · 冷启动 · 点朗读报「正在初始化」 · init 与首点竞态 · 挂起本次朗读（≤4 s）就绪后自动播放。

## 原生 ↔ 页面桥接

- 2026-11-03 · 状态推送 · 页面抛 `onState is not a function` · 注入前未判回调存在 · 加 `typeof === 'function'` 守卫。
- 2026-11-03 · 云端同意 · 每段都弹同意框 · `consentGrantedOnce` 每次朗读后清零 · 改会话级，切服务商才重置。
- 2026-11-03 · 未配置云服务商 · 仍弹同意框但注定 501 · 未看报价 `configured` · 未配置直接报错、不弹框。

## AI 分段 / 私有地点（2026-11-03）

- 2026-11-03 · AI 分段 · `AI_BAD_GROUPS` · 模型返回区间式 `[[0,2],[3,4]]`（1 基、闭区间），与「句子数组」契约不符 · 服务端归一化兼容 `[start,end]`/`{start,end}`/0 或 1 基，再 `raw.slice(span)` 确定性切块。`建议进用户级`
- 2026-11-03 · 写入分段 · `SEGMENT_LOSS_DETECTED` · 只给 `span+sourceText`，`cnSentences` 拼不回原文 · 走按句切分写入：逐句 split 后 `join('')` 必须等于 `sourceText`。
- 2026-11-03 · 验证 AI 能力 · 裸 `node` 调 DeepSeek 报 `AI_UNAVAILABLE`，服务内却成功 · `.env` 只由 8791 进程加载 · 验 AI 走 HTTP 接口，不在 shell 里裸调。
- 2026-11-03 · 私有地点合并 · 新地点 116 不在列表 · 前端 `apiCall` 不在作用域、静默失败 · 合并走带桥守卫的重试路径，并核对条数 115→116。`建议进用户级`
- 2026-11-03 · WebView CDP · `UND_ERR_SOCKET` · `tail -1` 取到 stale socket · 遍历全部 `webview_devtools_remote_*`，各自 forward 不同端口，用 `/json/version` 的 `Android-Package` 认领。

## 派工 / 本地子代理（2026-11-03）

- 2026-11-03 · 派工 · 日志 `command not found` 但退出码 0 · 安装目录被移除、子 shell 丢 PATH · 派工前 `command -v`，并回读日志首行，不只看 exit code。
- 2026-11-03 · 派工命令写法 · `&& codearts ... &` 下环境变量未生效 · `&` 把整条链放子 shell · 先 `export` 再单独执行，或用绝对路径。
- 2026-11-03 · 本地子代理 · `Agent` 偶发 `request timed out after 5000ms` 或 `ECONNREFUSED ... .sock` · 本地 PAC 套接字瞬时不可用，与被派任务无关 · 直接重派同一条任务，不改任务内容、不怀疑环境。

## 播放队列（2026-11-03）

- 2026-11-03 · 多元素朗读 · 第 13 项 `TTS_REMOTE_REJECTED` · 合成限流按单次朗读设计（12 次/60s），与批量队列冲突 · 朗读拆独立额度（48 次/60s、150ms）；新增限流先按真实批量核对。`建议进用户级`

## 后台朗读（2026-11-04）

- 2026-11-04 · 后台结束回前台 · 队列已跑完，页面仍显示旧进度 · `queue_state` 只回灌 `running=true`，漏了已结束分支 · 状态同步带 `outcome`（finished/stopped/failed）并覆盖三条分支。

## 2026-11-04 真机与建议区（阶段复盘迁出）

- 2026-11-04 · Note 12 Pro 装 APK · `INSTALL_FAILED_USER_RESTRICTED` · MIUI 未允许 USB 安装，改 settings 无效 · 推送后由用户在手机点安装/允许；不要把 adb 绕过写成成功。
- 2026-11-04 · Note 12 Pro 配对 · 原生高级设置滚不到配对码输入 · 面板滚动被 WebView 内容干扰 · 加内部桥 `SocialMateAndroid.pairDevice(code)`（不暴露 UI），配对后回读 prefs + 服务端 `paired:true`。
- 2026-11-04 · V1.5 建议区 · 用户读建议时被新 final 抢刷新 · 原 `showRecs()` 每次重建 · `S.suggFreeze` + 「有新的接话建议」徽标，点击才刷新；四方向禁止 `slice(0,1)`。
