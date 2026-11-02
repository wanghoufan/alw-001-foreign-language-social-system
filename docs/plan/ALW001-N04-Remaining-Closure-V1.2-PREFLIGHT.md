# ALW-001 N04 V1.2｜全阶段前置条件审计与一次性准备清单

status: REVIEWED_CLOUD_READ_ONLY
date: 2026-11-02
scope: P0-0 → P0-1 → P0-2 → P1-3 → P1-4 → 实机安装/归档/最终Human Gate
plan: docs/plan/ALW001-N04-Remaining-Closure-V1.2.md
execution_model: 唯一主开发者，遵守原有最终Human Gate；不增加ORCA角色或中间审批Gate
relay: 当前N04 V1.1收件箱SENT，本V1.2草案尚未批准/未入队，不覆盖已有回执

## 1. 已经核查的原始证据

2026-11-02 通过 Mac Mini Project Reader 读取：
- `android-poc/build-apk.sh`：Gradle 8.9组装本机debug APK；`android-poc/README.md`要求JDK17/SDK35；`socialmate-v1.2/install-phone-v040.sh`从唯一授权ADB设备安装，保留原应用数据。
- `socialmate-v1.2/service-v040.sh`：已有单进程管理8790腾讯ASR+8791 UI/AI；从`android-poc/asr-bridge/.env`及`socialmate-prototype/ai-gateway/.env`安全加载配置，默认使用现有环境；存在脚本不证明此刻进程/Key/余额可用。
- `socialmate-v1.2/demo-archive-service.sh`：已有8782本地演示归档，固定目录`~/Documents/SocialMate/Demo/Conversations`；`socialmate-v1.2/archive-service.sh`及服务端归档接收模块负责正式8781；尚需开机自启和手机outbox实测。
- `socialmate-prototype/ai-gateway/ENV_TEMPLATE.txt`列出`DEEPSEEK_API_KEY`及默认预算`DEEPSEEK_BUDGET_CNY=1`；腾讯云SDK需既有AppID/SecretId/SecretKey。本云端**没有读取且不会索取密钥明文**。历史日志声称腾讯ASR真实模式、AI预算存在，但本次不能实跑余额/权限探针。
- `docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/qa/20261102/device.json`显示Android11实体机序列号、APK0.7.3/vc28/SHA；这证明历史操作，不证明**当前**手机在线或已授权。
- `git status`本次返回`main...origin/main`且没有列出未提交文件；此前大批dirty状态已不同，执行者仍需开工时再读，不能将本次检查当锁。
- N04开发任务草案只需要本地Mac/安卓APP/现有腾讯ASR及私有网关，**当前阶段不需要新建GitHub仓库、不需要Vercel/Cloudflare/Netlify部署、不需要购买域名、DNS变更或新数据库**。

## 2. 全 Task ↔ 外部依赖矩阵

