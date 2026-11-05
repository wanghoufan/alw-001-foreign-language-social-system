# 豆包语音合成 2.0 · 密钥填写

> 用途：把红城湖等中文稿件用豆包语音 2.0 朗读。本文件只等你填 **1 个值**，其余已填好。

## 1. 获取链接（复制 Access Token）

- **控制台服务页（已登录）**：https://console.volcengine.com/speech/service/10035?AppID=9886928140&projectName=default
- **官方鉴权文档**：https://www.volcengine.com/docs/6561/2534847

在控制台服务页里找 **「应用管理」/「服务详情」** 中的 **Access Token**（如果页面显示的是 **API Key**，就填 API Key）。只复制这一个值，不要复制 Secret Key / AK / SK。

## 2. 已填好，无需你改

| 项 | 值 |
|---|---|
| AppID | `9886928140` |
| Resource ID | `seed-tts-2.0` |
| Endpoint | `https://openspeech.bytedance.com/api/v3/tts/unidirectional` |
| 中文默认音色 | `zh_female_xiaohe_uranus_bigtts`（小何 2.0） |
| 英文默认音色 | `en_male_tim_uranus_bigtts`（Tim） |
| 计费 | 后付费 3 元/万字符；资源包 10 万字 28 元 |
| 预算上限 | `SM_DOUBAO_BUDGET_CNY=0`（默认 0，接入验证后再按需放开） |

## 3. 保存位置与使用方式

- 真实值只写入 `socialmate-prototype/ai-gateway/.env`，键名 `SM_DOUBAO_API_KEY`（实测控制台给的是 API Key，请求头用 `X-Api-Key`）。
- 只允许服务端读取；不会出现在页面、日志、错误信息、测试夹具或 Git。
- 接入后先用中文、英文各一条验证，再接到「朗读」链路。

## 4. 待验证

- HTTP 同步非流式接口正文未核实，本轮只用 HTTP Chunked 流式。
- 免费试用额度的具体字符数需你在控制台「开通 / 试用」页确认。

---

# 请在下面这一行填写（只改这一行）

```text
SM_DOUBAO_API_KEY=
```

填完保存即可。我会读取这个值写入 `.env`，并把这行恢复为空，避免明文留在工作区。**不要把这个文件提交到 Git。**