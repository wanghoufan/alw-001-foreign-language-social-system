# Changelog

## 2026-10-06

- 为 SocialMate 添加 Dockerfile 和 Compose 部署配置，容器仅绑定宿主机回环地址，Markdown 数据通过 `APP_DATA_DIR` 持久化挂载。
- 文档化 Docker 部署、健康检查、日志和停止方式；真实数据与备份分别使用 DockerData 和 DockerBackups。
