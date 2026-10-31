package app.socialmate.dualmic;

/** Opposite channel-dominance in A-only and B-only samples is a candidate, never proof of isolation. */
public final class ChannelAssessment {
    private ChannelAssessment() {}
    public static String assess(double aDifferenceDb, double bDifferenceDb, int aChannels, int bChannels) {
        if (aChannels != 2 || bChannels != 2) return "MONO_OR_INCONSISTENT";
        // Both takes have signal but the two channels carry the same level: receiver is dual-mono.
        if (Math.abs(aDifferenceDb) <= 1.0 && Math.abs(bDifferenceDb) <= 1.0) return "MONO_MIX";
        if (aDifferenceDb > 6.0 && bDifferenceDb < -6.0) return "CANDIDATE_A_LEFT_B_RIGHT";
        if (aDifferenceDb < -6.0 && bDifferenceDb > 6.0) return "CANDIDATE_A_RIGHT_B_LEFT";
        return "NOT_PROVEN";
    }
}
