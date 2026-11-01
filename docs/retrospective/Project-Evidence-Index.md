# Project-Evidence-Index（证据索引表）

- 项目：alw-001-外语社交系统（SocialMate）｜HEAD：`a9cc03251f9be900b36c3bc66c4ba98eb55b564b`｜提交数 12｜分支 `main`
- 取证时间：2026-10-31｜执行标识：CB-Agent-R2
- 证据类型：`git`（提交历史/差异）、`doc`（仓库内文档，含工作树被忽略文档）、`code`（源码行号）、`实测`（本次真实执行命令）、`推断`（无直接证据）
- 状态：已证实 / 未证实 / 部分证实

---

## 一、仓库与版本基线

| 编号 | 断言或结论 | 类型 | 仓库相对路径 | commit | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E01 | HEAD 为 `a9cc03251f9be900b36c3bc66c4ba98eb55b564b` | git | — | `a9cc032` | 2026-10-11 | 已证实 |
| E02 | 提交数为 12（`git rev-list --count HEAD` 复核） | git | — | `a9cc032` | 2026-10-11 | 已证实 |
| E03 | 12 次提交作者唯一，均为 `wanghoufan` | git | — | 全部 | 2026-10-04~10-11 | 已证实 |
| E04 | 分支仅 `main`，远端 `origin/main` | git | — | — | — | 已证实 |
| E05 | 工作树唯一脏项为未跟踪的 `docs/`（`git status --porcelain` = `?? docs/`） | git | `docs/` | — | 2026-10-31 | 已证实 |
| E06 | `SocialMate-Data/`、`学习资料/`、`temp/` 被 gitignore，仅存在于工作树 | doc | `.gitignore` L40-42 | `151aa27` 起 | 2026-10-05 | 已证实 |
| E07 | 项目机器身份由 Project Steward 生成（ALW-001 / private / resident / primary） | doc | `.project.yaml` L2,7,12,13 | `e07acf9` | 2026-10-04 | 已证实 |
| E08 | 2026-10-11 15:04 之后约 20 天无提交 | git | — | `a9cc032` | 2026-10-31 | 已证实（事实）／**推断**（原因＝等用户反馈） |

## 二、原始需求（Day1）

| 编号 | 断言或结论 | 类型 | 仓库相对路径 | commit | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E09 | Day1 目标为「认识人→记录→AI 复盘→沟通卡→Live 口语→真人交流→再复盘」完整闭环 | doc | `temp/2026-10-04 - MAC - ChatGPT - 本地社交知识库环境检查配置测试闭环.md` L17 | `151aa27` 入库 / `5698685` 删除 | 2026-10-04 | 已证实（**文件已出版本库，现仅存工作树 `temp/` 副本**） |
| E10 | 第一阶段六原则含「本地数据为 SSOT」「Markdown 优先」「不提前建登录/云同步/数据库」 | doc | 同上 L23-30 | 同上 | 2026-10-04 | 已证实 |
| E11 | 原方案明确要求「代码目录与数据目录不要混在一起」 | doc | 同上 L78（另 L64） | 同上 | 2026-10-04 | 已证实 |
| E12 | 原方案对「主题/配色/深色/外观/浅色」零命中；「UI」仅 3 处（L27、L696、L765） | doc | 同上 L27,696,765 | 同上 | 2026-10-04 | 已证实（本次 grep 复核） |
| E13 | 原方案 §10 只给 5 个入口名，未定义导航形态 | doc | 同上 L450-494 | 同上 | 2026-10-04 | 已证实 |
| E14 | 原方案 §9.4「训练后复盘」只列 7 条文字要点，无文件产物要求 | doc | 同上 L436-447 | 同上 | 2026-10-04 | 已证实 |
| E15 | 原方案 §13 定义 Test A–G；§16 定义 10 条 MVP 验收标准 | doc | 同上 L582-665、L701-714 | 同上 | 2026-10-04 | 已证实 |
| E16 | 原方案 §18 写「在 Human Gate 前…不追求视觉完整度」 | doc | 同上 L769 | 同上 | 2026-10-04 | 已证实 |
| E17 | 早期方案文档被 `b956852`（R100 移入 `temp/`）与 `5698685`（D，删 781 行）移出版本库 | git | `temp/2026-10-04 - MAC - ChatGPT - …闭环.md` | `b956852`、`5698685` | 2026-10-11 | 已证实 |
| E18 | 移出动机为「公开前清理」 | 推断 | `5698685`、`b956852` 提交标题 | 同上 | 2026-10-11 | **未证实**（无用户原话） |

