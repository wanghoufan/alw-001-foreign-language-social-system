# T5 · User Acceptance Checklist（用户打开手机逐条对照）

对照 `ACCEPTANCE.md` 第「最终用户打开手机的检查」1–5 条。逐条给出**本次真机实际结果**与证据文件。
判定只有三种：PASS（本次真跑）/ PARTIAL（部分条件缺失）/ NOT_RUN（未执行，原因写在末尾）。

| # | 用户检查 | 本次结果 | 证据 |
|---|---|---|---|
| 1 | 不连 USB 打开 App → 人物页能看到 3 位演示联系人、9 次对话、候选/已确认事实；可清空 / 关掉重开 / 恢复，母版不丢 | **PASS（清空/重开/恢复）**；「不连 USB」为 **PARTIAL**（用 `adb reverse --remove-all` 断通道等价验证，未物理拔线） | `02-people-tab.png`、`11-demo-cleared.png`、`12-demo-cleared-restart.png`、`13-demo-restored.png`、`50-offline-readonly.png` |
| 2 | 有知情同意的受控对话里点开始录音，看到实时字幕与事实候选，先选人物后确认；问题立刻个性化且跨次保存 | **PASS**（合成音频 SYNTHETIC，ASR `mock:false`） | `31`（双同意）、`32`（实时字幕）、`33`（候选卡）、`34`（确认后问题变化）、`35-oliver-after-confirm.json` |
| 3 | 明确开启原文留存，停止后等「已同步 Mac」，Mac 下能找到同源 `.md/.json`；离线显示「待上传」，恢复后补传；导出的 `.md` 能在文件管理器打开 | **PASS**（保存 + 同步 + SAF 落盘 + 断网补传）；「系统查看器打开」**NOT_RUN**（无默认 Markdown 查看器） | `36-stopped.png`、`40-mac-archive-verify.txt`、`41`–`44`、`22-hashes-after-all.txt` |
| 4 | 麦克风停录、原文/AI 不同同意选项、语音/私人数据未上传到公开 PWA 或陌生 API | **PASS**：录音同意与留存同意分开勾选；停止后 `asrState=off`、原生状态「已停止」；原文只走 8790 腾讯 ASR 与 8781 本机归档；公网 PWA 未参与 | `31-native-consent-retention.png`、`36-stopped.png`、`40-mac-archive-verify.txt` |
| 5 | 缺真人双人 / BOYA / 高版本安卓时，保留诚实 NOT_RUN，不阻塞其它可做项 | **PASS（诚实标注）**：4 项 NOT_RUN 未写成 PASS | 本文末节 + `t5-report.json` |

## 用户可亲手复验的 4 步（不需要终端）

1. 手机断开数据线（保持 Wi-Fi/移动网）→ 打开 App → 看「人物」页是否仍有 3 位演示人物与「3 段会话 · 18 句原文」。
2. 点「清空演示数据」→ 关闭 App 重开 → 应为空态；再点「恢复演示数据」→ 回到 3 位 / 9 段 / 54 句。
3. 点「开始录音」→ 勾选「对方已知情并同意录音」→（如要留存）勾「保留本轮原文并同步 Mac」→ Record → 说一句英文 → 停 → 看候选卡选人确认 → 看专属问题是否变化。
4. 打开 `/v12/history` → 点某条「Open full transcript and review」→「Download (.md)」→ 选择「下载」→ 在文件管理器 `Download/` 里应看到 `SocialMate-sess_*.md`。

## NOT_RUN（本次未执行，原因）

| 项 | 原因 | 谁来解 |
|---|---|---|
| 手机 Tailscale 授权后真外出 | 手机未登录本 tailnet，`100.125.100.15` 不可达 | 用户本人（Tailscale App 登录 + 授权本机） |
| 物理拔出 USB 线 | 数据线仍供电；已用断 `adb reverse` 等价验证数据通道 | 用户本人（可 1 分钟完成） |
| 系统 Markdown 查看器打开导出文件 | 该 ROM 无默认查看器；可用查看器需同意第三方隐私政策 | 用户本人（同意某个查看器后即可验） |
| 真人双人对话 / BOYA 双麦 | 需真人知情同意 | 用户本人（约好后一次 5 分钟测试） |
