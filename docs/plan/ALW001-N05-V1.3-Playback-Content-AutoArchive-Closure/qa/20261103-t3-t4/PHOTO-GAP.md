# 照片缺口与 schema 草案（T3-2 / DATA-04）

> 结论：**PARTIAL — NO_SOURCE（仓库与可核查的用户目录里没有红城湖本人拍摄素材）**
> `SocialMate-Data/PrivatePlaces/pv-hongcheng-lake-park/place.json` 的 `photos: []` **本次未写入任何条目**。
> 未联网抓图、未伪造拍摄日期/作者/授权、未用历史图冒充 2026-11-03 现场。

## 1. 已做的只读搜索（命令 + 真实结果）

```bash
# ① 仓库内全部图片（排除 .git / node_modules）
find . -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" -o -iname "*.heic" \) \
     -not -path "./.git/*" -not -path "*/node_modules/*" | wc -l
→ 633

# ② 文件名含 红城湖 / hongcheng / lake / park / photo
find . -type f \( -iname "*.jpg" -o ... \) | grep -iE "hongcheng|红城|lake|公园|park|photo"
→ 命中 20 条，全部是 docs 下的「App 页面截图」(02-device-0810.png、04-hongcheng-19blocks.png …)
   和 115 公开地点指南的 webp（Haikou/001…、Wanning/083/01.webp…）
   **没有任何一张是红城湖现场照片**

# ③ 非 qa 截图目录下的 jpg/jpeg/heic
find . -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.heic" \) | grep -v "/qa/"
→ 空（仓库里的位图全是截图/设计图/webp 指南图，无原始照片）

# ④ 115 公开地点源里是否本来就有红城湖
python3 -c "…json.load('socialmate-v1.2/source/places-115.json')… '红城' in name …"
→ total places 115，红城湖 0 条命中
   → 红城湖是纯私有地点，公开图库里不可能有它的合规图

# ⑤ 海南 115 指南的照片来源台账
grep -in "红城\|hongcheng" docs/成果整理/Hainan-Travel-Guide/baseline/{PHOTO_SOURCES.csv,places.json,LOCATIONS.csv}
→ 无命中（该 CSV 里只有龙兴路/滨海新村等 115 个公开点）

# ⑥ 用户本机可能放原图的目录（只按文件名，不读图片内容）
for d in ~/Desktop ~/Downloads ~/Documents ~/Developer/coding ~/Movies; do
  find "$d" -maxdepth 4 \( -iname "*红城*" -o -iname "*hongcheng*" \); done
→ 全部 0 命中
ls ~/Pictures → 只有 "Photos Library.photoslibrary"（系统照片库，未授权/不可枚举，未打开）
```

**判定：没有可用的「本人拍摄」素材。** 用 115 指南里的 webp 或新闻图冒充红城湖现场属于「图片滥用」，
且 `docs/成果整理/Hainan-Travel-Guide/baseline/README.md:18` 明确写着「图片再使用和公开发布请自行确认原作者授权」，
`docs/DELIVERY_REPORT.md:43` 也写明新闻/携程/小红书图受版权保护不能复制。→ 一律不用。

## 2. 缺口清单（等用户补的 4 件事）

| # | 需要用户提供 | 为什么必须要 | 缺失后果 |
|---|---|---|---|
| 1 | 本人 2026-11-03 在红城湖拍的原图（湖面/跑道/广场舞/儿童区/公厕任选 1–6 张） | 只有本人才有授权与拍摄事实 | `photos` 保持空，DATA-04 停 PARTIAL |
| 2 | 拍摄日期（EXIF 或口述） | 「历史图不得冒充近期现场」是硬约束 | 只能写 `shotDate: "unknown"`，UI 不得显示成 2026 现场 |
| 3 | 作者署名（本人真实姓名/昵称，或明确「匿名」） | 归属与授权链 | `author` 只能 `unknown`，不可发布 |
| 4 | 授权范围（仅本机私有 / 可进私有 PWA / 可公开） | 私有地点也不能默认公开 | `license` 只能 `private_local_only` |

## 3. 可直接写入 `place.json` 的 photos 条目 schema 草案（**只给草案，未写入**）

