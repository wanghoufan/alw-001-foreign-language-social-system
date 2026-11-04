package app.socialmate.dualmic;

import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;

/** Shared USB input discovery and AudioRecord opening for the probe and the ASR streamer. */
final class AudioInputs {
    static final int[] SAMPLE_RATES = {48000, 44100, 16000};
    // UNPROCESSED first: AGC/NS can hide or rebalance the two wireless transmitters.
    private static final int[] SOURCES = {
            MediaRecorder.AudioSource.UNPROCESSED,
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.MIC};

    private AudioInputs() {}

    static boolean isUsb(AudioDeviceInfo d) {
        return d != null && (d.getType() == AudioDeviceInfo.TYPE_USB_DEVICE
                || d.getType() == AudioDeviceInfo.TYPE_USB_HEADSET);
    }

    static AudioDeviceInfo preferredUsb(AudioManager am) {
        AudioDeviceInfo fallback = null;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            if (!isUsb(d)) continue;
            if (d.getType() == AudioDeviceInfo.TYPE_USB_HEADSET) return d;
            if (fallback == null) fallback = d;
        }
        return fallback;
    }

    static AudioDeviceInfo builtinMic(AudioManager am) {
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_MIC) return d;
        }
        return null;
    }

    static String describe(AudioDeviceInfo d) {
        if (d == null) return "(无)";
        String type;
        switch (d.getType()) {
            case AudioDeviceInfo.TYPE_USB_DEVICE: type = "USB_DEVICE"; break;
            case AudioDeviceInfo.TYPE_USB_HEADSET: type = "USB_HEADSET"; break;
            case AudioDeviceInfo.TYPE_BUILTIN_MIC: type = "BUILTIN_MIC"; break;
            case AudioDeviceInfo.TYPE_WIRED_HEADSET: type = "WIRED_HEADSET"; break;
            default: type = "TYPE_" + d.getType();
        }
        return type + " #" + d.getId() + " · " + d.getProductName();
    }

    static String sourceName(int source) {
        switch (source) {
            case MediaRecorder.AudioSource.UNPROCESSED: return "UNPROCESSED";
            case MediaRecorder.AudioSource.VOICE_RECOGNITION: return "VOICE_RECOGNITION";
            case MediaRecorder.AudioSource.MIC: return "MIC";
            default: return "SOURCE_" + source;
        }
    }

    /** 开录前先读 ~200ms，全零说明接收器/发射器没声音，继续尝试下一组配置。 */
    private static boolean hasSignal(AudioRecord rec) {
        short[] buffer = new short[2048];
        int frames = 0;
        int nonZero = 0;
        try {
            rec.startRecording();
            for (int i = 0; i < 4; i++) {
                int got = rec.read(buffer, 0, buffer.length);
                if (got <= 0) continue;
                frames += got;
                for (int j = 0; j < got; j++) {
                    if (buffer[j] != 0) { nonZero++; break; }
                }
            }
        } catch (Exception ignored) {
        } finally {
            try { rec.stop(); } catch (Exception ignored) {}
        }
        return frames > 0 && nonZero > 0;
    }

    /** Tries sources, rates and stereo before mono. Caller must release() the returned record. */
    static AudioRecord open(AudioDeviceInfo preferred) throws Exception {
        String errors = "";
        for (int source : SOURCES) {
            for (int sampleRate : SAMPLE_RATES) {
                // 内置麦克风通常只有单声道；强行立体声会打开成功但全是静音。
                // USB 双麦仍优先立体声，保留左右声道分离。
                int[] channelOrder = preferred == null ? new int[]{1, 2} : new int[]{2, 1};
                for (int channels : channelOrder) {
                    int mask = channels == 2 ? AudioFormat.CHANNEL_IN_STEREO : AudioFormat.CHANNEL_IN_MONO;
                    int min = AudioRecord.getMinBufferSize(sampleRate, mask, AudioFormat.ENCODING_PCM_16BIT);
                    if (min <= 0) {
                        errors += sampleRate + "/" + channels + " unsupported; ";
                        continue;
                    }
                    AudioRecord rec = null;
                    try {
                        AudioFormat format = new AudioFormat.Builder()
                                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                                .setSampleRate(sampleRate)
                                .setChannelMask(mask).build();
                        rec = new AudioRecord.Builder().setAudioSource(source)
                                .setAudioFormat(format)
                                .setBufferSizeInBytes(Math.max(min * 2, 16384)).build();
                        if (rec.getState() != AudioRecord.STATE_INITIALIZED)
                            throw new Exception("not initialized");
                        if (preferred != null && !rec.setPreferredDevice(preferred))
                            throw new Exception("cannot set preferred USB device");
                        if (!hasSignal(rec)) throw new Exception("all-zero input (mic muted/off)");
                        return rec;
                    } catch (Exception e) {
                        errors += sourceName(source) + "/" + sampleRate + "/" + channels + ": "
                                + e.getMessage() + "; ";
                        if (rec != null) rec.release();
                    }
                }
            }
        }
        throw new Exception("无法打开音频输入：" + errors);
    }
}
