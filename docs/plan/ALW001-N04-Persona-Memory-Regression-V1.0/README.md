# N04 三人物真实可检查的演示闭环

**任务**：SM-ALW001-20261102-N04-PERSONAS
**主计划**：本目录 SDD.md
**永久虚构母版**：fixtures/demo-personas.json
**静态校验**：node docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-fixtures.mjs
**9次逐项验收**：SCENARIO-MATRIX.md
**旧N04版本稳定性计划**：docs/plan/ALW001-N04-Deep-Stabilization-and-Evidence-V1.0.md

已经**实际写入项目**的是3个人物 / 9条合成会话 / 54个final段 / 6个模拟已确认事实 / 3个待确认事实的母版、校验器与SDD。它们是原始测试材料，不是APP当前已经展示的产品界面。

## 桌面开发者从这里开始

1. 检查Git dirty和现有N03并行修改；新构建0.7.0/ADB固定serial留证，不覆盖别人的文件。
2. 先把演示数据母版接入**隔离的永久演示命名空间**，实现手机默认可见3个人物、9段原文，以及清空/恢复按钮。复用既有People和归档，不污染正式用户主档。
3. 实现录音final触发的即时待确认事实和当轮人工确认后动态更新专属话题；三人人物分别回放、截图、哈希断言，支持通用问题。
4. 让演示会话经现有归档管道自动落Mac固定 Demo/Conversations 目录、逐字导出md/json、断网补传；真正测试clear/restore后数据仍能恢复。
5. 每次QA保留不可覆盖的完整测试产物，更新项目HANDOFF/CHANGELOG和最新APK哈希后才最终一次Human Gate。

**安全**：本轮仅允许清除演示活动副本，绝不删除真实人物资料/归档；不能把虚构对话称为真人录音；真人ASR留存仍需明确授权。现有ASR和DeepSeek各1元预算不变。

**交付检验**：如果用户打开手机仍是空白/看不到演示人物，或者清空后无法恢复，再或者9套md/json没有在Mac保存，就不能结案。

---

# 执行记录

## 第一步：三人物演示母版接入隔离演示命名空间（2026-11-02）

状态：**PARTIAL-PASS**（步骤 1 完成；步骤 2/3/4 见文末「未完成项」）。

### 结论

手机打开「人物」页默认可见 **3 位演示人物 / 9 段会话 / 54 句原文**，点开能看到逐句英文原文（带时间、说话人、`合成` 标签）、2 条已确认事实（带来源「会话 ID · 段号」）与 1 条待确认事实；页面提供「清空演示数据 / 恢复演示数据」按钮与二次确认弹窗；清空后演示端点归 0 且真实 `SocialMate-Data/People/` 逐文件哈希完全不变；恢复后回到 3/9/54 且重复恢复不累加。

### 隔离设计（硬红线）

| 项 | 路径 |
| --- | --- |
| 演示命名空间（可清空/可恢复） | `SocialMate-Data/Demo/{People,Conversations,Backups,state.json}` |
| 真实主档（**本步从未写入**） | `SocialMate-Data/People/` |
| 不可变母版（只读） | `docs/plan/.../fixtures/demo-personas.json` |

- `demo-store.mjs` 每个写/读入口先跑 `assertIsolated()`：演示根与真实人物根互为父子时直接 500 拒绝，宁可报错也不写错目录。
- 复用既有链路，不新造第二套存储：人物事实走 `people-store.appendPeopleFacts(..., {root: Demo/People})`（保留 `<!--sm-src-->` 来源标记、幂等、原子替换、写前备份）；9 段会话走 `conversation-archive.saveSession(..., {root: Demo/Conversations})` 落 9 对 `.md` + `.json`（`YYYY/MM/SocialMate-*.md|json`）。
- 清空 = 把 `Demo/{People,Conversations}` 整体移到 `Demo/Backups/<ts>/` 并写 `state.json{cleared:true}`；`state.json` 里的 cleared 状态是持久的，重启不会自动重种；恢复 = 从母版在临时目录重建后原子替换。
- 演示读接口**不要求令牌**（内容全部是 Git 内公开的虚构剧本，不是用户隐私）：否则手机首次打开会停在「粘贴令牌」而空白。真实 `/v12/api/people*` 仍需令牌（实测 401 不变）。清空/恢复仍要求 `confirm:true` + 既有写限流。

### 改动文件清单

新增
- `socialmate-prototype/ai-gateway/demo-store.mjs`（演示命名空间：种入/状态/清空/恢复/读取；隔离断言）
- `docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-demo-integration.mjs`（29 项真跑验收，跑完自动恢复到基线）

修改
- `socialmate-prototype/ai-gateway/people-store.mjs`：`appendPeopleFacts(facts, {root})` 支持注入 root（默认仍是真实主档，行为不变）
- `socialmate-prototype/ai-gateway/server.mjs`：新增 `GET /v12/api/demo/status|people|people/:slug|sessions/:id`、`POST /v12/api/demo/clear|restore`
- `socialmate-v1.2/source/V1.1-baseline.html`：人物页「演示人物」分区（3 张卡 + 管理按钮 + 演示标签）、演示详情抽屉、应用内二次确认（不用 `window.confirm`，WebView 不弹原生对话框）
- `socialmate-v1.2/build-v12.py` + `socialmate-v1.2/index.html`：构建时内嵌只读母版（`<script id="demo-fixture">`），服务不可达时显示「离线只读」而不是空白
- `android-poc/app/build.gradle`：versionCode 26 / versionName 0.7.1

