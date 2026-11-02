# ALW-001 N04 V1.3｜全阶段一次性开发前置审计

task_id: SM-ALW001-20261102-N04-V13
project: ALW-001
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
approved_at: 2026-11-02T14:22:00+08:00
approved_by: USER_EXPLICIT_APPROVAL_PLAN_1
status: APPROVED_EXECUTION_PACKAGE
mode: SINGLE_MAIN_DEVELOPER_CONTINUOUS

applies_to: S0,T1,T2,T3,T4,T5,FINAL_SIGNOFF
current_state: SOURCE_LOG_AND_CONFIG_VERIFIED; REAL_TIME_AUTH_AND_DEVICE_STATUS_UNVERIFIED

**不能把“历史日志中已配置”写成“此刻已通过”**。工具仅可读取Mac项目文件/Git，不能调用Mac命令行、浏览器后台、真实ADB、云账户以确认实时权限。本清单覆盖T1→T5直到用户外出使用和验收，启动S0实测后把未核实项标PASS或BLOCKED，未获证据不能冒充。每个真实硬阻塞一次性合并列给用户，别分阶段不断索要。

## A/B/C/D 定义
- A：用户必须亲自操作的当前硬阻塞（缺就不能完成相应真实开发主链），在可自行探查后一次性请求。
- B：开发者自行配置/安装/修复，**不打扰用户**。
- C：可用现有服务/隔离Mock/临时路由继续其它开发，不能把替代测试声称正式验收。
- D：最后实机/真人/正式发布才需要的用户同意或人工操作；不能让其它Task中途停工。

## 全Task依赖清单（必须对照实际运行）
| ID | 登录/授权/API/配置/设备 | 关联 | 现状证据/缺口 | 类别 | 开工动作及缺失替代 |
|---|---|---|---|---|---|
| R01 | Mac mini项目/000官方登记/Git/并行所有权 | S0-T5 | 当前可读写001、Git 3个public-share文件dirty（他人任务不可改） | B | 首步git diff/修改者核查，保留改动；用独立分支/文件所有权协调，不reset/clean |
| R02 | Node、JDK17、SDK35、Gradle、Android构建、adb | T1-T5 | 旧构建/0.7.4安装曾成功，0.7.7/SDK当前状态未实测 | B | 开发者查版本、磁盘、编译能力、ADB授权/序列号；工具缺失自行修 |
| R03 | Mac 8790/8791/8781/8782服务及启动账号 | T2-T5 | 旧日志healthy，当前运行状态未知 | B | 服务health、端口所有权、归档权限、进程/启动项检查，失败先隔离端口 |
| R04 | 腾讯云ASR账号、AppID/SecretId/SecretKey、余额、模型可用与速率 | T2,T5 | 旧health显示 Tencent mode、配置有效、账本<1元；实时账号/余额/签名权限未知 | B→若不可代办才A | 先无需打印key的配置完整性、脱敏可用性/预算探针；失效才集中指导用户从腾讯云控制台授权/充值（不在聊天贴密钥）；先做离线与合成回归 |
| R05 | DeepSeek 官方API Key、权限、额度、模型、1元预算 | T2,T5 | 旧health显示已配置/曾可调用，新阶段不依赖新增模型；当前余额未知 | C/B | 验证但不涨预算、不重置账本；用本地规则验个性化，不因非关键模型阻塞 |
| R06 | Android归档令牌/后端签发、轮换与设备绑定、HTTPS/Keystore | T1,T3,T4 | 构建脚本当前从.local/archive-token写BuildConfig常量，存在APK静态泄露风险 | B；若新设备绑定必须本人确认则D/A | 先实现与评估安全替代、轮换/过期/拒绝，保留老版本迁移，不要求用户复制秘钥。不可逆轮换须备份和授权 |
| R07 | 安卓手机、USB调试、USB安装权限、麦克风权限、实际参与者录音同意 | T2,T3,T5 | Redmi Note 11曾被ADB授权，当前在线/弹窗未知；无权自动同意真人录音 | B/D | 开发者先adb devices并使用固定serial；若系统请求一次性确认由用户手机上授权，只有最终真人短录才需要参与者同意 |
| R08 | Tailscale Mac+Android、个人Tailnet登录、Serve路由、私有HTTPS证书/WSS | T3,T4,T5 | docs/architecture-facts曾记 `443/alw→8781`, `8443→8791`, `10000→8790`；近期真机依赖adb reverse，没有无USB最新证据 | B→授权异常时A | 开发者查两端已登录、auth、ACL/访问控制、cert/port mapping；需要本人2FA时集中一次处理；先用本机隔离集成，但不得称外出可用 |
| R09 | 数据目录权限与备份、真实People/Conversations隔离、9对Demo母版 | T1-T5 | 旧QA数据/目录已存在，当前可写与备份需复核 | B | 原始sha前后比较，受控合成/临时目录，禁止删除真实人物和9套演示 |
| R10 | Mac开机自启、LaunchAgent/系统后台权限及1-2步GUI恢复 | T4,T5 | 当前8782是独立手动脚本，自动重启未验 | B→系统首次同意才D | 复用已有守护，查自启/权限/日志；若macOS弹权限提示一次性收集 |
| R11 | Android本地存储/SAF文件选择器、签名、安装保留数据 | T3,T5 | N03历史SAF可用、0.7.4 installed；最新不可假设 | B/D | 当前版本真机复测导出，签名冲突不可自动卸载，必要时最终Human Gate |
| R12 | BOYA双麦、第二个真人参与者、知情同意、较新Android设备/OPPO浏览器/iPhone Safari | T5最终 | BOYA历史MONO_MIX；真人双人及缺机浏览器未完成 | D | 现阶段用合成内容+目前可用Redmi完成全部可做项，真人双人/额外设备存在时再验，否则NOT_RUN |
| R13 | GitHub凭据/推送、正式签名/商店发布、Vercel/Cloudflare/Netlify、DNS/新域名/数据库 | 本阶段全Task | 当前范围是Mac私有服务+本机侧载APP，**无需新公网发布** | N/A | 不要求登录、不购买、不新增服务；未来用户改变正式发布范围时另行完整审计 |
| R14 | 测试产物与手机截图/日志存储、APK_SHA及哈希工具 | T1-T5 | 原有`qa/20261102`存在，但版本0.7.7及后的新证据未齐 | B | 新增时间戳QA目录+证据索引，旧数据只读不覆盖 |
| R15 | 已有隐私/计费/同意闸与用户授权 | T1-T5 | 腾讯ASR/DeepSeek各1元预算约束、真实原文留存默认关闭 | B/D | 任何真实真人录音获得参与者同意；测试尽量不消费云额度；不改变限额、不把合成说真人 |

