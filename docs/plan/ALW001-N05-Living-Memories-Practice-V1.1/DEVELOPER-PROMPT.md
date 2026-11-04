【ALW-001 N05 V1.1｜独立主开发者连续执行】
以`docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/README.md`为入口，读取SDD、可点击HTML原型、单气泡安卓图标与浅深启动效果图，以及当前AGENTS/CHANGELOG/HANDOFF/Git diff和N04真实QA。先确认工作区唯一开发者/文件所有权，不覆盖并行修改、演示母版或公开PWA。

先完成所有Task到部署和真机的外部依赖扫描（S0一次性检查API Key可用性与余额、四端口服务、SDK/Gradle/ADB、TTS/STT引擎、Tailscale、Android配对/签名、数据权限；未核实标UNKNOWN，不打印Key），只把用户必须亲自操作的A事项一次性列出，D留在最后Human Gate。普通B/C问题自行修复/替代继续，不中途重复找用户。

**开发前即运行Android APK预构建和ADB保留数据安装**，回读版本/sha并截图，让手机实时预览新功能；每完成主要界面/原生能力都重新构建安装验证。若设备/签名/安全授权受阻，不自动卸载或误改用户手机。

连续S0→People日常化（演示/清空/恢复移高级设置）→旧友文本/语音AI补记候选/确认/撤回→海南地点id=1原档案只读+私有多次感悟和双语A/B分段→Android原生中英语音朗读/循环→单段GPT Voice练习Prompt复制/复盘回贴→全量真机和安全/PWA零修改验收。阶段/Task/Review/QA都是内部检查点，普通错误分析→修复→复测→继续；不要因中间节点暂停，最终所有可自办Task完成后仅一次Human Gate。

目标是实际可用而非写代码。必须保存最新APK、hash、ADB安装证据、真机截图、Mac原始记录、自动化正反例与当前PASS/NOT_RUN，不能把HTML模拟AI/浏览器TTS说成Android成功。N04旧任务的Tailscale授权、真人BOYA等外部项目如缺仍按真实NOT_RUN，不允许为图绿提高两项1元预算、降低隐私安全或改公开PWA。