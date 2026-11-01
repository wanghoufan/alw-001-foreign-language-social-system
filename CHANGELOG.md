# Changelog

## 2026-11-01

- 本机档案持久化：新增 `GET/PUT /api/profile`，显式确认后写入 `SocialMate-Data/Profile/current.json + current.md`（0600、原子替换、目录不入库）；V1.2「关于我」新增「同步到本机档案」，离线仍只用 localStorage。
- V0.4.0 组合服务：单进程同时提供 8790 腾讯云 ASR 与 8791 V1.2 UI/AI/SSE；新增 `/api/asr/status` 能力校验。
- 修复安装脚本误把旧独立 AI 网关当作完整服务：新增 `service-v040.sh` 进程身份核验/安全替换/幂等启动；端口被外部进程占用时拒绝 kill。
- 真机 WebView 打通 `?live=1` 自动开会话与 SSE 断线重连；新增显式云端 AI 同意开关，默认不发文字、取消勾选忽略在途响应。
- 新增手机音频→ASR→SSE→UI 全链 mock 测试、真机 WebView CDP 探针；93/93 Node 测试 + 12 Android 断言通过；APK 0.4.0 安装 Note 11（保留数据）。

## 2026-10-31

- 腾讯云实时 ASR 真实连通：A/B 轨 `16k_en` 与混音 `16k_zh_en_speaker_2.0` 均返回英文转写与时间戳。
- 修复 ASR 桥接：签名 URL 补 `speaker_diarization=1`；解析 V2 `sentences.sentence_list`；新增回归测试（35/35）。

## 2026-10-06

- 为 SocialMate 添加 Dockerfile 和 Compose 部署配置，容器仅绑定宿主机回环地址，Markdown 数据通过 `APP_DATA_DIR` 持久化挂载。
- 文档化 Docker 部署、健康检查、日志和停止方式；真实数据与备份分别使用 DockerData 和 DockerBackups。
