# B01 桌面 GPT 一词触发 GUI 转发测试

task_id: SM-RELAY-20261101-B01
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
operation: TEST_ONLY
status: READY

## 请桌面 GPT 转交给实际开发者的唯一消息

请读取绝对路径 `/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay/SM-Relay-PING-20261101-B01.md`，执行其中的 B01 最小测试：**只**创建 `/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay/SM-Relay-PONG-20261101-B01.md`，内容严格为两行：
SM-PONG-20261101-B01
received_by=desktop_developer

禁止开发、构建、部署、Git 操作、付费 API 调用或额外修改。只写此 PONG 文件，完成后回复已完成。

## 验收
- 云端有且仅有写入任务文件与CURRENT_TASK=READY；
- 桌面 GPT 仅在用户说“转发”后读取CURRENT_TASK，经 Computer Use 对 ALW-001 正确开发者窗口实际输入并点击发送，不能使用CLI/API代替；
- 桌面 GPT 记录 GUI_SEND 与开发者PONG为独立状态，写 `/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay/receipts/SM-RELAY-20261101-B01.md`（必要时创建receipts目录）；
- 开发者仅写对应PONG，不要重复A01/A02；如果读不到或权限不足，明确报告而非猜测；
- 不得将 READY 文件存在等同于已发送；未验证PONG不得标记ACKED。
