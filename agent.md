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
## 2026-11-07 阶段整理 / 真机对话（本轮新增）

- 2026-11-07 · 阶段整理 · `docs/` 膨胀到 472MB，241MB logcat 直留在 qa 目录 · 原始日志随会话累积且无归档策略 · 压缩为 `.local/archive/*.tar.gz`（18MB）并用行数校验完整性后删原文件。`建议进用户级`
- 2026-11-07 · 真机多轮录音 · 第二次会话混入上一轮 44 条消息，ASR/归档被污染 · 页面 `S.session` 在两次 `startRecording` 之间不重置，「开始新一轮」只改按钮文案 · 测试前显式清 `S.session/recs/asrSeen`，归档按 sessionId 核对，测试会话用完即删。`建议进用户级`
- 2026-11-07 · 停止录音 · 10:28 出现停止后的新会话并录到朗读声 · 受控 20 秒复现未重现，暂判为外部点击或页面状态残留 · 停止后必须查 `isRecording` 与 `files/archive/outbox` 的 mtime；发现新会话先清理再定性，未复现不得写成自动重启缺陷。`建议进用户级`
- 2026-11-07 · 外放语音测试 · `say -o` 生成的部分句子只有 0.005–0.8 秒，ASR 缺句 · 默认音色/语音标记导致截断 · 用 `say -v Samantha/Daniel` 生成，`afinfo` 逐句核对时长后再播放。`建议进用户级`
- 2026-11-07 · 真机测试收尾 · 两次发现 Wi-Fi 被改回关闭状态 · 测试期间有其它会话/用户操作手机 · 收尾必须复查 `wifi_on` 与 wlan0 IP，不能只执行一次 `svc wifi enable`。`建议进用户级`
- 2026-11-07 · 文档事实 · STATUS 修正 APK SHA 后 `architecture-facts.md` 仍写旧 `5cfb736c…` · 同一事实两处维护 · 版本/SHA 以真机 `base.apk` 为准，改完同步两处并核对。`建议进用户级`
- 2026-11-07 · 复盘入口 · `openReviewPage()` 返回 true 但界面仍在聊天页 · 原生 `openReview` 在无 lastSessionId/未导出时只改 status 文本，网页把 true 当成已打开 · 返回 true 只代表受理，必须再查前台 Activity/URL，并补无内容时的明确提示。`建议进用户级`

## 2026-11-08 OPPO 换机 / 字号线 / 原生朗读（本轮新增）

- 2026-11-08 · 页面改字号 · 补丁写了但页面完全没变 · 补丁被插进已有 style 块内部，解析成无效 CSS 文本 · 改后读 `getComputedStyle` 与 DOM 标记验证，grep 命中不等于生效。`建议进用户级`
- 2026-11-08 · OPPO 底部留白 · 导航栏高 107px、下方 46px 空条 · 原生已扣 44dp 视口，页面又叠 `env(safe-area-inset-bottom)` · 原生已避让时页面不再叠；导航 107→62px。`建议进用户级`
- 2026-11-08 · 页面改动不生效 · 覆盖安装后仍是旧页面 · WebView 缓存了 max-age=60 的 index.html · 静态页改 no-store，改后查 DOM 标记。`建议进用户级`
- 2026-11-08 · 页面构建 · 重跑 `build-v12.py` 会覆盖 V1.5–V1.7 手改 · 脚本只基于 V1.1 基线 · 页面真源是 `socialmate-v1.2/index.html`，Gradle 复制进 assets；勿重跑旧脚本。`建议进用户级`
- 2026-11-08 · 换机/重装 · 录音报「未配对或令牌失效」 · 新机 `asr_mode` 默认 `mac`，填了 Key 但模式没切 · 先 `setAsrMode('direct')` 回读 ready 再测。`建议进用户级`
- 2026-11-08 · OPPO 原生朗读 · 学习页「听本段」无声，`TTS_INITIALIZING` · 原生队列 provider 默认 `system`，OPPO `tts_default_synth=null` 无系统 TTS · 有豆包 Key 默认 `remote`，系统 TTS 只回退。`建议进用户级`
- 2026-11-08 · 原生朗读 · `RejectedExecutionException`，队列 `TTS_INTERNAL_ERROR` · 线程池 `release()` 后仍被复用 · 改为按需重建（`isShutdown` 时新建）。`建议进用户级`
- 2026-11-08 · 字号放大 · 卡片被撑到 463px、人物卡左侧字母头像占位 · 字号放大使 3 行截断失效；`.avatar` 占 40×40 · 恢复 `-webkit-line-clamp`、隐藏 `.person .avatar`；卡片 463→296px、人物卡 117→76px。`建议进用户级`

## 2026-11-09 N06 原型 / 浏览器 QA 通道（用户立规）

- 2026-11-09 · 页面/真机 QA 通道 · 直接用 `open` 或前台 Chrome 会弹出窗口、占用用户 profile 并抢焦点 · 本机默认 https 处理程序是 Google Chrome，裸 `open` 必然弹 Chrome · 浏览器 QA 统一走后端 MCP Neo：复用已登录旧标签，每轮最多新开 2 个测试页，结束关闭自开标签；MCP 不可用时退回无头 Chromium（Playwright 自带运行时），禁止碰用户主 Chrome。`建议进用户级`
- 2026-11-09 · 并行子代理 · 反复权限确认会阻塞并行开发 · 子代理默认走自动审批模式，继承当前模型与主智能体自己的 Task 通道，不得绕到 orca 子代理通道；按文件/目录分轨，禁止多代理同改一文件。`建议进用户级`
## 2026-11-09 N06 阶段 2 真机（本轮新增）

