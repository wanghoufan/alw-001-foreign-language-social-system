# ALW-001 N05 V1.1 · S1 收尾报告

**结论：S1 通过（退出码 0）。** 6/6 PASS，`node socialmate-v1.2/verify-n05-s1.mjs` 退出码 0（`s1-verify.log`）。

- ⑤ 已改为不依赖归档令牌：四区块 + 编辑态 + 批量态 + 变更记录容器，不触发演示写；撤回真实写入标注 SKIP 留 S2。
- People 去开发化生效：首屏无「演示人物/清空演示/恢复演示/合成final/测试令牌」，入口收在设置→高级→演示与测试。

## 三项 SHA-256（前=S0 `hashes.txt`）

1. `places-115.json`：`0412673d…836e9` → 一致；`public/index.html`、`public/styles.css` 一致。
2. `gh-pages` 公开源 7 文件（index/styles/public-places/sw/manifest/public-share.js/icon.svg）全部一致；另核 `public-share.html` 未变。
3. 真实 `SocialMate-Data/People` 41 文件聚合：`78482d07…4d3` → 一致。

演示计数恢复后 3 人 / 9 段 / 54 句（Demo 隔离副本，真实 People 未参与）。

## 边界

- HEAD `fc2379c` 未变，未 commit / 未 push，未改 APK 版本号，未动预算。
- S1 白名单 scoped status 恰好 4 类（source、index.html、verify 脚本、3 张截图）。
- 全仓 dirty 56（S0 为 43）：多出项来自 S2/S3 后端（22:03–22:09）与并行 S4 TTS（22:27–22:29）及 S0 前既有改动，本代理未写入禁改路径。

## 真机截图（`adb -s REDACTED-SERIAL`）

- `s1-device-people.png` / `s1-device-people-app.png`：People 首屏，开发字样命中 0，5 位真实人物。
- `s1-device-settings-demo.png` / `s1-device-settings-demo-app.png`：设置→高级→演示与测试（3 人/9 段/54 句）。
- 文字转写：`s1-device-*.txt`；明细见 `S1-EVIDENCE.md`。

## 未完成

- 详情「撤回」真实写入未点测（需归档令牌），留 S2。
- `adb reverse tcp:8791` 保留供并行 S4 使用，清理命令：`adb -s REDACTED-SERIAL reverse --remove tcp:8791`。