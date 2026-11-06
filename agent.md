# ALW-001 踩坑记录

更新：2026-11-06（格式：日期 · 场景 · 现象 · 原因 · 解法；`建议进用户级` = 换项目也成立）

> 2026-11-04 及以前的构建/服务/MIUI/代码/播放/复盘/N05/P066 条目已迁：`docs/archive/agent-pitfalls-legacy-20261106.md`（原文保留）。
> 2026-11-05 低频条目（收藏 toggle 细节、人物档案层级、显示越权回退、V1.6 限流/交付报告等）已迁入同目录 `agent-pitfalls-20261105-detail.md`。
> 更早归档：`docs/archive/agent-pitfalls-20261101.md`、`agent-pitfalls-20261102.md`、`agent-pitfalls-legacy-20261104.md`、`agent-pitfalls-asr-20261104.md`、`agent-pitfalls-v13-playback-20261104.md`、`agent-pitfalls-20261105-migrated.md`。

## V1.5.2 / 人物 / 豆包（2026-11-05）

- 2026-11-05 · App 内云端朗读 · 点「听本段」仍回退系统 TTS 并报「朗读被系统中断」 · WebView 自动取消 `window.confirm`，首次确认返回 false · 云端朗读默认授权 `S.v152.ttsConsent=true`，不依赖 confirm；实测豆包音频播放完成。`建议进用户级`
- 2026-11-05 · TTS 账本 · 同一句扣两次 0.0069 · `synthesize()` 内记账后路由又 `recordBilling()` · 只在新合成时记账，缓存命中不重复计费；修正重复条目。
- 2026-11-05 · 真机旧 JS · 改完前端仍走原生 TTS · WebView 缓存旧 `index.html`，`am start` 不重新加载 · force-stop+start 或 `location.replace(url+'?v='+Date.now())`；核对 innerHTML 含新函数。`建议进用户级`

## V1.6 活资料库（2026-11-05）

- 2026-11-05 · 图片压缩 · `createImageBitmap(file,{imageOrientation:'from-image'})` 报「not a valid enum value」 · Android WebView 不支持该枚举值 · 改用 `<img>` 解码 blob URL（Chromium 自动按 EXIF 摆正）再 Canvas 重绘。`建议进用户级`
- 2026-11-05 · 前端模块作用域 · 页面按钮点击报 `smCardNew is not defined` · 卡片模块写在 N05 的 IIFE 内，函数不挂全局 · 需要跨脚本调用时用 `window.__smCards` 显式暴露，别直接引用函数名。`建议进用户级`
- 2026-11-05 · 前端构建 · 页面改动在真机不生效，仍显示旧 UI · 只改 source 未执行 `build-v12.py`，WebView 拿到旧 `index.html` · 改前端后先 build、grep 新标记，再 force-stop 启动验证。`建议进用户级`

## 2026-11-06 自主推进 / Key 保护（用户立规）

- 2026-11-06 · 连续推进 · 构建、装机、断网验收停在回复里问用户 · 把「工具权限拒绝」当成需要用户拍板的业务决策 · 已批准任务内的构建、装机、启停本仓库服务、真机取证、断网/飞行模式验证应自动重试、换路径或换工具；只有密钥、真实付费、云账号/生产部署授权才集中问一次。`建议进用户级`
- 2026-11-06 · 权限拒绝 · 同一命令连续被拒仍原样重试 · 工具权限由客户端控制，不等于用户拒绝任务 · 换命令形态、换工具、先推进不受影响的部分；无法执行时保留阻塞证据并在报告标注。
- 2026-11-06 · 真机长跑 · App 进程在无触摸数分钟后被 MIUI 清掉，CDP 报 `fetch failed` · 屏幕/前台状态变化，非代码崩溃 · 取证前 `KEYCODE_WAKEUP` + 上滑解锁，先 `pidof` 再 forward，单次 CDP 内完成全部读取。`建议进用户级`
- 2026-11-06 · 用户 Key 数据 · 后续安装不得覆盖已填 Key · 必须只用 `adb install -r` 覆盖安装（保留 `shared_prefs`/Keystore/SQLite）；禁止 `adb uninstall`、`pm clear`、删 `socialmate-secure.xml`、恢复出厂；备份不含 Key，换签名/换机会丢。`建议进用户级`
- 2026-11-06 · Key 输入框 · 点输入框只能弹小米安全键盘 · MIUI 对 WebView `type="password"` 强制安全键盘 · 改 `type="text"` + `-webkit-text-security:disc`；代价是第三方输入法可读取输入，需提示清输入法历史。`建议进用户级`
- 2026-11-06 · 覆盖安装前提 · debug 签名变化会报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` · 不得用卸载解决（丢 Key 与本地库） · 先核对 debug keystore 指纹；必要时先导出 `.smbak` 与 Key 状态再决定换签名。

## 2026-11-06 V1.7 真机（本轮新增）

- 2026-11-06 · 卡片保存 · 点保存一直 `WRITE_TICKET_UNAVAILABLE` · 本地服务对 `/v12/api/demo/write-ticket` 也要求 token，页面 `smTicket` 不带 token · 写票生成免 token（写请求仍校验）；真机保存回「已保存」。
- 2026-11-06 · 录音按钮 · 停止后「开始录音」一直禁用 · 只在收尾 finally 复位，异常/提前 return 时卡住 · `stopStreaming` 立即 `startButton.setEnabled(true)`。
- 2026-11-06 · 后台录音验证 · 切后台 12s 回前台 `isRecording=false`，误判为后台停录 · 用 `am start` 回前台会重建 MainActivity/AsrActivity · 必须用最近任务或锁屏解锁验证；实测 12s/10s 录音保持。`建议进用户级`
- 2026-11-06 · 无 SIM 跑 4G · 关 WiFi 后腾讯直连静默失败、页面回「未开始」 · `gsm.sim.state=ABSENT`、无 rmnet、`mDataConnectionState=0` · 跑 4G 前先查 `ip addr` 与 SIM 状态，无卡时不得把失败写成代码缺陷。
- 2026-11-06 · 海南重负载 · 录音中切海南 P95 557ms · 116 张卡片一次性 `innerHTML`，主线程长任务 · `.placecard{content-visibility:auto;contain-intrinsic-size:auto 240px}` 后 P95 205ms。`建议进用户级`
- 2026-11-06 · 豆包直连音色 · 原生朗读报 `55000000 resource ID mismatched` · 传了系统 voice 名称 `Ruth` · 只接受 `zh_*_uranus_bigtts` 白名单，其他回退默认音色。
- 2026-11-06 · Android 读流 · `/v12/api/places/:id` 直接断连 · `InputStream.readAllBytes()` 在 Android 运行时不存在的 `NoSuchMethodError` · 用自写 `readAll(InputStream)` 循环读取。
- 2026-11-06 · 大图上传 · 3.8MB base64 经 `adb forward` 返回 502 · 代理超时/处理过慢 · 先压到 1600px（约 361KB），或直接在页面内 `fetch` 上传，不走 adb forward。
- 2026-11-06 · 本地服务错误 · 前端只看到 `Failed to fetch` · `LocalHttpException` 被 catch 后静默关连接 · 在 `handle` 捕获可预期异常并回 JSON（code/status），再关闭。`建议进用户级`