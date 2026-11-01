# ALW-001 SocialMate Development Plan V1.1
Date: 2026-11-01
Status: PLANNED — NOT IMPLEMENTED / NOT DEPLOYED
Project: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统

## Outcome
Extend existing Android v0.4.0 with consented original transcript preservation, durable offline outbox, automatic authenticated encrypted transfer to Mac mini, Markdown export for later communication/English reviews. Complete existing BOYA silent-PCM, no-USB connectivity, chat UI and recovery QA. Do not redo validated AI/ASR/data flows.

## Preconditions / preflight
- Inspect Git status/diffs, QA.md, latest verify logs, source scripts, global ~/.agents/AGENTS.md, and owner of each shared file. Current main tree has many uncommitted/untracked changes. Never reset/clean/overwrite other developer work, deploy/push or clear data.
- Inspect local 016「懒得打字」project **through the desktop developer** (not in cloud reader allowlist) for export directory, naming, Markdown schema, scheduling, recovery and unit tests. Reuse its established conventions only when they fit; do not claim 016 inspected until actually read. No wholesale source copy.
- Validate Mac mini Tailscale and Android client installed/authorized; verify no-USB transport, HTTPS certificate and explicit auth. Missing hardware/phone steps reserved for desktop; cloud can independently build isolated modules/tests.
- Baseline latest 2026-11-01 09:59 verify log: 102/102 Node, Android 12, BUILD SUCCESSFUL, historical SHA da46425f7e5e1e69b243ac87171bf47f1301c2f32a25c52a23399236fdf69b7e. Current verify-v040.sh adds stage 1b TLS+installer tests absent from the log; MUST rerun. No new PASS can be inferred.
- External credentials existing Tencent/DeepSeek; never print/commit keys. ASR and AI 1 CNY separate budgets unchanged. No need to buy keys or specify production domain. No network exposure without an auth barrier.
- Explicit permission states: informed participant recording/ASR consent; separate durable transcription retention + Mac export consent; separately cloud AI text consent (off by default). Revoke recording stops mic; revoke retention stops future storage/queueing and defines existing data deletion workflow; revoke AI stops calls. Obtain participant consent in actual test.

## Architecture / data contract
Android AudioRecord -> Tencent ASR -> final events -> on-device durable local archive/outbox -> authenticated encrypted transport -> Mac private receiver -> atomic Markdown + optional JSON. Interim is UI-only. SSE remains for chat UI; do not make in-memory SSE hub the sole persistence source. Capture final once at authoritative session pipeline; use unique stable event identity and server-side idempotency. Avoid private transcripts in logs.
Session: schemaVersion, sessionId, startedAt, endedAt, appVersion, consent/retention flags, export revision and state. Segment: eventId, finalAsrTextOriginal (never altered), receivedAt, relative startMs/endMs, provider, mock, track, reportedSpeakerId/unknown, optional correction separate from original. AI replies live in separate section. Keep timezones explicit (ISO8601 UTC with local display). Never infer real identity from speaker cluster. Default no PCM/WAV retention. Consider empty/aborted sessions explicitly.
Storage: Android app-private durable store (Room/SQLite or robust atomic file with encryption where warranted) rather than browser localStorage, which presently holds UI preferences. Store after every final; transaction and crash restart tests. Queue export after stop, manual retry, bounded backoff on reconnect; ACK only after Mac durable write. Verify content hash and revision; ensure no duplicated sessions. Avoid two writers modifying same session file concurrently.
Mac private location (tentative pending 016 check): ~/Documents/SocialMate/Conversations/YYYY/MM/SocialMate-YYYY-MM-DD-HHMMSS-<sessionId>.md . English filenames, UTF-8 original-language content; locked-down permissions; ignored by Git/public static paths. JSON sidecar optional and matching exact text/eventIds. Separate derived reviews as non-mutating files. Do not store in public site root.
Security: Use private Tailscale with verified TLS HTTPS/WSS and explicit authentication, authorization on every route (including SSE/AI/export and other existing endpoints if exposed), origin/request-size checks and secrets redaction. Host/port alone or Tailscale identity alone is not adequate application auth. Keep raw 8790/8791 bound to 127.0.0.1; put only a scoped, authenticated front door in front if necessary. Prefer minimal existing trusted tooling, inspect actual capability before designing implementation. Never disable TLS validation or enable public funnel. Fail closed on insecure transport.

