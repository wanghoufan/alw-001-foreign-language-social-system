/**
 * 统一错误类型。
 *
 * 约定：错误只携带「可外发」的 code / message / details，绝不携带厂商密钥、
 * 上游原始响应体或设备指纹原文。
 */
export class GatewayError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {ok: false, code: this.code, error: this.message, ...this.details};
  }
}

export function fail(status, code, message, details = {}) {
  return new GatewayError(status, code, message, details);
}

export function isGatewayError(error) {
  return error instanceof GatewayError;
}

/** 把任意异常收敛成可外发的 5xx，避免把堆栈和路径写进响应。 */
export function toGatewayError(error) {
  if (isGatewayError(error)) return error;
  return new GatewayError(500, "INTERNAL_ERROR", "网关内部错误");
}

/** HTTP 状态码 → 固定错误码，供上游映射复用。 */
export function mapUpstreamStatus(status) {
  if (status === 401 || status === 403) return ["PROVIDER_AUTH", 502];
  if (status === 429) return ["PROVIDER_LIMIT", 503];
  return ["PROVIDER_ERROR", 502];
}