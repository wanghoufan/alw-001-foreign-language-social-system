<!-- ALW-001 N05 V1.2 / USER_APPROVED_2026-11-03 / ANDROID_ONLY / single developer -->
# PREFLIGHT｜全 Task 外部依赖和边界的开工前检查

status: USER_APPROVED
## 4. 全Task预检与安全红线

| 类别 | 必须核查 | 缺失时如何推进 |
|---|---|---|
| B 开发者可自办 | Git HEAD/dirty与并发文件归属、Android SDK35/JDK17/Gradle/ADB、8790/8791/8781/8782、People/PlaceNotes权限、储存空间、前端路线与现有缓存/Polly假适配、图片来源许可 | 先做可本地完成项，保存日志；禁`reset/clean`工作树、禁改公开PWA |
| B/C AI | DeepSeek当前Key和剩余额度，既有1元上限、来源条款，真实翻译/分段成本预估 | 不突破预算；失效先完成规则/人工编辑和私有草稿 |
| D/A AWS | AWS账号、Region、IAM最小权限、云账单、真实TTS预算及用户隐私授权 | 当前0元、不可真实调用Polly或外传私有文稿；先跑 fake/缓存/播放与真实前置诊断；需用户本人操作的授权一次性列出 |
| D 最终验收 | 已连接红米真机、真实中英文语音主观试听、手机Tailscale（外出）及第三方GPT Voice | 尽早用ADB构建安装预览；只有不可代办的真人/账号操作留最终Human Gate |

禁止把AWS Key写入 APK、WebView JS、Git、日志；至少保护私有数据权限0600/0700、服务端路径校验、Origin/配对认证、幂等和版本冲突。图片可能涉及版权和路人肖像，不能因“网上找到”视为可自由发布。不得擅自创建公开地点或披露个人实测笔记。

## 必查清单

- 项目当前 Git HEAD/diff 与另一智能体窗口的文件归属，ADB设备唯一serial、签名和手机保留数据安装。
- SDK 35/JDK17/Gradle8.9、Node 8790/8791/8781/8782、Mac私有 People/PlaceNotes 文件权限、手机截图与Logcat证据。
- DeepSeek Key当前可用性/剩余额度及1元硬预算，AWS账户/IAM/Region/授权/预算0元，授权前不把红城湖原文传AWS。
- 照片作者/年份/授权和真实地点地理一致性，原文逐字hash，现有 115 PWA 静态文件前后 SHA。
- 外部依赖缺失时先完成非阻塞模块，用户必须本人处理的事项一次性整理到最终 Human Gate；费用、私有笔记外传、不可逆操作例外需明确授权。


**共同约束**：只改 Android 私有 SocialMate 与 Mac 私有后端；不改公开 PWA、公开 115 个地点或任何既有真人档案；保留旧 N04/N05 已通过证据，不 reset/clean 工作树，不擅自 AWS/DeepSeek 付费、对外传输或提交真实文稿到公开 Git。
