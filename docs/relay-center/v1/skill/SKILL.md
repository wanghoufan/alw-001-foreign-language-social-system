---
name: cloud-to-desktop-relay
description: "为多个本地开发项目统一生成、批准和投递一行文件路径任务。云端负责写任务，桌面ChatGPT通过Computer Use按工作区找开发者、判断忙闲、发送及回执。"
version: "0.1.0-pilot"
---
# Cloud-to-Desktop Relay · 多项目通用Skill候选

> **状态：候选 / 未安装到中央Skill仓库或Skill Manager。** 不取代000治理仓库已有`转发管家/说明.md`，只将该管家流程模块化。将来由Skill管家按现有正式规范审查入库。

## 一、云端生成阶段
当用户说“查看 X 项目进展，给开发计划”：用当前有权限的连接器读取对应项目`CHANGELOG/HANDOFF/QA/Git`，先只读核查，区分已做与待做；给计划，用户明确批准后再在`docs/plan/`写完整SDD，最后写`docs/relay/CURRENT_TASK.md`。**只写有权限的项目**，不能越权写中央000或其它只读项目。单一任务应携带：
`task_id`（不可复用）、`status:READY`、`user_approved:true`、`approved_at`（带时区的ISO时间）、`priority:100`、`target_project`、`project_root`、`instruction_file`、`task_relation`（CONTINUATION或INDEPENDENT）、`send_text`（一行相对路径）。先检查同项目未发送READY，避免无意覆盖；有历史GUI_SENT必须先归档状态。
绝不能把未获批准的draft或测试PING推到 READY；跨项目任务不能被错误放入另一个项目目录。

## 二、桌面分发阶段
固定触发词 **“转发”**。先读000`转发管家/说明.md`→本地共享注册表`PROJECTS.json`→各项目真实`CURRENT_TASK.md`+receipt；动态确定唯一READY任务，按批准时间+priority排序；Computer Use只读查唯一匹配的开发者工作区及忙闲；按继续/新任务选择原/新会话；只键入send_text一行并真实点击Send；见消息气泡再写回执。其它项目忙不影响该项目。忙或权限阻塞不反复催用户选择工具，保留READY；不承诺自动监控。
重要：云端的Mac项目读写连接器**不提供跨应用GUI控制**；不能因为写入任务成功就称开发者收到了。
默认每次触发只投递一个任务，不抢占同项目旧任务；如果已经GUI_SENT则无论CURRENT_TASK是否还是READY都禁止重发。

## 三、开发者阶段
开发者自行读取SDD，执行用户批准的连续开发与QA；跟转发员职责分离。不代用户执行付费、发布、删除、真人录音、授权审批。

## 四、验收门槛
静态：路径白名单、状态机、收到回执不重发；多窗口：不同工作区隔离、忙闲判断；GUI：一行发送、点击送达、回执。测试不得使用已在开发的真实READY任务制造重复。先跑三项目 dry-run 后再部署，私有插件是最后一步而不是替代本机Computer Use的快捷方式。
