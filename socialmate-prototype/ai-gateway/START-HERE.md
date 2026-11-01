# 开发者优先执行

本目录已预置真实 DeepSeek / OpenCode Go 网关，不是规则模拟。**没有 Key 时会明确显示“未配置”，不会冒充 AI 已接通。**

在 Mac mini 的终端执行：

```sh
cd "/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/socialmate-prototype/ai-gateway"
node --test core.test.mjs
cp ENV_TEMPLATE.txt .env
# 只在本机用编辑器填入 DEEPSEEK_API_KEY 与可选的 OPENCODE_GO_API_KEY
node --env-file-if-exists=.env server.mjs
```

然后在同一 Mac 上浏览器打开 <http://127.0.0.1:8791/>，进入「聊天」，选择模型，勾选演示同意以及向云端发送文字同意，输入英文句子，即调用真实 API。可访问 <http://127.0.0.1:8791/api/ai/health> 检查 Key 是否存在，响应只回传布尔值。

**不能重用 OpenCode TUI 的客户端 Key 存储文件；应由用户授权后把 Go API Key 填入本服务独立 .env。**

所有 Key 不得发给云端智能体聊天、不得写入 README、JS、截图、Git 提交或 APP；Mac 上 .env 被本目录 .gitignore 排除。真实验收需记录服务商、模型名、延迟、引用 ID、准确性、成本/额度，不记录密钥或完整私人对话。

历史说明（旧工作交接）：原计划待其他开发者把 Android final 事件接入，现该开发者已暂停，ChatGPT 已直接接管并新增 V0.4.0 同进程 ASR 事件转发；见下方最新入口。


### 与 ASR bridge 对接（开发者的下一项任务）

已提供 `asr-final-adapter.mjs`，由现有 `android-poc/asr-bridge` 的唯一 owner 审核后导入。调用方式：

```js
import { createAsrFinalAdapter } from '../../../socialmate-prototype/ai-gateway/asr-final-adapter.mjs';

// data 应从受信任的正式语料数据源加载，不从用户输入接受；
const bridge = createAsrFinalAdapter({ data: officialCorpus });
const result = await bridge.accept(asrEvent, {
  sessionId: realSessionId,
  consent: userCloudConsent,
  provider: 'deepseek',                 // 或 'opencode-go'
  model: 'deepseek-flash',              // 或 'deepseek-v4.1-flash'
  includePersonal: userPersonalConsent
});
// 如果 result.mode === 'real-ai'，才把建议和引用卡显示为真实 AI
```

当前适配器会拒绝 MOCK 和 interim，拒绝无授权发送；混音说话人 `spk_0` 不会擅自映射成“我”或“外国朋友”；重复 final 不二次计费，并限制连续调用间隔。此代码已写到独立目录，但**尚未直接修改 ASR bridge**，避免并行冲突。关键集成须先过 Node 测试和真实腾讯云 final 数据流验证。

## 最新：0.4.0 同进程 ASR + AI + V1.2 正式 UI

这是替代过去分别启动两个服务的**最新开发入口**：

```sh
cd "/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统"
bash socialmate-v1.2/verify-v040.sh
# 若手机通过 adb 接 Mac mini，一条命令设置 8790+8791 转发并启动两个服务：
bash socialmate-v1.2/run-live-v040.sh --phone
```

组合入口 `live-server.mjs` 同一个 Node 进程运行 ASR WebSocket 8790 和 AI/HTML 8791；ASR 内部调用 `options.onEvent` 将原样标准化事件送入只读 `live-asr-hub.mjs`，网页通过 `EventSource('/api/asr/live')` 接收字幕。没有公网 webhook、没有音频上传到 AI 模型。语音始终先由腾讯云 ASR 转写；只有最终字幕且本轮用户明确同意，才会调用 DeepSeek / OpenCode Go。

手机 Android 0.4.0 采用原生录音 + 同 Activity WebView 显示 `http://127.0.0.1:8791/v12`，需要 `adb reverse tcp:8790 tcp:8790` 和 `adb reverse tcp:8791 tcp:8791`（或上方脚本的 `--phone`）。目前不是无 ADB 的远程正式版。

本聊天只验证了原型 JavaScript 和事件 hub 的代码级逻辑，`npm test`、`node --test`、Gradle 编译与真机需有 Mac 本机执行证据后才能记 PASS。原 README 中此前的“尚未改 ASR bridge”等陈述是历史计划，不再代表最新代码状态。
