# A02 无人工桌面输入的自动唤醒测试
测试 ID：SM-PING-20261101-A02
状态：READY
来源：移动端/云端 GPT 写入 Mac mini 项目文件
范围：仅测试自动任务发现、桌面 GPT Computer Use 转发及 CodeArts 回执。不得开发、部署、调用付费模型或触碰私密用户资料。

**本测试不向桌面 GPT 发送任何新聊天消息，不提供人工桌面指令。**

只有当桌面 GPT **自行发现此文件**、并通过 Computer Use 操作当前最前端开发者窗口后，才能计为自动唤醒。

桌面 GPT 应在当前正在工作的开发者窗口中实际发送以下单行文本：
请读取绝对路径 /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/SM-Cloud-to-Desktop-PING-20261101-A02.md；只按文件写出 A02 PONG，不做任何开发任务。

开发者若真实收到指令，须创建：
/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/SM-Cloud-to-Desktop-PONG-20261101-A02.md

内容恰好为：
SM-PONG-20261101-A02
received_by=desktop_developer

桌面 GPT 须另写中转回执：
/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/SM-Desktop-GPT-RELAY-20261101-A02.md

其中必须说明自动触发机制、Computer Use 真实发送证据、目标窗口、发送时间及是否收到 PONG。若任何步骤未执行，不得伪造成功。

注意：文件写入成功只算云端→Mac 文件链路成功；若没有自动检测/通知/Work 调度，A02 不会凭空唤醒桌面 GPT。禁止把云端轮询或单纯看到文件作为 GUI 转发成功。