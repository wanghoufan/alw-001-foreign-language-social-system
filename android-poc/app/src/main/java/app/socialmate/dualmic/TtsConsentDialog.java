package app.socialmate.dualmic;

import android.app.Activity;
import android.app.AlertDialog;

import org.json.JSONObject;

import java.util.Locale;

/**
 * 真实云 TTS 的显式同意弹窗：只展示「发给谁、发什么、多少钱」，用户点确认后才调用
 * {@link TtsPlaybackController#confirmConsent()}；取消不会发送任何文本。
 *
 * 该弹窗同时用于主界面（WebView 宿主）和自测/设置页，避免两套文案分叉。
 */
public final class TtsConsentDialog {

    private TtsConsentDialog() {
    }

    public static void show(Activity activity, TtsPlaybackController controller, JSONObject event) {
        if (activity == null || activity.isFinishing() || controller == null || event == null) return;
        JSONObject quote = event.optJSONObject("quote");
        if (quote == null) return;

        String provider = quote.optString("providerId", "aws-polly");
        String region = quote.optString("region", "未配置");
        String engine = quote.optString("engine", "unknown");
        int chars = quote.optInt("charCount", 0);
        double cost = quote.optDouble("estimatedCostCny", 0);
        String excerpt = quote.optString("willTransmitTextExcerpt", "");
        boolean configured = quote.optBoolean("configured", false);

        String message = "把这段学习文本发送给第三方 TTS 朗读？\n\n"
                + "服务商：" + ("aws-polly".equals(provider) ? "Amazon Polly" : provider) + "\n"
                + "区域：" + region + "\n"
                + "声线引擎：" + engine + "\n"
                + "字符数：" + chars + "\n"
                + "预计费用：¥" + String.format(Locale.US, "%.6f", cost) + "\n"
                + "将发送的摘录：" + (excerpt.isEmpty() ? "（无）" : excerpt) + "\n\n"
                + (configured
                    ? "确认后会发起一次真实合成请求；本次只对这一段生效。"
                    : "当前 AWS 尚未配置：确认后只会返回 PROVIDER_NOT_CONFIGURED，不会产生费用。");

        new AlertDialog.Builder(activity)
                .setTitle("发送到 Amazon Polly？")
                .setMessage(message)
                .setNegativeButton("取消", (dialog, which) -> controller.cancelConsent())
                .setPositiveButton("同意并朗读", (dialog, which) -> controller.confirmConsent())
                .setCancelable(true)
                .show();
    }
}