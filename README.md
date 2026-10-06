# 外语社交系统（ALW-001）

[English](./README.en.md)

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

## Docker 部署

项目标识为 `alw-001-foreign-language-social-system`。正式部署副本位于 `~/Developer/coding/docker/alw-001-foreign-language-social-system/`；真实 Markdown 数据挂载自 `~/DockerData/alw-001-foreign-language-social-system/`，部署前快照保存在 `~/DockerBackups/alw-001-foreign-language-social-system/`。Compose 只将服务发布到 `127.0.0.1:4173`，不会开放到局域网。容器使用 `restart: unless-stopped`，由 Docker 管理其常驻生命周期。

首次部署先在正式部署副本创建 `.env.local`（从 `.env.example` 复制并填写真实绝对路径），确保 `APP_DATA_DIR` 已存在并包含初始化后的 Markdown 数据，再执行：

```sh
docker compose --env-file .env.local up -d --build
docker compose --env-file .env.local ps
```

健康检查：`http://127.0.0.1:4173/api/health`。查看日志：`docker compose --env-file .env.local logs --tail=100`。停止：`docker compose --env-file .env.local stop`。只有用户明确授权时才删除容器；不得删除 DockerData 或 DockerBackups。

## 数据与审阅

Markdown 文件是唯一数据真源。人物主档编辑须经过 Review 的预览和确认；候选在预览后若已过时会被拒绝。互动记录不可由审阅 API 覆盖。演示人物 `Test-Anna` 完全虚构，可删除 `SocialMate-Data/People/Test-Anna` 清除。

## 环境与验证

- Node 内置 HTTP/文件模块；无需安装包或 API Key。
- `node scripts/initialize-data.mjs` 初始化目录和模板。
- `node --test` 运行本地服务验收测试。
- GitHub：`wanghoufan/alw-001-foreign-language-social-system`（private）


## 口语练习记录

ChatGPT Live 结束一轮练习后，应提供一份可下载的完整 Markdown（`.md`）复盘文件。文件名格式为 `口语练习 YYYY-MM-DD - 场景短名 - Level N - 8位标识.md`，日期按 Asia/Shanghai；不使用竖线或正式文件归档命名规则。下载后将原始单次记录放入 `SocialMate-Data/Practice/Sessions/`。每周与每月分析分别放在 `SocialMate-Data/Practice/Reviews/Weekly/` 和 `Monthly/`，并在报告中引用所依据的单次记录文件名；不得改写原始记录。每份单次记录要保留可获得的对话转录、练习概览、理解与回应、原句及自然改法、互动节奏、可复用表达、下次最多 3 个可执行目标和不确定项。不可补造转录或仅凭文本推断发音。
