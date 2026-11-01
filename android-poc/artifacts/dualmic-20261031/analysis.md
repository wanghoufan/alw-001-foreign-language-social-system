# 博雅一拖二 · 真机双麦分轨验证（2026-10-31）

## 设备与条件

- 手机：Redmi Note 12T Pro（型号 23054RA19C，Android 15，HyperOS V816）
- 接收器：USB-Audio - BOYA mini（VID 0x3634 / PID 0x4155，厂商标识 Shenzhen jiayz）
- App：`app.socialmate.dualmic` 0.1.1（versionCode 2）实测；结论分析在 0.2.x 复核
- 采集：48000 Hz、2 声道、`UNPROCESSED` 音源、`setPreferredDevice` 指向 USB 接收器
- 每段 5.000 秒（240000 帧）；A 段只对 A 麦说话，B 段只对 B 麦说话
- 路由：A/B 两段 `requestedDevice == routedDevice`，均为同一 USB 设备（`routeVerified=true`）

## 样本级测量

| 指标 | A 段 | B 段 |
| --- | --- | --- |
| 采样率 / 声道 | 48000 / 2 | 48000 / 2 |
| 时长 | 5.000 s（240000 帧） | 5.000 s（240000 帧） |
| 左 / 右 RMS | -8.89 / -8.89 dBFS | -9.77 / -9.77 dBFS |
| L−R | ≈ -1.1e-9 dB | ≈ -2.6e-6 dB |
| max absolute L−R | 1 LSB | 6 LSB |
| 非零差值样本数 | 59 / 240000 | 787 / 240000 |
| 削波样本（左轨） | 13745（5.73%） | 8249（3.44%） |

- A 段与 B 段语音相关性：0.0114（两次内容确实不同）。
- 左右轨最大只差 1–6 个 LSB，属于定点量化噪声；听感与波形上等同于同一声源的 dual-mono。

## 结论

**MONO_MIX（接收器当前输出单声道混合，不是真分轨）。**

- 安卓确实以 48000 Hz / 2 声道打开了 USB 设备，路由也核对到了 BOYA 接收器。
- 但左右声道承载的是同一路混合信号；A、B 两个发射器的声音被合并，不能按左右通道区分说话人。
- 因此 ASR 应走 **混音 + 腾讯云说话人分离（`16k_zh_en_speaker_2.0`）**；双轨 A/B 只在接收器切到真正立体声模式后才可用。

## 未完成/未证明

- 未做两人同时说话、嘈杂环境、重插 USB、锁屏/中断测试。
- 未验证接收器 Mono/Stereo 模式切换（BOYA mini 2 的声道模式在 BOYA Central App 内，接收器无 M/S 实体键；本机未安装该 App）。
- 未做人工左右轨试听；本结论来自样本级测量。
- 5.73% / 3.44% 削波说明输入增益偏高，正式 ASR 前应降低增益或拉开距离。
- 结论只对当前手机、当前接收器、当前固件/连接方式有效，不代表所有博雅一拖二型号。

## 证据路径

- 真实录音（含本人语音，未入库）：`android-poc/.local/device-recordings/20261031-181420-139_A/`、`..._B/`
- 诊断 JSON：同目录 `diagnostics-A.json`、`diagnostics-B.json`
- 录音未复制到 artifacts，避免私人语音进入可提交目录。

## 复测方法

1. 在 BOYA Central App 把声道模式改为「立体声」，确认接收器仍显示 USB-Audio。
2. 打开 App 0.2.2，点「刷新音频设备」，确认选中 `USB_DEVICE ... BOYA mini`。
3. A 独说 5 秒、B 独说 5 秒，等待结论。
4. 期望：`CANDIDATE_A_LEFT_B_RIGHT` 或 `CANDIDATE_A_RIGHT_B_LEFT`；仍须导出 left/right WAV 试听串音。
5. 若仍为 `MONO_MIX`，说明该型号/固件在 USB 下只输出混合单声道，ASR 继续走 mix。
