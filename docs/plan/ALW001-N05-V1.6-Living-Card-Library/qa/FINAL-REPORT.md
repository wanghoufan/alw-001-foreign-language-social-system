# V1.6 三大活资料库 · 交付与真机验收报告（含整改）

- 日期：2026-11-05 ｜ 设备：Note 11 5G（21091116AC）393×791
- 版本：**0.9.1 / vc69**（整改为前端/后端改动，未重装 APK）
- APK：`release/SocialMate-0.9.1-vc69-debug.apk`，SHA-256 `dce4519b53c32a41681346797fe9e92dc2f7c29a578174d4aa2adf5d42dc3e97`
- 口径：区分「真机实测」「模拟」「未执行」；审查与整改记录见 `docs/qa/V1.6-Living-Card-Library/`。

## 一、功能现状（整改后）

| 项 | 状态 | 证据 |
|---|---|---|
| 统一卡片层（place/story/app） | PASS | `private-cards.mjs`；158 个后端测试全过 |
| 新建/编辑/补充标签 | PASS | 真机新建、编辑保存 revision 5→6 |
| 软删 + 回收站恢复 | PASS | 真机列表 27→26→27；恢复冲突返回 409 |
| 并发写一致性 | PASS | 10 并发 PATCH：1×200 + 9×409，落盘与成功响应一致，无 `.tmp` 残留 |
| 图片压缩/上传/封面/显示 | PASS | 真机连续 3 图无 429；列表 1 张封面、详情 3 张 blob 图 |
| 图片失败可见 | PASS | 失败不关弹层，提示「已保存 N 张，失败 M 张」 |
| 关于我中英同屏直显 | PASS | 列表中文在前、英文紧随，不折叠 |
| AI 英文草稿 | PASS | 真实调用返回自然英文；需令牌，中文不被覆盖 |
| 卡片分享 | PASS | 详情「复制中文 / 复制英文 / 分享图片」，无重复按钮 |
| 私有隔离 | PASS | 只落 `SocialMate-Data/PrivateCards/`；无公开路由 |
| 列表失败提示 | PASS | 有数据「离线：显示上次数据」，无数据「读取失败 · 重试」 |
| 覆盖层前端入口 | 未交付 | 后端接口与单测完成，页面无入口 |
| 备份/恢复 | 未交付 | 未实现导出导入 |
| 相机拍照 | 未实现 | 仅有相册/文件选择器 |

## 二、真机实测（整改后）

1. 关于我列表：封面图 `img[data-smc-card]` 为 blob URL，无错误条。
2. 详情：3 张图片、复制中文/复制英文/分享图片各 1 个，无「编辑这段话」。
3. 编辑保存：`revision` 5→6，3 张图保留，提示「已保存」。
4. 连续上传 3 图：`已上传 3/3`，无 429。
5. 底部导航字号 computed `15px`。
6. 失败提示：模拟卡片接口 503，显示「离线：正在显示上次数据 重试」。

## 三、真机模拟（非完整真机链路）

- 图片用 Canvas + `DataTransfer` 注入，未从相册真实选一张照片。
- 失败提示用前端覆盖 fetch 模拟 503；真实停归档服务时也观察到过失败提示（整改前）。

## 四、未执行（NOT_RUN）

- 相机拍照、覆盖层前端入口、备份恢复、393×852、深色主题截图、真实相册选图人工点选、非 WiFi→Tailscale 的 origin 切换。

## 五、审查与整改

- 首轮 4 角色审查判定「需打回」：P0 5 条。
- 整改后独立复审：**P0 全部关闭**，P1 抽查全关闭，158 测试通过。
- 剩余 P1：覆盖层入口、备份恢复、Tailscale origin、全站字号细则（hero 已改 15px，其他元信息 14px 合规）。

## 六、复现命令

```bash
bash socialmate-v1.2/service-all.sh health
python3 socialmate-v1.2/build-v12.py
cd socialmate-prototype/ai-gateway && node --test *.test.mjs
node scripts/sm-cdp.mjs "JSON.stringify({imgs:[...document.querySelectorAll('img[data-smc-card]')].length})"
```