## 三、功能实现

| 编号 | 断言或结论 | 类型 | 仓库相对路径 | commit | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E19 | 首个可用版本一次交付后端+前端+初始化+7 个验收用例（+1102 行） | git | `server.mjs`、`public/index.html`、`public/styles.css`、`scripts/initialize-data.mjs`、`test/acceptance.test.mjs` | `151aa27` | 2026-10-05 | 已证实 |
| E20 | 数据目录实际为项目根内 `SocialMate-Data/`，可 `SOCIALMATE_DATA_DIR` 覆盖 | code | `server.mjs` L8 | `151aa27` | 2026-10-05 | 已证实 |
| E21 | 服务默认绑 `127.0.0.1:4173` | code | `server.mjs` L9-10 | `151aa27` | 2026-10-05 | 已证实 |
| E22 | 静态资源白名单仅 `/` 与 `/styles.css` | code | `server.mjs` L104-111 | `151aa27` | 2026-10-05 | 已证实 |
| E23 | 写保护为预览—确认两段式（baseHash+changeId）；互动记录不可覆盖 | code | `server.mjs` L74-103（409 见 L80、L94） | `151aa27` | 2026-10-05 | 已证实 |
| E24 | 路径越界双层防护（字符校验 + `startsWith(DATA_DIR+sep)`）；请求体上限 1MB | code | `server.mjs` L26-31、L11、L23 | `151aa27` | 2026-10-05 | 已证实 |
| E25 | 主档更新采用 tmp + rename 原子写 | code | `server.mjs` L99-100 | `151aa27` | 2026-10-05 | 已证实 |
| E26 | 初始化用 `flag:'wx'`，永不覆盖已存在文件 | code | `scripts/initialize-data.mjs` L23 | `151aa27` | 2026-10-05 | 已证实 |
| E27 | 目录遍历按 `localeCompare('zh-CN')`；互动文件名正则支持 Unicode | code | `server.mjs` L35、L19 | `151aa27` | 2026-10-05 | 已证实 |
| E28 | 关系阶段仅 4 个中性值白名单，非法值兜底 `new_contact` | code | `server.mjs` L56-57 | `151aa27` | 2026-10-05 | 已证实 |
| E29 | 前端提示词硬编码本机绝对路径 | code | `public/index.html` L104-105 | `151aa27`（沿用至 HEAD） | 2026-10-05 | 已证实 |
| E30 | `/api/health` 已返回 `dataDir` 字段（可运行时注入替代硬编码） | code | `server.mjs` L46 | `151aa27` | 2026-10-05 | 已证实 |
| E31 | catch-all 把各类异常一律映射为 400 | code | `server.mjs` L113 | `151aa27` | 2026-10-05 | 已证实 |
| E32 | 练习提示词改为「必须提供可下载 .md」+ 文件名规范 + 8 个 YAML 字段 + 8 章节 + 禁补造转录 | code | `public/index.html` L194-218 | `994fa56` | 2026-10-06 | 已证实 |
| E33 | 练习产物规范同步进 README 与验收测试 | code/doc | `README.md` L65；`test/acceptance.test.mjs` L49-54 | `994fa56` | 2026-10-06 | 已证实 |
| E34 | 三套主题 + CSS 令牌化 + hash 路由 + toast + 一键复制 + 人物搜索 + Markdown 渲染 + 防重复提交 + 记住上次阅读（+515 行） | git | `public/index.html`、`public/styles.css` | `b8b78df` | 2026-10-11 | 已证实 |
| E35 | CSS 令牌结构：`:root` / `[data-theme="dark"]` / `[data-theme="forest"]` | code | `public/styles.css` L2、L25、L46 | `b8b78df` | 2026-10-11 | 已证实 |
| E36 | 主题切换器由 `THEMES` 数组渲染为分段按钮；持久化 `localStorage['sm-theme']`；head 内联防闪烁 | code | `public/index.html` L17-18、L28-33、L3-10 | `f2e4dbc`、`00aec27` | 2026-10-11 | 已证实 |
| E37 | 布局为左侧边栏 + 右侧内容（wiki 式），导航项带字符图标 | code | `public/index.html` L12、L15、L75；`public/styles.css` L83-84 | `262ac05` | 2026-10-11 | 已证实 |
| E38 | 话题页为左列表（带搜索）+ 右阅读区，`sessionStorage['sm-topic']` 记住上次阅读 | code | `public/index.html` L93、L127-140 | `b8b78df` | 2026-10-11 | 已证实 |
| E39 | 首页用 4 张编号流程卡承载高频操作直达 | code | `public/index.html` L89 | `151aa27` | 2026-10-05 | 已证实 |

