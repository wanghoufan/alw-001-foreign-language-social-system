# ALW-001 N05｜朗读架构变更：高自然度英语 + 可切换 TTS 服务（V1.0）

status: USER_CONFIRMED_PRODUCT_DIRECTION
date: 2026-11-02
stage: N05_S4_AND_FOLLOWUP
relation: CORRECTS_S4_TECHNICAL_SELECTION_NOT_FULL_SCOPE_RESTART
source: 用户已经试听后明确表示系统声音“效果太差，后续肯定不能用这个系统的”，并要求未来能够接入其它更地道的英文朗读服务。
owner: EXISTING_SINGLE_MAIN_DEVELOPER
scope: ANDROID_ONLY; PUBLIC_PWA_ZERO_CHANGE
safety: NO_AUTOMATIC_PAID_API_CALLS_OR_NEW_PROVIDER_KEY_WITHOUT_USER_APPROVAL

## 一、产品决策与当前源码的直接矛盾

N05 V1.0 `PLAN.md` 与 V1.1 `SDD-REVIEW-V1.1.md` 曾写「优先Android原生TextToSpeech」作为正式主要播放。**这个选型已经被用户否决**：系统TTS只能保留为离线/故障时经用户选择的备选，正式英语学习声音以高自然度神经TTS为主。原有需求如段落循环、中文/英文A/B/词组、速度、停止、学习进度不变。

真实Android源码已新增 `android-poc/app/src/main/java/app/socialmate/dualmic/TtsController.java` 和 `TtsSelfTestActivity.java`；直接依赖系统 `TextToSpeech`，有队列、语速、分句、循环、状态事件。**这些已有代码不得删除或从零重做**，但只能作为 `AndroidSystemTtsAdapter` 与播放器的基础，不能把现有 Java TextToSpeech API 错认为跨云服务通用接口。Mac私有Node服务目前已有8791 AI/UI，优先在同一服务增加适配层，而不是新造云服务器或把厂家Key编进APK。

## 二、必须实施的可替换接口设计

```text
SocialMate Android 人物卡/地点学习段/聊天表达
   -> SpeakRequest / TtsPlaybackController (语言/声音/速度/循环/停止/段ID)
        -> 优先: 已缓存、已授权的自然语音文件 -> Android音频播放器
        -> 未缓存: 私有 Mac mini 8791 /v12/api/tts/... (须鉴权)
            -> TtsProviderAdapter provider_id
                 AzureSpeech / ElevenLabs / GoogleCloudTTS / future adapter
            -> 校验音频和来源 -> 授权缓存 -> 播放
        -> 仅用户选择/明确授权: AndroidSystemTtsAdapter (低质离线备选)
```

**内部规范（非厂商API；前端/安卓只认这些字段）**
- SpeakRequest: `requestId`、`recordId`、`blockId`、`revision`、`segmentType`(cn/enA/enB/phrase)、`text`(不可自动改写)、`locale`(zh-CN/en-US/en-GB)、`accent`、`providerId`(logical preset)、`voiceProfileId`、`rate`、`style`(只使用已支持的字段)。
- SpeakResult: `audioId`、`mimeType`、`durationMs`(若可得)、`providerId`、`voiceId`、`modelVersion`、`cacheHit`、`textSha256`、`audioSha256`、`status`(ready/pending/error)、`warnings`；不返回厂商API Key或Mac绝对路径。
- Read-only capabilities endpoint（示意）`GET /v12/api/tts/providers`、`GET /v12/api/tts/voices`；合成申请（示意）`POST /v12/api/tts/synthesize`；经授权按audioId读取音频（示意）`GET /v12/api/tts/audio/<audioId>`，具体路由与现有8791认证契约一致；**不由浏览器决定任意服务端目录或厂商URL**。
- 云端adapter各自负责不同厂商的auth、文本/SSML参数、语音ID与口音、输出格式、限制、错误码/费率、重试；其余学习UI和播放器保持不变。
- 不得把`setRate`自动理解为所有云服务都有相同参数；云音频可在支持时由供应商语速控制，或在播放器做**尽量保留音高的变速**；同一速度/voice是否重新收费需在缓存维度明确。

## 三、严格的声音质量要求与选择流程

优先对照（非指定购买顺序）：1. ElevenLabs 高自然度声线；2. Azure Speech 神经语音；3. Google Cloud Chirp 3 HD；4. 其它后续可插拔。OpenAI旧`/v1/audio/speech`模型`tts-1/tts-1-hd/gpt-4o-mini-tts`已官方公告将在2027-01-06停用，**新接入不可将其当长期稳定的唯一基础**；后续如接OpenAI新Realtime API，按独立adapter处理，不把WebSocket/Realtime流与普通HTTP/MP3混为同一请求格式。

