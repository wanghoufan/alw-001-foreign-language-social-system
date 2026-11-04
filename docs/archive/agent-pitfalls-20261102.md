# 踩坑归档 · 2026-11-02（N04 V1.3 / N05 V1.1）

> 自 `agent.md` 迁出，原文保留；需要回溯时读这里，不要凭记忆重述。
> 迁出理由：所属阶段（N04 T5、N05 S0–S5）已收口，条目为阶段内操作细节；`agent.md` 触发 10KB 预算。

## N04 V1.3 T5（2026-11-02）

- WebView 的 `sessionStorage` 令牌跨 reload 保留；CDP 复现「用户输入令牌」用 `sessionStorage.setItem('sm-archive-token', …)`，**别把令牌打进日志**。
- 演示写票一次性：缓存后第二次写必 403（`WRITE_TICKET_REQUIRED/REPLAYED`）。"点一次没反应、点两次才行"先看 `demoApi` 的票缓存。
- `uiautomator` 把整块面板合成一个 text 节点，`tap-text "重试连接"` 会点到面板中央；原生按钮用独立节点坐标。
- `location.reload()` 进 `--expr` 要写 `(location.reload(),'r')`，直接 `location.reload();'r'` 会被包进 `return (...)` 报 SyntaxError。
- 归档 URL 与「本机/外出模式」分开存：切回本机模式要确认 `shared_prefs/socialmate-archive.xml` 的 `archive_url` 是 `127.0.0.1`，否则一直 `UnknownHostException`（原文留在 outbox）。
- 重跑验收前先 `adb reverse tcp:8790/8791/8781`，T4 的离线测试会 `reverse --remove-all`。

## N05 V1.1（2026-11-02）

- CodeArts 无人值守会话里，脚本内触发需授权的命令会以「user rejected permission」中断整路（不是脚本报错）；长验收拆成可中断续跑的分段脚本，或改本地子代理执行。
- Android 11+ 不声明 `<queries>` 的 `TTS_SERVICE` / `RecognitionService`，`getVoices()` 与 `SpeechRecognizer` 静默返回空；zh-Hans 与 en 常属不同 voice，切语言要重设 voice，不能只改 locale。
- TTS 自测不能用 `getSpeechRate()` 回读值当倍速证据（回读恒等于设置值），只能量实际时长；小米 0.75× 与 1.0× 仅差 6.7%。