## 四、返工证据

| 编号 | 断言或结论 | 类型 | 仓库相对路径 | commit | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E40 | 主题切换器由下拉+swatch 菜单改为分段按钮，距上次提交仅 3 分钟（13:32→13:35） | git | `public/index.html`、`public/styles.css` | `b8b78df`→`f2e4dbc` | 2026-10-11 | 已证实 |
| E41 | 「跟随系统」选项被移除，默认改为晨光（13:35→14:22） | git | `public/index.html` L5-7、L17、L27 | `f2e4dbc`→`00aec27` | 2026-10-11 | 已证实 |
| E42 | 顶栏 tabs 整体改为左侧边栏（14:22→14:30），`index.html` 10 行 + `styles.css` 110 行 | git | `public/index.html` L12；`public/styles.css` | `262ac05` | 2026-10-11 | 已证实 |
| E43 | HANDOFF 写于 14:14，8 分钟后被 `00aec27` 推翻、16 分钟后被 `262ac05` 推翻，且至今未提交 | doc/git | `docs/handoff/HANDOFF.md` L3,7,17-18 | 工作树未提交 | 2026-10-11 | 已证实 |
| E44 | 用户提供了外观参考截图（「浅色/指挥舱/极光」样式） | doc | `docs/handoff/HANDOFF.md` L9 | 工作树未提交 | 2026-10-11 | 已证实（HANDOFF 转述）／**未证实**（原始消息不在仓库） |
| E45 | 移除「跟随系统」、改为 wiki 布局的原因无任何记录 | git | 提交说明体为空 | `f2e4dbc`、`00aec27`、`262ac05` | 2026-10-11 | 已证实（无记录） |
| E46 | 12 次提交中仅 `b8b78df` 有说明体，其余 11 次说明体为空 | git | — | 全部 | 2026-10-04~10-11 | 已证实（`git log --format=%b`） |
| E47 | `CHANGELOG.md` 仅 2026-10-06 一条记录 | doc | `CHANGELOG.md` L1-7 | `994fa56` | 2026-10-06 | 已证实 |

## 五、部署与运行状态