设计为「与 115 源向前兼容 + 补齐私有场景必需的可审计字段」。
115 源现有 key（`slot/local/query/source_url/image_url/caption/status`，见 `places-115.json` 首例）
全部保留，新增字段不破坏既有渲染。

```json
{
  "slot": 1,
  "local": "photos/20261103-01.jpg",
  "sha256": "<写入时对原图重算>",
  "width": 4032,
  "height": 3024,
  "bytes": 2411520,
  "caption": "湖边跑道与跳广场舞的人群（傍晚）",
  "sourceUrl": "user_camera_roll",
  "author": "unknown",
  "shotDate": "unknown",
  "shotDateConfidence": "unknown",
  "license": "private_local_only",
  "usage": ["private_place_gallery"],
  "consent": { "by": "user", "at": "2026-11-03T22:30:00+08:00", "scope": "local_only" },
  "status": "pending_user_confirmation",
  "addedAt": "2026-11-03T22:30:00+08:00"
}
```

字段约束（建议写进后续实现校验）：

| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| `slot` | int | 是 | 1..12，唯一，渲染顺序 |
| `local` | string | 是 | 相对 `PrivatePlaces/<placeId>/` 的相对路径；禁止 `..`、禁止绝对路径、禁止 URL |
| `sha256` | string | 是 | 写入时对文件重算，读取时校验（防偷换） |
| `width`/`height`/`bytes` | int | 是 | 用于前端占位与体积上限（单张建议 ≤ 8MB） |
| `caption` | string | 否 | ≤ 80 字，不得写未验证事实（如「2026年11月3日现场」除非 `shotDate` 有据） |
| `sourceUrl` | string | 是 | 本人拍摄固定写 `user_camera_roll`；外部素材必须是可追溯页面 URL |
| `author` | string | 是 | 无法确认一律 `unknown`；**禁止猜测** |
| `shotDate` | string | 是 | `YYYY-MM-DD` 或 `unknown`；`unknown` 时前端**不得**显示年份 |
| `shotDateConfidence` | enum | 是 | `exif` / `user_stated` / `unknown` |
| `license` | enum | 是 | `private_local_only` / `private_pwa_ok` / `CC0` / `CC-BY` / `CC-BY-SA` / `all_rights_reserved` |
| `usage` | string[] | 是 | 至少一项：`private_place_gallery` / `gpt_prompt` / `public_pwa`（`public_pwa` 需 `license` 允许再分发） |
| `consent` | object | 是 | 谁在何时同意了什么范围；缺省即视为未授权 |
| `status` | enum | 是 | `pending_user_confirmation` / `confirmed` / `rejected` |

落地时的硬校验（建议加在 `private-places.mjs` 的 `create()`/未来 `updatePhotos()`）：

1. `local` 必须落在 `PrivatePlaces/<placeId>/photos/` 内（`realpath` 前缀校验，参照 `learning-archive.mjs:710` 的 PATH_ESCAPE 写法）；
2. 不接收 base64 / 外链，只接收已经落盘的文件 + 由服务端重算 `sha256`/尺寸；
3. `status !== "confirmed"` 的条目不进 UI 主图位，只做「待确认」占位；
4. `license === "private_local_only"` 时禁止进入任何导出/GPT Prompt 载荷。

## 4. 本次未做的事（明确边界）

- 未改 `place.json`（`photos` 仍为 `[]`，sha256 `ad717e71…1ef5` 前后一致）。
- 未改 `private-places.mjs`（尚无写照片的接口；上表 schema 需要主开发者批准后再实现）。
- 未访问系统照片库 `Photos Library.photoslibrary`（需要用户授权，且属于个人隐私数据，未打开、未解析）。
- 未从网络下载任何图片。

## 5. 补齐后如何验收（DATA-04）

1. `place.json` 的 `photos` 至少 1 条 `status: "confirmed"` 且 `sha256` 与磁盘文件重算一致；
2. 每条都有 `sourceUrl` / `author` / `shotDate`（或 `unknown`）/ `license` / `usage` / `consent`；
3. 前端只读该私有目录，不产生任何公网请求（`grep` 网络面板无外链）；
4. 若 `shotDate: "unknown"`，页面文案不得出现「2026 现场」字样；
5. 私有图不出现在公开 PWA 产物（`socialmate-v1.2/` 内无引用）。
