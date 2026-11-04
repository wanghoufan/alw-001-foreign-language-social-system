# V1.4 T2｜Mac 无人值守自动归档 · 证据报告（2026-11-04）

status: 本报告只覆盖 S2/ARC01–ARC03；V1.3 已通过的 85 条索引结构、五类 sourceType、原件引用与派生文件结构未改。

## 1. 根因（旧 watch 为什么不再扫描）

开工前（07:48）三处独立取证，结论一致：**11-02 那个 watch 实例从来没被 launchd 托管，是手工起的进程，会话结束就没了，也没有任何东西会把它拉起来。**

| 取证 | 结果 |
|---|---|
| `launchctl list \| grep -iE "alw\|socialmate\|archive\|learning"` | 只有 `com.alw.github-profile-daily`、`com.alw.skill-daily`、`com.alw.socialmate-stack`（pid 2433）——**没有任何 learning-archive 任务** |
| `ps aux \| grep learning-archive` | 空，没有 `--watch` 进程 |
| `grep -l "learning-archive" ~/Library/LaunchAgents/*.plist` | 无匹配；该类目录只有 `com.alw.socialmate-stack.plist` 与归档无关 |

因此「11-02 实例不再按 300 秒扫描」不是脚本内部状态坏了，而是**进程与守护都不存在**；85 条索引是靠人工 `--once` 补到位的（与 HANDOFF §3 记录一致）。

## 2. 修复

- 新增 LaunchAgent **`com.alw.learning-archive-watch`**（`~/Library/LaunchAgents/`，macOS 只允许从这里加载）：
  - 绝对路径指向本项目 `socialmate-prototype/ai-gateway/learning-archive-worker.mjs --watch --interval 300`
  - `WorkingDirectory` = 项目根；`RunAtLoad` + `KeepAlive` + `ThrottleInterval=30`（崩溃 30s 后自恢复）
  - 日志落**项目内** `.local/learning-archive/watch.out.log` / `watch.err.log`（不写 /tmp）
  - `ProcessType=Background` + `LowPriorityIO`，不抢前台 IO
  - node 路径双保险：优先 `.workbuddy/binaries/node/22.22.2`，不存在则回落 `.nvm/.../v24.19.0`
- **只加载本项目这一个 label**，未触碰 orca / workbuddy-switch / p066 / p054 等任何其它 label；四个服务进程（24798/92317/92336）全程未重启。

运行态：`launchctl list` → `45168 0 com.alw.learning-archive-watch`；`ps` → `node … learning-archive-worker.mjs --watch --interval 300`。

## 3. 七项受控验证（`verify.mjs` → `verify-result.json`，7/7 PASS）

| 用例 | 结果 | 实测数据 |
|---|---|---|
| 一次扫描后再次扫描新增 0（幂等） | PASS | run1 `indexed=1`；run2 `indexed=0 unchanged=1` |
| 源文件修改记新版本、旧版本与原件都不覆盖 | PASS | v1 `49927b5d…` / v2 `62d892ee…`，条目数 2 |
| QA fixture 文件名自动打标 | PASS | `total=2 realTotal=1 fixtures=1` |
| 连续漏扫 2 周期标 DEGRADED | PASS | `state=DEGRADED missed=2 consecutive=2` |
| PID 不存在标 NOT_RUNNING 并给恢复命令 | PASS | `recovery=launchctl kickstart -k gui/<uid>/com.alw.learning-archive-watch` |
| 断网（fetch 抛错）仍完成本地扫描 | PASS | `indexed=1 cloudCalls=0` |
| worker 被杀后新实例补扫停机期新增 | PASS | 停机期新增 `indexed=1`，`healthBefore=NOT_RUNNING` |

## 4. 健康摘要（`--health --json`）

```json
{"state":"OK","lastScan":"2026-11-04T00:23:01.610Z","lastScanAgeSeconds":127,
 "intervalSeconds":300,"nextScanEtaSeconds":173,"runningPid":45168,"running":true,
 "missedCycles":0,"consecutiveMissedCycles":0,"degradedAfterMissedCycles":2,
 "lastRunId":"run-20261104T001300-0eec","lastIndexed":1,"lastUnchanged":84,"lastFailed":0}
```

字段覆盖 S2 要求的 lastScan / running PID / 计划间隔 / 失败-滞后状态 / DEGRADED 阈值与恢复入口；`--status` 另有 `realTotal` 与 `testFixtures`。

## 5. ARC01 生产链路实测（我复核，非子代理临时根目录）

- 时间：`08:20:24` 放入 `SocialMate-Data/Inbox/qa-fixture-arc01-20261104.md`
- `08:23:01` 后台自动扫描完成：`lastIndexed=1 lastUnchanged=84`（**165 秒，全程未执行任何手工归档命令**）
- 清理：`--remove lm-fd67db3498b8a86b` 撤销索引（原始文件保留）→ 样本文件进废纸篓 → 复核 `total=85`

## 6. ARC03 语义修正

- 唯一 `self_test` 条目 `lm-fa760f1f00826c3d`（`sourceId=aabbccddeeff`，QA fixture）现为 `test:true`、`sourceTag:"qa_fixture"`，不再冒充 1 条真实学习成绩。
- `learning-archive.mjs` 增加 fixture 判定（文件名约定或正文 `qa_fixture: true`，**不做内容相似度猜测**）与历史条目补标入口 `--retag-fixtures`（幂等）。
- 现状：`total=85`、`realTotal=84`、`testFixtures=1`、`course=0`（NO_SOURCE 维持）、`awaitingConsent=85`。
- P016 真实收件仍为 **0**；不得把这条 fixture 说成 P016 手机传来的记录。

## 7. 测试残留清理（重要）

子代理的 e2e 样本一度被生产 watch 收录（`thought 43→44`，`lm-5395a1e2698ec4db`）。已 `--remove` 撤销索引 + 删除样本文件，复核回到 `total=85 / thought=43`。**生产索引没有任何测试数据残留。**

## 8. 遗留 / 边界

- 未做「删库重建」，未覆盖任何用户原始资料。
- 未产生云调用（DeepSeek / 腾讯云预算闸未动）。
- `course=0` 仍为 NO_SOURCE；P016 真实投递为空时如实标未接入。
- 该 LaunchAgent 落在 `~/Library/LaunchAgents/`（launchd 硬要求的位置），项目内只放脚本与日志。
