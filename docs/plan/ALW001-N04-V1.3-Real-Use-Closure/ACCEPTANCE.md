# ALW-001 N04 V1.3｜独立QA与最终用户验收合同

task_id: SM-ALW001-20261102-N04-V13
project: ALW-001
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
approved_at: 2026-11-02T14:22:00+08:00
approved_by: USER_EXPLICIT_APPROVAL_PLAN_1
status: APPROVED_EXECUTION_PACKAGE
mode: SINGLE_MAIN_DEVELOPER_CONTINUOUS

reference: docs/plan/ALW001-N04-V1.3-Real-Use-Closure/PLAN.md
priority: evidence_is_more_important_than_green_markdown_checklist

## 起始验证
- 最新源码/HEAD与dirty快照有证据；`public-share.html`, `public-share.js`, `sw.js`的原有修改未丢失、未覆盖；无reset/clean。
- `PREFLIGHT.md` 15项依赖均被真实检查或有明确没查理由，用户唯一必须操作的事项集中说明。
- 已有3个虚构人设、9份演示会话、54句和清空/恢复/问句/主档编辑不回退；演示母版与既有9对Mac归档/20261102 QA不被清除。

## 必须提供的原始证据与PASS条件
| 验收ID | 真实操作/输入 | 第三方可核实PASS条件 | 文件与证据 |
|---|---|---|---|
| QA01 原文溯源 | 3人原始fixture/session/segment逐字比对，篡改/乱序/伪造段号反例 | 3/3与textOriginal逐字相同；候选摘要独立且引用来源；违规0事实写入 | source-audit.json、负面测试日志与源码位置 |
| QA02 安全/身份 | 受控恶意iframe、跨域页面、重放/过期凭证访问录音桥及归档写端点 | 0未授权原生操作/0未授权写入；构建APK中不含可提取的长期归档token常量；正常读写仍可用 | bridge-security.json、APK静态扫描、鉴权回执 |
| QA03 真实会话 | Android原生录音获得同意，经当前真实ASR返回非mock final，产生pending，用户指定人确认 | 当轮专属问题变化，重启可回读，撤销后不引用，重复确认不双写，另两人hash不变 | session-timeline.jsonl、People SHA、手机截屏 |
| QA04 手机归档 | 真实手机outbox断网→Mac不可达→恢复→Mac生成MD/JSON，重复上传 | 逐字、段数/ID/时间一致；失败不丢不伪报；Mac2xx后才标已同步；SAF保存且文件管理器可读 | android-outbox.json、mac-archive-index.json、hash/截图 |
| QA05 无USB外出 | 拔掉USB，清除adb reverse，手机切移动网，Mac保持运行 | 私有Tailscale+有效TLS可连接UI/ASR/档案/归档，不需终端；失败有明确状态，不白屏 | tailnet-off-usb.json、真实设备截图/日志 |
| QA06 自恢复 | 受控关闭单个服务/Mac重启和网络变化，恢复后再访问 | 所有本项目服务可控自启/自愈，不杀其它项目进程；任务队列补传且不重复 | mac-autostart.json、服务health/日志 |
| QA07 演示不回退 | 人物页→3人9会话→专属+通用→清空→重启→恢复→编辑/批量/撤销 | 演示区显示不空白、母版仍在，真实People与正式Conversations字节hash一致 | demo-regression.json、截图，真实数据前后SHA |
| QA08 APK一致性 | 当前源编译debug APK→唯一Serial安装保留数据→回读设备安装信息 | 实际 `dumpsys package` 版本与APK包版本/签名对得上；APK SHA与QA一一对应 | build.log、install.log、apk.sha256、device.json |
| QA09 文档与Reviewer | 独立Reviewer根据测试日志从零复查 | `CHANGELOG/HANDOFF/IMPLEMENTATION_STATUS/N04 QA`最新一致；失败与NOT_RUN透明，无历史假PASS | test-report.md、reviewer-verdict.md、截图索引 |

## 永久保存
推荐：`docs/plan/ALW001-N04-V1.3-Real-Use-Closure/qa/YYYYMMDD-HHMMSS/`（源码审查/日志/JSON报告等无个人隐私素材）；实际音频、人物隐私原文、访问token**只保留在Mac本地受限目录**且不得纳入Git。可供用户Finder打开的Mac `~/Documents/SocialMate/Demo/QA/N04-V1.3-<stamp>/` 放脱敏副本+SHA索引，不删除此前真实QA。不要为方便截图而开启公共访问。
每条记录带实际设备serial(需要可脱敏)、机型、系统、APK/hash、Git HEAD+dirty、时区、命令、exit code、HTTP状态、mock与真人标记、不同用户/工作区身份边界。凡只看过代码或以前日志的标 `PARTIAL` 或 `NOT_RUN`；不能为了勾满表而伪造实测。

## 最终用户打开手机的检查
1. 手机不连USB时打开App→人物页能看到3位演示联系人、9次对话和候选/已确认事实；可以点清空/关闭重开/恢复，母版不会丢。
2. 用户在有知情同意的受控对话中点击开始录音，看到实时字幕与事实候选，先选人物后确认；问题立刻个性化变化且跨次对话仍保存。
3. 明确开启原文留存，停止后等手机状态“已同步Mac”，在Mac Documents下可找到同源的.md/.json；离线时显示“待上传”，网络恢复后补传，手机导出的.md可在文件管理器打开。
4. 观察麦克风停录、原文/AI不同同意选项、语音/私人数据未上传到公开PWA或陌生API。
5. 缺真人双人/BOYA或Android较新版设备时，保留诚实的NOT_RUN说明，**不阻塞所有开发者可自行完成的事情**。

## 完成时必须答用户的格式
`当前版本与SHA / 已完成T1–T5 / 真机设备与截图 / 核心PASS及FAIL / 仍然NOT_RUN原因 / 永久证据路径 / 用户本人一次性剩余Human Gate`；不能只答“已完成代码/跑通模拟”。