## Delivery sequence and gates
### M0 Read-only safety and regression
1. Collect current diffs, dependencies and files used by other developer; establish non-overlapping file ownership.
2. Desktop runs bash socialmate-v1.2/verify-v040.sh . Require new log proving stage 1b 4 PASS (2 TLS + 2 installer), full Node/Android/build success and newly computed APK sha. Fix failures carefully and rerun.
3. Preserve historical QA as history; log NOT_RUN for new physical tests.

### M1 Persist verbatim conversations
1. Add typed schema/parser and consent-aware final-only durable writer/outbox on Android; reject interim and stale replay, label mock and unknown speaker.
2. Strictly separate recording, retention/export, cloud-AI permissions in UI/data paths. Record explicit user action without persisting secrets.
3. Simulate process kill, restart, duplicate event, large transcript, cancellation and disabled consent. Test no loss/no unauthorized retention.

### M2 Mac archival receiver and private transport
1. Read 016 exporter; define versioned Markdown schema + canonical JSON and stable IDs. Build archive writer, validate payload/path, atomic file write, checksum and duplicate acknowledgement.
2. Wire authenticated private HTTPS/WSS ingress with Tailscale-supported access; Android config points to safe URL; no ADB reverse, HTTP cleartext or implicit localhost assumptions for user mode.
3. Test 401/403 invalid auth, wrong origin, bad TLS, oversized payload, path traversal, crash mid-write, concurrent/replayed sessions and network interruption.
4. Do not expose existing AI/SSE routes through insecure network ingress or open 8790/8791 publicly.

### M3 Chat UI/history
1. Within existing chat Tab add session history, original-text transcript (copy), explicit separately labeled AI response and export status (queued, syncing, synced, failed) with manual retry and date filters.
2. Recording/in-session UI displays real network/mic state and stop; preserve advanced BOYA diagnostic section, five tabs, light theme, font controls, 51 apps/204 steps/115 places/5 confirmed stories.
3. Make deletion semantics explicit, including Mac copy and pending queue; prevent false 'deleted' UI state while remote removal unconfirmed.
4. Real Redmi screenshot reviews: overflow, tap targets, font scaling, reconnect states, scroll, back/foreground. Static code alone not PASS.

### M4 BOYA hardware and resilience
1. On target Note 11 serial <note11-serial> check receiver and *both* transmitters power/pairing/mute, gain and USB audio routing. Record A alone then B alone; measured nonzero PCM RMS/peak for each channel; check dual mono and mark mix when necessary. Existing -180 dBFS is FAIL, not proof of independent channels.
2. Unplug USB and remove adb reverse: verify recording→Tencent ASR final→chat→separate AI consent→DeepSeek and Hainan card→stop→Mac file exported. Never send mock as 'real'.
3. Test Mac service restart, phone offline at stop, network change Wi-Fi/cellular, locked/background recording stopped, receiver unavailable, retry after app force-stop, no duplicate archive or loss.
4. Test no-consent ⇒ no capture/no retention/no external text call; both 1 CNY guards remain enforced. Do not spend more than approved budgets.

## Test evidence / delivery
- New QA entry in socialmate-v1.2/QA.md and machine logs under socialmate-v1.2/.local/qa; device screenshots under screenshots. Each case PASS/FAIL/NOT_RUN with date, device, log filename, reproducible command and actual observed outcome. Include final APK sha and sample archive SHA-256 from Mac; redact private personal transcript in shared logs/screenshots.
- Acceptance thresholds: all new code regression PASS; no loss/duplication after restart; accurate verbatim final records and Markdown; private no-USB TLS/authenticated round trip; real BOYA non-silent audio or documented hardware BLOCKED (do not claim full delivery); separate permissions all enforced; practical chat UI tests; no dataset regressions. Any hardware block remains explicit.
- Update handoff with completed tasks, remaining blockers and next executable actions. Do not rewrite old evidence or mark source-only work as device PASS.

## Concurrent working agreement
Cloud: spec, isolated archive schema/format/test modules, code review, UI proposals on disjoint files.
Desktop: actual Mac terminal/Gradle/ADB, 016 comparison, Tailscale/TLS configs, BOYA, device screenshots and QA runs. Before touching MainActivity.java, AsrActivity.java, server.mjs, source/V1.1-baseline.html, verify-v040.sh or QA.md, recheck latest diff and coordinate ownership. Implement → test → fix → retest without routine approvals; request user action only at real hardware, login, consent or release boundaries.

## Project statuses at plan creation
M0 incremental regression NOT_RUN. M1 durable archive NOT_BUILT. M2 authenticated wireless + export NOT_BUILT. M3 archive/history UI NOT_BUILT. M4 BOYA recorded PCM FAIL historically; renewed hardware test NOT_RUN. Overall NOT DELIVERED.
