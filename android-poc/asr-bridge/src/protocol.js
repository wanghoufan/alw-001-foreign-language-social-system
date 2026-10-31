/**
 * 桥接协议的统一事件构造与校验。
 *
 * 所有发往手机的 JSON 事件都必须包含：
 * type / track / text / startMs / endMs / speaker / confidence / final。
 * mock 模式额外带 mock:true，绝不允许把模拟结果伪装成真实 ASR。
 */

export const EVENT_TYPES = Object.freeze(['interim', 'final', 'error', 'session']);

function clampMs(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 0;
  return Math.max(0, Math.round(Number(value)));
}

export function makeEvent(input) {
  const {
    type,
    track,
    text = '',
    startMs = 0,
    endMs = 0,
    speaker = 'unknown',
    confidence = null,
    final = false,
    mock = false,
    ...extra
  } = input;

  if (!EVENT_TYPES.includes(type)) {
    throw new RangeError(`未知事件 type: ${type}`);
  }
  if (!['A', 'B', 'mix'].includes(track)) {
    throw new RangeError(`事件 track 必须是 A、B 或 mix，收到 ${track}`);
  }

  let normalizedConfidence = confidence;
  if (normalizedConfidence !== null && normalizedConfidence !== undefined) {
    normalizedConfidence = Number(normalizedConfidence);
    if (!Number.isFinite(normalizedConfidence) || normalizedConfidence < 0 || normalizedConfidence > 1) {
      throw new RangeError(`confidence 必须是 0..1 或 null，收到 ${confidence}`);
    }
  } else {
    normalizedConfidence = null;
  }

  const start = clampMs(startMs);
  const end = Math.max(start, clampMs(endMs));

  return {
    ...extra,
    type,
    track,
    text: String(text ?? ''),
    startMs: start,
    endMs: end,
    speaker: String(speaker || 'unknown'),
    confidence: normalizedConfidence,
    final: Boolean(final),
    mock: Boolean(mock),
  };
}

/** 构造 error 事件；message 放在 text，便于客户端直接展示。 */
export function makeErrorEvent({ track, message, mock = false, ...extra }) {
  return makeEvent({
    type: 'error',
    track,
    text: String(message ?? 'unknown error'),
    startMs: 0,
    endMs: 0,
    speaker: 'unknown',
    confidence: null,
    final: false,
    mock,
    ...extra,
  });
}
