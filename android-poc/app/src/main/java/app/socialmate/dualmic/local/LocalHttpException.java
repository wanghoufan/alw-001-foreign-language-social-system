package app.socialmate.dualmic.local;

/** 本地服务的可预期错误：status/code 直接回给页面，message 是用户可读中文。 */
public class LocalHttpException extends Exception {
    public final int status;
    public final String code;

    public LocalHttpException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}