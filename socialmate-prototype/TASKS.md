# SocialMate Prototype · PLAN / TASKS / Ownership

日期：2026-10-31 ｜工作目录：socialmate-prototype/ ｜ 本次交付单位：完整可交互 HTML 原型 + 正式开发契约

## 第一阶段：语料与产品 IA（已写入）

- [x] 查 ALW-001 旧服务的 README、server.mjs、Markdown 人物审核 API 与 Android 0.2.2/ASR bridge 状态。
- [x] 读取正式 V1.4 中英双语演示主稿，抽取 **51 个 P 编号、204 条编号演示**，不回退到 temp/intros。
- [x] 读取海南 places.json 全量 **115 地点**，保留城市/分类/中英文描述/两套地图链接；可用本地图片引用，但未核权不作为公开包。
- [x] 读取英语常用句型及假期话题模板；初始关于我话题仅使用已知信息并标注待核对项。
- [x] 完成信息架构：软件 / 海南 / 聊天 / 关于我 / 人物 五主 Tab；桌面侧栏、手机底栏、详情抽屉、默认浅色/手动深色。
- [x] 参考已安装 Product Design 设计流程；Mobbin 参考因账户需付费而未读取，不伪称使用了其 UI 资源。

## 第二阶段：交互原型（已写入）

- [x] index.html + styles.css + app.js + data.js。
- [x] 手机/桌面自适应，底部五主 Tab，中文与英文自然表达，完整软件步骤。
- [x] 按 P ID/文本搜索软件，A/B/C 分类；中英详情、复制、固定聊天参考。
- [x] 海南 115 地点按城市/分类/中英检索；地图、双语介绍、复制/Web Share 回退。
- [x] 独立 public-share.html + public-places.js：公开只读地点分享，不加载任何私人数据，支持单地点 URL / 分享 / 中英切换。
- [x] 关于我话题本机新增/编辑/搜索与复制；人物新增/编辑/关联会话。
- [x] 聊天页手动模拟 ASR 文本、区分发言者、相关资料自动/手动检索、追问及分享建议。
- [x] 已收藏的内容固定显示在聊天引用区域，切换主 Tab 后仍可调用。
- [x] 会后检查原文/说话人/事实，确认后将会话和对方确认的 notes 存到本地演示档案，导出 Markdown。
- [x] 浏览器本地存储 + 轻量隐私警示；没有真实麦克风权限/云凭证/服务调用。
- [x] 搜索结果局部刷新，保留搜索框与移动端软键盘焦点。

## 第三阶段：可维护性、测试与打包（已交付工具；执行边界见 QA）

- [x] build-data.cjs：可重读正式 V1.4 + 海南源文件，并通过 51/204/115 数据断言；--check 不覆盖源。
- [x] story-seeds.json 作为个人话题的可审查种子。
- [x] test-prototype.cjs：Node 内置 11 组核心数据、渲染、交互和隐私保护测试。
- [x] package-prototype.cjs：自动生成私有 ZIP 的脚本；先构建数据、执行 Node 测试，再打包。
- [x] package-public-share.cjs：只包含 public-share.html / public-share.js / public-places.js / styles.css 的公开 ZIP 打包脚本。
- [x] README.md + SPEC.md + TASKS.md + QA.md：说明布局、接口、真实集成与验收。
- [x] 已通过 V8 沙箱测试脚本解析 / UI 虚拟 DOM 核心场景及 9/9 组测试逻辑。
- [ ] **需有 Mac shell 的执行者实际运行 Node 测试和打包脚本。** Mac Reader 只有读写文件权限，不提供 shell；不能将这一步标 PASS。
- [ ] 实际 Chrome/红米/小米/OPPO 浏览器屏幕视觉截图、点按验收和可访问性人工 QA。
- [ ] 真实移动端性能与长列表搜索体验/断网刷新、前后台切换验收。

## 第四阶段：正式产品集成（不由本次原型冒充已完成）

- [ ] 与现有 android-poc owner 协调后决定页面由原生 Compose、WebView 或 PWA 承载；采音仍然由原生 Android 完成。
- [ ] 把 51+115+个人资料抽成独立的、带来源与权限的内容服务；测试更新后原 P 编号和 115 地点 ID 不漂移。
- [ ] 真实 Tencent ASR，当前 BOYA mini 默认按 MONO_MIX；speaker_id 映射、不确定性、稳定终稿和断线恢复。
- [ ] 加入真实 ASR→资料检索→1 问 1 分享→会后审核全链路，防止把 AI 文本覆盖原始字幕。
- [ ] 按已有 /api/preview /api/apply 人工 Gate 写人物主档与不可覆盖互动记录；加鉴权和审计。
- [ ] 公开只读分享 HTML 已实现；后续部署为正式 HTTPS PWA、确权素材及安全部署验收尚待完成。
- [ ] Android APK 在红米设备实测；PWA 在红米/小米/OPPO 原生浏览器真测；正式分享及部署由人工最终验收。

## 与桌面开发者并行的所有权规则

- 此次 ChatGPT 所有写入均位于 `socialmate-prototype/`；只由本轮原型维护者修改。
- 另一位桌面开发者可以继续 `android-poc/` / `asr-bridge/` 的独立代码与 mock/ASR 工作，但不要修改本目录、根目录正式文稿、根主程序或现有 private Markdown。
- 不重置、不清理未追踪 `android-poc/`、`docs/`、`.opencode/` 等文件；当前 Git 未提交文件属于不同工作流。
- 集成之前协调一次文件所有权 / 任务范围即可，不增加 ORCA 审批 Gate；高风险生产变更、凭证和真人录音仍需用户许可。

## 桌面开发者接手执行命令