运行时数据（`.gitignore` 已忽略 `/SocialMate-Data/`，不入库）：`SocialMate-Data/Demo/`

### 验证 1：静态母版校验（86 项）

```
$ node docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-fixtures.mjs
{
  "result": "PASS",
  "checks": 86,
  "failures": [],
  "persons": 3,
  "sessions": 9,
  "segments": 54
}
```

### 验证 2：演示端点默认返回 3 人物 / 9 会话 / 54 段

```
$ curl -s http://127.0.0.1:8791/v12/api/demo/status
{"ok":true,"demo":true,"synthetic":true,"isolatedRoot":"SocialMate-Data/Demo",
 "realRoot":"SocialMate-Data/People","seeded":true,"cleared":false,
 "fixtureVersion":"N04-DEMO-1.0",
 "fixtureSha256":"5513b086aff7066ee08995f4aae857ed8a4848aaac51249bf9309dc9a1288263",
 "personas":3,"sessions":9,"segments":54,"seed":{"seeded":true,"reason":"already"},
 "demoRoot":"SocialMate-Data/Demo"}

$ node docs/plan/.../verify-demo-integration.mjs
{ "result": "PASS", "checks": 29, "failures": [],
  "realPeople": {"files": 41, "sha256": "fe662283e3c85553cedea57f8644567e14df66c4cbd44c0c3493902910af4793"},
  "demo": {"root": "SocialMate-Data/Demo",
    "people": [
      {"slug":"demo-oliver-uk","name":"Oliver Reed","facts":2,"pending":1,"sessions":3,"segments":18,
       "firstLine":"What do you enjoy doing before work?"},
      {"slug":"demo-maya-us","name":"Maya Torres","facts":2,"pending":1,"sessions":3,"segments":18,
       "firstLine":"What kind of creative work do you do?"},
      {"slug":"demo-jieun-kr","name":"Ji-eun Park","facts":2,"pending":1,"sessions":3,"segments":18,
       "firstLine":"What do you enjoy doing on a quiet weekend?"}],
    "sessions": 9, "segments": 54} }
```

### 验证 3：清空 → 演示端点归 0，真实 People 逐文件哈希不变

```
$ curl -s -X POST -H 'Content-Type: application/json' -d '{"confirm":true}' \
    http://127.0.0.1:8791/v12/api/demo/clear   → persona 0 / sessions 0 / segments 0
$ curl -s http://127.0.0.1:8791/v12/api/demo/people
api people: 0 sessions: 0 segments: 0 cleared: True

$ (清空前)  find SocialMate-Data/People -type f | sort | shasum 逐文件
before:       41 files /        6 dirs
final :       41 files /        6 dirs
IDENTICAL          # /tmp/n04-real-people-before.txt vs /tmp/n04-real-people-final.txt
Daniel-Weiss  Mia-Chen  Ravi-Kumar  Sofia-Martins  Test-Anna  _template   # 目录一项不少
```

清空后 `SocialMate-Data/Demo` 只剩 `Backups/` 与 `state.json`（`cleared:true`），退出 App 重进仍为 0。

### 验证 4：恢复 → 回到 3 / 9 / 54，重复恢复不累加

```
$ curl -s -X POST -d '{"confirm":true}' .../restore → personas 3 / sessions 9 / segments 54
$ 再恢复一次                                        → personas 3 / segments 54（幂等）
$ find SocialMate-Data/Demo/Conversations -name '*.md'  | wc -l  → 9
$ find SocialMate-Data/Demo/Conversations -name '*.json'| wc -l  → 9
$ find SocialMate-Data/Demo/People -name 00-profile.md   → demo-oliver-uk / demo-maya-us / demo-jieun-kr
```

### 验证 5：真机（WGBMXWDIAIFMPFCQ，`21091116AC`）

APK：`versionCode=26 versionName=0.7.1`，SHA256 `a126dccae57e4c1b45803cffeca589e81d74cbe8a2f4390d2f26109c0afaa3e5`，`adb -s WGBMXWDIAIFMPFCQ install -r` 成功。

| 截图 | 内容 |
| --- | --- |
| `/tmp/n04-01-people.png` | 人物页「演示人物 3 位 · 9 段会话 · 54 句原文」，演示标签、两个管理按钮、Oliver Reed 卡（地区/风格/兴趣/最后交流日） |
| `/tmp/n04-02-detail.png` | 点开 Oliver：2 条已确认事实（来源 `sess_n04_demo_oliver_uk_1 · 段 2/4`）+ 1 条「待确认 · 未写入主档」 |
| `/tmp/n04-03-segments.png` | 三段会话原文逐句（`00:00 · 说话人 spk_0 · 合成` / “What do you enjoy doing before work?” …） |
| `/tmp/n04-04-clear-confirm.png` | 清空二次确认弹窗（写明只清 `SocialMate-Data/Demo`，不碰 `SocialMate-Data/People`） |
| `/tmp/n04-05-cleared.png` | 清空后空态「0 位 · 0 段会话 · 0 句原文」+ 恢复提示 |
| `/tmp/n04-06-restore-confirm.png` | 恢复二次确认弹窗 |
| `/tmp/n04-07-restored.png` | 恢复后回到「3 位 · 9 段会话 · 54 句原文」 |
| `/tmp/n04-08-three-personas.png` | 三位演示人物卡（Oliver Reed 英国·伦敦 / Maya Torres 美国·奥斯汀 / Ji-eun Park 韩国·首尔） |

