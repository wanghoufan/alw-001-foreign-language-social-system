# PREFLIGHT｜开工前置检查（待执行）

## 起点（2026-11-05）

- HEAD：`3a4f696`（V1.2–V1.5.1 已推送）；工作树：本轮尚未改动页面/原生。
- Android：**0.8.30 / vc65**，Note 12T Pro 已装；Note 12 Pro 也可用。
- 服务：`service-v040.sh` 健康；8790/8791 组合服务、8781 归档端正常。
- ASR：`mode=p066`、`authRequired=true`；设备令牌握手已通过。
- 真机基线：V1.5.1 会话 40 段 / 226.7 秒 / 归档 201；已知尾部 3 条只进页面未进档案（本轮 T6 修）。

## 必须确认

- [ ] `pwd -P` 与 `git rev-parse --show-toplevel` 指向唯一根目录
- [ ] 服务 `/health` 200，`activeSessions=0`
- [ ] Note 12T Pro 在线；版本 0.8.30/65
- [ ] 备份 `V1.1-baseline.html`、`index.html`、`AsrActivity.java`
- [ ] 记录基线截图（当前布局）用于前后对比
- [ ] 确认本轮不改 `places-115.json`、不改档案结构、不调预算

## 分类

### Can Do
- 全屏/单排控制/1:2 布局/纯英文/翻译按条/建议精简/停止弹层/分享卡/原资料页。
- 尾部 final 归档等待修正。
- 0.8.31 打包与真机验收。

### Test Only
- 归档尾部一致性：用真实短录音（TTS 回放 + 本人说话）比对页面消息数与归档段数。
- 原资料往返：录音中进入 20 秒再返回，核对 `activeSessions` 与字幕。

### Unauthorized / NOT_RUN
- 真人 30 分钟长会话、蜂窝切换、来电/耳机、P066 402/300s/撤销、Polly。
- commit / push / 部署。

## 预算
- 真机验收使用最短必要录音；TTS 回放 + 本人短句，单次 ≤60 秒；不做长时间压测。