## 用户本人现在需要准备什么？
### A｜立即需要你操作
**目前没有经实测确认为缺失、非你不可的A类事项。** 现有Key/账号历史已配置，但真实有效性和实时手机/Tailscale登录还未由本连接验证。开发者须在 S0 做逐项实际预检，并且在继续其它可做工作时把真正A项一次性集中向你说明，不能中途频繁要求提供材料。

### D｜最后可能需要本人
- [ ] Mac/安卓若弹 USB调试/安装、麦克风权限或Tailscale重新登录的设备提示，由你在自己设备上授权；如果已有授权无需重复。
- [ ] 如实际要求在无USB的手机上首次配对私有入口，只需完成**一次安全登录/配对**，不要在聊天传Token明文。
- [ ] 最后若做真人双人录音/BOYA分离验收，需你和另一参与者明确知情同意；若暂无人选仍可完成其它代码和合成/单人验收，双人标NOT_RUN。
- [ ] 最终签收时点按真实手机的完整验收脚本；其他较新Android/OPPO/iPhone设备仅在你有设备时再测试。
- [ ] 如macOS首次启用自启动项要点安全确认，只集中一次报告。

### 本阶段不需要
新腾讯云/DeepSeek Key（先复用旧配置）、新GitHub仓库、Vercel/Netlify/Cloudflare权限、域名/DNS/ICP、云数据库、App商店账号、付费套餐、升级任何现有1元预算。**不得误说开发者可以无条件跳过最终真实登录/录音同意验证。**

## 反事实停工检查（实际做完才开编）
1. T1不会因ASR余额/安卓不在线而停；做静态源句/鉴权/bridge负面测试。
2. T2若真实腾讯Key失效，先做合成输入通过真实pipeline、人物事务/回滚，然后等待集中授权；真人不得无同意录音。
3. T3若手机不在线，先完成接收端/idempotency/离线模拟、服务错误恢复和SDK构建；手机最终验证不能假冒。
4. T4若Tailscale登录过期，先排查本机服务、自启动/证书/ACL，需2FA时最后集中授权；USB reverse不能当无USB PASS。
5. T5若设备缺失，所有代码/Build/Node回归必须完成，真机或真人缺失标NOT_RUN，等待真实设备；不让代码任务中途停。

**审计完成证据要求**：开发者将R01–R15填写 status=VERIFIED/BLOCKED/NOT_NEEDED、命令退出码/脱敏运行结果、用户必需动作/替代方案写入本轮QA；未见真实安全探针则仍是 UNVERIFIED，不能给用户说“准备完成”。
