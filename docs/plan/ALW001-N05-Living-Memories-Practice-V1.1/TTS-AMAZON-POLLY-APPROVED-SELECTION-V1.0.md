# ALW-001 N05｜Amazon Polly 首选朗读供应商选型（V1.0）

decision_date: 2026-11-03
status: USER_SELECTED_PROVIDER_AMAZON_POLLY
scope: N05 S4 / Android APP ONLY
change_type: TECHNICAL_PROVIDER_CHOICE_NOT_A_NEW_PROJECT
main_provider: AWS Amazon Polly
language_strategy: MULTI_VOICE_BY_LANGUAGE
fallback: Existing Android system TTS USER_OPT_IN_ONLY
other_providers: Optional extension points, NOT selected for initial paid integration
paid_permission: NOT_GRANTED
default_new_tts_budget: 0
public_pwa: MUST_NOT_CHANGE

## 用户决定与覆盖规则
用户在对比微软和其它TTS后明确说“使用亚马逊的”。现阶段正式确定使用 **Amazon Polly**；不再以Azure/ElevenLabs/Google作为本阶段主接入。先前文件 `TTS-PROVIDER-ADAPTER-DECISION-V1.0.md` 中“一起比较三家或先试听Azure/ElevenLabs”的建议由本文件覆盖；但 **TtsProviderAdapter统一协议、授权检查、可替换能力与缓存**必须保留，不能因选定Amazon而把架构锁死到AWS SDK。保留现已开发并回归过的系统TTS代码，作为明确提示后用户手动开启的低质备用；不要把它当正式音质通过标准。

> 这是“选定服务商”，不是批准AWS付款、创建账单或上传私人文字。AWS真实计费调用和第三方传输仍需本人明确授权。

## 官方能力（2026-11-03 查证）
- Amazon Polly支持 English (US) / `en-US`、English (British) / `en-GB` 以及 Mandarin Chinese / `cmn-CN`。
- 正式候选：英文美式 `Ruth`（Generative）、`Joanna`（Generative）；英式 `Amy`、`Brian`（Generative）；中文 `Zhiyu`（Neural）。
- Polly 官方“Fully bilingual”仅列出 Aditi、Kajal、Hala、Zayd，没有真正普通话+英美英语同一声线。因此**一句中文配英文A/B**必须按已校验语言拆成 `Zhiyu` 中文音频＋所选英文生成式声线音频，按用户设定队列拼接；不得依靠英文声线硬念中文/宣称单人双语精通。
- 用 `DescribeVoices(Engine, LanguageCode)` 在选定Region现场核查真正可用的voice/engine，不要凭静态名单硬编码。Amazon Polly `SynthesizeSpeech` 明确填写 Engine 参数，未填默认Standard，不能导致音质悄悄降级。
- 作为候选Region：`ap-northeast-1`（东京）或`ap-southeast-1`（新加坡），生成式与神经语音文档列有支持；实际服务权限和声线以该账号API返回为准，区域费用按AWS当期计价。
- 官网价格：Standard $4 /100万字符；Neural $16 /100万字符；Generative $30 /100万字符，均为超出免费层后的公开基础标价（可能税费/区域差异）；AWS公布首12个月符合条件账户的免费额度为Standard每月500万、Neural每月100万、Generative每月10万字符，账户实际是否合格须查看AWS控制台，免费不等于无限调用。
- AWS官方试听入口： https://console.aws.amazon.com/polly/ ，登录后 Text-to-Speech → Engine → Language / Region → Voice → Listen。纯试听应先在AWS控制台完成，确认是否收费与账户额度。

官方参考：
- https://docs.aws.amazon.com/polly/latest/dg/available-voices.html
- https://docs.aws.amazon.com/polly/latest/dg/bilingual-voices.html
- https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html
- https://docs.aws.amazon.com/polly/latest/APIReference/API_DescribeVoices.html
- https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html
- https://docs.aws.amazon.com/polly/latest/dg/neural-voices.html
- https://aws.amazon.com/polly/pricing/

