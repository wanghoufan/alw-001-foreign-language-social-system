# SocialMate Prototype · QA / 验证证据

截至：2026-10-31；项目：ALW-001；范围：独立 HTML 产品交互原型，不涵盖真正实时麦克风或腾讯云。

## 已实际验证（可被当前连接证明）

### 1. 来源数据完整性
- 通过 Mac Project Reader **回读**完整 V1.4（76,719 字节）与海南 places.json（291,140 字节）。
- 运行独立数据提取与校验：**51 软件作品条目、204 逐条演示步骤、115 地点**；P 编号与地点 ID 唯一，无缺少双语介绍。
- 离线原型数据已写 `socialmate-prototype/data.js`。
- `build-data.cjs --check` 的等价函数在 V8 沙箱读取真实项目文本、只用内存模拟 Node fs/path，得到 **PASS**（比较 V1.4/海南文字和原型数据，不比较存在的可选图片）；另独立校验 public-places.js 115 条及无私有字段。
- 正式源文档保持不变，未覆盖 V1.4、Hainan/places.json、People 或正式服务。

### 2. JavaScript 可解析
- 经 `new Function(app.js)` 在 V8 中做**完整 JS 语法解析 PASS**。
- 最初一次发现 personDetail 字符串拼接错误，已修复并重新解析；没有掩盖修复历史。
- 模拟 DOM 执行 15 条交互断言，全部通过：5 Tab、软件详情、海南详情、固定引用、我的话题、人物、会话同意、模拟英文对话、“万绿园”资料匹配、会后复核与保存。
- `test-prototype.cjs` 11 个测试用例在 V8 下配合 Node API shim 执行逻辑：**11/11 PASS**。这并不等同于 Mac shell 真实执行 `node --test` 或浏览器视觉 QA。

### 3. 主要操作状态
| 场景 | 已验证层级 | 备注 |
| --- | --- | --- |
| V1.4 软件筛选/详情/步骤 | 数据+JS模拟 | 未逐款手机真机点击 |
| 海南 115 地点/地图字段 | 数据+JS模拟 | 地图需网络，实际打开待测 |
| 软件/海南/关于我引用固定 | JS模拟 | localStorage 保存逻辑已检查 |
| 搜索及聊天手动全库检索 | JS模拟 | 实际键盘/滚动等待浏览器 QA |
| 浅色默认、深色切换 | CSS+JS代码检查 | 真实截图尚无 |
| 会话同意、模拟字幕、追问 | JS模拟 | 非真实 ASR |
| 结束会话、人工确认、人物 notes | JS模拟与代码检查 | 仅浏览器演示数据 |
| 浏览器文件导出与系统分享 | 源码实现 | 真机点击待测；不支持时回退复制 |
| 独立 Node 数据生成、私人/公开打包命令 | 源码已写入 | Mac shell 未实际执行 |
| 公开 Hainan 分享 HTML 与数据隔离 | 115 条、JS 语法和无敏感字段检查 PASS | 真实浏览器分享/发布待验收 |

## 交付前尚须执行的真环境测试（不可提前打勾）

- [ ] Mac mini 上 `node --test socialmate-prototype/test-prototype.cjs` 获得真实 PASS 日志。
- [ ] Mac mini 上 `node socialmate-prototype/build-data.cjs --check` 及打包命令实际通过。
- [ ] 浏览器打开 `http://127.0.0.1:4317/socialmate-prototype/`，检查首页无 JS 报错、排版不溢出。
- [ ] 在宽 360 / 393 / 412 / 430 / 768 / 1024 / 1440px 检查五 Tab/搜索/抽屉/弹窗/底栏安全区。
- [ ] 在红米/小米/OPPO 内置浏览器检查软键盘搜索不掉焦点、分享回退、返回/关闭和长列表滚动。
- [ ] 分别确认本地 `file://` 与 `http://127.0.0.1` 的数据加载表现。
- [ ] 实测断网：原型文字内容可打开，地图需要网络，提示不过度承诺离线地图。
- [ ] 检查真实 WAV/腾讯云服务不由本原型启动、APP 不泄露私人资料；公开分享包只包含授权内容。

## 当前风险等级与处理意见

- **P1** 私人原型含个人话题和人物演示内容：禁止公网部署。正式发布之前必须区分公开分享页与私人工作台，并审核图片版权。
- **P1** 初始推荐仅基于关键词：可能不能理解复杂长对话，必须保持对原始资料的可追溯引用；不能宣称已经具备大模型深度语义理解。
- **P1** Android BOYA mini 目前为 MONO_MIX，不能把真实说话人分离标成已通过；腾讯云未配置真实密钥。
- **P2** 图片本地路径依赖源项目目录，单独 ZIP 中未包含原 Hainan 图片，因此可能看到渐变占位图；不影响 115 地点文字检索。
- **P2** 浏览器 localStorage 会被清理，原型未做跨设备同步，正式会话不能以此作为永久存储；需导出或私有服务持久化。
- **P2** 大列表 51/115 条尚未经过真实低端安卓浏览器性能测试。

## 并行防冲突

已设置项目内原型独立目录。其他智能体继续 android-poc 与 ASR bridge；此轮不修改那些目录、不改根 README 和 Docker，不要求用户停掉其他项目。建议对同一文件设单一 owner，合并前运行两套测试。

**结论**：独立 HTML 原型源代码、正式数据和完整设计契约均已写入。通过代码级与模拟运行验收；正式浏览器视觉/真机联调与 Mac shell Node 测试由于当前 Project Reader 不提供执行能力，**不能称为完成**。真实语音识别是后续独立阶段，不是本轮 HTML 原型的交付前置。

## 补充：一键实际执行入口