```sh
cd "/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统"
node socialmate-prototype/build-data.cjs --check
node --test socialmate-prototype/test-prototype.cjs
python3 -m http.server 4317 --bind 127.0.0.1
# 打开 http://127.0.0.1:4317/socialmate-prototype/
```

确认可交互和测试通过后：

```sh
node socialmate-prototype/package-prototype.cjs
node socialmate-prototype/package-public-share.cjs
# 私人原型 ZIP 与公开海南 ZIP 均生成在 socialmate-prototype/.local/releases/
```

一旦出现错误，执行者应自行修复和重跑；不要求用户接入真实 BOYA 或提供腾讯云密钥才完成纯 HTML 原型 QA。不要部署私人原型到公网。

- [x] 已新增 `verify-and-package.sh`：一条命令运行真实 Node 测试、生成两套 ZIP、检查公开包只有四文件和 SHA-256，并输出本机日志。**当前是脚本写入完成，不是 Mac 实际执行完成**。
- [ ] 桌面开发者实际运行 `bash socialmate-prototype/verify-and-package.sh`，附原始日志、两个 ZIP 路径及校验值，遇失败自行修复重跑。
- [ ] 真浏览器截屏 QA：手机 360/393/412/430px、平板 768px、桌面 1024/1440px，五页底栏/搜索/详情/分享/会后归档，每页默认浅色和切深色。

## 2026-10-31 用户现场反馈 · 自动关联必须优先

- [x] 将聊天页主操作从「查资料」改成**对话内容触发自动推荐**；手动搜索仅为折叠备用。
- [x] 增加自然接话 / 三句连续追问 / 个人分享（运行规则模拟，注明非真实 AI）。
- [x] 将海南正式源中 NO.39/41/45 与「户外跑步」上下文关联，可点击整张卡跳转海南正式详情，返回仍保留会话。
- [x] 将新验收约束写入 SPEC.md §2.3.1 并增加真实数据的自动推荐回归用例。
- [x] 11/11 组 Node 逻辑经 V8 工具沙箱模拟通过；不冒充 Mac mini 实际 `node --test`。
- [ ] 安卓 ASR 最终句自动触发真正 AI 推理、服务端安全检索、弱网/串音及响应速度真机测量；本轮仅交互模拟。


## 2026-10-31 新增：真实 AI 接口（因前置预检遗漏，优先补做）

- [x] 核对 DeepSeek 官方及 OpenCode Go 官方 API、模型 ID、端点、独立密钥、Go privacy/regions 限制。
- [x] 写入 `ai-gateway/core.mjs`：真实 Chat Completions 发送、模型切换、来源候选、JSON 校验、真实/错误状态、限时、费用/隐私防护。
- [x] 写入 `ai-gateway/server.mjs`：仅本机开放 `/api/ai/analyze` 与 `/api/ai/health`，请求限频与静态私人原型服务。
- [x] 原型聊天页接入：默认官方 `deepseek-flash`、可选 `deepseek-v4-pro` 与 Go `deepseek-v4.1-flash`；每轮需勾选发送对话文字同意、调用成功显示真实 AI，失败明确回退。
- [x] 写入 `ENV_TEMPLATE.txt`、`ai-gateway/README.md`、`START-HERE.md` 与 Node 测试代码；不创建真实 .env，也不存任何 Key。
- [ ] Mac mini 终端实际运行 `node --test core.test.mjs`、启动网关并检查 health。
- [ ] 用户在 Mac mini 本地填写**官方 DeepSeek Key**，执行真正在线调用并记录延迟、回答质量、资料卡匹配与用量；**没有 Key 不得声称真实 API 已验收**。
- [ ] 如果要启用 OpenCode Go 备选，用户本地设置独立 Go Key，核对 Go 额度及隐私区域设置，执行同一批 A/B 测试。
- [ ] 将现有 Android/腾讯云 ASR 最终句事件接到该 AI 网关；只在稳定 final 后触发，保留原始字幕并处理话题切换、节流与断线恢复。另一开发者正修改 `android-poc/`，当前不由本工作流同时覆盖。
- [ ] 真人双人聊天真机验收（含噪声、重复句、说话人分配），后置且不能阻塞其他无硬件任务。

- [x] 新增 `ai-gateway/asr-final-adapter.mjs` 与独立测试，供腾讯 ASR owner 接到 final 事件后调用；跳过 mock/interim、需同意、避免重复和过频计费。
- [ ] 与正在工作的 ASR owner 协调一次，审查并接入最终字幕事件，做真实云 ASR + DeepSeek 云 AI 联动测试并检查说话人不确定性。

## UI V1.2 · 排版和个人显示设置整改

- [x] 移除软件/海南/关于我/人物四个页面的首屏大绿色介绍块；聊天页保持内容先行。
- [x] 右上角显示设置：整体字号四档、英文单独三档、卡片密度三档、浅色/深色主题；立即生效、同浏览器本地保存。
- [x] 「关于我」标签可从分类与自定义多标签动态生成；新增与编辑话题可以添加标签，支持按标签筛选和搜索。
- [x] 默认正文 16px、英文约 18px、次级标签 14px；取消主内容英文两行裁切，调整按钮与换行策略。
- [x] 新增 3 组自动化回归用例；**14/14** 测试逻辑已由 V8 兼容模拟执行通过（非 Mac 终端测试）。
- [ ] Mac mini 执行 `node --test socialmate-prototype/test-prototype.cjs` 并记录退出状态与日志。
- [ ] 真机安卓原生 APP 与厂商内置浏览器、实际系统字号 200%、320 CSS px、横屏及无障碍 QA；默认大字和各种密度须现场人工看过。
- [ ] 用户审阅最新可交互 HTML 后确认字号与间距默认值，不能由开发者声称用户已验收。
