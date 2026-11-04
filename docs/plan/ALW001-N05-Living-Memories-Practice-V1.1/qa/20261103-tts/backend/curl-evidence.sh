#!/bin/zsh
# ALW-001 N05 · TTS 适配层：curl 取证脚本（临时实例 8799，临时数据目录，无任何厂商 Key）
# 令牌只从环境变量读取，不写进命令、不写进回执。
set -u
BASE="http://127.0.0.1:8799"
EV="/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/qa/20261103-tts/backend"
TMP="/tmp/alw001-n05-tts-evidence"
TOKEN="$(cat "$TMP/token.txt")"
ORIGIN="-H Origin:$BASE"
CODES="$EV/14-exit-codes.txt"
: > "$CODES"

run() { # name, then curl args
  local name="$1"; shift
  curl -sS -m 10 "$@" > "$EV/$name"
  print -r -- "$name -> curl exit $?" >> "$CODES"
}

# ① 无令牌 / 跨源
run 01-no-token.txt -i "-H" "Origin: $BASE" "$BASE/v12/api/tts/providers"
run 02-cross-origin.txt -i -H "Origin: https://evil.example" -H "x-archive-token: $TOKEN" "$BASE/v12/api/tts/providers"

# ② 提供商与语音清单
run 03-providers.json -H "x-archive-token: $TOKEN" "-H" "Origin: $BASE" "$BASE/v12/api/tts/providers"
run 04-voices-en-gb.json -H "x-archive-token: $TOKEN" "-H" "Origin: $BASE" "$BASE/v12/api/tts/voices?locale=en-GB"

# ④ 只报价，不落盘
run 05-estimate.json -X POST -H "content-type: application/json" -H "x-archive-token: $TOKEN" "-H" "Origin: $BASE" \
  -d '{"requestId":"req-evidence-01","recordId":"rec-evidence-01","blockId":"blk-1","revision":2,"segmentType":"enA","text":"I went to Longxing Road today.  光线很好。 ","locale":"en-US","providerId":"fake","estimate":true}' \
  "$BASE/v12/api/tts/synthesize"