已新增 `socialmate-prototype/verify-and-package.sh`（使用 `bash` 执行）。将依次运行来源数据 `--check`、真实 Node 测试、两套 ZIP 打包、ZIP 完整性/公开四文件隔离核对及 SHA-256，原始证据写到 `socialmate-prototype/.local/qa/verify-*.log`。

**目前仅脚本已写入，未在 Mac mini 上运行。** 只有获取真实退出状态 0、完整日志和两份实际 ZIP 后才可标记打包 PASS；浏览器视觉/手机交互测试仍需另外进行。

## 聊天自动联想 V1.1 验收补充

- 手机预览 HTML 经真实 Chromium 浏览器 390×844 宽度操作回归：输入户外跑步 → 出现自然追问和 NO.39/41/45 相关卡 → 点击万绿园详情 → 返回聊天仍保留原始模拟句 → 人工归档 → 深色主题切换；JavaScript pageerror 0，水平溢出 0。
- 单文件便携 HTML 使用 **23** 个真实海南地点样本；原 Mac mini 的正式 data.js **115** 个地点。两版原型不能相互代替，也不能用便携版通过证明全量资料质量。
- Mac 项目原型更新后的 **11/11** 组测试逻辑通过 V8 Node API 模拟运行；Mac mini 本地 `node --test` 与厂商浏览器真机仍未执行。
- 当前「自动关联」是规则驱动的页面交互验证，非真实大模型输出。进入实用级产品前必须对实际英语双人对话的 ASR + AI + RAG 做端到端 QA。


## 真实 AI 接口新增验证记录（2026-10-31）

| 检查 | 当前状态 | 证据与限制 |
| --- | --- | --- |
| DeepSeek 官方与 Go API 官方路径核对 | 已完成 | DeepSeek API docs 与 OpenCode Go v2 docs |
| `core.mjs` / `server.mjs` / 更新后 `app.js` 语法 | PASS（V8 沙箱解析） | 不是 Mac 终端 Node 真实测试 |
| 两服务商模拟 HTTPS 请求 | PASS | DeepSeek 官方 Flash `thinking.disabled`；Go 模型 ID 独立 |
| 未同意云端传输 | PASS（核心方法模拟） | 403 CONSENT_REQUIRED |
| 未配置 Key | PASS（核心方法模拟） | 503 PROVIDER_NOT_CONFIGURED |
| 幻觉资料来源 ID | PASS（核心方法模拟） | 不存在的 ID 999 被过滤 |
| 服务端 localhost / 只读健康检查 / 限频 | 源码实现 | Mac 实际启动/并发实测待执行 |
| DeepSeek 真实付费 API / Go 真实套餐 API | **BLOCKED — 未配置 Key** | 必须 Mac 本机设置，不允许在聊天发送 |
| Android ASR final → AI 网关联动 | 待执行 | 应协调独立开发者，严禁并行覆盖他的 asr-bridge 文件 |

不把「纯 HTML 自动模板」称为「AI 已经接通」，不把 Mock fetch 的通过称为付费服务调用通过。正式 QA 应覆盖准确引用、连贯追问、错说话人、不相关时不乱推卡、真实延迟、余额/429 和隐私同意。

- ASR 事件适配器 `asr-final-adapter.mjs` 已写入：只处理 `final=true` 且 `mock=false` 的事件，需用户明确同意，保留 `unknown` 说话人；去重同一事件，降低重复付费风险。实际 Mac Node 测试、真实 WebSocket 联调待验收。

### 2026-10-31 代码级回归

- `core.test.mjs` **9/9** 测试逻辑在 V8 + 兼容 Node assert shim 下实际执行通过（包括两提供商构造请求、缺 Key、需要同意、资料 ID 幻觉过滤、429 及无效 endpoint）。
- `asr-final-adapter.test.mjs` **2/2** 同样通过，覆盖 mock/interim/未授权跳过、去重、节流与重置。
- HTML 原型的网络模拟点击：在未同意云端时网络调用 **0 次**；勾选云端同意后发出一次 `POST /api/ai/analyze`，请求默认 DeepSeek 官方 Flash、不开私人故事，真实 AI 返回与万绿园引用卡均成功渲染。
- 三处源文件 `core.mjs`、`server.mjs`、`app.js` JavaScript 语法检查通过。
- 私人 ZIP 打包脚本增加 `.env`、`.env.*`、`.pem`、`.key` 排除与压缩包内容复核，避免未来生成密钥文件后误随 ZIP 发出。

这些是可复现的**代码级验证**，不等于 Mac mini 终端真实 `node --test`、调用 DeepSeek / OpenCode Go 在线 API 或红米浏览器验收。真正云端测试在 Mac mini 本地配置 API Key 后才能完成。

## UI V1.2 字号与布局回归（2026-10-31）

- Mac 正式原型：`app.js`、`styles.css`、`index.html` 已实际写入。V8 检查 14/14 自动化测试逻辑通过（Node shim，不是本机 Mac CLI）。
- 最新单文件便携预览在 Chromium 通过 320、360、390、430、768、1024、1440px 的首屏及显示设置检查，未发现横向溢出或 JavaScript 运行错误。
- 390px 真浏览器额外测试：右上角设置、超大整体字号、英文特大、密度切换；「关于我」新增话题/自定义“户外,跑步”标签，点“户外”筛选只返回相应卡片；有截图和单独 HTML/ZIP 交付。
- 便携预览的 Chromium 使用受限的 about:blank 环境，无法真实验证 localStorage **刷新后**持久化；代码实现存在，但应由桌面开发者在真实 localhost/手机原生浏览器补验，不能说该项已浏览器实测 PASS。
- Android 原生 sp / 200% 缩放、系统大号字体、红米/OPPO 浏览器真实触摸操作待验证。此轮不存在用户最终视觉签收。
