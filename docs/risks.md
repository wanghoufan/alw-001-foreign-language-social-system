# ALW-001 风险与红线

更新：2026-11-01

## 并行工作区

- `socialmate-prototype/` 由另一智能体维护；V0.4.0 只改了其中的 `ai-gateway/`，其他文件不得修改、覆盖或 reset/clean。
- 工作区可能同时有其他智能体的未提交改动；提交前核对 diff，禁止强行覆盖。
- 组合服务只绑 `127.0.0.1`；真机依赖 `adb reverse`，无线 ADB 与 BOYA 同时占用 USB-C 时需确认映射仍在。

## 设备与端口

- 本机 Docker 容器 `keep-fitness` 占用 8787；不要按端口盲杀进程，ASR 桥接使用 8790。清理前先用 `lsof` 看 `COMMAND`。
- 不要停/重启正式 Docker（`socialmate` 等）；不得动 `DockerData` / `DockerBackups` / 其他服务。
- MIUI 的 `adb install` 可能报 `INSTALL_FAILED_USER_RESTRICTED`；需用户开「通过 USB 安装 / USB 调试（安全设置）」，或改用 `pm install-create/write/commit`；不得擅自改系统设置。
- `adb reverse` 用完移除；一台设备只保留一个 logcat；不要用 `adb logcat -d`。

## 双麦

- 当前 BOYA mini 实测 `MONO_MIX`；USB 声明 stereo ≠ 真分轨。不得把 stereo 声明写成“分轨已证明”。
- 2026-11-01 实测接收器枚举、路由均正常，但 A/B 采集 `L/R -180 dBFS`；先查发射器开机/配对/静音，不要先改音频代码，也不得把静音写成双麦通过。
- 立体声模式在 BOYA Central App；接收器没有 M/S 实体键。切换后必须重跑 A/B 并试听串音。
- 输入削波约 3.4%–5.7%；正式 ASR 前降低增益或拉开距离。
- 结论只对当前手机 + 接收器 + 固件有效，不代表所有博雅一拖二。

## ASR

- 腾讯云真实握手/英文转写已验证；MOCK 仍不是 ASR。说话人 `spk_N` 会随环境声源漂移，不能把 ID 直接映射为真实身份。
- 本模块按官方 ASR v2 文档实现；`647/131297` 的 “v3” 提示实际是 TRTC 的另一条接入（`asr.cloud-rtc.com/asr/v2`），不是 ASR 产品的 v3；新账号仍以控制台实际接口为准，不要盲改协议。
- 官方 v2 无 `confidence`；不得伪造置信度。
- 手机端不得出现 SecretId/SecretKey；不得把密钥写进 APK、仓库或日志。
- `NODE_TLS_REJECT_UNAUTHORIZED=0` 由 CodeArts agent-kernel 注入；不得设置该值、不得用 `-k` 或跳过证书校验。`service-v040.sh` 启动前剥离继承值，`live-server.mjs` 对 env 文件中的 `=0` fail-closed。
- 腾讯云 ASR 上限 1 元、按 1 元/小时估算；剩余 ≤0.01 元拒绝新会话。不得自行改大或清空账本；本地估算不等于云账单。
- 混音说话人分离在重叠、相似音色、背景提示音下可能标错或新增 ID；`spk_N` 只作聚类，不保证 A/B 对应。
- 真实环境噪声是正常输入，不要求为验收清空环境；严格 A/B 准确率只作可选实验指标。

## 内容建议层

- 建议层是 BM25 确定性检索，不是大模型语义理解；不要把模板问题说成 AI 生成。
- 个人故事文件当前为空；只加载 `confirmed:true` 的英文条目，不得自动抓取或编造私人内容。
- 检索可能错配；已做精确标题优先与主导领域收敛，但仍需人工判断。
- 软件介绍只读 V1.4；禁止读取 `temp/intros-A～I`。

## 本机档案

- 只接受用户显式确认后的写入：`PUT /api/profile` 必须 `confirm:true`，缺失即 400；不得把自动推断写成档案事实。
- 存储固定在 `SocialMate-Data/Profile/`（已 gitignore），不入公开仓库、不上传云端；`current.json` 保持 0600。
- 字段白名单只留 stories/people；不要把主题、显示设置或未知浏览器状态带进档案。
- 本机档案不等于正式 `People/*.md`：未获确认前不自动改写正式人物目录。

## 隐私与内容

- 录音需双方知情同意；提供停止与删除；未核实权限前不开放公共服务。
- 原始 WAV 含本人语音，放 `.local/`（已 gitignore），不提交、不上传、不放进公开 PWA。
- V1.4 是唯一正式软件介绍主稿；禁止用 `temp/intros-A～I` 替换。
- 不把仅代码完成 / MOCK / 合成语音 / 编译通过写成真人验收通过。
- DeepSeek 仅在用户授权的 1 元累计额度内自动调用；超限不得绕过预算闸或改大上限。预算 ledger 落 `.local/`，不要提交。
- Note 11 为 0.4.0；Note 12T 当前未安装本项目 APK。两台设备操作必须显式 serial，不能共用 reverse/会话。
