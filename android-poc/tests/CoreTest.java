import app.socialmate.dualmic.*;
import java.io.File;
import java.nio.file.Files;
public class CoreTest {
    private static int checks = 0;
    private static void check(boolean x, String s) {checks++; if (!x) throw new AssertionError(s);}
    private static void frame(byte[] b, int i, int l, int r) {
        int n = 4*i; b[n]=(byte)l; b[n+1]=(byte)(l>>8); b[n+2]=(byte)r; b[n+3]=(byte)(r>>8);
    }
    public static void main(String[] args) throws Exception {
        byte[] a = new byte[4000], b = new byte[4000];
        for(int i=0;i<1000;i++){frame(a,i,12000,1000);frame(b,i,1000,12000);}
        StereoAnalyzer x = new StereoAnalyzer(2), y = new StereoAnalyzer(2);
        x.add(a,0,a.length);y.add(b,0,b.length);
        check(x.frames()==1000,"frames");
        check(x.leftMinusRightDb()>6 && y.leftMinusRightDb() < -6,"opposite dominant");
        check(ChannelAssessment.assess(x.leftMinusRightDb(),y.leftMinusRightDb(),2,2).equals("CANDIDATE_A_LEFT_B_RIGHT"),"candidate");
        check(ChannelAssessment.assess(0,0,2,2).equals("MONO_MIX"),"dual-mono");
        check(ChannelAssessment.assess(4,-4,2,2).equals("NOT_PROVEN"),"weak difference");
        check(ChannelAssessment.assess(8,-8,1,2).equals("MONO_OR_INCONSISTENT"),"mono");
        boolean threw=false;try{x.add(new byte[3],0,3);}catch(IllegalArgumentException e){threw=true;}
        check(threw,"reject partial frame");
        File f = File.createTempFile("dual-mic-", ".wav");
        try {
            try(WavWriter w = new WavWriter(f,2,48000)){w.write(a,0,a.length);}
            byte[] wav = Files.readAllBytes(f.toPath());
            check(wav.length==4044,"WAV size");
            check(new String(wav,0,4,"US-ASCII").equals("RIFF"),"RIFF");
            check(new String(wav,8,4,"US-ASCII").equals("WAVE"),"WAVE");
            check((wav[22]&255)==2,"stereo");
            check((wav[40]&255)==(4000&255),"WAV payload length");
        } finally {f.delete();}
        System.out.println("PASS "+checks+" core assertions");
    }
}
