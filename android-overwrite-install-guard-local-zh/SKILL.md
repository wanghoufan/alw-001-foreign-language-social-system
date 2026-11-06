---
name: android-overwrite-install-guard-local-zh
description: 安装 Android 新版本 APK、覆盖安装或更新手机端前必须调用。核对 APK 签名与已装一致、版本号递增、用户 Key 与本地库不会被清空；禁止 uninstall、pm clear、删 shared_prefs。收尾必须输出三项强制回执。
metadata:
  version: "1.0.0"
  language: zh-CN
---

# Android 覆盖安装守卫

## 触发词

- 安装新的软件版本〔用户〕
- 不要把我这个数据给覆盖了〔用户〕
- 别给我把数据清掉了〔用户〕

## 解决什么

Android 覆盖安装一旦误用 `uninstall`、`pm clear`、删 `shared_prefs` 或换签名，用户已经填写的厂商 Key（DeepSeek/豆包/腾讯）、SQLite 本地库、卡片图片会一起丢失，且无法从备份恢复 Key。

本 Skill 把「安装前核对 → 只做 install -r → 安装后回读」固定成强制前置步骤，避免每次靠记忆。

## 适用场景

- 打包新 APK 后给同一台手机覆盖安装；
- 用户说「装新版本」「别丢数据」「别清 Key」；
- 版本号变更、签名变更、换构建机后的安装。

## 前置条件

- 已取得目标设备序列号（按 `android-device-target-lock-local-zh` 的 status → resolve 流程；不得无 `-s` 操作）。
- 已拿到 APK 绝对路径与包名（默认 `app.socialmate.dualmic`，以项目实际为准）。
- 设备已解锁、USB 调试可用。

## 流程（按序，不得跳步）

1. **读已装版本**
   ```bash
   adb -s <serial> shell dumpsys package <pkg> | grep -E "versionCode|versionName"
   ```
   记录旧 `versionCode`；新 APK 必须大于或等于旧值。

2. **核对签名**
   ```bash
   apksigner verify --print-certs <apk> | grep "SHA-256 digest"
   ```
   与设备上已装版本证书指纹比较；不一致会报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`，此时**停止**，不得用卸载解决。

3. **核对 Key 与本地库存在**
   - 若 App 提供桥或本地接口，先读 `cloudKeyStatus()`，记录三项布尔值；
   - 确认 `shared_prefs`、Keystore、SQLite 文件存在（`run-as <pkg> ls`）。
   - 不得打印 Key 值，只记录是否已配置。

4. **只做覆盖安装**
   ```bash
   adb -s <serial> install -r <apk>
   ```
   禁止：`adb uninstall`、`adb shell pm clear`、`rm shared_prefs/*`、恢复出厂。

5. **安装后回读**
   - `dumpsys package` 的 `versionCode` 已递增；
   - `cloudKeyStatus()` 三项与安装前一致；
   - 启动 App，五 Tab 可打开，本地资料仍可读。

6. **异常处理**
   - `INSTALL_FAILED_UPDATE_INCOMPATIBLE`：先导出 `.smbak` 与 Key 状态，再决定是否换签名；不得直接卸载。
   - 安装后 Key 丢失：立即停止继续操作，保留现场，报告用户，不得用「重新填一次」掩盖。

## 强制回执（缺失不算完成）

收尾必须原样输出：

```text
已核对签名 / 已核对版本递增 / 已核对 Key 与本地库保留
```

## 红线

- 不得 `adb uninstall`、`pm clear`、删除 `shared_prefs`、恢复出厂。
- 不得在签名不一致时用卸载绕过。
- 不得打印 Key、Token、真实人物数据。
- 不得把「备份里不含 Key」写成「Key 可恢复」。
- 无设备/无 APK/无法核对签名时必须标 NOT_RUN，不得伪造通过。

## 验收

- 安装前后 `versionCode` 可回读；
- 签名指纹一致；
- 三项 Key 布尔值与安装前一致；
- 五 Tab 与本地资料可读；
- 强制回执三项齐全。