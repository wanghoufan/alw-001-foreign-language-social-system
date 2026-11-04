package app.socialmate.dualmic;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.Set;

import org.json.JSONObject;

/**
 * 家庭 WiFi 自动发现。
 *
 * 用户只需要连接 WiFi 或开关 Tailscale：
 * - 同一 WiFi 下向 UDP 8799 广播，Mac 返回局域网 UI / ASR / 归档地址；
 * - 发现不到时，由调用方回退到 Tailscale 入口；
 * - 不含任何令牌/密钥。
 */
final class EndpointResolver {
    private static final String DISCOVER_REQUEST = "SOCIALMATE_DISCOVER";
    private static final int DISCOVER_PORT = 8799;

    static final class LanEndpoint {
        final String base;
        final String asr;
        final String archive;

        LanEndpoint(String base, String asr, String archive) {
            this.base = base;
            this.asr = asr;
            this.archive = archive;
        }
    }

    private EndpointResolver() {}

    /** 手机当前是否有 Tailscale 的 100.64.0.0/10 地址。 */
    static boolean tailscaleUp() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface item = interfaces.nextElement();
                if (!item.isUp() || item.isLoopback()) continue;
                for (InterfaceAddress address : item.getInterfaceAddresses()) {
                    InetAddress ip = address.getAddress();
                    if (ip == null || ip.getAddress().length != 4) continue;
                    byte[] raw = ip.getAddress();
                    int first = raw[0] & 0xff;
                    int second = raw[1] & 0xff;
                    if (first == 100 && second >= 64 && second <= 127) return true;
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    /** 在后台线程调用；最多等待 timeoutMs 毫秒。 */
    static LanEndpoint discoverLan(int timeoutMs) {
        DatagramSocket socket = null;
        try {
            socket = new DatagramSocket();
            socket.setBroadcast(true);
            socket.setSoTimeout(220);
            byte[] request = DISCOVER_REQUEST.getBytes("UTF-8");
            Set<InetAddress> targets = broadcastTargets();
            long deadline = System.currentTimeMillis() + Math.max(300, timeoutMs);
            while (System.currentTimeMillis() < deadline) {
                for (InetAddress target : targets) {
                    try {
                        socket.send(new DatagramPacket(request, request.length, target, DISCOVER_PORT));
                    } catch (Exception ignored) {
                    }
                }
                while (System.currentTimeMillis() < deadline) {
                    byte[] buffer = new byte[2048];
                    DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                    try {
                        socket.receive(packet);
                    } catch (SocketTimeoutException timeout) {
                        break;
                    }
                    try {
                        JSONObject data = new JSONObject(new String(packet.getData(), 0, packet.getLength(), "UTF-8"));
                        if (!"socialmate".equals(data.optString("service"))) continue;
                        String base = data.optString("base", "").trim();
                        String asr = data.optString("asr", "").trim();
                        String archive = data.optString("archive", "").trim();
                        if (base.startsWith("http://") && asr.startsWith("ws://") && archive.startsWith("http://")) {
                            return new LanEndpoint(base, asr, archive);
                        }
                    } catch (Exception ignored) {
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (socket != null) socket.close();
        }
        return null;
    }

    private static Set<InetAddress> broadcastTargets() {
        Set<InetAddress> targets = new LinkedHashSet<>();
        try {
            targets.add(InetAddress.getByName("255.255.255.255"));
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface item = interfaces.nextElement();
                if (!item.isUp() || item.isLoopback()) continue;
                for (InterfaceAddress address : item.getInterfaceAddresses()) {
                    InetAddress broadcast = address.getBroadcast();
                    if (broadcast != null) targets.add(broadcast);
                }
            }
        } catch (Exception ignored) {
        }
        return targets;
    }
}