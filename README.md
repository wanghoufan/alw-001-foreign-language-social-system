# 外语社交系统（ALW-001）

Local-first 社交知识库 MVP。数据使用项目内独立目录中的 Markdown 文件；本地服务仅监听 `127.0.0.1`，无外部依赖、账号、云端同步或 AI API。

## 本机运行

要求 Node.js 20+。首次运行会在本项目内创建 `SocialMate-Data` 并写入虚构演示人物和模板；已存在的文件不会覆盖。

```sh
node scripts/initialize-data.mjs
node server.mjs
```

在本机打开 <http://127.0.0.1:4173>。停止：在服务终端按 `Ctrl+C`。如 4173 被占用，可指定空闲端口：

```sh
PORT=4174 node server.mjs
```

数据目录：`SocialMate-Data/`（项目根目录内）。可设置 `SOCIALMATE_DATA_DIR` 覆盖。服务只绑定回环地址，不支持手机局域网访问。

## 数据与审阅

Markdown 文件是唯一数据真源。人物主档编辑须经过 Review 的预览和确认；候选在预览后若已过时会被拒绝。互动记录不可由审阅 API 覆盖。演示人物 `Test-Anna` 完全虚构，可删除 `SocialMate-Data/People/Test-Anna` 清除。

## 环境与验证

- Node 内置 HTTP/文件模块；无需安装包或 API Key。
- `node scripts/initialize-data.mjs` 初始化目录和模板。
- `node --test` 运行本地服务验收测试。
- GitHub：`wanghoufan/alw-001-foreign-language-social-system`（private）
