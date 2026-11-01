# ALW-001 SocialMate — Conversation archive and automatic Mac export — V1.0
Date: 2026-11-01
Status: **NEW PRODUCT REQUIREMENT / NOT IMPLEMENTED / NOT TESTED**
Origin: explicit user request to preserve the original conversations and automatically export to the computer for communication review and English speaking review. Reference: local project 016「懒得打字」, not directly inspected; its previously agreed Markdown learning-record export semantics are reference only.

## Product decision
1. Maintain a **verbatim conversation archive** of each explicitly opted-in session. Do not silently save or discard the raw transcript because an AI rewrite exists.
2. Display separate controls and states for (a) informed permission to record/transmit audio to Tencent ASR, (b) **save transcription history and export to user's Mac** (must be explained and opted into), (c) permission to send transcript text to DeepSeek (off by default). Saving does not imply AI permission. Recording consent alone is not a blanket permission for permanent retention; disclose retention to all participants.
3. Archive **final ASR text exactly as received**, including mistakes and original language, with timestamp, track, speaker label as reported, and provenance; never assert unknown speaker identity. Keep interim in transient UI only, not durable history. Include separately optional user corrections, not overwriting raw text.
4. Session-centric record: session_id (random opaque ID), started_at, ended_at, export_state, app_version, transcript segments [{id, start_ms, end_ms, received_at, speaker_id, track, provider, mock, text_original}], and optional AI response in a clearly distinct section. Never store API secrets. By default do NOT retain WAV/PCM audio; retaining audio needs another deliberate consent and a separate design.
5. Automatic export to a **private Mac mini inbox** when the connection is available, with a durable, idempotent outbox. Avoid storing transcript in logs, URLs, backups or public site. Export on stop and in batches on reconnect. Survive phone/app/network restarts; show pending/synced/error. Never mark synced before server verifies durable atomic write. Retry without duplicating sessions.
6. Primary export: UTF-8 Markdown (.md) readable for later review. Preserve metadata and original text. Optional JSON sidecar for machine-assisted analysis should have exact same event IDs and original content. Never replace verbatim transcript with edited AI output.
7. Mac directory: use separate private SocialMate area under user's Documents (proposed `~/Documents/SocialMate/Conversations/`, to be verified with 016 conventions). Group by YYYY/MM; English-only filenames to avoid download issues: `SocialMate-YYYY-MM-DD-HHMMSS-<short-session-id>.md`. Stable filename per session; dedupe by session_id, hash and revision; no partial exports exposed. Restrict directory/file permissions; excluded from public HTML and VCS.
8. No-USB access must use an authenticated encrypted private transport (existing Tailscale only after validation) with HTTPS/WSS, access control and tests. ADB reverse is only a development route. Export endpoint cannot accept unauthenticated content and must reject oversized/replayed/out-of-scope writes.
9. UI: “会话记录” entry in the chat area, session timeline with exact original text and separate AI recommendations, copy/export/sync state, manual retry, delete a session (also specify Mac-side deletion/retention semantics before implementation). No extra primary tab; retain existing five tabs, light theme and font scaling. Let user export today / 3 days / 7 days / custom period like 016.
10. Future reviews: communication topics, missed opportunities to respond, natural replies and English speaking improvements operate on **copies/derivatives**, never rewriting the original record. Review requires deliberate request, separate AI text permission, and clear labeling of derived content.

## Existing implementation inspection
- `socialmate-prototype/ai-gateway/live-asr-hub.mjs`: in-memory SSE broadcast; no durable transcript store.
- `socialmate-prototype/ai-gateway/server.mjs`: localhost-only HTTP server, /api/asr/live GET, AI routes; no transcript archive/export endpoint or network-grade authentication.
- `android-poc/app/src/main/java/app/socialmate/dualmic/AsrActivity.java`: local WebView and AudioRecord, current fixed localhost URLs. UI/cloud consent previously implemented; no verified persistent transcript export.
- Previous QA states no private subtitle persistence by design. This new requirement supersedes that **only for explicitly authorized retained sessions**, while privacy boundaries remain in force.

## Implementation tasks and acceptance
A. Build client durable session/outbox on Android (encrypted private local storage preferred) with separate retention consent, stable IDs, final-only deduplication, crash-safe atomic updates and offline retry.
B. Build Mac local authenticated archive receiver and validated Markdown writer; enforce transport/auth, safe path handling, size bounds, atomic commit, ownership, idempotency, no leaks. Preserve read-only public corpus.
C. Show archives and pending export state in the chat UI. Do not change 51 apps/204 steps/115 places/5 confirmed stories.
D. Unit/integration tests: final vs interim, mock labeling, consent denial, multiple speakers/unknown, duplicate/reconnect, interrupted transfer, filename/path traversal, unauthorized client, AI consent independence, app restart, Mac receiver restart and no USB.
E. Actual Redmi + Mac acceptance: record a short conversation with consent, unplug USB, stop, verify Markdown appears on Mac exactly matching ASR final (including recognition errors), compare timestamps/labels, restart/offline replay without duplicates, explicit refusal prevents saving, review original vs derived outputs, check no leak to public endpoints. New QA log with PASS/FAIL/NOT_RUN and actual Mac file hash. Do not claim complete from source/test alone.

## Scope/concurrency safeguards
No deployment, credential disclosure, budget increase, service restart, public tunnel, reset/clean, other developer file overwrite or destructive changes. Coordinate owners before touching shared sources. Keep old 102/102 Mac verification and phone evidence as historical only. New feature status stays NOT_BUILT until code wired and new test evidence exists.
