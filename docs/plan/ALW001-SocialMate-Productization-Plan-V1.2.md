# ALW-001 SocialMate 产品化一体推进计划 V1.2
日期：2026-11-01
状态：已形成更新开发计划；实施与新真机验收尚待执行
项目根：/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统

## 0. 需求纠偏（最高优先级，不允许混淆）
ALW-001 有两种**用途完全不同、必须隔离**的交付物。
A. **私人 Android APP（主产品）**：本人使用。保留既有五 Tab（软件／海南／聊天／关于我／人物）、BOYA/手机录音、腾讯云 ASR、DeepSeek 接话/追问、私有档案、原文会话留存、自动同步到 Mac mini。继续采用“Android 原生 AudioRecord + 内嵌 WebView”的既有混合架构，不因公开 PWA 而重写或删减 Android 功能。
B. **面向外国朋友的公开海南景点 PWA（精简分享窗口）**：朋友收到普通 HTTPS 链接，以手机自带浏览器直接打开，只展示海南115处地点的公开中英资料。可以搜索／筛选／查看地图／勾选自己想去的地方／整理并分享已选清单给发送者。**严禁**录音、字幕、聊天、AI 对话、软件作品集、关于我、人物、历史聊天、个人档案、私有 Mac API、任何密钥或个人信息。不得因为 Android 内部“五 Tab”而给公开 PWA 加五 Tab。PWA 不要求朋友安装 APP、登录或打开 Google Chrome。不要引入在线投票服务器、账户/好友系统、实时通知或任何私有资料同步。
公开 PWA 的“选择”优先纯客户端本地收藏＋生成只含地点 ID 的可分享清单链接、系统分享/复制回退；收件人可通过常用聊天软件把选择回发用户。默认不收集朋友身份、位置或选择历史到服务器。
C. 项目原有私有 HTML/PWA 形式仅为 Android WebView/用户自己的管理界面和内部原型，**不能作为面向外国朋友的公开 PWA**。不得把整个私有组合服务 8790/8791 公开来图方便。

