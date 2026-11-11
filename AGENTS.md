# ALW-001 项目级规则

> 项目级规则优先于全局规则；本文件只放本项目特有约束，通用规则见 `~/.codeartsdoer/AGENTS.md`。

## 媒体接入（强制）

- **凡涉及 WebView 连续音频接入（云端 TTS、朗读队列、播放/暂停/停止控制、控制栏布局），必须先调用 `webview-media-control-guard-local-zh` 并完成三项强制回执：`已用 Web Audio / 暂停路径已核对 / 吸顶已确认`。任一未写不得报完成。**
- 适用信号：出现「第二句变系统声」「暂停失败 TTS_NOT_PLAYING」「滑到第 2 段后停不了」，或新增/修改朗读队列与控制栏时。
- skill 位置：项目根 `webview-media-control-guard-local-zh/SKILL.md`。

## 卡片回归（强制）

- **凡更新卡片/活资料库（Skill 卡片、技能地图、登记表、台账、清单、看板）后，必须先调用 `sm-card-regression-local-zh` 并完成强制回执：`真源 / 派生 / 名称版本时间 / 计数 / diff / 结论`。任一缺失不得报完成。**
- 适用信号：出现「改了源但显示没变」「两份卡片对不上」「计数/版本/更新时间不一致」，或同步地图、登记表、台账、索引时。
- skill 位置：项目根 `sm-card-regression-local-zh/SKILL.md`。

## 语音自测（强制）

- **凡在无人真实说话的情况下验收语音类功能（实时 ASR、字幕、中文→英文、英文→中文、朗读），必须先调用 `android-voice-selftest-local-zh` 并完成强制回执：`音源 / 收音 / 分层结论 / 证据 / 结论`。任一缺失不得报完成。**
- 外放与 mock 只能证明链路或 UI/接口，不得写成真人语音 PASS；连续两轮无 interim 判「未拾音」，先查音源与输入路由，不得写成产品缺陷。
- skill 位置：项目根 `android-voice-selftest-local-zh/SKILL.md`。

## 覆盖安装（强制）

- **凡安装新版本 APK、覆盖安装或更新手机端，必须先调用中央 `android-true-device-qa-orchestrator-local-zh` 的覆盖安装守卫（签名指纹比对、敏感配置布尔回读）并完成强制回执：`已核对签名 / 已核对版本递增 / 已核对 Key 与本地库保留`。任一缺失不得报完成。**
- 禁止 `adb uninstall`、`pm clear`、删除 `shared_prefs`、恢复出厂；签名不一致时停止，不得卸载绕过。
- 备份包不含厂商 Key；不得把「有备份」写成「Key 可恢复」。

## 项目事实

- 组合服务：`bash socialmate-v1.2/service-all.sh health`（8790/8791/8781/8782）。
- 真机取证：`node scripts/sm-cdp.mjs "<js>"`（adb forward + WebView DevTools，只连 127.0.0.1）。
- 真实数据、密钥、`.env` 不入库；`SocialMate-Data/` 已 gitignore。