**同文AB盲听至少12项**：英式/美式各≥3样本；龙兴路街景完整段、英文A与B、日常俚语/搭配、日期/数字、混合中英文专有名词、连续三次循环停顿、0.75x听清度、不同句间语调、普通话自然度；同原文同输出脚本、统一音量/声线类别，先让用户独立试听打分再选择；不能只因品牌知名度宣布最地道。评价自然度、口音一致性、重音/连读/停顿、句子末尾是否生硬、重复耐听度、首播延迟、每千字符成本、网络可用性、隐私与缓存限制。

## 四、缓存、成本和隐私边界

- 用户会对同一学习段重复听几十次，**必须先按段生成/缓存，循环时只重放音频，绝不能每循环一次都重新请求付费TTS**。缓存键至少包含原文字节哈希、`recordId/blockId/revision`（绑定业务来源）、locale、provider、modelVersion、voice、style、生成率。仅在服务条款允许且用户已授权的私有Mac/手机区域缓存；允许清理缓存，不能混为学习记录原文。
- 当前 ASR/DeepSeek 各1元预算不代表新TTS有消费许可：**新TTS预算默认0元/禁用任何计费请求**，提供`estimate`和`explicitConsent`、超额fail closed和账本，用户选定供应商及预算后再做真实API联调。免费Demo试听可用，但不得拿Demo试听冒充API接通。
- 私人地点感悟和英文练习文本发送给第三方TTS属于外部数据传输；默认OFF，首次上传前说明提供商、会发送的内容、可能费用与保存方式，需明确同意；禁止上传好友真实私人信息或把音频公开到PWA。
- 所有厂商API Key只在 Mac mini 服务器环境变量或后续用户已批准的P066统一网关安全存储；Android APK/HTML/JS/日志不得含厂商Key，用户无需每次手输。P066如果可复用已建能力可以委托路由，但不要把N05研发绑定在P066尚未完成的部分。
- 服务失效或离线：先用合法本地缓存，未缓存则给用户可读错误/试听/切换选项；不能**未经提示**自动切到用户已判为不合格的系统朗读或私自选择新的付费提供商；需要时用户手动打开「临时系统声音」。

## 五、最小开发与QA任务（不抢占正在执行的S4代码文件）

1. 先检查现在活跃的`TtsController`、N05 S4真实进度、当前唯一开发者与Git dirty，不让多个智能体并发编辑同一Java/UI文件。先把S4的原生TTS试听和验证留证，标签明确`FALLBACK_ONLY`；**不能把用户否决的声音作为最终S4音质PASS**。
2. 抽象播放/合成的稳定协议，编写两种无需Key的测试adapter（FakeTts和已有AndroidSystemTtsAdapter），至少用一个厂商adapter接口骨架证明更换 provider 只换适配层、不要改学习段落页面/播放控制/复盘数据。
3. Mac 8791受限路由、请求签名/鉴权、按用户同意限制第三方传输、cache及计费dry-run、响应mime/content-length/sha校验、私有音频播放器与停止/循环回归；不创建新数据库/新公网/PWA变更。
4. 先用本地合成音频预置文件模拟高质量音频协议，ADB手机听/暂停/循环/切段/0.75x，验证相同段重复播放不会新增合成请求；服务异常回退/无权限0第三方请求。待用户批准供应商+预算才做真实云TTS A/B、付费API联调及音质最终Human Gate。
5. 真机预构建（现已有ADB设备）与 APK版本/hash/截图/行为记录，原生图标和Splash无需重做，既有N05各阶段继续推进，不因高质量TTS账号尚未提供而停在S4。最后只在全部可自行完成项结束后一次Human Gate，TTS真实提供商未授权/未试听必须列`NOT_RUN`。

## 六、官方依据与版本兼容点（2026-11-02复核）
- Android官方系统TTS： https://developer.android.com/reference/android/speech/tts/TextToSpeech
- ElevenLabs API： https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- Azure Speech REST： https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech
- Google Cloud TTS： https://cloud.google.com/text-to-speech/docs/create-audio
- Google Cloud TTS最新费用： https://cloud.google.com/text-to-speech/pricing
- OpenAI TTS旧API弃用公告： https://developers.openai.com/api/docs/guides/text-to-speech