### 服务与安全备注

- 8791 原进程未含新路由，需热加载代码：用项目自带 `bash socialmate-v1.2/service-v040.sh restart` **平滑重启一次**（只停本仓库自有进程，ASR 8790 与 AI 8791 同进程，重启后 `combined:true`、腾讯 ASR 真实模式、预算数值未变）。
- 未改动 ASR 与 DeepSeek 预算逻辑；本轮 0 次 DeepSeek 调用，无新增费用。
- 演示内容全部标「演示数据 · 虚构合成」/「合成」，未出现「真人录音」表述。

## 未完成项（后续步骤，不在本步范围）

1. 新 final → 待确认 → 用户确认 → 专属问题即时刷新的交互闭环（SDD §2.3 / T2）；当前仅静态展示 fixture 里 1 条待确认候选。
2. 9 套会话按协议自动落 Mac 固定目录 `~/Documents/SocialMate/Demo/Conversations` 并支持断网补传（SDD §2.4 / T3）；当前落在仓库内 `SocialMate-Data/Demo/Conversations`。
3. 人物专属问题/通用问题对照（`N04-persona-comparison.json`）、记忆时间线、归档清单、clear-restore 证据 JSON 等 QA 产物落盘（SDD §4）。
4. 离线只读兜底路径做了代码与构建校验（内嵌 3 人物/9 会话/54 段可解析），但尚未在真机上断网实测。

---

## 第二步：final → 待确认 → 人工确认 → 当轮专属话题更新（2026-11-02）

状态：**PASS（SDD §2.3 / T2 闭环）**。归档落 Mac 固定目录与断网补传仍属 T3，见文末「第二步未完成项」。

### 结论

演示模式下新来的 final **先进入「待确认」队列，不写档案**；页面显式标「待确认 · 未写入主档」并给出来源（会话 ID · 段号）。用户点「确认写入档案」后，事实立刻落到 `SocialMate-Data/Demo/People/<slug>/00-profile.md`，同一轮返回重算后的 2 条专属问题 + 1 条通用破冰，**同屏更新，不刷新页面/不重启 App**；点「忽略」只清队列，档案不变。说话人身份无法证实时，final 进「未归属」队列，必须由用户选人后才允许写入。真机重启后已确认事实与问题仍在。

### 改动文件清单

新增
- `docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-pending-facts.mjs`（32 项真跑断言；结尾自动恢复演示基线，可重复跑）

修改
- `socialmate-prototype/ai-gateway/demo-store.mjs`
  - `state.json` 的 `pending` 从单个对象升级为数组（每条带稳定 `id`，旧结构读取时自动归一，不清用户演示副本）；
  - 新增 `injectDemoFinal()`（合成 final 回放 / 显式文本，同来源同文本幂等）、`confirmDemoPending()`（写 `Demo/People` 后立刻重算问题并返回整份 person）、`ignoreDemoPending()`、`listInbox()`；
  - 新增 `buildDemoPrep()`：只由**已确认事实**按本地规则生成 2 条专属问题（最新确认的排第一）+ 1 条通用破冰；待确认候选不参与，0 次外部调用。
- `socialmate-prototype/ai-gateway/server.mjs`：新增 `POST /v12/api/demo/final`、`POST /v12/api/demo/people/:slug/pending/:id/confirm|ignore`（含未归属 `POST /v12/api/demo/pending/:id/confirm|ignore`）；全部要求 `confirm:true`，复用既有写限流（12 次/分、400ms 间隔），未放宽。
- `socialmate-v1.2/source/V1.1-baseline.html`：演示详情抽屉加「回放一条合成 final（演示）」「待确认 · 未写入主档」「确认写入档案 / 忽略」「给这位朋友的 2 个专属问题（随确认即时更新）」「通用破冰 1 题」；演示分区加「本轮未归属 final」选人块；确认/忽略后同屏重渲染并提示「已写入演示档案，专属问题已更新」。
- `socialmate-v1.2/index.html`：`build-v12.py` 重建产物。
- `android-poc/app/build.gradle`：versionCode 27 / versionName 0.7.2。

### 验证 1：`verify-pending-facts.mjs`（PASS，32 项，连续两次）