# ③ 真实合成一次 + 重复请求命中缓存（需要一次性写票）
TICKET="$(curl -sS -m 5 -H "x-archive-token: $TOKEN" "-H" "Origin: $BASE" "$BASE/v12/api/demo/write-ticket" | sed -n 's/.*"ticket":"\([^"]*\)".*/\1/p')"
BODY='{"requestId":"req-evidence-01","recordId":"rec-evidence-01","blockId":"blk-1","revision":2,"segmentType":"enA","text":"I went to Longxing Road today.  光线很好。 ","locale":"en-US","providerId":"fake","rate":1}'
run 06-synthesize-first.json -X POST -H "content-type: application/json" -H "x-archive-token: $TOKEN" -H "x-sm-write: $TICKET" "-H" "Origin: $BASE" -d "$BODY" "$BASE/v12/api/tts/synthesize"
TICKET2="$(curl -sS -m 5 -H "x-archive-token: $TOKEN" "-H" "Origin: $BASE" "$BASE/v12/api/demo/write-ticket" | sed -n 's/.*"ticket":"\([^"]*\)".*/\1/p')"
run 07-synthesize-again-cachehit.json -X POST -H "content-type: application/json" -H "x-archive-token: $TOKEN" -H "x-sm-write: $TICKET2" "-H" "Origin: $BASE" -d "$BODY" "$BASE/v12/api/tts/synthesize"

# ⑤ 计费请求 → 402，账本零变动
LEDGER_BEFORE="$(shasum -a 256 "$TMP/TtsCache/ledger.json" | cut -d' ' -f1)"
TICKET3="$(curl -sS -m 5 -H "x-archive-token: $TOKEN" "-H" "Origin: $BASE" "$BASE/v12/api/demo/write-ticket" | sed -n 's/.*"ticket":"\([^"]*\)".*/\1/p')"
run 08-skeleton-billing-402.json -X POST -H "content-type: application/json" -H "x-archive-token: $TOKEN" -H "x-sm-write: $TICKET3" "-H" "Origin: $BASE" \
  -d '{"requestId":"req-evidence-02","segmentType":"enA","text":"Let us meet at the cafe.","locale":"en-US","providerId":"azure","voiceProfileId":"en-US-AvaMultilingualNeural","explicitConsent":true}' \
  "$BASE/v12/api/tts/synthesize"
LEDGER_AFTER="$(shasum -a 256 "$TMP/TtsCache/ledger.json" | cut -d' ' -f1)"
{
  print -r -- "ledger_sha_before=$LEDGER_BEFORE"
  print -r -- "ledger_sha_after=$LEDGER_AFTER"
  print -r -- "ledger_unchanged=$([[ "$LEDGER_BEFORE" == "$LEDGER_AFTER" ]] && print true || print false)"
} > "$EV/13-ledger.json"

# ⑥ 未显式同意 → 403 CONSENT_REQUIRED
TICKET4="$(curl -sS -m 5 -H "x-archive-token: $TOKEN" "-H" "Origin: $BASE" "$BASE/v12/api/demo/write-ticket" | sed -n 's/.*"ticket":"\([^"]*\)".*/\1/p')"
run 09-consent-required-403.json -X POST -H "content-type: application/json" -H "x-archive-token: $TOKEN" -H "x-sm-write: $TICKET4" "-H" "Origin: $BASE" \
  -d '{"requestId":"req-evidence-03","segmentType":"enA","text":"Let us meet at the cafe.","locale":"en-US","providerId":"elevenlabs","voiceProfileId":"eleven-multilingual-v2-en"}' \
  "$BASE/v12/api/tts/synthesize"

# ⑦ 音频读取：完整 / Range 206 / 越界 416 / 篡改 400
AUDIO_ID="$(sed -n 's/.*"audioId":"\(tts-[a-f0-9]*\)".*/\1/p' "$EV/06-synthesize-first.json" | head -1)"
curl -sS -m 5 -D "$EV/10a-audio-full-headers.txt" -o /dev/null -H "x-archive-token: $TOKEN" "-H" "Origin: $BASE" "$BASE/v12/api/tts/audio/$AUDIO_ID"
print -r -- "audio-full -> curl exit $?" >> "$CODES"
curl -sS -m 5 -D "$EV/10b-audio-range-headers.txt" -o /dev/null -H "x-archive-token: $TOKEN" "-H" "Origin: $BASE" -H "Range: bytes=0-99" "$BASE/v12/api/tts/audio/$AUDIO_ID"
print -r -- "audio-range -> curl exit $?" >> "$CODES"
curl -sS -m 5 -o /dev/null -w "status=%{http_code}\n" -H "x-archive-token: $TOKEN" "-H" "Origin: $BASE" -H "Range: bytes=999999-" "$BASE/v12/api/tts/audio/$AUDIO_ID" > "$EV/10c-audio-range-invalid.txt"
print -r -- "audio-range-invalid -> curl exit $?" >> "$CODES"
node -e '
const fs=require("node:fs");
const file=process.argv[1];
const b=fs.readFileSync(file);
b[100]=b[100]^0xff;
fs.writeFileSync(file,b);
' "$TMP/TtsCache/audio/$AUDIO_ID.wav"
run 11-tampered-audio-400.json -H "x-archive-token: $TOKEN" "-H" "Origin: $BASE" "$BASE/v12/api/tts/audio/$AUDIO_ID"

# ⑧ 隐私闸：含他人姓名 / 带人物档案字段
TICKET5="$(curl -sS -m 5 -H "x-archive-token: $TOKEN" "-H" "Origin: $BASE" "$BASE/v12/api/demo/write-ticket" | sed -n 's/.*"ticket":"\([^"]*\)".*/\1/p')"
run 12-privacy-person-name-403.json -X POST -H "content-type: application/json" -H "x-archive-token: $TOKEN" -H "x-sm-write: $TICKET5" "-H" "Origin: $BASE" \
  -d '{"requestId":"req-evidence-04","segmentType":"enA","text":"Evidence Person said the coffee here is great.","locale":"en-US","providerId":"fake"}' \
  "$BASE/v12/api/tts/synthesize"

print -r -- "done"
