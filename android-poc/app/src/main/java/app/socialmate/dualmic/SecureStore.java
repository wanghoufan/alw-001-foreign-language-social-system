package app.socialmate.dualmic;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * 用 Android Keystore 里不可导出的 AES-256-GCM 密钥加解密小段敏感值。
 *
 * 与 EncryptedSharedPreferences 目的相同（Keystore 保护主密钥、密文落普通存储），
 * 但不引入额外依赖；密钥永不离开 TEE/Keystore，root 之外无法导出。
 * 只用于设备配对密钥这种几十字节的东西，不用于大文件。
 */
public final class SecureStore {
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "sm_pairing_aes_v1";
    private static final String PREFS = "socialmate-secure";
    private static final String TRANSFORM = "AES/GCM/NoPadding";
    private static final int TAG_BITS = 128;

    private final SharedPreferences prefs;

    public SecureStore(Context context) {
        this.prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance(ANDROID_KEYSTORE);
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) {
            return (SecretKey) store.getKey(KEY_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    /** 写入（空值视为删除）。失败时返回 false，调用方必须按「未配对」处理。 */
    public boolean put(String name, String value) {
        if (value == null || value.isEmpty()) {
            prefs.edit().remove(name).apply();
            return true;
        }
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] body = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String packed = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
                    + Base64.encodeToString(body, Base64.NO_WRAP);
            return prefs.edit().putString(name, packed).commit();
        } catch (Exception e) {
            return false;
        }
    }

    /** 读取；解不开（换机、清 Keystore、篡改）一律返回空串，绝不返回半份数据。 */
    public String get(String name) {
        String packed = prefs.getString(name, "");
        if (packed == null || packed.isEmpty()) return "";
        int split = packed.indexOf(':');
        if (split <= 0) return "";
        try {
            byte[] iv = Base64.decode(packed.substring(0, split), Base64.NO_WRAP);
            byte[] body = Base64.decode(packed.substring(split + 1), Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(body), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    public void remove(String name) {
        prefs.edit().remove(name).apply();
    }
}
