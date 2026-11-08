# 转发管家跨项目 V1.0｜治理仓库安装交接（仅安装提案，未自动执行）

日期：2026-11-01
现状：`000-alw-个人偏好-电脑治理仓库-skill管理/转发管家/说明.md` 已存在，是唯一主真源，不新建第二个“转发管家”。
试点包位于：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay-center/v1/`。

## 一次性接入目标
用户已经同意“统一Skill+本地任务中心→三项目验证→私人插件”。**当前云端Mac Mini Project Reader对000只有只读权限，禁止绕过或声称已经写入000。** 由具000权限的桌面治理智能体在000工作区执行一次性合并，按现有 `总管家/管家统一规范.md` 自检，并保持000真源唯一性。

建议仅在既有 `转发管家/说明.md` 修改：
- 角色不变、固定触发仍为“转发”。
- **读取顺序补一项**：先在 `/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay-center/v1/PROJECTS.json` 获取可写试点项目注册表，再逐个读取其`docs/relay/CURRENT_TASK.md`和回执；将当前单项目“被转发项目”概念扩展到多项目扫描。
- **权限修订**：将试点共享入口 `/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay-center/v1/` 授予 `只读`；所有跨项目写操作仍严格限定各项目的`docs/relay/CURRENT_TASK.md`和`docs/relay/receipts/`。任何非授权项目不能写入。
- **安全判据**：READY + explicit approved + instruction_file存在且在当前项目根内 + 一行send_text与文件相符 + 无已发送回执；其他状态忽略。多个READY按priority→approved_at→task_id稳定排序；单次最多发送1条；BUSY就保留，不跳队，不自动后台监控。
- **路由保护**：按项目工作区识别开发者，而非工具品牌。对P054，若任务属于ORCA链路只能向它的唯一Task Manager投递，不越级Builder；P066遵守当前选择的主开发者/ORCA模式。
- 不变：Computer Use GUI真实发送；不得以写文件、输入框预填、成功写回执冒充发送；不能接管计划制定/开发/QA；不能代审批、付款、发布、删除数据。
- 通过总管家既有结构巡检；不得修改根AGENTS触发词内容、不得新增Gate/角色。

## Skill 管家接手
候选 Skill 稿已移除（原 `docs/relay-center/v1/skill/SKILL.md`，2026-11-07 清理）。中央 Skill 仓库已有更新版 `cloud-to-desktop-relay-local-zh`，转发规则与项目登记以 `019-转发管家/` 为唯一真源；不要再使用旧试点稿，也不要直接复制到 `~/.agents/skills`。
本试点注册表是临时存储：正式移到000的 `转发管家/` 后，将3项目注册入口一起更新为正式路径，旧试点文件保留“已迁移”说明，不让两份注册表同时变真源。

## 插件封装门槛
当前仅能证明静态注册和防重，尚未证实P054/P066的正式 GUI Send；不能声称已跨项目全链通过。下一次由用户批准的真实P054或P066开发任务，先按既定项目治理接收，Computer Use真实投递和留回执后再决定是否封装私有 ChatGPT 插件。Plugin只是云端增强，不能替代桌面GPT的Computer Use。
