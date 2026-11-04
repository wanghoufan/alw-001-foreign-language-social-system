# ALW-001 踩坑归档 · ASR / 运行时（2026-11-04 阶段复盘迁出）

> 从 `agent.md` 迁出，原文保留。ASR 复测、预算闸、TLS、分离参数都在这里。
> 运行时端口/服务事实以 `docs/architecture-facts.md` 为准。

## ASR / 运行时

- 终端默认 PATH 没有 node；先 `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`；脚本已内置 nvm 回退。
- 8791 返回 `/api/ai/health` 不代表是组合服务（旧独立 `server.mjs` 也 200）；查 `/api/asr/status` 的 `combined:true` + `service-v040.sh ensure` 核 cwd/命令。
- `asr-bridge` 无密钥自动 MOCK；`.env` 只填部分密钥启动即报错，不静默降级。
- 腾讯云分离必须传 `speaker_diarization=1`，否则连上不出文本；V2 返回 `sentences.sentence_list`（非扁平），只认扁平会"0 文本"。
- 同一人两段录音拼接测不出分离（都判 `spk_0`）；要两个真人或真人 + 明显不同的 TTS。
- TTS 网页自播介绍/示例会被麦克风录进 `spk_N`；核对 ID 时排除。
- `spk_N` 是聚类编号，随背景声源漂移；UI 固定「说话人待确认」，不映射真实身份。
- 真实 ASR 复测走 `scripts/asr-test-run.mjs`（无 `ASR_TEST_APPROVED=1` 拒绝，按时长截断并写台账）。
- 发音频前等 `session.status=ready`，约 20ms/块；一次性 `send` 后立刻 `end` 只有 session 事件。
- 真机探针 real 模式必须送真实语音 PCM；440Hz 测试音只适合 mock 能量分段。
- `service-v040.sh` 的 `lsof` cwd 会把中文路径转义成 `\xNN`，比较前解码；`cwd == 仓库根` 也算本项目。
- `NODE_TLS_REJECT_UNAUTHORIZED=0` 来自 CodeArts agent-kernel 注入的 shell，不在 zsh/launchd/`.env`；启动脚本 `unset`、`live-server.mjs` 拒绝 `=0`，别用 `-k`。
- 腾讯云 ASR 预算闸在 `asr-budget.js`：默认 1 元、按 1 元/小时估、剩余 ≤0.01 元拒新会话；账本 `android-poc/.local/asr-budget.json`。
