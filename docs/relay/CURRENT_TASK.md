# Mac mini Desktop GPT relay inbox · N03 SDD V1.1 LOCAL
status: SENT
task_id: SM-ALW001-20261101-N03
approval: USER_APPROVED_P0_TO_P3
target_project: ALW-001
target_project_folder: alw-001-外语社交系统
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
target_app_mode: AUTO_BY_WORKSPACE
task_relation: CONTINUATION
conversation_route: SAME_CONVERSATION_PREFERRED
instruction_file: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/ALW001-N03-SDD-V1.1/README.md
routing_rules: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay/DESKTOP_GPT_START_HERE.md
sdd_version: V1.1_LOCAL_DIRECT
human_voice_tests: POSTPONED
ready_after: 2026-11-01

## Developer must receive EXACTLY one line:
send_text: 读取并执行：docs/plan/ALW001-N03-SDD-V1.1/README.md

## For fixed desktop GPT relay only
- After user says “转发”, read V1.8 routing rules, check existing N03 receipt and developer chat for duplicate, then use Computer Use GUI to select unique developer in ALW-001 workspace.
- Verify `instruction_file` exists. Developer MUST read README.md, SDD.md, prototype.html, assets, adb-preflight-preview.sh in this existing Mac mini project. **All needed core inputs are already written locally**. No downloading ZIP, user unzipping, or pasting long prompt.
- Do NOT rewrite/restate the SDD. Send only exact `send_text` and click actual Send, see posted bubble, write receipt. If currently BUSY/approval, keep READY without interrupting.
- CONTINUATION prefers same ALW-001 developer conversation. If its editor remains disabled, V1.8 allows one failed attempt then a fresh chat in the same workspace. Never pick another project.
- This file supersedes previous N03 V1.0 pointer only; no other project/AI task is affected. N02 was already GUI_SENT and must not be forwarded again.
