# Cloud-to-Desktop GPT Relay — official-product research & implementation V2.0
Date: 2026-11-01
Project: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
Status: RESEARCHED/PLAN, not installed, not automatically awakened

## User's non-negotiable outcome
From mobile, user sends cloud GPT an instruction. On always-on Mac mini, **desktop ChatGPT Work performs ALL interaction with whichever developer app happens to be foreground (e.g., CodeArts) via Computer Use, types/pastes the task, visually clicks Send, verifies delivery, writes a receipt**, and reports back. Cloud controller need not know developer app in advance. No developer-tool-specific API or CLI is allowed to replace this GUI send. Helper notification/heartbeat may only wake the desktop GPT or make a new task visible, not operate the developer interface.

## Verified tests to preserve
A01 PASSED: Desktop ChatGPT Computer Use sent to CodeArts GUI and developer wrote SM-PONG-20261101-A01. Evidence:
- docs/plan/SM-Desktop-GPT-RELAY-20261101-A01.md
- docs/plan/SM-Cloud-to-Desktop-PONG-20261101-A01.md
A02: Cloud wrote docs/plan/SM-Cloud-to-Desktop-PING-20261101-A02.md without human desktop input. At last verified check there was no relay/PONG A02. Thus a file written through Mac Project Reader does not automatically wake an idle desktop Work task.

## Verified official architectures (2026-11-01)
1. ChatGPT dot: user messages persistent cloud agent; optionally connect local computer through desktop app; agent can create Work/Codex tasks and use local files/browser/apps with permissions. Official Help Center: https://help.openai.com/en/articles/20001530-getting-started-with-your-dot . **Currently official listed eligibility: Pro 18+, Business Premium and certain eligible enterprise; not ordinary Plus.** Access gradually rolls out and user may not see it.
2. ChatGPT Work Cloud local computer access: coordination in cloud; connected Mac executes local steps subject to Work/Computer Use permissions. Official Help/learn: https://learn.chatgpt.com/docs/enterprise/cloud-local-access and https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex . Eligible cloud Work conversations can continue from web/mobile; requires proper workspace/role/local-access permission and updated desktop client. Documentation describes enabling via Enterprise admin permissions, so do not assume an individual Plus account supports cloud-to-local execution. Old Local Work chat does NOT become cloud-synced merely because both apps are open.
3. Grok Bot: desktop and mobile are clients of a persistent Cursor-hosted cloud computer; native routines can be schedule-, event-, webhook-triggered; local device access separate/approved. Sources: https://docs.x.ai/grok-bot/overview , https://docs.x.ai/grok-bot/skills-routines-and-automations , https://docs.x.ai/grok-bot/security . Cloud computer ≠ arbitrary control of an existing user's local GUI session; local execution docs chiefly promise authorized desktop commands. As the user insists **desktop ChatGPT Computer Use** sends to the developer GUI, do not substitute Grok Bot, OpenClaw, developer CLI or any remote-control script.
4. Normal ChatGPT Scheduled/Work Cloud work may run on schedules and supported app events; that does not by itself prove that a scheduled cloud run can invoke an idle **local** desktop Computer Use tool. Do not confuse an hourly cloud check with desktop Work local executor activation. https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt .

## Option A (P0, prefer native service)
Test whether this actual account/device supports Work Cloud + connected local computer access:
- Update signed-in ChatGPT Mac desktop to current version; ensure Work/Computer Use plugin available and macOS Accessibility/Screen Recording permissions are granted.
- On Mac in a NEW Work task, inspect actual Local/Cloud selector or account/workspace sync/access controls. Do not assume the toggle or "Allow local computer access" exists for Plus.
- Where supported and user approves: enable local computer access/Work Cloud sync, create a NEW eligible cloud-coordinated Work conversation. In that conversation run a no-send screenshot/read test on Mac foreground developer window. Then from the phone **continue the SAME Work conversation**, sending one new, harmless test instruction to identify foreground CodeArts via Computer Use, type a unique one-line PING and click Send.
- Require desktop GUI SEND_CONFIRMED receipt + developer PONG + mobile receipt. Log execution location and permissions, screenshot evidence, and observed result; fail if Work is cloud-only with no local Computer Use.
- This route directly makes the user message the cloud wake event; it avoids task-file polling and any custom background daemon. A cloud-written file may remain useful for long detailed prompts but not as the sole wake mechanism.
- If eligible dot exists, test linking local computer under dot profile > Computers > Allow, then message dot from mobile and ask it to start a LOCAL Work task doing the same GUI relay. Treat actual availability and ability to control *arbitrary* foreground developer app as separate required tests. Do not infer from marketing wording.

