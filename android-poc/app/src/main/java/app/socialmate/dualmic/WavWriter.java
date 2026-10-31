package app.socialmate.dualmic;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;

/** Seekable 16-bit LE PCM WAV writer. */
public final class WavWriter implements AutoCloseable {
    private final RandomAccessFile out;
    private final int channels;
    private final int sampleRate;
    private long count;
    private boolean closed;
    public WavWriter(File file, int channels, int sampleRate) throws IOException {
        if ((channels != 1 && channels != 2) || sampleRate <= 0) throw new IllegalArgumentException("format");
        this.channels = channels; this.sampleRate = sampleRate;
        out = new RandomAccessFile(file, "rw");
        out.setLength(0);
        out.write(new byte[44]);
    }
    public void write(byte[] pcm, int offset, int length) throws IOException {
        if (closed) throw new IOException("closed");
        if (length % (2 * channels) != 0) throw new IOException("partial frame");
        out.write(pcm, offset, length);
        count += length;
    }
    private void u16(int n) throws IOException { out.writeByte(n & 255); out.writeByte((n >>> 8) & 255); }
    private void u32(long n) throws IOException {
        out.writeByte((int) n & 255); out.writeByte((int)(n >>> 8) & 255);
        out.writeByte((int)(n >>> 16) & 255); out.writeByte((int)(n >>> 24) & 255);
    }
    @Override public void close() throws IOException {
        if (closed) return;
        closed = true;
        try {
            if (count > 0xffffffffL - 36) throw new IOException("WAV exceeds RIFF limit");
            out.seek(0);
            out.writeBytes("RIFF"); u32(36 + count);
            out.writeBytes("WAVE"); out.writeBytes("fmt "); u32(16);
            u16(1); u16(channels); u32(sampleRate); u32(sampleRate * channels * 2L);
            u16(channels * 2); u16(16);
            out.writeBytes("data"); u32(count);
        } finally { out.close(); }
    }
}
