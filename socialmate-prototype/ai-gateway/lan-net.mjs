/**
 * 局域网来源判定：只允许回环与 RFC1918 / 链路本地地址进入私有服务。
 * 即使服务监听 0.0.0.0，公网来源也会被拒绝。
 */

import os from "node:os";

export function normalizeIp(addr) {
  return String(addr || "").replace(/^::ffff:/i, "").split("%")[0];
}

export function isLoopbackIp(addr) {
  const ip = normalizeIp(addr);
  return ip === "127.0.0.1" || ip === "::1";
}

export function isPrivateIp(addr) {
  const ip = normalizeIp(addr);
  if (isLoopbackIp(ip)) return true;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * Tailscale 来源：100.64.0.0/10（CGNAT）或 fd7a:115c:a1e0::/48。
 * 只在“是否允许进入私有服务”时放行；不并入 lanIpv4List，避免端点发现误选 Tailscale 接口。
 */
export function isTailscaleIp(addr) {
  const ip = normalizeIp(addr);
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
  }
  return /^fd7a:115c:a1e0:/i.test(ip);
}

export function lanIpv4List() {
  const result = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const item of addresses || []) {
      if (item.family !== "IPv4" && item.family !== 4) continue;
      if (item.internal) continue;
      if (!isPrivateIp(item.address)) continue;
      result.push({name, address: item.address, netmask: item.netmask});
    }
  }
  // 真实私有网段优先，链路本地（169.254）放最后；同分时优先 en1/wlan 类无线接口。
  const score = (item) => {
    const [a, b] = item.address.split(".").map(Number);
    let value = 0;
    if (a === 192 && b === 168) value = 30;
    else if (a === 10) value = 20;
    else if (a === 172) value = 10;
    if (/^(en|wl|wlan)/i.test(item.name)) value += 3;
    return value;
  };
  return result.sort((x, y) => score(y) - score(x));
}

function ipToInt(ip) {
  return normalizeIp(ip)
    .split(".")
    .reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

export function sameSubnet(a, b, netmask) {
  const mask = ipToInt(netmask || "255.255.255.0");
  return (ipToInt(a) & mask) === (ipToInt(b) & mask);
}

/** 优先选与请求方同一网段的本地地址，避免多网卡时回错地址。 */
export function pickLanIp(peerAddress) {
  const list = lanIpv4List();
  if (!list.length) return null;
  const same = list.find((item) => sameSubnet(item.address, peerAddress, item.netmask));
  return (same || list[0]).address;
}