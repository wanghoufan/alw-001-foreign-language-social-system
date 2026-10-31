package app.socialmate.dualmic;

/** Streaming PCM16 little-endian RMS analyser. The caller supplies complete interleaved frames. */
public final class StereoAnalyzer {
    private final int channels;
    private final double[] sumSquares;
    private long frames;
    private long clippedSamples;
    public StereoAnalyzer(int channels) {
        if (channels != 1 && channels != 2) throw new IllegalArgumentException("channels 1 or 2");
        this.channels = channels;
        sumSquares = new double[channels];
    }
    public void add(byte[] pcm, int offset, int length) {
        if (offset < 0 || length < 0 || offset + length > pcm.length) throw new IllegalArgumentException("range");
        int frameBytes = channels * 2;
        if (length % frameBytes != 0) throw new IllegalArgumentException("partial frame");
        for (int p = offset, end = offset + length; p < end; p += frameBytes) {
            for (int ch = 0; ch < channels; ch++) {
                int n = p + ch * 2;
                short s = (short) ((pcm[n] & 0xff) | (pcm[n + 1] << 8));
                double v = s / 32768.0;
                sumSquares[ch] += v * v;
                if (Math.abs((int) s) >= 32760) clippedSamples++;
            }
            frames++;
        }
    }
    public long frames() { return frames; }
    public long clippedSamples() { return clippedSamples; }
    public int channels() { return channels; }
    public double rms(int ch) {
        if (ch < 0 || ch >= channels) throw new IllegalArgumentException("channel");
        return frames == 0 ? 0 : Math.sqrt(sumSquares[ch] / frames);
    }
    public double dbfs(int ch) { return 20 * Math.log10(Math.max(rms(ch), 1e-9)); }
    public double leftMinusRightDb() { return channels == 2 ? dbfs(0) - dbfs(1) : 0; }
}