```
$ node docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-pending-facts.mjs
{
  "result": "PASS",
  "checks": 32,
  "failures": [],
  "assertions": {
    "A_inject": {
      "pendingBefore": 1, "pendingAfter": 2,
      "factsBefore": 2, "factsAfter": 2,
      "injected": {"text": "Oliver keeps his runs easy on the days after heavy lifting.",
                   "sessionId": "sess_n04_demo_oliver_uk_3", "segmentIndex": 1,
                   "pendingId": "pnd_fa72ae987063"}          // 断言①出现 1 条待确认、档案事实数不变
    },
    "B_confirm": {
      "factAdded": "Oliver is preparing for his first 10-kilometre race in December.",
      "facts": {"before": 2, "after": 3},                    // 断言②事实 +1
      "pendingBefore": 2, "pendingAfter": 1,
      "prep": {
        "before": ["How is your pull-up goal going?",
                   "Have you found a routine that works for your gym mornings?"],
        "after":  ["How is your 10K training for December going?",
                   "How is your pull-up goal going?"],
        "generic": "What has been the highlight of your week so far?"
      }
    },
    "C_ignore": {
      "ignored": "Oliver keeps his runs easy on the days after heavy lifting.",
      "pendingAfter": 0, "factsUnchanged": 3                  // 断言③待确认归零、档案不变
    }
  },
  "realPeople": {
    "files": 41,
    "sha256Before": "fe662283e3c85553cedea57f8644567e14df66c4cbd44c0c3493902910af4793",
    "sha256After":  "fe662283e3c85553cedea57f8644567e14df66c4cbd44c0c3493902910af4793"
  }                                                            // 断言④逐文件哈希一致
}
```

其余通过项（摘要）：重复注入不产生第二条；重复确认返回 404 且不重复写；未归属 final 未选人时确认返回 `400 ATTRIBUTION_REQUIRED`；确认后 `Demo/People/demo-oliver-uk/00-profile.md` 含新事实且含 `sm-src` 来源标记；忽略的文本没有进入档案；结尾 `restore` 回到 3 人物 / 9 会话 / 54 段 / 3 条待确认。

第二次运行（`/tmp/n04-t2-verify-run2.json`）同样 `PASS 32 / failures 0`，before/after 文本与哈希完全一致 → 脚本可重复跑。

### 验证 2：真机（WGBMXWDIAIFMPFCQ，`21091116AC`，Android 11）

APK：`versionCode=27 versionName=0.7.2`，SHA256 `465d9f22a39b12bc8032eb677150039c8824dd0b9c8a6c88a956ca851f162f89`；`adb -s WGBMXWDIAIFMPFCQ install -r` → `Success`，`firstInstallTime` 仍为 `2026-10-31 18:25:27`（保留用户数据）。

| 截图 | 内容 |
| --- | --- |
| `/tmp/n04-t2-01-people.png` | 人物页演示分区「3 位 · 9 段会话 · 54 句原文 · 待确认 3 条」「演示数据 · 虚构合成」标签 |
| `/tmp/n04-t2-02-pending.png` | Oliver 详情：2 条已确认事实 +「本轮新听到 · 待确认 1 条 · 未写入主档」+ 回放按钮 |
| `/tmp/n04-t2-03-before-confirm.png` | 确认前：待确认条目（来源 `sess_n04_demo_oliver_uk_2 · 段 4`）+「确认写入档案 / 忽略」+ 专属问题 1「How is your pull-up goal going?」 |
| `/tmp/n04-t2-04-after-confirm.png` | **同屏**确认后：该事实进入已确认区、待确认 0 条、专属问题 1 变为「How is your 10K training for December going?」，Toast「已写入演示档案，专属问题已更新」 |
| `/tmp/n04-t2-05-after-restart.png` | force-stop 后重开 App：仍为 3 条已确认事实（含 10K 那条）→ 重启不丢 |
| `/tmp/n04-t2-06-replay-pending.png` | 点「回放一条合成 final（演示）」→ 新增 1 条「待确认 · 未写入主档」（来源 `..._3 · 段 2`），专属问题未变（未确认不参与） |
| `/tmp/n04-t2-07-after-ignore.png` | 点「忽略」→ 待确认 0 条、事实仍 3 条、Toast「已忽略，未写入档案」 |

### 服务与安全备注

- 8791 需加载新路由：用 `bash socialmate-v1.2/service-v040.sh restart` 平滑重启一次，只停本仓库自有进程（旧 pid 61174 → 新 pid 68132）；日志 `socialmate-v1.2/.local/qa/live-v040-20261102-094328.log`。重启后 `combined:true`、腾讯 ASR 真实模式不变。
- 回归：第一步脚本 `verify-demo-integration.mjs` 改为**先 restore 再做基线断言**（用户确认后 pending 不再恒为 1），并加了与服务端一致的 429 重试；重跑 **30 项 PASS**，真实 People 哈希不变。该脚本结尾会把演示副本恢复成基线（Oliver 又回到 2 条事实 / 1 条待确认），真机上再打开看到的是标准演示起点，不是上面截图里已确认的状态。
- 未改 ASR / DeepSeek 预算逻辑，本轮 **0 次 DeepSeek 调用**（预算账本仍为 calls 51 / spent ¥0.213634）、0 次腾讯 ASR 调用（ASR 预算 seconds 465.081 未变）。
- 真机操作经 WebView CDP（`WebView.setWebContentsDebuggingEnabled(true)` 既有开关）点 DOM，等价于用户点击；截图由 `adb exec-out screencap` 取得，未修改页面之外的任何状态。
- 隔离核对：设备操作后重新计算 `SocialMate-Data/People/` 41 个文件 sha256 = `fe662283…0af4793`，与本轮开始前一致；所有写入只出现在 `SocialMate-Data/Demo/`。

### 第二步未完成项

