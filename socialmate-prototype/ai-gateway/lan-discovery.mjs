/**
 * 家庭 WiFi 自动发现：Mac 在 UDP 8799 上响应手机广播，
 * 返回同一局域网可访问的三个服务地址。不含任何令牌/密钥。
 */

import dgram from "node:dgram";
import {pickLanIp} from "./lan-net.mjs";

const DISCOVER_REQUEST = "SOCIALMATE_DISCOVER";

export function startLanDiscovery({port = 8799, aiPort = 8791, asrPort = 8790, archivePort = 8781} = {}) {
  const socket = dgram.createSocket("udp4");
  let closed = false;

  socket.on("error", (error) => {
    if (!closed) {
      console.warn(`[socialmate-discovery] UDP ${port} unavailable: ${error.message}`);
    }
  });

  socket.on("message", (message, remote) => {
    if (String(message).trim() !== DISCOVER_REQUEST) return;
    const ip = pickLanIp(remote.address);
    if (!ip) return;
    const payload = JSON.stringify({
      service: "socialmate",
      base: `http://${ip}:${aiPort}`,
      asr: `ws://${ip}:${asrPort}/asr`,
      archive: `http://${ip}:${archivePort}/api/archive/session`,
    });
    socket.send(payload, remote.port, remote.address, () => {});
  });

  socket.bind(port, "0.0.0.0", () => {
    try {
      socket.setBroadcast(true);
    } catch {
      // 忽略：部分系统不允许设置广播，仍可接收单播响应。
    }
    console.log(`[socialmate-discovery] listening udp://0.0.0.0:${port}`);
  });

  return {
    close() {
      closed = true;
      try {
        socket.close();
      } catch {
        // 忽略重复关闭。
      }
    },
  };
}