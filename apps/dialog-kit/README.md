# 四路口对话教学台

一个完全本地、可运行的中文对话教学最小项目：四类角色、七个阶段、实体与关系抽取、置信度确认、可回退的会话状态，以及可写入的记忆建议。界面文案全部为中文，不调用任何外部模型或网络服务。

## 快速开始

要求 Node.js 20+，不需要安装依赖。

```sh
cd apps/dialog-kit
make test
make run
```

浏览器打开 <http://127.0.0.1:4190>。如端口被占用，可指定空闲端口：

```sh
PORT=4191 node app/server.mjs
```

运行时数据默认写入 `apps/dialog-kit/data/runtime/`（已在 `.gitignore` 中排除）。

## 四类角色

| 标识 | 名称 | 作用 |
| --- | --- | --- |
| `mia` | 陈美玲 | 中文夹英文的对话对象，偏好先看具体数字 |
| `maria` | 玛丽亚 | 直接、具体的项目对话对象，遇到模糊表述会追问 |
| `daniel` | 丹尼尔 | 第一次来海口的外国朋友，练习简单英语 |
| `tutor` | 教练 | 阶段讲解、标准答案与易错表达 |
| `system` | 系统 | 建议确认、记忆写入与历史查询 |

学员以 `me` 身份参与，不算独立代理。

## 七个阶段

`问候 → 定题 → 澄清 → 角色扮演 → 反馈 → 巩固 → 收束`

阶段不是单向的：`POST /api/dialog/rewind` 会回到上一阶段，历史事件不删除；回退后可以“重新讲解”或“继续下一阶段”。

## 实体、关系与置信度

- 实体类型：`person / project / place / time / need`
- 关系类型：`owns / works_on / located_at / needs`
- 每条建议至少命中 2 个实体或关系；不足 2 个时不会生成建议，避免把普通寒暄包装成教学建议。
- 抽取置信度在 `0..1` 之间；低于 `0.6` 的建议会在页面上显示“需要确认”，确认后才写入记忆。

## 接口

### 创建会话

```sh
curl -s -X POST http://127.0.0.1:4190/api/dialog/session \
  -H 'Content-Type: application/json' \
  -d '{"sampleId":"mia-hongcheng-weekend","route":"zh"}'
```

### 提交一个回合

```sh
curl -s -X POST http://127.0.0.1:4190/api/dialog/turn \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId":"s_1",
    "actorId":"me",
    "audienceId":"mia",
    "content":"这周六下午三点，红城湖公园东门，预算两百以内，可以吗？"
  }'
```

返回的 `event` 固定包含：
`type / sessionId / turnId / stage / actor / audience / content / score / confidence / entities / relations / suggestedActions / createdAt`。

### 回退阶段

```sh
curl -s -X POST http://127.0.0.1:4190/api/dialog/rewind \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"s_1"}'
```

### 确认或拒绝建议

```sh
curl -s -X POST http://127.0.0.1:4190/api/dialog/confirm \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"s_1","suggestionId":"s_1-a1","accepted":true}'
```

`accepted:false` 不会写入记忆；重复确认同一条建议不会重复写入。

### 历史建议

```sh
curl -s 'http://127.0.0.1:4190/api/memory/suggestions?sessionId=s_1'
```

每个会话默认带至少 5 条历史建议，格式为 `{ order, title, content, explanation, confidence, entities, relations }`。

### 其他

- `GET /api/dialog/samples`：样本、角色与中文标签
- `GET /api/dialog/session?sessionId=s_1`：读取会话
- `POST /api/dialog/advance`：进入下一阶段
- `POST /api/dialog/route`：切换语言路线（保留会话）
- `GET /api/health`：健康检查

## 错误约定

- `400`：无效阶段、阶段不匹配、已在收束阶段、第一阶段继续回退
- `404`：样本、会话或建议不存在
- `422`：缺少字段、未知参与者、置信度越界、无效实体/关系类型、建议命中不足

## 测试

```sh
make test
```

当前覆盖 26 项：模型契约、七阶段推进与回退、实体/关系抽取、建议命中下限、低置信度确认、记忆写入/拒绝、语言路线保留、样本数量、静态页中文文档等。测试只使用本地临时目录和固定时钟，不访问网络。

## 样本来源说明

教学台使用 `app/samples.mjs` 中的加工数据，覆盖项目沟通、成本澄清、周末邀约、英语角色扮演和第一次见面。若工作区未提供原始 `maria-dialogue-samples.json` / `maria-standard-answer.zip`，`chinese-samples/` 下提供了等价的本地夹具，便于替换为真实样本后再加工。

## 目录

```text
apps/dialog-kit/
  app/
    models.mjs      契约、枚举、事件工厂
    samples.mjs     教学样本与实体目录
    store.mjs       JSON 会话/记忆存储
    service.mjs     七阶段编排与建议生成
    server.mjs      HTTP API + 静态页
    static/         中文教学台
  chinese-samples/  原始/参考样本
  tests/            接口与业务逻辑测试
  Makefile
```