1. T3：9 套会话自动落 `~/Documents/SocialMate/Demo/Conversations`、断网补传、手机 SAF 导出——仍未做（当前演示归档在仓库内 `SocialMate-Data/Demo/Conversations`）。
2. SDD §4 的 QA 产物（`N04-memory-timeline.jsonl`、`N04-persona-comparison.json`、`N04-archive-inventory.json`、`N04-clear-restore.json`、`N04-android-ui-screenshots/`）尚未成体系落盘；本轮截图仍在 `/tmp`。
3. 真机断网离线只读路径仍未实测。
4. 未归属 final 的选人块已有 API 与 UI，但本轮真机只验证了「已归属回放」，未在设备上点过选人下拉。

---

## 第三步：9 套会话落 Mac 演示归档 + 断网补传 + QA 产物（2026-11-02）

状态：**PASS（SDD §2.4 / T3 + §4）**。真机 0.7.3（vc 28）。

### 结论

9 套合成会话经**真实 HTTP 归档管道**（隔离接收端 `127.0.0.1:8782`）落到 Mac 固定目录
`~/Documents/SocialMate/Demo/Conversations/2026/{10,11}/`，每套一对 `.md` + `.json`，与仓库内待传队列的副本**逐字节相同**，
54 段原文与母版 `fixtures/demo-personas.json` 逐句一致（全部 `MOCK/synthetic` 标记）。
归档端不可达时 9 套全部留在 `SocialMate-Data/Demo/` 待传队列（`archive-state.json` 记 pending + lastError，本地副本不删）；
恢复后一次投递全部送达（created 9 / duplicate 0）；清掉投递台账后重复投递得到 **duplicate 9 / created 0，文件数仍 9+9、sha256 不变**。
清空演示后卡片归 0、Mac 演示归档 9 对仍在；恢复回到 3/9/54 + 3 条待确认。
正式归档 `~/Documents/SocialMate/Conversations`（4 文件）与真实主档 `SocialMate-Data/People`（41 文件，`fe662283…0af4793`）前后 sha256 完全不变。

### 隔离与队列设计

| 项 | 路径 / 端点 |
| --- | --- |
| 待传队列（本地权威） | `SocialMate-Data/Demo/Conversations/YYYY/MM/*.json` + 投递台账 `SocialMate-Data/Demo/archive-state.json` |
| Mac 演示归档（交付物） | `~/Documents/SocialMate/Demo/Conversations/YYYY/MM/*.md+*.json` |
| 隔离归档接收端 | `http://127.0.0.1:8782/api/archive/session`，root 由 `SM_CONVERSATION_DIR` 固定，令牌 `socialmate-v1.2/.local/demo-archive-token` |
| 正式归档（未参与） | `127.0.0.1:8781` → `~/Documents/SocialMate/Conversations` |

- 投递复用 `conversation-archive.saveSession` 的校验/原子写/幂等（同 sessionId + contentHash → duplicate 200）；
  归档 JSON 只存 final 段（不带 `final` 字段），投递时补回协议要求的 `final:true`，原文与其他字段不动。
- 种入/恢复后自动异步补传（`setImmediate`，不阻塞手机打开）；失败只写台账，不删本地队列。
- 已 exported 但 Mac 文件被手工删除时会自动重投；客户端不能传任何路径，端点/root 全在服务端固定。

### 改动文件清单

新增
- `socialmate-prototype/ai-gateway/demo-archive.mjs`（队列扫描 / HTTP 投递 / 台账 / 状态 / 幂等）
- `socialmate-v1.2/demo-archive-service.sh`（8782 隔离接收端：start/stop/status/token，独立 pid/日志/令牌）
- `docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-demo-archive.mjs`（39 项真跑验收，可重复跑）
- `docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/generate-qa-artifacts.mjs`（QA 产物生成 + 真实确认/清空恢复取证）

修改
- `socialmate-prototype/ai-gateway/demo-store.mjs`：种入/恢复成功后触发 `scheduleArchivePush()`
- `socialmate-prototype/ai-gateway/server.mjs`：新增 `GET /v12/api/demo/archive/status`、`POST /v12/api/demo/archive/push`
  （`confirm:true` + 既有写限流），`/v12/api/demo/people` 附带 `archive` 状态
- `socialmate-v1.2/source/V1.1-baseline.html`：演示区显示「Mac 归档 N/N 已送达 ｜ ~/Documents/…」、新增「同步到 Mac 归档」按钮、
  清空态显示「Mac 已有 9 对留档」
- `socialmate-v1.2/index.html`：`build-v12.py` 重建产物
- `android-poc/app/build.gradle`：versionCode 28 / versionName 0.7.3

运行时数据（`.gitignore` 已忽略，不入库）：`SocialMate-Data/Demo/`、`~/Documents/SocialMate/Demo/`

### 验证 1：`verify-demo-archive.mjs`（PASS，39 项）

