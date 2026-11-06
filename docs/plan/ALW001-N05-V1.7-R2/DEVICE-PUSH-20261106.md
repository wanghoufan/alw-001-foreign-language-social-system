# V1.7 最新版三台真机推送记录（2026-11-06）

## 推送物

- APK：`release/SocialMate-0.9.2-vc70-debug.apk`
- versionCode / versionName：`70 / 0.9.2`
- SHA-256：`5cfb736c6ca4d9ea6cff5df421a1e328bc341ae60c7d1e51f62fa19d2811c997`
- 签名证书 SHA-256：`8e82a7975008e8ec87ff0f2ecadf495b5263effa34aaec9ab6f135ebea911cf3`

## 结果（按机型，不记录序列号）

| 机型 | Android | 安装前 | 安装后 | Key 三项 | 本地库 | archive |
|---|---|---|---|---|---|---|
| 23054RA19C | 15 | 0.8.31 / 66 | 0.9.2 / 70 | true / true / true | 1 人物 / 0 故事 / 0 收藏（pull 后 8 人物） | exported/outbox/quarantine 保留 |
| 21091116AC | 11 | 0.9.2 / 70 | 0.9.2 / 70 | true / true / true | 1 故事 / 1 收藏 / 8 人物 | 保留 |
| 22101316C | 14 | 0.9.2 / 70 | 0.9.2 / 70 | false / false / false | 0 / 0 / 0 | 保留 |

## 说明

- 三台签名均与安装包一致，均用 `adb install -r` 覆盖安装，**未 uninstall、未 pm clear、未删 shared_prefs**。
- 23054RA19C 从 0.8.31 升级：旧版本没有手机端 Key 管理，Key 三项为 false 属“本来没有”，不是安装丢失；本地 SQLite 为新版首次创建，因此计数为 0。
- 22101316C 为同版本覆盖安装，安装前后均为空库，Key 未配置。
- 21091116AC 为当前测试机，三项 Key 与 1 故事/1 收藏/8 人物全部保留。
- 三台 archive 目录（exported/outbox/quarantine）均保留。

## 强制回执

```text
已核对签名 / 已核对版本递增 / 已核对 Key 与本地库保留
```

补充：两台已是 vc70，本次为同版本覆盖（未递增）；一台 66→70 为递增。未出现 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`。