# N06 阶段 2 · 真机取证记录（2026-11-09）

- 目标设备：OPPO PLG110（最终验收机；序列号不记录）
- 当前装机：**0.9.14 / versionCode 82**
- 当前 APK：`android-poc/app/build/outputs/apk/debug/app-debug.apk`，54 MB
- 当前 SHA-256：`47c066321e1defe00c0aa1a484a5352a75a2bc1473e8393c91050e1dd1f7c48e`
- 本轮均在已有 0.9.13 基础上覆盖安装，未卸载。

## 第 2 轮：紧凑布局修订（0.9.14 / vc82）

按用户反馈「标签之间空隙大、左上角仍显示话题/海南/聊天页名」，对照原型调整：

| 项 | 修改前 | 修改后（真机回读） |
|---|---|---|
| 顶栏页名 | `话题` 大标题 + `TOPICS` 副标题 | 已移除，顶栏只剩主题/设置按钮 |
| 子标签高度 | 44px（被 44px 最小高度撑大） | 35px |
| 子标签间距 | 8px | 6px |
| 子标签字号 | 14px（`--reading-meta`） | 15px |
| 滚动条 | 可见灰线 | 隐藏 |

证据：`08-compact-topics.png`（真机）、`socialmate-v1.2/qa/n06-s2/`（无头 28/28）。

覆盖安装：`install -r` Success；`dumpsys` 回读 vc82/0.9.14；`socialmate-secure.xml` 710B、`config` 282B、`socialmate_local.db` 217,088B，装前后一致；软件内版本行可读「版本 0.9.14（构建 82）· N06 阶段 2」。

网页验证：`verify-n06-s2.mjs` **PASS 28/28**，新增断言：顶栏不重复页名、子标签高度 ≤36px 且间距 ≤8px。

## 第 1 轮：功能验收（0.9.13 / vc81）

| 项 | 结果 | 证据 |
|---|---|---|
| 签名比对 | 已装包 V2 证书 `8e82a797…911cf3` = debug keystore | apksigner |
| 覆盖安装 | Success；数据与 Key 保留 | 命令输出 |
| 启动页面 | 五 Tab「话题/海南/聊天/关于我/人物」 | `01-launch.png` |
| 节日页 | 47 张卡、26 张“日期待确认”、94 个复制按钮 | CDP；`02-festival-47.png` |
| 海南列表 | 116 张卡（115 公开 + 1 私有），封面解码 1600px | CDP |
| 骑楼详情 | 3 图全部解码（1600px）、`1 / 3` | CDP；`03b-hainan-gallery-loaded.png` |
| 全屏 | 1/3 → 2/3 → 关闭 | CDP；`04-lightbox-2of3.png` |
| 聊天节日标签 | 分享卡含英文问句与复制 | CDP；`05-chat-festival.png` |
| 聊天结构 | 对话区/建议区/关联标签未回归 | CDP；`07-chat-main.png` |
| 记录识别预览 | 2 段 / 3 条表达（未写库） | CDP；`06-record-preview.png` |

## 环境问题（非产品缺陷，已记 agent.md）

- 第 1 轮首次检查时所有图片都不解码，页面内 `fetch('/v12/img/...')` 挂起；`force-stop` 重启 App 后恢复。判定为一次挂起的请求堵住 LocalServer 串行处理。

## 清场

- `forward --list` 空、`reverse --list` 空。
- `stay_on_while_plugged_in` = 7（原值）；`screen_off_timeout` = 1800000（原值）。
- 无本任务临时文件；正式升级包保留安装。

## 判定

**PASS**（第 2 轮）：紧凑布局按原型落地，顶栏页名移除，真机尺寸回读与网页断言一致。

未验证（不属本轮改动）：记录保存写入落库、录音实时字幕链路、长时后台保活。