```
$ node docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-demo-archive.mjs
RESULT PASS checks 39 failures []
{
  "macDemoArchive": {
    "root": "/Users/zzymima0000/Documents/SocialMate/Demo/Conversations",
    "files": 18, "pairs": {"md": 9, "json": 9},
    "digest": "6c27fa687935381954bc393bf41aa4e525467f281a117948c7899367b7d499e3"
  },
  "queue": {"root": ".../SocialMate-Data/Demo/Conversations", "sessions": 9},
  "realArchive": {"filesBefore": 4, "filesAfter": 4,
    "sha256Before": "90d8a1510cf414d5a2078da9d4deed7d43129774eec55ee14bd39f4120649337",
    "sha256After":  "90d8a1510cf414d5a2078da9d4deed7d43129774eec55ee14bd39f4120649337"},
  "realPeople": {"files": 41,
    "sha256": "fe662283e3c85553cedea57f8644567e14df66c4cbd44c0c3493902910af4793"},
  "lifecycle": {
    "offline":   {"pending": 9, "delivered": 0, "errors": 9, "remoteFiles": 0},
    "recovered": {"created": 9, "delivered": 9, "pending": 0},
    "repeated":  {"created": 0, "duplicates": 9}
  }
}
```

逐段核对项（同脚本内断言）：`verbatim-md-9`（Mac md 与队列副本 `cmp` 相同）、
`verbatim-segments-sessions-9`（9 套 × 6 段文本数组与母版完全相等）、`synthetic-mock-54`（54 条 `MOCK` 标记）；
`offline-no-remote-write`（断网时 Mac 目标 0 文件）、`offline-queue-kept-9`（本地队列仍有 9 套）。

### 验证 2：断网 → 待传 → 恢复 → 送达（真实执行序列）

```
1) bash socialmate-v1.2/demo-archive-service.sh stop      → 归档端不可达（ECONNREFUSED）
2) rm SocialMate-Data/Demo/archive-state.json（清投递台账，模拟首次投递）
3) POST /v12/api/demo/archive/push {"confirm":true}
   → pending 9 / delivered 0 / errors 9；Mac 目标 0 个文件；队列 9 套原样保留
4) bash socialmate-v1.2/demo-archive-service.sh start     → 8782 READY
5) POST …/push → created 9 / delivered 9 / pending 0；Mac 生成 9 对 md+json（HTTP 201）
6) rm archive-state.json 后再 push → created 0 / duplicates 9（HTTP 200）；文件仍 9+9，md sha256 逐一不变
```

### 验证 3：9 套 md/json 的 sha256（`shasum -a 256` 实跑）

```
b30cb181983d2923d6050b86bf4ec7ecb0d2aa9342ecf726575003653e9e2c6c  ~/Documents/SocialMate/Demo/Conversations/2026/10/SocialMate-2026-10-20-040000-sess_n04_demo_jieun_kr_1.json
125fac99b1a991c3f56a7667b8f2d580e22b5233c41266408f6c53ffd4b17728  ~/Documents/SocialMate/Demo/Conversations/2026/10/SocialMate-2026-10-20-040000-sess_n04_demo_jieun_kr_1.md
f49f4b1024f30bdb304c6ca31e2f330ed2afef28ef61873b3ac3c16522b9050d  ~/Documents/SocialMate/Demo/Conversations/2026/10/SocialMate-2026-10-20-090000-sess_n04_demo_oliver_uk_1.json
242d5e2f99d59aaef83d1ca3b7d867faa3e2afc579cb097c4c4bdee863e9e9ea  ~/Documents/SocialMate/Demo/Conversations/2026/10/SocialMate-2026-10-20-090000-sess_n04_demo_oliver_uk_1.md
9f2f80c594adb5f08d4247cd63ccd91b410f2d633e983b917866f67c5161fb49  ~/Documents/SocialMate/Demo/Conversations/2026/10/SocialMate-2026-10-20-140000-sess_n04_demo_maya_us_1.json
51961fc7c8b9335ddf18b2883504ea675dc739791ddbdcf1b45620ee0647fe4f  ~/Documents/SocialMate/Demo/Conversations/2026/10/SocialMate-2026-10-20-140000-sess_n04_demo_maya_us_1.md
09f8606406fed183f61b317927bea85be3d308446407d01e80312a0c6423a913  ~/Documents/SocialMate/Demo/Conversations/2026/10/SocialMate-2026-10-27-040000-sess_n04_demo_jieun_kr_2.json
8eac9bb74e1ede05b9b1d2d00569f06ca5ba765acd73253a52225439898d2290  ~/Documents/SocialMate/Demo/Conversations/2026/10/SocialMate-2026-10-27-040000-sess_n04_demo_jieun_kr_2.md
c70f9015443bb2e65bcf300cc60b58ad3d95a8d15555ff2eeb8fdc5a6bd1271e  ~/Documents/SocialMate/Demo/Conversations/2026/10/SocialMate-2026-10-27-090000-sess_n04_demo_oliver_uk_2.json
f471b0cda0048ff3b98c482f44c5d01ec4b235a5e0111e27306485cb17d3b5ce  ~/Documents/SocialMate/Demo/Conversations/2026/10/SocialMate-2026-10-27-090000-sess_n04_demo_oliver_uk_2.md
968860a5695c6998084ac3d5b86107134b61a69374a76d56cfcbe159196d7242  ~/Documents/SocialMate/Demo/Conversations/2026/10/SocialMate-2026-10-27-140000-sess_n04_demo_maya_us_2.json
56d253f8c8e86e4d9d8e70217446d010421925abecc0e09e4247ecb665238c45  ~/Documents/SocialMate/Demo/Conversations/2026/10/SocialMate-2026-10-27-140000-sess_n04_demo_maya_us_2.md
e2828a8287e8fd4794137f424887164633768ca6ceaec9e26f8fad7c3517ff91  ~/Documents/SocialMate/Demo/Conversations/2026/11/SocialMate-2026-11-01-040000-sess_n04_demo_jieun_kr_3.json
acac7e04d79c15b56b8cfeffb9d7e5369c6c1656c3ed6c31a4e4178d2b58d104  ~/Documents/SocialMate/Demo/Conversations/2026/11/SocialMate-2026-11-01-040000-sess_n04_demo_jieun_kr_3.md
dbc829f6db7aaa69dc2743f609d3aa6788c02b3b7bf8a8f1b8a494f44cdeac6e  ~/Documents/SocialMate/Demo/Conversations/2026/11/SocialMate-2026-11-01-090000-sess_n04_demo_oliver_uk_3.json
08fedc6eed472ff80311bd5c86323e167bb46ea23fc5f7c9faa5f100cd7798df  ~/Documents/SocialMate/Demo/Conversations/2026/11/SocialMate-2026-11-01-090000-sess_n04_demo_oliver_uk_3.md
d47f1cad6b293f7ffa9ac93de3ae0bd6187bd01e8724ae44629d59356748a13e  ~/Documents/SocialMate/Demo/Conversations/2026/11/SocialMate-2026-11-01-140000-sess_n04_demo_maya_us_3.json
5813904cd67dd81217f17558b6271d2c0a8d99475cff0bc999c657749794ee67  ~/Documents/SocialMate/Demo/Conversations/2026/11/SocialMate-2026-11-01-140000-sess_n04_demo_maya_us_3.md
```