| 编号 | 断言或结论 | 类型 | 仓库相对路径 | commit | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E48 | 部署副本位于 `~/Developer/coding/docker/alw-001-foreign-language-social-system/` | doc | `README.md` L41；`README.en.md` L58-59 | `994fa56` | 2026-10-06 | 已证实 |
| E49 | 部署副本的 `public/index.html`、`public/styles.css`、`server.mjs` 与 HEAD 逐字节一致（diff 均 0 行） | 实测 | 部署副本 vs HEAD | `a9cc032` | 2026-10-31 | 已证实 |
| E50 | 部署副本 mtime 为 2026-10-11 14:30，对齐提交 `262ac05`（14:30:43） | 实测 | 部署副本 | `262ac05` | 2026-10-11 | 已证实 |
| E51 | 部署副本 README 为 3249 字节（2026-10-06 版），与 HEAD 的 4409 字节不同 —— README 未同步 | 实测 | 部署副本 `README.md` | `994fa56`/HEAD `a9cc032` | 2026-10-06 | 已证实 |
| E52 | 同步纪律只覆盖 `cp public/*`（HANDOFF 原文） | doc | `docs/handoff/HANDOFF.md` L39 | 工作树未提交 | 2026-10-11 | 已证实 |
| E53 | 数据挂载自 `~/DockerData/alw-001-foreign-language-social-system/`，备份在 `~/DockerBackups/.../predeploy-20261006` | doc | `README.md` L41；`.env.example` L8-9 | `994fa56` | 2026-10-06 | 已证实 |
| E54 | 挂载数据目录 mtime 停在 2026-10-05 11:10~11:11，与项目内数据目录是否同一份无法确认 | 实测 | `~/DockerData/alw-001-foreign-language-social-system/` | — | 2026-10-05 | 部分证实（mtime 已见）／**未证实**（是否同一份、有无同步） |
| E55 | 容器安全基线：只读根 + tmpfs + `cap_drop: ALL` + `no-new-privileges` + 非 root + 健康检查 | code | `compose.yaml` L26-32；`Dockerfile` L16 | `994fa56` | 2026-10-06 | 已证实 |
| E56 | Compose 只发布 `127.0.0.1:4173`，不开放局域网 | code | `compose.yaml` L20 | `994fa56` | 2026-10-06 | 已证实 |
| E57 | 端口 4173 被 Docker 占用时本地调试用 `PORT=4174`，且不得擅自停容器 | doc | `README.md` L34；`docs/handoff/HANDOFF.md` L41 | `151aa27`/工作树 | 2026-10-05 | 已证实 |
| E58 | favicon.ico 404，站点未提供图标，server 仅白名单 `/`、`/styles.css`、`/api/*` | doc | `docs/handoff/HANDOFF.md` L22 | 工作树未提交 | 2026-10-11 | 已证实（未处理） |

## 六、质量验证

| 编号 | 断言或结论 | 类型 | 仓库相对路径 | commit | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E59 | `node --test test/acceptance.test.mjs` 实测 7/7 通过（Node v24.19.0） | 实测 | `test/acceptance.test.mjs` L26-83 | HEAD `a9cc032` | 2026-10-31 | 已证实 |
| E60 | `node --test test/`（带目录参数）报 `MODULE_NOT_FOUND` | 实测 | — | — | 2026-10-31 | 已证实 |
| E61 | README 写「`node --test` 运行本地服务验收测试」，未固化为可复制粘贴的具体命令 | doc | `README.md` L60；`README.en.md` L90 | `151aa27` | 2026-10-05 | 已证实 |
| E62 | 无 UI 自动化测试；界面正确性仅靠 HANDOFF 一句人工实测记录 | doc/code | `docs/handoff/HANDOFF.md` L15；`test/acceptance.test.mjs` | 工作树/HEAD | 2026-10-11 | 已证实 |
| E63 | 验收测试用「HTML 字符串包含」断言前端（改中文文案即会红） | code | `test/acceptance.test.mjs` L51-54 | `994fa56`/`b8b78df` | 2026-10-06 | 已证实 |
| E64 | 项目无 package.json、无依赖、无构建 | code | 仓库根无 `package.json` | `151aa27` | 2026-10-05 | 已证实 |
| E65 | Test F 验证重启后数据仍在；Test G 验证预览不落盘、陈旧候选 409、路径越界 400 | code | `test/acceptance.test.mjs` L55-63、L64-83 | `151aa27` | 2026-10-05 | 已证实 |

## 七、数据真源、隐私与其他

