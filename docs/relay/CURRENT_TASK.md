# ALW-001 N05 S4｜Amazon Polly provider selection, continuation after V1.1

status: READY
task_id: SM-ALW001-20261103-POLLY-ADOPT
user_approved: true
approval: USER_SELECTED_AMAZON_POLLY_20261103
approved_at: 2026-11-03T09:29:00+08:00
priority: 25
target_project: ALW-001
target_project_folder: alw-001-外语社交系统
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
project_reader_id: 001
target_app_mode: AUTO_BY_WORKSPACE
task_relation: CONTINUATION
conversation_route: SAME_CONVERSATION_PREFERRED
instruction_file: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/TTS-AMAZON-POLLY-APPROVED-SELECTION-V1.0.md
prior_sent_task: SM-ALW001-20261102-N05-V11-ADOPT
routing_rules: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay/DESKTOP_GPT_START_HERE.md
canonical_governance_project: 000-alw-个人偏好-电脑治理仓库-skill管理
canonical_registry_file: 转发管家/项目登记.json
scope: AMAZON_POLLY_PROVIDER_ADOPTION_ONLY_NO_SCOPE_EXPANSION
human_gate: FINAL_ONCE
no_public_pwa_changes: true

send_text: 读取并执行：docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/TTS-AMAZON-POLLY-APPROVED-SELECTION-V1.0.md

## Safety and execution scope
- This is a distinct explicitly approved supplier-selection update. The previous N05-V11-ADOPT task already has a GUI_SENT receipt and remains SENT; do not resend it or reproduce completed S0-S4.
- Desktop relay must first re-read official 000 project registry and rules and this current pointer, validate READY and absence of this task id's GUI_SENT receipt, and identify the actual current ALW-001 developer window.
- Send **only** the send_text one line through Computer Use GUI when the unique target is IDLE. If BUSY or approval pending, retain READY and do not interrupt; never open any closed developer app.
- Amazon Polly is the first-choice provider; preserve multi-provider adapter architecture, previous TTS cache/audio player, existing native system voice as explicitly opted-in fallback. No Google/Azure as primary and no new paid account without user consent.
- Keep new TTS budget zero and no private content transmitted to AWS until user explicitly authorizes both; continue independently on fake adapter, tests, safety and phone ADB preview.
- Only after real posted message bubble may relay record GUI_SENT and set this task SENT; never infer GUI send from file write.