计数：`find … -name '*.md' | wc -l` → **9**；`*.json` → **9**；正式归档文件数 **4**（前后一致）。

### 验证 4：清空 / 恢复（`clear-restore.json`）

```
$ node …/generate-qa-artifacts.mjs
clearRestore: {clearedToZero:true, restoredToBaseline:true, demoQueueCleared:true,
  macDemoArchiveUntouched:true, realPeopleUnchanged:true, realArchiveUnchanged:true,
  archiveStillDelivered:true}

清空后：personas 0 / sessions 0 / segments 0 / cleared true
        SocialMate-Data/Demo/Conversations 不存在（已移入 Demo/Backups/<ts>/）
        Mac Demo/Conversations 仍 9 对（18 文件），digest 不变
恢复后：personas 3 / sessions 9 / segments 54 / 待确认 3
        archive total 9 / delivered 9 / pending 0 / remoteFiles {md:9,json:9}
        真实 People 41 文件 fe662283…0af4793；真实归档 4 文件 90d8a151… 均不变
```

### 验证 5：真机（WGBMXWDIAIFMPFCQ，`21091116AC`，Android 11）

APK：`versionCode=28 versionName=0.7.3`，SHA256 `cd4cddcc123e9e39d20f6ca348ca3c014df7b8411ab7321e58dcab5c02e6147f`；
`adb -s WGBMXWDIAIFMPFCQ install -r` → `Success`，`firstInstallTime` 仍为 `2026-10-31 18:25:27`（保留用户数据）。
截图（已复制到 `qa/20261102/shots/`，均取自本机 `adb exec-out screencap`）：

| 截图 | 内容 |
| --- | --- |
| `01-people-demo-archive-9of9.png` | 演示区「3 位 · 9 段会话 · 54 句原文 · 待确认 3 条」+「Mac 归档 9/9 已送达 ｜ ~/Documents/SocialMate/Demo/Conversations」 |
| `02-sync-toast-idempotent.png` | 点「同步到 Mac 归档」→ Toast「已同步 Mac 归档 9/9 套（新增 0 · 重复投递 0 · 已在位 9）」 |
| `03-oliver-facts-pending.png` | Oliver 详情：2 条已确认事实（含来源会话/段号）+ 本轮待确认 1 条 |
| `04-oliver-questions-segments.png` | 专属问题 2（基于引体向上 / 健身房早晨事实）+ 通用破冰 1 + 三段原文（`说话人 spk_0 · 合成`） |
| `05-clear-confirm.png` | 清空二次确认，写明只清 `SocialMate-Data/Demo`，不碰 `People` 与正式归档 |
| `06-cleared-empty.png` | 清空后空态「0 位人物 / 0 段会话」+「Mac 归档：演示已清空，Mac 已有 9 对留档」 |
| `07-restore-confirm.png` | 恢复二次确认（3 人物 / 9 会话 / 54 句，重复恢复不累加） |
| `08-restored-3-9-54.png` | 恢复后回到 3 位 / 9 段 / 54 句 +「Mac 归档 9/9 已送达」 |
| `09-three-personas.png` | 三位演示人物卡（英国·伦敦 / 美国·奥斯汀 / 韩国·首尔） |

### QA 产物（`qa/20261102/`）

| 文件 | 内容 |
| --- | --- |
| `persona-comparison.json` | 三人事实/话题/专属问题/通用问题对照；三人专属问题 6 条互不重复、每条带 factId 与来源；`assertions` 全 true |
| `memory-timeline.jsonl` | 16 条：6 条基线事实、3 条 final→pending、3 次真实人工确认（含 prep before/after）、3 条建议更新、1 条恢复基线 |
| `archive-inventory.json` | 9 套的 Mac 路径 / 字节数 / sha256 / 段数 / 逐字一致标记，总计 32,736 字节 |
| `clear-restore.json` | 清空前后状态、Mac 演示归档与真实 People/正式归档的 sha256 证明 |
| `verify-demo-archive.json` | 39 项验收原始报告 |
| `device.json` | 真机序列号 / 机型 / Android / 版本 / APK SHA256 |
| `shots/01…09*.png` | 上表 9 张真机截图 |

