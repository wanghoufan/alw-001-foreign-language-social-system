# ALW-001 N05 V1.1 · S1 收尾证据（2026-11-02 22:24–22:35）

## 1. 结论

- `node socialmate-v1.2/verify-n05-s1.mjs`：6 项全 PASS，**退出码 0**，日志见 `s1-verify.log`。
- ⑤ 已改为不依赖归档令牌：只断言「四区块 + 编辑态 + 批量态 + 变更记录渲染」，不触发演示写。
- 禁改路径（places / public / gh-pages 公开源 / 真实 People）哈希与 S0 `hashes.txt` 全部一致。
- 真机截图已落盘：People 首屏命中开发字样 0 项；演示与测试入口在设置→高级内。

## 2. ⑤ 的改动（`socialmate-v1.2/verify-n05-s1.mjs`）

| 项 | 原实现 | 现实现 |
|---|---|---|
| 触发演示写 | 通过详情触发写/撤回，撞归档令牌门槛 | 不写任何数据 |
| 四区块 | textContent 含四区块名 | 保留 |
| 编辑态 | 点击后检查输入框/保存/取消 | 保留，并点取消退出 |
| 批量态 | 检查全选/移动/批量删除/完成 | 保留，并退出批量 |
| 变更记录 | 仅全文含「变更记录」 | 断言 `.sectiontitle` 标题 + 紧邻 `.pftimeline` 容器 + `N 条 · 倒序` 计数或 `.pfempty` 空态 |

`skipped` 显式记录：撤回按钮已渲染，但真实撤回写入需归档令牌，S1 不点，留 S2。

## 3. 脚本结果

```
PASS ① People 首屏无开发控件
PASS ③ 演示默认关闭，真实列表不含演示人物
PASS ② 设置→高级→演示与测试入口与恢复/清空
PASS ④ 三名演示可恢复且 UI 计数回读
PASS ⑤ 详情四区块 / 编辑态 / 批量态 / 变更记录渲染
PASS ⑥ 主题：浅色默认、深色与跟随系统跨刷新保持
EXIT=0
```

②④ 的演示清空/恢复只写 `SocialMate-Data/Demo` 隔离副本，结束时已回到 3/9/54。

## 4. Git 边界

- HEAD 未变：`fc2379c`（= S0 记录）；分支 `main`；未 commit / 未 push。
- S1 白名单范围内 `git status --porcelain` 恰好 4 类（`s1-git-snapshot.txt`）：

```
 M socialmate-v1.2/index.html
 M socialmate-v1.2/source/V1.1-baseline.html
?? socialmate-v1.2/screenshots/n05-s1-detail.png
?? socialmate-v1.2/screenshots/n05-s1-people-first.png
?? socialmate-v1.2/screenshots/n05-s1-settings-demo.png
?? socialmate-v1.2/verify-n05-s1.mjs
```

- 全仓 `dirty_count` 56（S0 记录为 43）。多出部分不是 S1 新改动：
  - `socialmate-prototype/ai-gateway/` 6 个文件 mtime 22:03–22:09，属 S2/S3 后端（`s2s3.log` 22:10 已结束）；
  - `android-poc/` 5 个文件 mtime 22:27–22:29，属并行 TTS/S4 会话；
  - 其余为 S0 之前既有改动（CHANGELOG/docs/relay 等）。
- 本代理本轮只写入：`verify-n05-s1.mjs`、`qa/20261102-s1s3/**`；未写入任何禁改路径。
- 说明：S1 开始前未留存全仓 `git diff --stat` 快照，故「只应出现 4 类」用**白名单 scoped status + 禁改文件内容哈希**双重证明，而不是用全仓 diff 行数。

## 5. 三项 SHA-256 对比（前= S0 `hashes.txt`）

| 对象 | S0 | 当前 | 结论 |
|---|---|---|---|
| `source/places-115.json` | `0412673d…836e9` | `0412673d…836e9` | 一致 |
| `public/index.html` | `ba6537cc…134e` | `ba6537cc…134e` | 一致 |
| `public/styles.css` | `5cf4044e…d1` | `5cf4044e…d1` | 一致 |
| `gh-pages:index.html` | `d5c3bc5c…a1a` | 同左 | 一致 |
| `gh-pages:styles.css` | `230ca8c2…a1b` | 同左 | 一致 |
| `gh-pages:public-places.js` | `5c4a51d4…100` | 同左 | 一致 |
| `gh-pages:sw.js` | `7a0831fc…b7e` | 同左 | 一致 |
| `gh-pages:manifest.webmanifest` | `f8fc22d0…96c` | 同左 | 一致 |
| `gh-pages:public-share.js` | `905c63ba…395` | 同左 | 一致 |
| `gh-pages:public-share.html` | （S0 未单列） | `d5c3bc5c…a1a` | 新增核对，与公开首页同源；未改 |
| `gh-pages:icon.svg` | `61e289d8…3` | 同左 | 一致 |
| 真实 `SocialMate-Data/People` 41 文件聚合 | `78482d07…4d3` | `78482d07…4d3` | 一致 |

聚合算法（可复现）：`find SocialMate-Data/People -type f | sort | xargs shasum -a 256 | shasum -a 256`。

补充：`SocialMate-Data/Demo` 聚合由 `ee241688…def` 变为 `7b53ed32…ac01`，原因是 ② 做了一次清空→恢复往返，重写了演示副本与归档台账；该目录为隔离副本，真实 People 未参与（计数与 `/api/demo/people` 的 `realRoot` 已复核）。

## 6. 演示计数（恢复后）

`GET /v12/api/demo/people` → `isolatedRoot=SocialMate-Data/Demo`、`realRoot=SocialMate-Data/People`、`personas=3`、`sessions=9`、`segments=54` ✔

## 7. 真机截图（`adb -s REDACTED-SERIAL`，model 21091116AC）

- `s1-device-people.png` / `s1-device-people-app.png`：People 首屏（WebView / 整屏）。
- `s1-device-settings-demo.png` / `s1-device-settings-demo-app.png`：「设置 → 高级 → 演示与测试」展开态。
- 文字转写：`s1-device-people.txt`、`s1-device-settings-demo.txt`。

证据点：

- People 页对 `演示人物/清空演示/恢复演示/合成 final/合成final/测试令牌` 命中 **0**；首屏为 5 位真实主档（Daniel / Mia / Ravi / Sofia / Test-Anna），无演示三人。
- 设置面板含「高级」「演示与测试」，计数 `3 人 · 9 段会话 · 54 句原文`；`#demoAdv` 展开后 `top=39`，在 791px 视口内。
- 截图非空白校验：采样唯一色 772 / 830。
- 连接方式：`adb reverse tcp:8791 tcp:8791`（App 默认 `http://127.0.0.1:8791/v12`）。

## 8. 未完成 / 限制

- 详情「撤回」的真实写入与撤回未在 S1 点测（归档令牌门槛），`skipped` 已标注，留 S2。
- 全仓 `git diff --stat` 含 S2/S3/S4 与 S0 前既有改动，无法用「44 行 diff」单指标验收，已改用 scoped status + 哈希双证。
- `adb reverse tcp:8791` 保留未移除，供并行 S4 会话继续使用；如需清理：`adb -s REDACTED-SERIAL reverse --remove tcp:8791`。