## Option B (only if option A unavailable; preserve desktop GPT GUI)
Keep CloudGPT -> Mac project inbox as proven A01/A02 transport. Missing component is *an officially supported execution/wake trigger for local Work with Computer Use*.
- P1: Desktop GPT in Work checks installed app version and docs/UI to see whether a genuine scheduled local Work task, enterprise local sync, dot, or supported event-triggered local task can open/continue Work with Computer Use. Verify with an independent A03 or A04; never infer from general Scheduled support.
- P2: If native support absent, an optional small Mac launchd observer can detect new inbox files, queue metadata and show a notification. It must NEVER click the developer GUI. However merely sending a local macOS notification does NOT programmatically awaken an idle ChatGPT Work agent. Before treating P2 as solved, verify there is a supported ChatGPT invocation route that starts a new local Work turn from the notifier. If not, classify WAKE_BLOCKED and report exactly which capability is missing; do not implement fragile undocumented deep links, AppleScript fake keystrokes or call developer-specific APIs.
- P3: In-app direct mobile Work tasks are a potential user experience alternative but require positive verification that the task can access the connected Mac and use desktop Computer Use. If no such approved path works, fully unattended architecture is currently unproven; no amount of extra file polling or receipt scripting alone fixes it.

## Computer Use dispatch behavior
- Observe real foreground developer app and current workspace; if not unambiguously the authorized target, stop and report (do not send to arbitrary window).
- Read complete prompt file using absolute path. Validate task ID, no secrets, expected project and allowed send scope.
- Confirm nonduplicate by checking previous SEND_CONFIRMED receipts and visual sent chat before typing.
- Use Computer Use GUI to paste **short instruction pointing to absolute task file**, not raw potentially giant prompt, and click actual Send. Verify GUI sent turn and response.
- Write durable receipt states CREATED, CLAIMED, GUI_SENT, DEVELOPER_ACKED, FAILED; timestamps, target app/window and screenshot evidence pointer. Do not mark ACKED from file existence alone. Independent developer writes its PONG; cloud verifies both.
- Protected actions (public deployment, payment, deleting personal data, credentials, destructive Git) still require user approval.
- Keep the GUI sender GPT as a persistent task role, not assume app remaining open means model turn is active forever.

## Concrete A03 feasibility test (no dev work)
A03 goal: verify **mobile prompt → cloud-orchestrated Work → local Mac Computer Use** without manually entering a new instruction on the desktop. Do NOT reuse A02 and do NOT start by writing only another inbox PING. With user present for setup, first check actual account/UI eligibility; then initiate a new synced Work task and from PHONE send:
"这是 A03 远程控制最小测试。请通过已连接 Mac mini 的 Computer Use 只读识别当前前台开发窗口。不要输入、发送、修改文件或运行命令。返回目标应用名称、窗口标题和你是否真实调用本地 Computer Use；若无法接入本地桌面，明确写 BLOCKED。"
If read-only local UI PASS, then A03b authorizes a new distinct tiny send/PONG, and fully automatic mobile-trigger test is PASS only on actual GUI send + PONG; no accidental duplication of A01/A02. The ability to run A03a is account-dependent. A03 can be tested by dot on supported plans, or Work Cloud sync if enabled.

## Productization steps if A03b PASS
1. Store a reusable GUI relay skill/prompts and task schema in ALW-001 (later relocate to user governance 000 project if explicitly writable) with receipt, dedupe, retries and project owner checks.
2. Add optional alert/ack monitor on Mac if useful, but do not create persistent busy loop; push tasks through working native cloud/local Work path.
3. Test alternate foreground apps (CodeArts, OpenCode, WorkBuddy) and cross-project absolute path, no-target, background window, reconnect after restart, duplicate request ID.
4. Provide mobile command style ("转交 SocialMate ...") with signed scoped task file and human-approval boundaries; prevent privacy leaks and unrelated app control.

## No-go / hard facts
- User has ChatGPT Plus in current product metadata; dot official eligibility does NOT include regular Plus as of check. Do not suggest a dot install without confirming plan availability. Do not require user to upgrade during this feasibility test.
- A01 proves desktop GPT uses Computer Use when manually activated, nothing more.
- A02 shows no autonomous activation up to last inspection, not proof feature can never be enabled.
- Neither Mac project file write, macOS app staying signed in, nor ordinary cloud Scheduled task alone proves local Computer Use activation.
- No production changes, no SSH/public ports/keys, no CodeArts development activity for test, no blind A02 replay.

## What to hand back
Feature eligibility screenshots for Work Cloud local/sync/dot; A03a GUI read-only result; A03b GUI_SEND and independent PONG if eligible; screenshot and exact times/IDs; blocker if no supported native wake. Only after positive A03b proceed to automation hardening.
