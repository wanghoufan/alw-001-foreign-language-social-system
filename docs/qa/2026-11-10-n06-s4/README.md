# N06 阶段 4 · 真机取证（2026-11-10）

- 设备：OPPO PLG110
- 装机：**0.9.28 / versionCode 96**（覆盖安装，未卸载）
- APK：57,146,477 B，SHA-256 `c527029defaea440dd969ff63d43ec691b0075e57c1eab48ca14664ff76a709a`
- 签名：V2 `8e82a797…911cf3`（与已装一致）

## 结果

| 项 | 结果 | 证据 |
|---|---|---|
| 中文解释 | 有 | `term-v2.png` |
| 英文解释 | 有（1–3 行简单英文） | `term-v2.png` |
| 四条顺势问 | like / compare / experience / benefit，中文 + 英文 | `term-v2.png` |
| 不再问“你听过吗” | 卡片文本无“听过” | CDP |
| 复制按钮 | 4 个；真实输入事件点击 → toast「已复制英文内容」 | CDP Input |
| 改查 | 标题栏「改查」展开后输入框可见 | CDP |
| 一屏显示 | 卡片 589px / 视口 700px，scrollHeight 590 | CDP |
| 版本行 | 设置页「版本 0.9.28（构建 96）· N06 阶段 4」 | CDP |

## 真机回读（摘）

```text
state=ok
zh: 卡波耶拉是一种巴西武术，结合了舞蹈和音乐。练习的人会围成一圈，伴着音乐做踢腿和翻腾动作。
en: Capoeira is a Brazilian martial art that mixes dance and music. People do kicks and moves in a circle while music plays.
asks: like|What do you enjoy most about capoeira?
      compare|How is it different from other sports you've tried?
      experience|What is it like to do capoeira?
      benefit|What do you get out of doing capoeira?
copyButtons=4, hasListened=false
toast: 已复制英文内容
version: 版本 0.9.28（构建 96）· N06 阶段 4
```

## 覆盖安装守卫回执

```text
已核对签名：是（V2 证书 8e82a797…911cf3，与已装包一致）
已核对版本递增：是（versionCode 90 → 96，versionName 0.9.22 → 0.9.28，dumpsys 回读 96/0.9.28）
已核对 Key 与本地库保留：是（socialmate-secure.xml 710B、socialmate-config.xml 282B、socialmate_local.db 217,088B，装前后一致）
```

## 点击门禁回执

```text
【点击门禁回执】
安全区判定：页面交互走 CDP 坐标与真实输入事件，未用 adb input tap
点击与回读：①点字幕词 → 卡片出现 ②点复制 → toast「已复制英文内容」 ③点「改查」→ 输入框可见
破坏性按钮：无
结论：点击操作可信
```

## 清场

- `forward tcp:9223` 已移除；他人映射未动；`reverse --list` 空。
- `stay_on_while_plugged_in=7`（原值）；`screen_off_timeout=1800000`（原值）。
- App 已重启，页面内存中的测试会话已清；未写业务库。

## 未验证

- 录音进行中点词（避免打断真机 ASR）。
- 真实手指点击与 CDP 真实输入事件的剪贴板行为一致；JS 合成 click 无手势时会提示受限，属浏览器限制。