- 2026-11-09 · 真机所有图片都不解码 · 海南列表封面与详情画廊 `complete=false`、`naturalWidth=0`，页面内 `fetch('/v12/img/...')` 挂起超时 · 一次挂起的图片请求堵住 LocalServer 串行处理，后续请求全部排队；`curl` 带正确 Host/Origin 直测图片 200/24ms · 先 `force-stop` + 重启 App 恢复，再取证；不要先改前端或判图片 404。`建议进用户级`
- 2026-11-09 · 真机 CDP 点击导致误入记录详情 · `[data-open=place][data-id=3]` 未限定 `#results` 时命中画布外残留节点 · 选择器要限定可见列表容器（`#results …`），点后回读 drawer 标题再继续截图。

## 2026-11-10 N06 阶段 3（本轮新增）

- 2026-11-10 · 子代理内容收集 · 两次返回「还在努力学习」空话，文件未生成 · 任务范围过大/触发兜底 · 拆成单文件、限定 12–20 条、明确「只写文件 + 每条实抓来源」后成功；主代理回源抽检（香港天文台、Nager）再接入。`建议进用户级`
- 2026-11-10 · 页面取词 · 点字幕词取不到词 · 只用 `textContent` 无法定位字符 · 用 `caretRangeFromPoint` 取光标词，优先长按选区；合成 click 需带真实 clientX/clientY。`建议进用户级`
- 2026-11-10 · APK 内 AI 直连 · 页面新接口 401 `TOKEN_INVALID` · `LocalServer` 对 `/api/ai/*` 要求 `x-archive-token`，页面直连 fetch 不带 · 新接口显式带 `uiToken()`；旧 translate/analyze 同样风险待核。`建议进用户级`
- 2026-11-10 · 无头验证 · 「0 JS 异常」被 favicon 404 判红 · 浏览器自动请求 `/favicon.ico`，服务未提供 · 资源 404 与业务异常分开记录，不断言为代码缺陷。
- 2026-11-10 · 数据合并 · 手改单行 JSON 风险高 · N06_FEST 是 89KB 单行字面量 · 用 Node 脚本读取子代理 JSON、按 id 合并、再 `node --check` 验证内联脚本。`建议进用户级`
- 2026-11-10 · 真机 CDP · 安装后 forward 9223 指向旧 socket · 进程 PID 变化，旧映射失效 · 按新 PID 重建 forward，收尾移除自己条目，不动他人 9461/9462。
- 2026-11-10 · 内容二次扩充 · 同一天两版（0.9.16 → 0.9.17） · 首批 76 条后用户要求继续收集 · 补文化习俗 8 条、更多 12 条后共 96 条，必须 bump vc85 重新出包并覆盖安装；文档里的版本/SHA/条数同批改，不能只改一处。`建议进用户级`
- 2026-11-10 · 分类维度 · 用户指出只有生活/文化/健身太少 · 96 条内容压在「更多」大杂烩 · 补球类 18、板类与户外 14、工作学习 20、家庭与关系 17、金钱健康科技 18，共 170 条；一级标签不增，页内按 `subtheme` 分组渲染，避免顶部标签继续膨胀。`建议进用户级`
- 2026-11-10 · 球类内容 · 外国朋友爱打球，原有仅足球/篮球 · 缺乒乓球、网球、匹克球等 · 按项目一条，来源用国际单项联合会（ITTF/Wimbledon/Pickleball Canada/BWF/FIVB/WBSC/ICC/World Rugby/R&A/WPBSA/USBC/World Squash/IHF），便于后续按兴趣扩展。

## 2026-11-10 体验修正（0.9.21）
- 2026-11-10 · 点词提示勾选 · 页面根本没有该复选框，`cloudConsentChecked()` 恒 false，自动接话也从未触发 · 改版删了 UI 但门禁代码残留 · 取消门禁代码而不是把复选框加回来；移除前先 grep 所有 `cloudConsent/translateConsent/ttsConsent/aiConsent`。`建议进用户级`
- 2026-11-10 · 翻译/接话 401 · APK 内 `/api/ai/*` 要求 `x-archive-token`，页面直连 fetch 未带 · 之前被 consent 门禁挡住没暴露 · 所有 `/api/ai/*` 页面请求统一带 `uiToken()`，并用真机回读验证。`建议进用户级`
- 2026-11-10 · 接话显示 `[object Object]` · 真实 AI `reply` 是对象，渲染按字符串拼接 · 门禁取消后 AI 首次真正触发 · 新增 `aiReplyParts()` 兼容字符串/对象，网页断言检查无 `[object Object]`。`建议进用户级`
- 2026-11-10 · 点词卡字号被放大 · 卡片内 p 继承全局 `p{font-size:19px!important}`，四问每条 134px、整卡 961px · 全局字号下限规则优先级最高 · 卡片作用域加 `!important` 覆盖；改完用 CDP 量 scrollHeight，目标 ≤ 视口。`建议进用户级`
- 2026-11-10 · 复制提示受浏览器限制 · JS 合成 click 无用户手势，`execCommand('copy')` 与 clipboard 都被拒 · 真机验证不能用 `element.click()` 判剪贴板 · 用 CDP `Input.dispatchMouseEvent` 派发真实输入再读 toast；真实手指点击可正常复制。`建议进用户级`
- 2026-11-10 · 英文问句断行难看 · 复制按钮与问句同行挤占 232px 宽 · 长英文在窄栏被挤成「it?」 · 按钮移到中文行右侧，英文独占整行；先量宽再调布局。`建议进用户级`