## 1. 2026-11-01 最新证据与实际起点
- Mac mini Project Reader 实际读取 Git：\`main...origin/main [ahead 12]\`，当前无显示的工作树修改；不能推断未推送的提交可随意推送，也不代表其他开发者不会并行改动。
- \`android-poc/app/build.gradle\` 实际是 \`versionName 0.4.0 / versionCode 9\`。历史 QA 有 Mac Node 102/102、TLS 2/2、Android 核心 12、BUILD SUCCESSFUL、Redmi Note 11 (serial <note11-serial>) 安装成功。APK 位于 \`android-poc/app/build/outputs/apk/debug/app-debug.apk\`；历史 SHA \`da46425f7e5e1e69b243ac87171bf47f1301c2f32a25c52a23399236fdf69b7e\`。**Android 已做出来但只是 Debug/开发版，不是独立无 USB 产品**；历史 PASS 不代表本次最新增量 PASS。
- \`socialmate-v1.2/verify-v040.sh\` 已包含 stage 1b 的 2 TLS + 2 安装指引测试；最新 \`verify-20261101-095933.log\` 无 stage 1b 执行记录，必须在 Mac 真跑新回归。
- \`socialmate-prototype/public-share.html\` + \`public-share.js\` + \`public-places.js\`：**现成独立公开海南 HTML**。真实代码支持115处、中英切换、关键字/城市/类别筛选、地点详情、Google/高德导航、单地点URL和分享；\`package-public-share.cjs\` 只打包公开四文件。当前**缺选中/收藏/清单回发**；未发现 \`manifest*.webmanifest\`、\`sw.js\`，故不应冒称已成为正式可安装 PWA。
- \`socialmate-prototype/ai-gateway/server.mjs\` 当前可读到同一网关会提供 \`/api/asr/live\`、\`/api/profile\`、\`/api/ai/analyze\` 和公开 HTML。**公开页面自身无私人资料不代表同一个服务器安全可公开**：应为公开 PWA 另做纯静态发布包/独立托管；绝不对外暴露这些私有 API。
- \`socialmate-prototype/ai-gateway/conversation-archive.mjs\` 已有 final-only/同意/校验/幂等/Markdown+JSON 设计和 8/8 历史定向测试，但**Android 持久 outbox、鉴权接收/API、无 USB 自动传输仍未完成**。源码细节风险：\`normalizeSegment\` 对原始文本调用 \`trim()\`，违反严格逐字保留；文件名只取 sessionId 前8位，存在碰撞风险；JSON先 rename、Markdown后直写，断电会产生不同版本；要加强事务、单调 revision 与可恢复性，不能以“8/8”替代新测试。
- \`SocialMate-Data/Profile/current.json/.md\` 私有用户资料存储与 \`GET/PUT /api/profile\` 已有，历史 5/5 定向测试；与确认后的人物 Markdown 同步还没有完整打通。
- BOYA receiver 在某次现场枚举到 48k/2ch，但 A/B 都 -180.0 dBFS；另一早期实测为双单声道混音。应优先排查两发射器状态，确认有非静音 PCM；不能声称天然独立双轨。
- Mac 8790/8791 仍是 localhost + ADB reverse 的开发服务。腾讯云和 DeepSeek 各自1元限额不可擅自提高；录音、留存导出、云端AI传文字要分别取得知情同意。日志/真机证据为最终验收唯一依据。
- 016「懒得打字」不在本轮 Mac Reader 已授权项目清单；桌面有本地权限时先直接查它的导出文件名、格式、幂等与离线恢复实现，择优复用，**不能假装已检查016**。

## 2. 统一技术分层
公开站：独立可部署静态资源 = public-share.html/JS + 公开地点投影 + CSS + （按需要）manifest/图标/service worker。运行时**零**私有数据API、零令牌、零麦克风、零ASR、零AI。所有公开数据从经白名单过滤的海南115源生成，保护 source 原稿；图片必须版权核验，缺图用文字占位，不要外链不可信图片或为了好看编造图片。
私人 Android：保持原生录音服务和权限控制 + 聊天 WebView + ASR 与 AI；Android app-private持久历史及稳定 outbox。服务端只在Mac本地保存，外部私有连接通过 Tailscale + 经验证的 HTTPS/WSS + 应用级鉴权访问；不能把 Tailscale 私网当成默认免鉴权服务。
Mac 私有服务：localhost 网关(8790/8791) + 接收器鉴权层 + 原子档案存储/副本 + 既有预算/人员确认。私人记录不存于公开站、不由公开站反向调用、不写入Git、无密钥泄露。

## 3. 一次性连续推进的完整开发任务（内部自推进，不在每个小节停工）
### 工作流 A：公开海南 PWA 从现有 HTML 做完
A1. 先核对115字段与中英文自然表达，使用已确认公开字段构建静态数据。维持已有城市/类别/关键字、Google/Amap地图和单地点深链；默认英文，可切中文；界面只包含景点与必要的导航/说明。
A2. 新增“想去/选择”多选、已选数量、查看已选清单、取消选择/清空、按选择过滤。使用设备端 localStorage 持久化，不自动上传服务器；没有用户登录。
A3. 新增一键发回选择：生成只含经过验证的地点ID的 HTTPS 分享链接（如 query ?selected=3,39,41），支持收件人打开回显选中清单；也生成简洁英文名称+地点链接文本；优先 navigator.share，手机厂商浏览器不支持就复制，可经微信/WhatsApp等应用发给本人。URL长度与选择数需要约束，缺损ID容错。这里的“回发”是用户主动通过聊天分享，并非服务器自动通知。
A4. 如确有需要，增加合法 HTTPS 场景下的 PWA manifest + 保守的离线缓存（只缓存公开静态资源，版本更新可迁移，绝不缓存/private API）；不显示必须安装APP的说明。默认浅色、支持深色与字号缩放，保持简洁，严禁资料大杂烩。
A5. 修复移动端详情返回后列表滚动与筛选/选择不丢失、底部安全区和触控区域；适配小米/红米自带浏览器、OPPO 浏览器、iPhone Safari，Chrome只作补充。无外网时至少已缓存地点能读，导航提示需要网络。
A6. **发布隔离关键验收**：公开包精确资源 allowlist、无 51 软件/204步骤、私有人物/关于我/故事、字幕/录音/ASR/AI 或Key；不要直接部署 \`socialmate-prototype/index.html\` 或 \`socialmate-v1.2/index.html\`；单独托管静态资源，确保公网URL绝无私有路由（尤其 /api/profile、/api/asr/live、/api/ai/analyze）；未获授权不部署。
A7. 验收：115数目、每项详情、中英切换、地图、选3项→生成清单链接→另一设备打开→选中完全一致、重载/离线/小屏/浏览器分享回退。前后端不接触私人数据，真实浏览器截图及操作记录。可先完成全部本地构建/测试，不要因为域名未确认停工。

### 工作流 B：Android APP 完整产品化
B1. 运行当前源码最新增量全量回归，确保 stage1b 真正执行；更新新日志、APK SHA。保留原生 MainActivity/AsrActivity 已验收布局/录音同意/停止/后台停录，避免重写原生音频层或把APP误当PWA。
B2. 接通安全私有网络：先实际确认 Mac/手机 Tailscale、私网身份与可信证书，走明确受保护的HTTPS/WSS入口，Android 可配置服务地址，删除日常模式对 \`127.0.0.1\` 与ADB reverse的依赖；ADB只能保留调试模式。明确定义 WebView 与WS鉴权、令牌保护、服务端访问授权、源检查、流量限额与超时；不能把 localhost 8790/8791 或profile/SSE公开。
B3. 以 Android app-private 事务存储所有**获明确留存同意**的 final 原文字段，interim不落盘，保留识别错误和原语言/接收时间/unknown speaker/轨道/mock/provider。原文禁止trim/AI改写，修订只添加独立可追溯字段。录音、永久留存、发送AI文字三项同意彼此独立；后端不可通过伪造 consent:true 来绕过客户端真实同意，需在会话生命周期校验。
B4. 端侧 outbox（可靠队列、持久事件ID、断线补传、幂等回执、重启续传）；停止录音、弱网恢复、Mac重启后自动导出 Markdown+JSON到Mac私有目录。修复 archive 模块短ID文件名碰撞、原文trim、Markdown/JSON写入中断问题；服务端唯一 session ID、校验sha/revision、原子提交/恢复流程、权限0600，避免重复归档/错误覆盖，严控删除权限。
B5. 完善 Android 聊天 UI：首屏实时字幕、说话人待确认、1句接话+2–3追问+真实资料卡、正在录音/断线/恢复/结束、历史会话、原文、同步状态与重试；云端AI未授权不传文本、mock/interim不花钱。独立保留五 Tab 与官方51软件/204步骤/115海南地点/5故事，不把公开PWA的“只显示海南”限制错误施加到私人APP。
B6. 经用户确认后的“关于我/人物”资料才入正式 People Markdown；会话原文与人物推断/AI复盘严格分离。复盘未来可以读取经授权的原文，不能覆盖。参考016的导出流程，允许选择日期范围批量导出。
B7. BOYA：先确认两个发射器电量/连接/静音/增益、手机USB设备路由，A/B分别讲话测 PCM RMS/peak。若为mono mix就明确显示mix，用说话人聚类但不冒充真实身份。真机两人对话与嘈杂场景测试；若硬件仍-180dBFS，列出硬件阻塞而继续其他可完成代码/网络/APP QA。
B8. 录音权限/保留权限/AI权限、切后台停录、锁屏/网络切换、服务重启、预算闸、重放、强制关闭APP、错误鉴权与证书、安全删除/保留策略都做自动化与真人验收。不得把synthetic/mock当真人现场。
B9. 构建新的Debug APK，真实更新唯一确认的 Note11 serial \`<note11-serial>\`，使用保留数据的安装路径；如需要正式发布/签名/商店上架另请授权，禁止自动部署。

## 4. 开工预检与阻塞处理
- 桌面先读 \`~/.agents/AGENTS.md\`、项目 handoff/QA/SPEC、Git diff、正在工作智能体的文件所有权；合并迭代推进，不加多余审批Gate。若同文件正在被另一个开发者改，开发者选择独立子模块/测试先推进，不强行覆盖。
- 016导出实现：本机读取，不可读时在计划中注明仅影响复用，不应阻塞独立实现。
- 现有API key和Node/JDK/SDK已具备的证据先核查，不让用户重复填；预算维持各1元。录音硬件与真人配合是最后验收条件，先完成无硬件任务。
- PWA 静态 HTTPS 托管（临时域名可先测试），正式域名/DNS、外部访问和公网发布均为最后授权，不作为开发中止条件。
- Tailscale账号、两端客户端、Mac常驻与系统权限要核对；安装或登录若真需用户动作，集中列一个清单，不要每完成一步问一次。
- 需要真实操作的人为同意、个人数据删除和部署/推送保留用户控制；普通bug、构建失败、测试失败自动修复重跑。

## 5. 连续验收矩阵和完成口径
PWA:
PWA-01 独立公开目录及打包只含白名单文件；0私人数据/0私有API。
PWA-02 115条、城市/分类/搜索、双语详情、Google/Amap导航真实点击。
PWA-03 任意选择→刷新保留→生成链接→另一手机打开恢复同一选择→朋友通过聊天分享给用户；不上传私有服务器。
PWA-04 机型原生浏览器实际通过（Redmi/Xiaomi/OPPO，iPhone Safari若可借到）；默认浅色/可切深色/可放大，截屏。
PWA-05 HTTPS/缓存/弱网兼容；公开路由枚举无 /api/profile /api/asr/live /api/ai/analyze，无录音权限请求。正式公开发布须明确授权。
Android:
APP-01 当前所有代码/Gradle测试真实通过，新日志含TLS/安装校验，APK hash实际重算。
APP-02 真机APP从首页→录音同意→真实 ASR final→字幕/AI独立同意→真实建议卡→停止/退后台。
APP-03 非ADB、USB实际拔掉，通过可信HTTPS/WSS私有访问，非法凭据和坏证书被拒绝。
APP-04 手机关闭/断网/重开，原文final不丢/不重；自动上传Mac，Markdown/JSON与收到final逐字匹配，时序/来源/unknown一致，有SHA与文件权限。
APP-05 录音/归档/AI同意三闸，未授权不采集/不持久化/不发送模型；1元预算边界有效。
APP-06 BOYA真实非零PCM，混音则明示mix；无法恢复记录BLOCKED而不是通过。
APP-07 聊天UI真实手机截图与可操作性；50+大字号和网络错误态；个人资料不能未经确认自动写正式档案。
APP-08 Mac service守护/重启与恢复、手机弱网/切换/后台状态有复现证据。

每条按 PASS/FAIL/NOT_RUN/BLOCKED 填 \`socialmate-v1.2/QA.md\`、新原始日志（.local/qa）、真实截图、文件 hash 和时间；同时更新 handoff、CHANGELOG 和剩余问题。已通过的历史工作不重复测试除非修改影响回归。代码写完不代表设备验收。

## 6. 一体化执行指令（不按小阶段反复停）
开发者的工作单位是“把 **Android私人APP + 海南公开PWA** 两个成果推到接近可交付”。先给自己形成技术任务依赖图，然后把互不冲突的 B（可靠归档/私网）与 A（公开PWA）并行推进；连续分析→实现→单测→集成→构建→QA→修复→复测。任何内部阶段结束自行进入下一项，不需要问“是否继续”。不存在外部权限/硬件阻塞时，不能提前以“计划已完成”作为完成目标。真正物理验证需要用户在场时，先完成所有其他分支，不把全部工作暂停。严禁自动上线、push、reset/clean、清空数据、提高预算或覆盖其他智能体文件。

## 7. 下一份交付必须说明
1. 新增了哪些用户实际可用功能，文件/提交/版本号；现有Android是否已脱离USB使用（有真机证据才答“是”）。
2. 外国朋友的海南PWA是否已拥有可分享HTTPS链接（未部署则回答“否”），选择清单能否回传。
3. Mac自动归档是否已实际写盘并被第二设备验证；保留原文精度和幂等。
4. 全部测试真实结果、APK hash、PWA资源清单hash与设备型号。
5. 剩余非代办项集中列举，不反复要求用户“继续”。

**验收红线**：Android私有功能始终不公开；海南公开PWA始终只有公开地点及选择清单；未经授权不录音/不保存；不把旧测试当最新验收；不擅自部署。