| ID | 资源/网站/授权/API/设备 | 关联Task | 目前核实结果 | 类别 | 负责人、最迟需要时点 | 缺失时可用路径 |
|---|---|---|---|---|---|---|
| E01 | Mac mini本地仓库、Git提交与并行文件所有权 | P0-0,P0-1,P0-2,P1-3,P1-4 | 仓库/branch已读；当前git干净，需重新查并发编辑 | B | 开发者开工立即 | 不改有冲突文件，先做只读回归 |
| E02 | Node22+、JDK17、SDK35、Gradle8.9、本地构建权限 | P0-0,P0-1,P0-2,P1-4 | 构建脚本、旧ADB工件存在；本次未运行version/构建 | B | 开发者首日预构建 | 缺工具自己修复；SDK不稳先静态修复 |
| E03 | Mac 8790/8791网关、8781正式归档、8782演示归档、端口占用/服务账号 | P0-1,P0-2,P1-3,P1-4 | 管理脚本已查，历史运行有证据，**当前health未核实** | B | 开工前health及隔离环境检查 | 本地受控测试端口，不能用Mock当真实联通 |
| E04 | 腾讯云ASR账户AppID、SecretId/Key、套餐可用、余额/速率、1元预算闸 | P0-1,P0-2,P1-4 | 旧真实ASR测试有记录、已有.env加载路径；**当前Key有效性/账单未核实** | B；若失效且真ASR不可替代则变A | 开发者先做脱敏探针；仅真云联调前用户必要授权 | 合成音频+隔离mock跑其他回归，不冒充真ASR PASS |
| E05 | DeepSeek API Key/模型ID/余额/1元预算 | P0-1,P1-4 | 现有官方接入及环境变量模板已核实；N04只测试本地推荐规则，无新增付费调用要求 | C（当前不新增） | 开发者检查预算与现有调用；非本阶段硬阻塞 | 本地模板0云调用，不修改已有模型预算 |
| E06 | 真机Redmi与USB调试/安全USB安装/麦克风权限、唯一ADB serial、测试数据备份 | P0-1,P0-2,P1-3,P1-4 | Android11手机曾授权并安装0.7.3；本次**实时在线状态未知** | D（首次授权才需用户） | 开发者先adb devices；最终手机环节可能需用户点一次授权 | 可先构建/服务模拟；最终仍必须真机 |
| E07 | Tailscale / 同机ADB reverse / Mac网络、HTTPS和证书、手机断网测试 | P0-1,P0-2,P1-3,P1-4 | 代码/脚本支持USB端口映射，外网Tailscale当前状态**未核实** | B/C | 开发者联调时检查 | 同机ADB reverse/本机隔离，外网需验收才标PASS |
| E08 | 录音知情同意、真实两人测试对象、BOYA双麦/接收器模式 | P0-1,P1-4及最终真人验收 | BOYA当前历史MONO_MIX；真人双人效果从未被本次验证 | D | 用户本人在真实对话验收时组织并同意 | 先用完全虚构数据、合成音频完成可自测任务 |
| E09 | 私有People/Conversations及演示备份、目录读写与清空边界 | P0-0,P0-1,P0-2,P1-3,P1-4 | 本地Demo9对归档和真实目录隔离有历史QA证据；当前写权限未实测 | B | 开发者首日做隔离hash/备份 | 隔离测试目录，不删除或覆写真实资料 |
| E10 | Mac开机自启/启动项授权、故障恢复 | P1-3,P1-4 | Demo服务当前脚本是手动start，未验证LaunchAgent等持久启用 | B/D | 开发者优先复用现有自启；如系统要求用户点允许则最终集中确认 | 测试脚本方式先自办，不影响前序Task |
| E11 | GitHub远端push、正式发布账号、Vercel/Netlify/域名/DNS/证书/ICP、云数据库 | 本阶段任何Task均不依赖新外部部署 | 本地Mac APP+现有服务；未发现必要新增云部署，本次没有登录平台逐一核实 | N/A（本阶段），若未来改变产品发布方案重新分类 | 无本轮用户动作 | 不引入新账号、付费或域名作为阶段阻塞 |
| E12 | Android高版本设备/小米及OPPO系统浏览器、真人签收和正式版本交付 | P1-4/最终Human Gate | Android11旧实测；Android12+/OPPO没有本轮实测证据 | D | 用户最后可提供其它设备；本阶段无则NOT_RUN且不阻塞软件可完事项 | Android11完成该设备真实验收，不能宣称Android15覆盖 |

## 3. 你本人需要准备的内容（一次性）

**A｜开工硬阻塞：目前没有证据证明存在必须让你立即登录/购买/提供新Key才可开工的事项。**
开发者先复用现有腾讯ASR及DeepSeek配置、真实手机和本机服务，自行核对可用性；如发现实际Key失效/账户欠费/2FA或无法访问的真实硬阻塞，必须用已有后台安全配置指导你一次完成（不在聊天发送明文），并继续不受影响的Task。

**D｜最终真机/真人验收时可能需要你做（现在不阻塞）**：
- [ ] 手机若弹出“允许这台Mac进行USB调试/通过USB安装/麦克风权限”，在设备屏幕上确认。若已授权且adb可用，无需重复操作。
- [ ] 如要验收真人双人通话，安排一位知情同意录音的朋友，使用自己的手机和BOYA设备做短场景；没有时项目标真人场景NOT_RUN，不伪称完成。
- [ ] 如Mac系统首次要求允许开机启动项、设备权限，按开发者统一提供的具体设置步骤处理；无需提前猜授权。
- [ ] 真正准备在另一部手机、Android12+/OPPO上验收时，再提供对应设备；不为本轮增加平台或预算。

**不需要你现在准备**：新GitHub账号、Vercel/Netlify登录、域名/DNS、数据库账号、第二套密钥、提升预算或购买云服务。

## 4. 交接前反事实停工演练

- P0-0：只需当前源码与Node工具，开发者可做；无外部账号。
- P0-1：真实腾讯识别前先脱敏探针；不足则先完成本地final/人物确认及合成链，不让用户中断其它任务；真云成功另记证据。
- P0-2：手机→Mac真实上传依赖ADB权限及服务可用；先独立打通隔离通道，手机暂不在线时做PC端回归，不冒充真机PASS。
- P1-3：开机恢复与离线场景如需首次macOS授权最终集中，先测试既有服务机制。
- P1-4：真机和真人不能由云端替用户完成，QA分类PASS/PARTIAL/NOT_RUN。发布/付费/危险删除仍需明确许可。

**决策**：本轮没有不可替代且确认缺失的A类条件，建议开发者可按已批准的任务连续推进。尚未核实的E03/E04/E06/E07/E09/E10，应作为开发者S0首日必查，而不是写“已确认正常”；绝不因此把需要本人操作的隐患留到中期。新外部服务/正式域名并不在当前任务范围内。
