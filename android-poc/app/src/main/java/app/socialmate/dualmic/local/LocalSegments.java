package app.socialmate.dualmic.local;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 地点记录分段引擎（Android 本地版）。
 *
 * 与 Mac 端 study-blocks.mjs 保持同一组不变式：
 * 1. 句数守恒：所有块 cnSentences 之和等于原文句子总数；
 * 2. 逐字可回查：sourceText 等于 rawInput 的 sourceSpan 切片；
 * 3. 全文可复原：块间空隙按原序插回后等于 rawInput。
 *
 * 本类不调用任何 AI；缺英文时 needsTranslation=true，不编造翻译。
 */
public final class LocalSegments {
    private static final int MAX_SENTENCES_PER_BLOCK = 4;
    private static final int MAX_BLOCK_CHARS = 600 * 4;
    private static final Pattern PARAGRAPH_GAP = Pattern.compile("\\n[ \\t]*\\n");

    private LocalSegments() {}

    public static final class Result {
        public final JSONArray blocks;
        public final JSONObject stats;
        public final JSONArray warnings;
        Result(JSONArray blocks, JSONObject stats, JSONArray warnings) {
            this.blocks = blocks;
            this.stats = stats;
            this.warnings = warnings;
        }
    }

    public static Result segment(String rawInput) throws Exception {
        String text = rawInput == null ? "" : rawInput;
        if (text.trim().isEmpty()) {
            throw new LocalHttpException(400, "EMPTY_RAW_INPUT", "请先粘贴或口述内容");
        }
        if (text.length() > 20000) {
            throw new LocalHttpException(413, "RAW_INPUT_TOO_LARGE", "单条记录原文超过 20000 字符上限");
        }
        List<int[]> ranges = paragraphRanges(text);
        JSONArray blocks = new JSONArray();
        int totalSentences = 0;
        for (int[] range : ranges) {
            List<int[]> units = sentencesInRange(text, range[0], range[1]);
            totalSentences += units.size();
            for (int i = 0; i < units.size(); i += MAX_SENTENCES_PER_BLOCK) {
                List<int[]> group = units.subList(i, Math.min(units.size(), i + MAX_SENTENCES_PER_BLOCK));
                int start = group.get(0)[0];
                int end = group.get(group.size() - 1)[1];
                String sourceText = text.substring(start, end);
                if (sourceText.length() > MAX_BLOCK_CHARS) {
                    throw new LocalHttpException(413, "BLOCK_TOO_LARGE", "单个学习段过长，请先自行拆分段落");
                }
                JSONArray cn = new JSONArray();
                StringBuilder joined = new StringBuilder();
                for (int[] unit : group) {
                    String sentence = text.substring(unit[0], unit[1]);
                    cn.put(sentence);
                    joined.append(sentence);
                }
                if (!joined.toString().equals(sourceText)) {
                    throw new LocalHttpException(500, "SEGMENT_SELF_CHECK_FAILED", "分段自检失败：句子切片无法逐字覆盖原文");
                }
                JSONObject block = new JSONObject();
                block.put("blockId", "blk-" + (blocks.length() + 1) + "-" + sha256(sourceText).substring(0, 8));
                block.put("order", blocks.length());
                block.put("sourceSpan", new JSONObject().put("start", start).put("end", end));
                block.put("sourceText", sourceText);
                block.put("cnSentences", cn);
                block.put("enVariants", new JSONArray());
                block.put("phrases", new JSONArray());
                block.put("reviews", new JSONArray());
                block.put("contentRevision", 1);
                block.put("needsTranslation", true);
                block.put("originalChanged", false);
                blocks.put(block);
            }
        }
        JSONObject stats = stats(text, blocks, totalSentences);
        if (!stats.optBoolean("reassembled")) {
            throw new LocalHttpException(500, "SEGMENT_LOSS_DETECTED", "分段自检失败：复原原文不一致，已拒绝写入");
        }
        if (stats.optInt("lostSentences") > 0 || stats.optInt("duplicatedSentences") > 0) {
            throw new LocalHttpException(500, "SEGMENT_LOSS_DETECTED", "分段自检失败：句数不守恒，已拒绝写入");
        }
        JSONArray warnings = new JSONArray();
        warnings.put("EN_VARIANT_MISSING");
        return new Result(blocks, stats, warnings);
    }

