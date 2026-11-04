# SPEC｜V1.4真实场景的四项技术合同

status: USER_APPROVED

## S1 P0｜Android锁屏后台连续学习朗读
- 用户进入红城湖第1段点击「循环×3」后按电源键熄屏、放入口袋，完整队列仍连续：中文→英A→英B→每词组中文→1000ms静音→英文，重复三轮。不能用常亮屏或不锁屏的权宜测试伪装PASS。
- 先调查当前WebView网页队列、Activity.onStop与TTS/原生回调的生命周期耦合。把播放队列的所有权移到独立于Activity存活的Android后台媒体播放组件，复用V1.3队列算法、声线、缓存键、revision与音频真实完成回调；WebView只负责显示/下发受控命令。
- 使用合规mediaPlayback前台服务+媒体会话/持久通知。当前targetSdk35，按Android官方规则确认Android 14+前台服务类型及权限FOREGROUND_SERVICE、FOREGROUND_SERVICE_MEDIA_PLAYBACK，service声明foregroundServiceType=mediaPlayback。Android13+通知权限按系统规则处理。不得用后台偷偷录音或开机时自启媒体服务。
- 通知栏有播放/暂停/继续/停止与轮次状态，不能显示真人对话正文、用户个人故事、地点等私人文本。来电、音频焦点、耳机拔出、蓝牙断连按平台合适策略暂停/停止，明确恢复条件，保证不会同时朗读两个队列。切回APP可实时恢复状态。
- 系统TTS真实朗读优先验证，首次初始化、超时/故障、杀进程、网络断开必须状态准确；音频回调驱动下一元素，旧队列token失效后任何晚到回调不得推进。媒体播放完成即停止前台服务，不无限常驻。手机当前为Redmi Note11 Android11；第二台Android14/15需要授权安装时标NOT_RUN。
- 官方技术参考：https://developer.android.com/develop/background-work/services/fgs/service-types 与 https://developer.android.com/about/versions/14/changes/fgs-types-required 。

## S2 P0｜Mac mini无人值守自动资料归档
- 保持现有LearningArchive五类sourceType及原件引用、哈希、派生文件、索引结构。调查为什么老watch（11月2日实例）不能继续按300秒扫描；核对launchctl label、脚本路径、工作目录、日志/失败退出、PID、实例归属，只对本项目正确实例安全重新加载。
- 保存原件到既有目录后后台自动扫描、分类、去重、派生规则/已授权AI处理；支持网络断开、worker被杀/崩溃、Mac重启/重新登录后自动补扫，时间戳可检验。成功回执含来源/数量/hash，失败有重试码/下一次时间及健康提示；不要求用户运行终端。
- 85条索引中必须把self_test的QA fixture标记为test，而不冒充1条真实学习成绩；course=0维持NO_SOURCE，P016真实收件为空时明确未接入。一次扫描新增0幂等，源修改记新版本且原件不覆盖。输出lastScan、running PID、计划间隔、失败/滞后状态；连续漏扫至少两个周期标DEGRADED，可通过已有恢复入口自恢复。
- 云AI仅在相应类别授权与原有预算许可下处理；未同意保留awaiting_consent不外传私人原文。

## S3 P1｜脱离USB的手机无线实际使用
- 复用现有Mac Tailscale Serve和手机Tailscale，查验443/alw→8781、8443→8791、10000→8790是否真实有效（不是按旧资料假定）。不搭新的公网服务、正式域名或不安全明文HTTP。
- 手机需要Tailscale首次登录/配对时，一次性集中列出用户需要操作的项目，其余开发与网络测试不断工。真实验收拔掉USB、清adb reverse、断开无线adb，在同LAN和蜂窝网络访问已有私有页面并测试红城湖完整听读、复盘保存、断线恢复与Mac归档。
- 必须保持合法HTTPS/私网、证书正常核验、token与设备授权、失败可恢复。不能把服务端curl成功或adb reverse替代脱离USB真机通过。若因用户未登录导致无法实测，标PARTIAL/NOT_RUN而不是谎报PASS。

## S4 P1｜P016安全自动投递跨项目交接
- 仅引用V1.3/qa/20261103-t3-t4/P016-HANDOFF.md的现有详细D1–D4：未鉴权明文18791全接口监听、pushToMac失败也标已送达、只导出当天无法跨天补传、22:00自然调度未验证。
- 由ALW开发者形成可交P016主管的待办和联合接口C1–C4；P016项目另行批准才能修改它，ALW本阶段不得主动改P016代码。ALW侧只负责安全收件目录和self_test文件落地后的自动索引。
- P016真正手机自然定时、安全投递/失败补传及Mac原件落盘得到证据前，ARCH-03保持NOT_RUN；QA自测fixture不能冒充。

## 非本阶段
不新增学习中心/课程看板、不重新优化19段中英教学文字、不启用真实AWS付费、不强收红城湖照片、不改公开PWA、不自动读取ChatGPT对话、不自动发版。

## 不可突破的边界
- 单一主开发者连续实施；只在用户专属登录、明确隐私/付费授权、最终真实Human Gate请用户介入。禁止重做N05 V1.3已经真机通过的19段混合语言播放器、20轮300项循环和GPT复盘。
- 不增加学习中心Tab、课程管理、公开PWA功能；不得改公开海南115地点/V1.4作品资料/他人已确认档案。原始逐字文本不可覆盖，派生版分层留版本。
- 禁止Git reset/clean、覆盖其他开发者dirty工作、盲杀服务、清除手机数据、自动commit/push/release。设备必须校验serial和安装签名，增量adb install -r。
- 真实AWS Polly预算仍为0，未经用户额外明确授权不调用真实Polly、不外传个人想法/聊天原文；DeepSeek和腾讯云现有1元闸不增加。不得把fake音频当Polly真人音质。
- P016独立项目只读交接、不擅自改源码/重启未鉴权18791；真实聊天留存需双方同意。服务仅走现有安全内网/Tailscale HTTPS与配对鉴权。