| 编号 | 断言或结论 | 类型 | 仓库相对路径 | commit | 日期 | 状态 |
|---|---|---|---|---|---|---|
| E66 | 数据规范文件存在双真源：生成器模板不含「口语练习学习材料」章节，磁盘手改版含该章节 | 实测/code | `scripts/initialize-data.mjs` L6 vs `SocialMate-Data/00-README.md` | `994fa56` / 工作树 | 2026-10-05~10-06 | 已证实 |
| E67 | 手改版 `00-README.md` 为 1921 字节、mtime 2026-10-05 11:11 | 实测 | `SocialMate-Data/00-README.md` | — | 2026-10-05 | 已证实 |
| E68 | 隐私红线 7 条全部有代码或模板证据（来源标注／禁推断／中性阶段值／不记证件／可审查／不可覆盖／不自动联系） | code | `server.mjs` L56-57,80,94,74-103；`scripts/initialize-data.mjs` L6,L9,L10；`SocialMate-Data/Prompts/聊天复盘.md` | `151aa27` | 2026-10-05 | 已证实 |
| E69 | 演示人物 `Test-Anna` 完全虚构，可整目录删除 | doc/code | `README.md` L54；`scripts/initialize-data.mjs` L20 | `151aa27` | 2026-10-05 | 已证实 |
| E70 | 跨设备数据通道被规划但子目录未创建；已立「不得为此开放公网或局域网」红线 | doc | `学习资料/00-说明.md`（末段） | 工作树（被 gitignore） | — | 已证实（文档存在）／**未证实**（何时写、为何未落地） |
| E71 | 双语 README：`ce2b104` 引入后，每次改动需同步 2 个文件、4 处绝对路径 | git/doc | `README.md` L41；`README.en.md` L58-61 | `ce2b104`、`bef53d0`、`a9cc032` | 2026-10-05~10-11 | 已证实 |
| E72 | 三张真实截图随 `bef53d0` 入库，共约 525KB（156383+208033+161453 字节） | git | `assets/home.png`、`assets/practice.png`、`assets/topics.png` | `bef53d0` | 2026-10-11 | 已证实 |
| E73 | 数据目录偏离原方案（要求分离 vs 实现放项目内），仓库内无任何决策记录 | doc/code | 早期方案文档 L78 vs `server.mjs` L8、`.gitignore` L42 | `151aa27` | 2026-10-05 | 已证实（偏离事实）／**未证实**（责任归属与动机） |
| E74 | 动机推断：为省一次路径配置／为 Docker 挂载对齐／用户后来改主意 | 推断 | — | — | — | **未证实**（A/B 互审后共同判定：证据不足，Docker 化后数据仍被搬到 `~/DockerData`，该推断反向不成立） |
| E75 | 用户对 2026-10-11 14:30 之后的形态（wiki 布局、截图 README）无书面认可 | doc | `docs/handoff/HANDOFF.md` L17-18 自列认可 commit 止于 `f2e4dbc` | 工作树未提交 | 2026-10-11 | 已证实（无认可） |
| E76 | 用户本轮授权「修完默认 commit + push + 重建 Docker + 实测后再汇报」闭环 | doc | `docs/handoff/HANDOFF.md` L44 | 工作树未提交 | 2026-10-11 | 已证实（HANDOFF 转述）／**未证实**（授权原话） |
| E77 | 主题配色细节至今无用户反馈（「松林太黄、墨夜太蓝」类微调待定） | doc | `docs/handoff/HANDOFF.md` L27 | 工作树未提交 | 2026-10-11 | 已证实 |
| E78 | `temp/` 内另有 9 个 `intros-*.md`、`blocks.json`、`repos.json`、`assemble.py`（mtime 2026-10-31），与本项目无关的其他并发工作产物 | 实测 | `temp/` | — | 2026-10-31 | 已证实（存在）／**未证实**（用途，不属于本项目复盘范围） |

---

## 附：状态汇总

- 已证实：**62** 条
- 部分证实：**2** 条（E08 原因、E54 是否同一份）
- 未证实：**14** 条（E18、E44 原始消息、E54 同步、E70 缘由、E73 责任、E74、E76 原话，及其内含的 7 处「无记录」判定）

## 附：取证命令清单（可复核）

```sh
git -C "<项目根>" rev-parse HEAD
git -C "<项目根>" rev-list --count HEAD
git -C "<项目根>" --no-pager log --pretty=format:"%h|%ad|%an|%s" --date=iso
git -C "<项目根>" --no-pager log --pretty=format:"%h||%b"
git -C "<项目根>" --no-pager log --pretty=format:"%h %ad %s" --date=short --name-status
git -C "<项目根>" --no-pager status --porcelain
git -C "<项目根>" --no-pager show 151aa27:public/index.html
git -C "<项目根>" --no-pager show b8b78df -- public/index.html
git -C "<项目根>" --no-pager show f2e4dbc -- public/index.html
git -C "<项目根>" --no-pager show 00aec27
git -C "<项目根>" --no-pager show 262ac05 -- public/index.html
grep -n "主题\|配色\|深色\|外观\|浅色\|UI" "temp/2026-10-04 - MAC - ChatGPT - 本地社交知识库环境检查配置测试闭环.md"
node --test test/acceptance.test.mjs
diff ~/Developer/coding/docker/alw-001-foreign-language-social-system/public/index.html public/index.html
```