`persona-comparison.json` 摘要：

```
Oliver  : How is your pull-up goal going? / Have you found a routine that works for your gym mornings?
          generic: What has been the highlight of your week so far?
Maya    : Have you made any new posters for local bands? / What's the best small gig you've seen recently?
          generic: What has been the highlight of your week so far?（允许重复）
Ji-eun  : Which café have you enjoyed most recently? / What have you been photographing lately?
          generic: Is there anything you would like to try for the first time this month?
确认待确认候选后（真实调用，非预演）：
Oliver  → How is your 10K training for December going?
Maya    → What kind of Haikou street food would you like to try?
Ji-eun  → What are you practising in English these days?
```

### 服务与安全备注

- 8791 只重启本仓库自有进程一次（旧 pid 68132 → 新 pid 77365），用于加载 `/v12/api/demo/archive/*`；
  8790 ASR 与 8791 同进程（`combined:true`），随该次平滑重启一起恢复，不涉及任何其他进程；
  重启后腾讯 ASR 真实模式、预算 `calls 51 / ¥0.213634`、ASR `465.081s` 全部未变。
- 新增 8782 演示归档接收端（pid 82451，独立令牌/pid/日志），正式 8781（pid 47203）未重启、未写入。
- 本轮 **0 次 DeepSeek 调用、0 次腾讯 ASR 调用**，无新增费用。
- 所有演示内容标「演示数据 · 虚构合成」/`MOCK`；任何失败都不会删除本地队列或真实档案。

### 第三步未完成项

1. 手机端 `SessionArchive` 仍只服务真实会话；「手机 outbox → Mac」的单条合成会话闭环本轮未做
   （本轮按用户口径验收的是 `SocialMate-Data/Demo/` 桌面待传队列 → 8782 接收端）。
2. SDD §4 的 Mac `~/Documents/SocialMate/Demo/People/<slug>/00-profile.md` 尚未镜像；演示人物档案当前仍在仓库
   `SocialMate-Data/Demo/People/`（`Conversations` 已按要求落 Mac）。
3. 真机断网「离线只读」与未归属 final 的选人下拉仍未在设备上点测。
4. 8782 未加开机自启；机器重启后需 `bash socialmate-v1.2/demo-archive-service.sh start` 才会自动补传。




---

## N04 人物档案详情重构（2026-11-02，0.7.4 / vc29）

**用户确认结构**：顶部头像首字母 + 姓名 + 国家·职业 + 「演示数据」 + 事实条数 + 中英切换；分组固定为
`基本情况 · 沟通习惯 · 爱好 · 生活习惯 · 其他`；组内有序列表；逐条编辑/删除；每组批量选择、全选、批量删除、批量改分组；
底部变更记录倒序时间线，支持撤回。

### 数据落点

| 内容 | 位置 |
| --- | --- |
| 事实正文 | `SocialMate-Data/Demo/People/<slug>/00-profile.md`（仍是带 `sm-src` 的可撤回事实） |
| 分组 + 中英翻译 | `SocialMate-Data/Demo/People/<slug>/facts-meta.json`（按 factId 索引） |
| 变更记录 | `SocialMate-Data/Demo/changelog.jsonl`（只追加；撤回也追加一条 `undo`） |
| 真实主档 | `SocialMate-Data/People/` 零写入（前后 41 文件 / sha256 一致） |

旧事实没有 `facts-meta.json` 时：已知母版英文句按内置对照表补中文与分组，其余一律归「其他」，仍能显示与编辑。

### 写接口

- 新增：`POST /v12/api/demo/people/:slug/facts`、`.../facts/:id/edit`、`.../facts/:id/delete`、
  `.../facts/bulk-delete`、`.../facts/bulk-group`、`.../changelog/:id/undo`
- 令牌：沿用现有 `x-archive-token`（由归档服务校验，无新增密钥）；同源校验沿用 `originOK`；写限流沿用 `createRateLimiter`。
- 读：`GET /v12/api/demo/people/:slug` 直接返回 `facts/groups/changelog`；`GET .../changelog` 可单独读取。

### 验证与设备

- `verify-persona-profile.mjs`：39 项全 PASS（分组条数、单条编辑、删除、批量删 2 条、改分组、变更记录动作与条数、
  新增/修改/删除/改分组撤回、老数据归其他、令牌 401、跨源 403、真实 People sha256 不变）。
- 真机 `WGBMXWDIAIFMPFCQ`（21091116AC / Android 11），版本 0.7.4 / vc29，
  APK sha256 `32df58fbe6b1513a3a10dafe22bdc1cc167791edc6d03c5270e06ac3adfca265`。
- 14 张真机截图：`qa/20261102/shots/persona-*.png`；设备与截图清单：`qa/20261102/persona-profile-device.json`；
  脚本输出：`qa/20261102/persona-profile-verify.txt`。
- 版本注入使用 `qa/20261102/version-0.7.4.gradle`，未修改 `android-poc/**` 源码。
