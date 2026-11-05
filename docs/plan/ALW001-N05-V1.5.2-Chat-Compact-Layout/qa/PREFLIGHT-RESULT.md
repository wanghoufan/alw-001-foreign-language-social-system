# PREFLIGHT 结果（2026-11-05 09:43）

## 环境

- `pwd -P`：仓库根 `/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统`
- HEAD：`3a4f696`；工作树：仅有上一轮未提交文档与计划目录
- 组合服务：`service-all.sh health` → 4/4 HEALTHY（8790/8791/8781/8782）
- ASR：`mode=p066`，`activeSessions=0`

## 设备

| 序列（不写入外传文档） | 型号 | 已装 | 分辨率 | 用途 |
|---|---|---|---|---|
| 192.168.31.105:5555 | 23054RA19C（Note 12T Pro） | 0.8.30 / vc65 | 1080×2460 | 本轮主验收 |
| WGBMXWDIAIFMPFCQ | 21091116AC | 0.8.14 / vc49 | 1080×2400 | 不用于本轮 |

## 备份

- `socialmate-v1.2/source/V1.1-baseline.html.bak-20261105-v152`
- `socialmate-v1.2/index.html.bak-20261105-v152`
- `android-poc/app/src/main/java/app/socialmate/dualmic/AsrActivity.java.bak-20261105-v152`

## 边界确认

- 不改 `places-115.json`（只在构建脚本补充 `special_en/photos` 映射）
- 不改人物档案结构、不改四方向生成逻辑、不新增付费调用
- 不 commit / push / 部署