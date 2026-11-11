# P001 外语社交系统 · R2 证据索引

- 生成时间：2026-11-08
- Git 基线：HEAD `17c9f1a`（2026-11-06）｜提交总数 65 ｜10-31 后新增 52（`bf1ceb4..HEAD`，A 实测）
- 工作树：脏（本轮复盘文档写入前即存在）
- 说明：本索引只列本轮 R2 使用与复核过的证据，不重复上一轮 `Project-Evidence-Index.md`。标注「主开发者回源」= 本轮由主开发者亲自用 sed/grep 复核通过。

## 一、直接证据（本轮新增或复核）

| # | 结论 | 证据定位 | 等级 |
|---|---|---|---|
| E1 | 默认主题为浅色，非"跟随系统" | `socialmate-v1.2/index.html`：`SAV.theme??='light'`（约 :947）、`'set.themeHint':'默认浅色…'`（约 :656） | 主开发者回源 |
| E2 | 主题三档 UI 已存在 | 同文件：`'set.themeLight'/'set.themeDark'/'set.themeSystem'`（约 :657） | 主开发者回源 |
| E3 | 明文 HTTP 仅放行回环与 Tailscale，普通局域网拒绝 | `LocalSync.java`（android 源集）：`("127.0.0.1"… \|\| isTailscaleHost(host))` + 注释「普通局域网明文 HTTP 一律拒绝」 | 主开发者回源 |
| E4 | 用户 11-07 书面叫停一批"更安全架构"扩张 | `ALW001-N05-V1.7-R3-Final-Minimal-20261107.md:10-17`「本轮明确删掉的扩大需求」：不增加新加密工程、不推翻既有功能、不做复杂双向同步、不把"更安全的架构"自行升级为交付项 | 主开发者回源 |
| E5 | 字号下限两套并存 | 11-02 `type-floor`（底部 Tab 11.5px，`62dd132`；`CHANGELOG.md:53` 为其**整改记录**，非引入点）；11-08 `a11y-font-floor`（19/15/23/14） | 直接（A 路取证，主开发者未逐行复核） |
| E6 | 交付留痕缺失 | `git status --porcelain` 非空；HANDOFF 自述未 commit/push；A 路记「29 项待提交」 | 直接 |
| E7 | 早期 781 行 Day 1 需求原文已从磁盘消失 | 可经 `git show 5698685^:<path>` 恢复 | 直接（A 路） |
| E8 | 换机适配提交（11-08，OPPO） | 提交序列内换机相关提交；无对应 ADR/对话 | 直接（代码事实）+ 来源缺失 |

## 二、被推翻或降级的证据

| # | 原主张 | 处理 |
|---|---|---|
| X1 | 「HEAD 冻结五天」 | 推翻：实测 11-02 14:27→11-04 23:14，2.4 天；改用"工作树脏约 4 天" |
| X2 | 「11.5px 属 V1.6 问题」 | 推翻：由 11-02 `62dd132` 的 `type-floor` 引入，因果被写反 |
| X3 | 「项目级 AGENTS.md 由 11-08 治理提交补齐」 | 推翻：`209b08e`（11-05）引入，且 `docs/roles`、`docs/sop` 至今不存在 |
| X4 | 「relay receipts 11 份」 | 修正：实测 9 份 |
| X5 | 「94 处 <14px 声明」 | 降级为证据缺口：双方均未能实测，不得作为结论数字引用 |
| X6 | 「release/ 545MB、11 个 APK」 | 降级为证据缺口：B 无实测，A 未确认现值 |

## 三、缺口清单

1. `release/` 体积与 APK 数量现值（未实测）。
2. 94 处小于字号下限声明的精确计数（未实测）。
3. 11-08"恢复系统三档"的决策来源（无对话/ADR）。
4. 真机侧布局结论（46px 留白、463→296px 卡片）仅文档证据。
5. 158 项测试未实跑。
6. 781 行 Day 1 原文未逐条比对。

## 四、可复现命令

```bash
cd "/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统"
git rev-parse --short HEAD; git rev-list --count HEAD
git rev-list --count bf1ceb4..HEAD
git log --format='%h %ad %s' --date=short bf1ceb4..HEAD
git status --porcelain
sed -n '655,657p;946,948p' socialmate-v1.2/index.html
grep -rn "isTailscaleHost" --include=LocalSync.java .
```
