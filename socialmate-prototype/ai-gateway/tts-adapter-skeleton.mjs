/**
 * N05 TTS · 真实厂商适配器骨架（azure / elevenlabs / google）。
 *
 * 本轮只证明「换 provider 只换适配层」：注册表、校验、缓存、预算闸、播放器都不用改。
 * 因此这三个 adapter 是**纯骨架**：
 * - 不 import 任何 HTTP 客户端，函数体内没有任何网络调用，结构上不可能联网；
 * - 没有配置 Key 时抛 501 PROVIDER_NOT_CONFIGURED；
 * - 即使将来配置了 Key，也必须先由用户批准预算并显式改写本文件才会真正发请求。
 */
function fail(status, code, message, extra = {}) {
  return Object.assign(new Error(message), {status, code, ...extra});
}

export function createSkeletonAdapter({providerId, label, keyEnv, modelVersion}) {
  return {
    providerId,
    network: "none", // 骨架：不存在任何网络出口
    modelVersion,
    keyEnv, // 只记录「需要哪个环境变量」，绝不读取、绝不回显它的值
    async speak() {
      throw fail(501, "PROVIDER_NOT_CONFIGURED",
        `${label} 适配器只有骨架：未配置 Key，且本轮禁止发起任何真实云 TTS 请求`,
        {providerId, reason: "SKELETON_NO_NETWORK"});
    },
  };
}
