# PRECHECK · 海南115处图文指南

日期：2026-10-31（Asia/Shanghai）｜执行机：Mac mini (Mac16,10, Apple M4, 24GB, macOS 26.6)

| 项目 | 实际命令 / 检查 | 结果 | 判定 |
|---|---|---|---|
| 中央规范 | `cat ~/.agents/AGENTS.md` | 已读取（193 行） | PASS |
| 基线 ZIP | `shasum -a 256 Hainan_115_Bilingual_Interactive_Guide_V2.0.zip` | `70cd40faecc5621e45ce395732560b6e5f4d3dcc74759dce1579daf428e8c927`，与交接文档一致 | PASS |
| 基线内容 | 解压到 `baseline/` | places.json 115 条、唯一 ID 115、每处 3 个槽位；LOCATIONS 115 行；PHOTO_SOURCES 345 行；实际图片 0 张 | PASS（与文档描述一致） |
| 工作目录 | `/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/Hainan-Travel-Guide` | 独立于 `coding/1.Active`，可读写 | PASS |
| 磁盘 | `df -h /Users/zzymima0000` | 可用 41 GiB（91% 已用） | PASS（足够数百张图） |
| Python | `python3 -V` | 3.9.6；Pillow 11.3.0、requests 2.32.5 可用 | 可自办（未建 .venv，系统包满足） |
| 浏览器 | Chrome 156.0.8078.74、Safari 26.6 | 已安装 | PASS |
| Node | `node -v` | 未安装 | 可替代（无需，构建用 Python） |
| 网络-直连 | `curl https://www.baidu.com` / `https://api.github.com` | 200 | PASS |
| 网络-Wikimedia 直连 | `curl https://commons.wikimedia.org` | 超时（000） | 可替代：走系统代理 |
| 网络-Wikimedia 代理 | `curl -x http://127.0.0.1:7897 .../w/api.php` | 200，0.45s | PASS（代理 127.0.0.1:7897） |
| 图片下载 | 带 UA 下载 Commons 1920px 缩略图 | 200 `image/jpeg`，Pillow 解码 1920×1440 | PASS |
| Openverse API | `curl -x proxy api.openverse.org` | 超时 | 不用（改 Commons 单源） |
| 图片授权 | Commons `extmetadata` | LicenseShortName / Artist / LicenseUrl 可读 | PASS |
| 部署/付费 | — | 未使用 Vercel、未部署、未申请付费服务 | 符合要求 |

## 结论

环境具备开工条件。唯一网络限制是 Wikimedia 需经本机系统代理（127.0.0.1:7897），已在采集脚本中固化。