## 工程任务（不与正在工作的开发者抢占文件）
1. **只替换提供者选型**：检查目前真实代码的 `TtsProviderAdapter`、`TtsPlaybackController`、`RemoteTtsAdapter`、`tts-providers.mjs`、`tts-cache.mjs`、`tts-adapter-skeleton.mjs` 以及N05 S4 QA。保留已通过的S0-S4、现有UI、语言切换、按段循环、缓存、数据schema。只新增或更新 `AwsPollyTtsAdapter` 独立实现与注册；不删除其它adapter/公共接口。
2. **Mac mini 私有代理接入**：在已有8791私有受限API后端实现 Amazon Polly `SynthesizeSpeech`，采用 AWS SDK官方支持版本和**默认凭证链/IAM最小权限**，用户有权限的情况下由本机安全配置完成。AWS Account ID、AccessKeyId、SecretAccessKey、SessionToken 不可写入HTML、Git、Android APK、公开API响应或日志，更不得采用AWS root key。不得用 `polly:*` 超级权限代替仅必要的 `polly:SynthesizeSpeech` / `polly:DescribeVoices`。未就绪时能力探测应返回 `PROVIDER_NOT_CONFIGURED`；别把可构建和真AWS可用混为一谈。
3. **中英语言路由**：中文`cmn-CN`使用`Zhiyu` Neural，英文A/B/习语使用美式`Ruth`或`Joanna` Generative，用户可切英式`Amy`/`Brian` Generative。只有明确支持后才启用特殊SSML标签；不由客户端任意传任意SSML/厂商参数。
4. **请求与音频缓存**：一段英文第一次生成MP3后本地安全缓存；回放20/100次调用本地音频播放器，不请求Polly。key至少包括精确原文SHA、语言、Engine、voiceId、区域、内容revision、语音风格版本、选定合成参数。分段生成与循环队列分离，不把单次朗读重新生成视为正常；拒绝越权缓存读取/任意文件路径/XSS/缓存投毒。断网优先已授权缓存；否则提示无法生成，**不得未经同意自动降级为Android低质TTS**。
5. **预算/隐私零默认**：除已有DeepSeek和Tencent各1元独立预算外，新增`aws_polly`独立账本与硬上限，初始**0元**；发送真实学习文稿至AWS前显示服务商/地域/要传输的文本范围/估算字符及费用，用户明确授权后才开启。第一次真实API验证必须预先核对AWS账号登录、IAM策略、billing/free tier、付款状态和单次/每日/每月上限，真实需要用户操作的账号登录/2FA/预算确认**集中一次列出**；不要索要原文密钥或要求用户贴在聊天里。
6. **真机验收**：先用FakePollyAdapter/预置无隐私测试音频完成目前ADB连接手机的普通话、英式、美式、英文A/B、习语、多段播放/循环/停止和去重；保存APK SHA、已装versionCode、音频sha、服务端请求次数、错误/超限负例、无私有资料出网证据。经用户批准AWS调用后，用真实`Polly`对同一段龙兴路样本文本试听：`Zhiyu Neural`+至少2个英文Generative voice；*音质通过*只能由用户实际试听确认，不得以单元测试代替。
7. **迭代**：开发者只在现有单主开发者链路连续推进，普通问题自行修复，不加中间审批。由于AWS登录/真实云上传/费用是第三方外部授权，不得把“连续不中途问人”解释成可代用户同意这些操作；不阻塞其它可做任务。

## 本阶段前置条件一次性清单
- B 开发者自办：AWS SDK/依赖、Node/8791服务、TTSAdapter注册/语言路由/Mock、缓存/播放器、脱敏契约测试、ADB预构建及实时手机预览。
- A/D 用户专属：是否已有AWS正式账号/Polly控制台可登录、所在Region是否可用、最小权限IAM授权与账户计费、明确允许把选择的学习文字发到AWS、明确批准测试预算。**目前未核实，不得声称已授权AWS**。如需新开AWS账号/绑卡，不得由开发者擅自代办。
- 不需要Google、Azure或ElevenLabs新Key，不需要另建公网服务、DNS、云数据库，也不修改公开PWA。
