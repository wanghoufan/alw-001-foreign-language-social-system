package app.socialmate.dualmic.local;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * 本机私人备份包：AES-256-GCM 加密（默认）+ 兼容旧未加密 ZIP。
 *
 * 加密格式（.smbak）：
 *   magic "SMBK1" | salt 16B | iv 12B | GCM ciphertext（内含 128-bit tag）
 * 明文内容与旧格式一致：
 *   backup.json             —— LocalStore.exportBackup() 的完整数据快照
 *   media/<cardId>/<file>   —— 私有卡片图片原文件
 *
 * 口令不存储；PBKDF2WithHmacSHA256 120000 次派生 256-bit key。
 * 不打包密钥、令牌、录音原文。
 */
public final class LocalBackup {
    private static final long MAX_UNZIPPED_BYTES = 200L * 1024 * 1024;
    private static final int MAX_ENTRIES = 5000;
    private static final byte[] MAGIC = {'S', 'M', 'B', 'K', '1'};
    private static final int SALT_BYTES = 16;
    private static final int IV_BYTES = 12;
    private static final int ITERATIONS = 120_000;

    private LocalBackup() {}

    public static void exportTo(LocalStore store, OutputStream out, String password) throws Exception {
        ByteArrayOutputStream zipBytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(zipBytes)) {
            JSONObject backup = store.exportBackup();
            zip.putNextEntry(new ZipEntry("backup.json"));
            zip.write(backup.toString(2).getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            List<String[]> media = store.allCardMedia();
            for (String[] pair : media) {
                File file = store.mediaPath(pair[0], pair[1]);
                if (file == null || !file.exists() || !file.isFile()) continue;
                zip.putNextEntry(new ZipEntry("media/" + pair[0] + "/" + pair[1]));
                try (InputStream in = new FileInputStream(file)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) zip.write(buf, 0, n);
                }
                zip.closeEntry();
            }
            // 已获留存同意的会话原文（archive/exported）；quarantine 不打包。
            File archiveDir = new File(store.appFilesDir(), "archive/exported");
            File[] archiveFiles = archiveDir.listFiles();
            if (archiveFiles != null) {
                for (File file : archiveFiles) {
                    if (!file.isFile() || !file.getName().endsWith(".json")) continue;
                    zip.putNextEntry(new ZipEntry("archive/exported/" + file.getName()));
                    try (InputStream in = new FileInputStream(file)) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) > 0) zip.write(buf, 0, n);
                    }
                    zip.closeEntry();
                }
            }
        }
        String secret = password == null ? "" : password;
        if (secret.trim().isEmpty()) {
            // 明确允许非加密导出，但页面默认要求口令；这里保留兼容路径。
            out.write(zipBytes.toByteArray());
            out.flush();
            return;
        }
        byte[] encrypted = encrypt(zipBytes.toByteArray(), secret);
        out.write(encrypted);
        out.flush();
    }

    public static JSONObject importFrom(LocalStore store, InputStream rawIn, File workDir, String password) throws Exception {
        byte[] all = readAll(rawIn);
        byte[] zipBytes;
        if (all.length >= MAGIC.length && startsWith(all, MAGIC)) {
            String secret = password == null ? "" : password;
            if (secret.trim().isEmpty()) {
                throw new LocalHttpException(400, "BACKUP_PASSWORD_REQUIRED", "这是加密备份，请输入导出时设置的口令");
            }
            zipBytes = decrypt(all, secret);
        } else if (all.length >= 2 && all[0] == 'P' && all[1] == 'K') {
            // 兼容 0.9.2 早期未加密 ZIP。
            zipBytes = all;
        } else {
            throw new LocalHttpException(400, "BACKUP_INVALID", "不是 SocialMate 备份文件");
        }
        return importZip(store, new ByteArrayInputStream(zipBytes), workDir);
    }

    private static JSONObject importZip(LocalStore store, InputStream zipInput, File workDir) throws Exception {
        File tmp = new File(workDir, "import-" + System.currentTimeMillis());
        if (!tmp.exists() && !tmp.mkdirs()) throw new Exception("无法创建临时目录");
        long total = 0;
        int entries = 0;
        try (ZipInputStream zip = new ZipInputStream(zipInput)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > MAX_ENTRIES) throw new LocalHttpException(413, "BACKUP_TOO_MANY_ENTRIES", "备份条目过多");
                String name = entry.getName();
                if (name.contains("..") || name.startsWith("/")) continue;
                if (!name.equals("backup.json") && !name.startsWith("media/") && !name.startsWith("archive/exported/")) continue;
                File target = new File(tmp, name);
                File parent = target.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) continue;
                try (OutputStream out = new FileOutputStream(target)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = zip.read(buf)) > 0) {
                        total += n;
                        if (total > MAX_UNZIPPED_BYTES) {
                            throw new LocalHttpException(413, "BACKUP_TOO_LARGE", "备份解压后超过 200MB 上限");
                        }
                        out.write(buf, 0, n);
                    }
                }
            }
        }
        File backupFile = new File(tmp, "backup.json");
        if (!backupFile.exists()) throw new LocalHttpException(400, "BACKUP_INVALID", "备份缺少 backup.json");
        JSONObject root = new JSONObject(new String(readAll(new FileInputStream(backupFile)), StandardCharsets.UTF_8));
        JSONObject result = store.importBackup(root, false);

        File mediaRoot = new File(tmp, "media");
        int mediaCount = 0;
        File[] cardDirs = mediaRoot.listFiles();
        if (cardDirs != null) {
            for (File cardDir : cardDirs) {
                if (!cardDir.isDirectory()) continue;
                File[] files = cardDir.listFiles();
                if (files == null) continue;
                for (File file : files) {
                    if (!file.isFile()) continue;
                    String mime = file.getName().toLowerCase().endsWith(".png") ? "image/png"
                            : file.getName().toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg";
                    store.importMediaBytes(cardDir.getName(), file.getName(),
                            readAll(new FileInputStream(file)), mime);
                    mediaCount++;
                }
            }
        }
        result.put("media", mediaCount);
        int archiveCount = 0;
        File archiveTmp = new File(tmp, "archive/exported");
        File[] archiveFiles = archiveTmp.listFiles();
        if (archiveFiles != null) {
            File exportedDir = new File(store.appFilesDir(), "archive/exported");
            File importedDir = new File(store.appFilesDir(), "archive/imported");
            if (!importedDir.exists()) //noinspection ResultOfMethodCallIgnored
                importedDir.mkdirs();
            for (File file : archiveFiles) {
                if (!file.isFile() || !file.getName().endsWith(".json")) continue;
                // 本机已有同名原文（exported 或之前导入）时跳过，避免恢复出重复副本。
                if (new File(exportedDir, file.getName()).exists()) continue;
                File target = new File(importedDir, file.getName());
                if (target.exists()) continue;
                try (InputStream in = new FileInputStream(file);
                     OutputStream out = new FileOutputStream(target)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                archiveCount++;
            }
        }
        result.put("archive", archiveCount);
        return result;
    }

    private static byte[] encrypt(byte[] plain, String password) throws Exception {
        byte[] salt = new byte[SALT_BYTES];
        byte[] iv = new byte[IV_BYTES];
        SecureRandom random = new SecureRandom();
        random.nextBytes(salt);
        random.nextBytes(iv);
        SecretKeySpec key = deriveKey(password, salt);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
        byte[] ciphertext = cipher.doFinal(plain);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(MAGIC);
        out.write(salt);
        out.write(iv);
        out.write(ciphertext);
        return out.toByteArray();
    }

    private static byte[] decrypt(byte[] packed, String password) throws Exception {
        if (packed.length < MAGIC.length + SALT_BYTES + IV_BYTES + 16) {
            throw new LocalHttpException(400, "BACKUP_INVALID", "备份文件过短或已损坏");
        }
        int offset = MAGIC.length;
        byte[] salt = new byte[SALT_BYTES];
        byte[] iv = new byte[IV_BYTES];
        System.arraycopy(packed, offset, salt, 0, SALT_BYTES);
        offset += SALT_BYTES;
        System.arraycopy(packed, offset, iv, 0, IV_BYTES);
        offset += IV_BYTES;
        byte[] ciphertext = new byte[packed.length - offset];
        System.arraycopy(packed, offset, ciphertext, 0, ciphertext.length);
        SecretKeySpec key = deriveKey(password, salt);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
        try {
            return cipher.doFinal(ciphertext);
        } catch (Exception e) {
            throw new LocalHttpException(400, "BACKUP_PASSWORD_INVALID", "口令错误，或备份文件已损坏");
        }
    }

    private static SecretKeySpec deriveKey(String password, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, ITERATIONS, 256);
        try {
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            byte[] key = factory.generateSecret(spec).getEncoded();
            return new SecretKeySpec(key, "AES");
        } finally {
            spec.clearPassword();
        }
    }

    private static boolean startsWith(byte[] bytes, byte[] prefix) {
        if (bytes.length < prefix.length) return false;
        for (int i = 0; i < prefix.length; i++) if (bytes[i] != prefix[i]) return false;
        return true;
    }

    private static byte[] readAll(InputStream in) throws Exception {
        try (InputStream input = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = input.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }
}