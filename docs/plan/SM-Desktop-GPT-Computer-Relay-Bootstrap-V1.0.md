# Desktop GPT Computer Use relay · fixed architecture and minimal test V1.0
Date: 2026-11-01
State: DESIGN / NO AUTOMATIC WAKE CONFIRMED

## Non-negotiable roles
- Cloud GPT writes task files to an explicitly allowed Mac mini project location.
- **Desktop ChatGPT in local Work/Computer Use is the only cross-app dispatcher.** It observes the foreground developer window, types/pastes the task, **actually clicks Send**, verifies the message appears and the developer starts/responds, and writes a receipt.
- Developer may be any chat/agent app; do NOT require knowing OpenCode, CodeBuddy, Claude, or any CLI/API. Do NOT replace Computer Use delivery with terminal commands, AppleScript keystrokes, ADB or tool-specific message APIs.
- A tiny OS notifier is only permitted as a wake signal if needed; never use it to paste, click or send the task itself.
- Desktop ChatGPT stays open; developer window stays foreground, but **being open does not prove an unattended Work session is actively polling**. Test wake behavior separately, do not label the system automatic until proven.

## Minimal existing probe A01
Input: `docs/plan/SM-Cloud-to-Desktop-PING-20261101-A01.md` (already written by cloud; harmless, no development allowed).
1. Desktop GPT receives an explicit Computer Use task to read the A01 input in project 001.
2. Desktop GPT checks current foreground app/screen and identifies an open developer chat input; if absent/wrong window, stop without sending. Do not send to random chat.
3. Desktop GPT uses **Computer Use GUI** to type this minimal single-line probe into the foreground developer chat and click Send:
`请读取 docs/plan/SM-Cloud-to-Desktop-PING-20261101-A01.md，并按文件要求只写 PONG 回执；不执行任何开发。`
4. Verify visually that the message appeared as a sent turn. Write relay receipt:
`docs/plan/SM-Desktop-GPT-RELAY-20261101-A01.md`, including message ID, observed target app/window, SEND_CONFIRMED or FAILED, time, GUI evidence pointer. Do not claim the developer read it yet.
5. Wait/check for actual developer-created receipt `docs/plan/SM-Cloud-to-Desktop-PONG-20261101-A01.md`. Cloud can inspect both via Mac Project Reader.
6. If PONG exists, the triggered GUI relay worked. This alone **does NOT prove fully unattended wake**.
7. Unattended wake test: while mobile cloud writes fresh uniquely ID'd PING file (A02) without any manual desktop typing, check whether Desktop GPT autonomously notices, uses GUI and records SEND_CONFIRMED and developer PONG. If not, report WAKE_BLOCKED and investigate a legitimate event/notification trigger; DO NOT pretend background monitoring exists.

## Safety and delivery
- Do not run builds/deploy, no destructive changes, no paid API calls, do not paste private keys or raw audio. No blind Ctrl+Enter; check send button and actual sent message. Avoid duplicate task ID sends. Keep inbox state RECEIVED→SENDING→SENT→ACKED; retry only after checking if already sent.
- Only user-authorized routine task texts can be dispatched. For external/public/publishing/destructive tasks request user authorization separately.
- Do not promise that local Computer Use can run forever merely because app stays online. Background/wake must be tested in the installed version.
