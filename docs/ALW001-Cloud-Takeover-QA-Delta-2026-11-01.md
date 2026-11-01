# ALW-001 SocialMate — Cloud Takeover QA Delta (2026-11-01)

## Evidence and scope
Baseline: ALW-001-SocialMate-Handoff-V1.0.md (read in full). Read-only Mac mini Project Reader was used against project id 001 at /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统. This connector does NOT execute shell, Gradle, ADB, or device tests. No existing source, Git state, app data, or services were modified. No deployment occurred.

## Verified observations (read-only)
- Git: main...origin/main with modified .gitignore, CHANGELOG, Android MainActivity.java/AsrActivity.java, ASR bridge files and many untracked files including socialmate-v1.2 and socialmate-prototype. These are not safe to reset, clean, overwrite or auto-commit.
- Latest available verification log: socialmate-v1.2/.local/qa/verify-20261101-095933.log, 2026-11-01 09:59:33 +0800. It records 24+15+40+23 = 102 Node PASS, 12 Android assertions, BUILD SUCCESSFUL and APK SHA da46425f7e5e1e69b243ac87171bf47f1301c2f32a25c52a23399236fdf69b7e. This is historical evidence, not a fresh test from this takeover.
- Current verify-v040.sh includes stage 1b calling both test-tls-guard.mjs and test-install-guidance.mjs; **the latest log does not show stage 1b**. These tests were added after that log or were not exercised by that run. Current incremental regression is NOT_RUN, not PASS.
- BOYA: previous on-device A/B measurement -180 dBFS both channels while USB receiver enumerated. Routing detection is not PCM success. Two transmitters need isolated actual recordings and nonzero PCM verification. Current status FAIL/unresolved.
- Android AsrActivity.java still hardcodes ws://127.0.0.1:8790/asr and http://127.0.0.1:8791/v12. AndroidManifest.xml still uses android:usesCleartextTraffic=true. The comment in showSocialMatePanel explicitly requires adb reverse for both ports. Offline/USB-free use is NOT BUILT.
- Mac live-server.mjs binds only localhost and checks TLS-disabling environment before imports; service-v040.sh strips inherited NODE_TLS_REJECT_UNAUTHORIZED=0 on process startup. Existing local gateway/API/SSE authentication is not proven suitable for network exposure. Do NOT tunnel ports to other devices or the public Internet without authenticated origin, Android HTTPS/WSS URL migration, and security tests.
- Native chat toolbar already has stop-recording and reload; cloud AI consent is separate. This is an implemented code path, but no new device UI observation was made in this takeover.

## Priority execution queue
P0-A — Run on the actual Mac mini from project root: bash socialmate-v1.2/verify-v040.sh . Confirm stage 1b outputs four tests (2 TLS + 2 install guidance) and record new log time, all Node totals, Gradle result, SHA. Fix failures without resetting or overwriting concurrent modifications.
P0-B — BOYA isolation: photograph receiver/transmitter battery, pairing and mute state; record A alone then B alone, measure PCM RMS/peak separately for both channels and confirm nonzero signal. Check system USB audio routing; if both channels are dual mono, label mix and never claim A/B independent. Don't send synthetic audio to claim phone hardware acceptance.
P0-C — USB-free private access: document Tailscale enrollment and route for the target Android phone and Mac; do not use ADB reverse as the product transport. Implement trusted HTTPS/WSS gateway with explicit authentication/authorization, origin checks, scoped session access, certificate verification and minimum exposure. Avoid exposing raw localhost 8790/8791. Preserve separate recording and AI consent and both CNY 1 budget guards. E2E test with USB unplugged, ADB reverse removed, Wi-Fi/cellular switch, denial of unauthorized clients, service restart and bad certificate.
P0-D — UI: review actual Redmi screenshots/video for initial chat view, transcription readability, AI card information hierarchy, recording/connection/error states, navigation and text sizes. Preserve 5 tabs and corpus 51 apps/204 steps/115 places/5 stories. Independent human/device QA required.
P1 — weak network, background, lock-screen, process kill/restart and secure reconnection; document real results; complete personal Markdown sync later.

## Acceptance ledger (as of read-only inspection)
- Historical 102/102 Node, Android 12, APK build: PASS (historical only).
- New TLS + installer delta after 09:59: NOT_RUN.
- BOYA actual non-silent phone PCM: FAIL (previous evidence), current recovery test NOT_RUN.
- No-USB, authenticated TLS private connectivity: NOT_BUILT / NOT_RUN.
- Device chat UI final UX: PARTIAL (previous screenshots); latest review NOT_RUN.
- Weak-network/resume tests: NOT_RUN.
- Formal delivery: BLOCKED.

## Cloud/desktop concurrency
Cloud side may prepare separate docs/tests and review UI/security; desktop alone runs Mac shell/Gradle/ADB and BOYA hardware acceptance. Before changing any shared source file, check its latest diff and ownership with the other developer. Do not kill unrelated processes or alter another developer's uncommitted changes. No deploy, push, data reset, key disclosure, public tunnel, or budget increase without explicit authorization.

## Exact execution references
Project id: 001; target phone serial: &lt;note11-serial&gt;.
Verification: bash socialmate-v1.2/verify-v040.sh
Install (ONLY after successful verified build and only if needed): bash socialmate-v1.2/install-phone-v040.sh --serial &lt;note11-serial&gt;
Safety status: bash socialmate-v1.2/service-v040.sh status
Expected evidence location: socialmate-v1.2/.local/qa/ and socialmate-v1.2/screenshots/.
