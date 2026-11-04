# N05 开发→部署→Android真机验收：全Task前置条件审计

status: PRELIMINARY_CLOUD_SOURCE_CHECK; DESKTOP_REALTIME_PROBES_REQUIRED
date: 2026-11-02
covered_tasks: UX01,MEM01,LOC01,LANG01,PRACT01,QA01,release/install
class: A=用户必须做的开工硬阻塞; B=开发者自办; C=可替代继续开发; D=最后真人/设备/登录才需本人

| ID | 依赖 / 账号 / Key / 登录 / 设备 | 影响Task | 本轮检查事实 | 类别 / 谁负责 |
|---|---|---|---|---|
| E01 | Mac mini已有ALW001源文件/000登记与本地写权限 | 全部 | 本连接已成功读项目，项目 Git 许多N04未提交文件，开发者在运行，不能双写 | B，开发者协调文件所有权，不能自动覆盖 |
| E02 | Node22、JDK17、AndroidSDK35、Gradle8.9、ADB与测试存储 | 全部/QA | N04 0.8.1/36确有真机与构建QA，**当前状态仍需实查** | B，开发者 |
| E03 | Mac 8790 ASR / 8791 私有UI+AI / 8781正式归档 / 8782演示归档及服务自启 | MEM01,LOC01,PRACT01,QA | N04 T4证据说明服务与LaunchAgent能自愈；当前实时健康未直接检测 | B，开发者S0检查 |
| E04 | DeepSeek 官方API Key、模型可用/额度/计费/1元上限 | MEM01,LOC01,PRACT01 | 旧私有服务已有Key、budget；本轮只需分析按钮时受限调用，不需要新Key。S0安全探针检查实时余额 | B；失效且真实AI不可替代时A（用户安全登录重授权） |
| E05 | 腾讯云ASR AppId/SecretId/Key、账本/预算/网络 | MEM01语音输入、QA | N04 T2 `mock:false`和单次合成音频走真实ASR有日志；不证明此时Key仍有效；文字录入不依赖 | C/B；S0探针失败时允许先文字链，真实云ASR最后验收需授权 |
| E06 | Android 11 已安装系统中文/英语TTS引擎和声线语音包 | LANG01/QA | 官方TTS API可查询但**当前手机实际声线未测试**；无需新API Key，若缺语音包需设备系统下载/允许权限 | B，必要时D用户在手机点安装/确认；优先不增加费用 |
| E07 | Android系统语音识别服务/麦克风权限 | MEM01语音输入/QA | Android11系统识别可用性未知，API31的严格on-device识别接口不适用当前Android11 | C，提供文字主路径，系统识别不可用再用已授权腾讯ASR且遵守1元限额 |
| E08 | ChatGPT Android App登录、Voice权限、手动复制提示词与复盘 | PRACT01/QA | 官方支持同一会话文字与Voice，但外部ChatGPT的登录/麦克风状态不可从Mac确认 | D，用户在最终验收时按设备常规登录并允许麦克风；开发者只检查复制分享，不索取账号密码 |
| E09 | 当前115地点数据/地点ID与公共PWA隔离 | LOC01/QA | `socialmate-v1.2/source/places-115.json`存在，龙兴路`id=1`，公开PWA不得写 | B，开发者做独立PlaceNotes存储，测试hash |
| E10 | Mac 私有人物和新地点笔记文件夹、读写与备份权限 | MEM01,LOC01,PRACT01 | People主档存在且有原子写撤回链，PlaceNotes拟新增，仅本地隔离，不需新数据库 | B，开发者 |
| E11 | Tailscale手机/ Mac账号授权、私有HTTPS路由、无USB移动网络 | QA外出使用 | N04 T4明确：Mac端证书已核验，测试Redmi Note11手机 **尚未登录Tailscale** | **D：需要用户本人在手机完成一次授权**，开发者继续不受影响的Task |
| E12 | Redmi Android11 USB调试、保留应用数据安装、真实朗读聆听 | QA/发布 | N04 0.8.1有安装证据；要核查当前serial、真实音量/语音包，物理拔线不是软件替代 | B/D，开发者先准备，最后设备授权及主观声线试听由用户 |
| E13 | 公开网站、DNS、Netlify/Vercel/Cloudflare/GitHub新登录/数据库/新TTS付费Key | 本阶段全部 | **没有依赖**；只做已存在的私有安卓APP与Mac服务，PWA不动 | N/A，不需你提供 |
| E14 | 虚构测试素材、第三方朋友同意、私人感悟和档案隐私 | 全部/QA | 开发者使用虚构3人物/地点笔记；不读取/上传真实朋友私密对话做测试 | B；真人验收与对外传播时D |

## 现在是否需要用户一次性准备？
**当前未发现阻止 UX01、MEM01文字路径、LOC01数据模型、LANG01 TTS选型、PRACT01 Prompt/回贴开发的A类条件。** 但 E04/E05 真实额度、E06/E07 系统语音包、E11手机Tailscale登录仍未实时核实。

## 可以现在安排、避免后续中断的用户动作
- [ ] 在将用于外出使用的 Redmi Note11 5G 上打开 Tailscale，与Mac mini登录同一 tailnet 并授权；这是既有N04真机验收的已知真实缺口。用户自己在手机上操作2FA/账号，不在聊天发密码。
- [ ] 最终试听英语/中文朗读时，根据开发者的语音列表和手机系统提示安装/启用相应语音包；缺英语声线时开发者先把其它功能做完。
- [ ] 用ChatGPT移动端登录自己账号、给麦克风权限，完成一次 Prompt 粘贴→语音答题→复制复盘的**人工验收**。不需要把ChatGPT的帐号或令牌交给开发者。
- [ ] 如果要真人双人录音验收，需双方知情同意；开发者先用合成音频和虚构角色完成其它测试。

**不需要现在提供**：新的 DeepSeek/腾讯API Key、新域名/DNS、新Vercel/Cloudflare/Netlify登录、数据库账号、付费TTS套餐、GPT API Key。未来若实测证明系统声线远低于用户目标，可另作云神经语音 A/B 评估并由用户决定是否授权付费，不能擅自加入。

**S0硬规定**：先检查全部14项并在QA落证据，每项标 VERIFIED/BLOCKED/NOT_NEEDED；如真实缺失不可自办授权，集中报告一次；不受影响的任务连续开发，不反复中断。永远不在日志和ChatGPT中输出API Key明文。