    /** 校验客户端自带 blocks 是否满足同一套判据。 */
    public static JSONObject validate(String rawInput, JSONArray blocks) {
        String text = rawInput == null ? "" : rawInput;
        int expected = 0;
        for (int[] range : paragraphRanges(text)) {
            expected += sentencesInRange(text, range[0], range[1]).size();
        }
        return stats(text, blocks, expected);
    }

    private static JSONObject stats(String text, JSONArray blocks, int expectedSentences) {
        int cursor = 0;
        StringBuilder reassembled = new StringBuilder();
        boolean valid = true;
        int sentenceCount = 0;
        int duplicated = 0;
        java.util.HashSet<String> seen = new java.util.HashSet<>();
        for (int i = 0; i < blocks.length(); i++) {
            JSONObject block = blocks.optJSONObject(i);
            if (block == null) { valid = false; break; }
            JSONObject span = block.optJSONObject("sourceSpan");
            if (span == null) { valid = false; break; }
            int start = span.optInt("start", -1);
            int end = span.optInt("end", -1);
            if (start < cursor || end <= start || end > text.length()) { valid = false; break; }
            reassembled.append(text, cursor, start).append(block.optString("sourceText", ""));
            cursor = end;
            JSONArray sentences = block.optJSONArray("cnSentences");
            if (sentences != null) {
                sentenceCount += sentences.length();
                for (int j = 0; j < sentences.length(); j++) {
                    String s = sentences.optString(j, "");
                    if (!seen.add(s)) duplicated++;
                }
            }
        }
        if (valid) reassembled.append(text.substring(Math.min(cursor, text.length())));
        JSONObject out = new JSONObject();
        try {
            out.put("sentenceCount", sentenceCount);
            out.put("expectedSentences", expectedSentences);
            out.put("lostSentences", Math.max(0, expectedSentences - sentenceCount));
            out.put("duplicatedSentences", duplicated);
            out.put("blockCount", blocks.length());
            out.put("reassembled", valid && reassembled.toString().equals(text));
        } catch (Exception ignored) {}
        return out;
    }

    private static List<int[]> paragraphRanges(String text) {
        List<int[]> ranges = new ArrayList<>();
        Matcher m = PARAGRAPH_GAP.matcher(text);
        int start = 0;
        while (m.find()) {
            ranges.add(new int[]{start, m.start()});
            start = m.end();
        }
        ranges.add(new int[]{start, text.length()});
        List<int[]> out = new ArrayList<>();
        for (int[] r : ranges) {
            if (r[1] > r[0] && !text.substring(r[0], r[1]).trim().isEmpty()) out.add(r);
        }
        return out;
    }

    private static List<int[]> sentencesInRange(String text, int from, int to) {
        List<int[]> units = new ArrayList<>();
        int index = from;
        while (index < to) {
            while (index < to && Character.isWhitespace(text.charAt(index))) index++;
            if (index >= to) break;
            int start = index;
            while (index < to) {
                char ch = text.charAt(index);
                if (ch == '\n') { index++; break; }
                if (isSentenceEnd(text, index, to)) {
                    index = trailingPunctuationLimit(text, index + 1, to);
                    break;
                }
                index++;
            }
            units.add(new int[]{start, Math.min(index, to)});
        }
        for (int i = 0; i < units.size() - 1; i++) units.get(i)[1] = units.get(i + 1)[0];
        return units;
    }

    private static boolean isSentenceEnd(String text, int index, int limit) {
        char ch = text.charAt(index);
        if (ch == '。' || ch == '！' || ch == '？') return true;
        if (ch == '.' || ch == '!' || ch == '?') {
            char next = index + 1 < limit ? text.charAt(index + 1) : '\0';
            return next == '\0' || next == '\n' || Character.isWhitespace(next)
                    || next == '”' || next == '’' || next == '"' || next == '）' || next == ')';
        }
        return false;
    }

    private static int trailingPunctuationLimit(String text, int index, int limit) {
        int cursor = index;
        while (cursor < limit) {
            char ch = text.charAt(cursor);
            if (ch == '”' || ch == '’' || ch == '"' || ch == '）' || ch == ')') cursor++;
            else break;
        }
        return cursor;
    }

    static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}