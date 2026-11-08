package app.socialmate.dualmic.local;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * 手机本地真源（SQLite）。
 *
 * 设计原则：
 * 1. 文档式存储：表格主键 + 完整 JSON 快照，字段结构与 Mac 私有服务保持一致，
 *    页面不需要区分数据来自手机还是 Mac。
 * 2. 单一写入入口：所有写操作 synchronized + 事务，写完记 sync_log，供局域网同步。
 * 3. 软删优先：卡片删除进 deleted_at 墓碑，恢复不清真源。
 * 4. 不存密钥：只存业务数据；设备令牌由 SecureStore 管理，与本库无关。
 */
public final class LocalStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "socialmate_local.db";
    private static final int DB_VERSION = 1;
    private static volatile LocalStore instance;

    private final Context appContext;
    private final File mediaRoot;

    public static LocalStore get(Context context) {
        if (instance == null) {
            synchronized (LocalStore.class) {
                if (instance == null) instance = new LocalStore(context.getApplicationContext());
            }
        }
        return instance;
    }

    private LocalStore(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
        this.appContext = context;
        this.mediaRoot = new File(context.getFilesDir(), "local-media");
        if (!mediaRoot.exists()) //noinspection ResultOfMethodCallIgnored
            mediaRoot.mkdirs();
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS people (slug TEXT PRIMARY KEY, list_json TEXT, detail_json TEXT, created_at TEXT, updated_at TEXT, dirty INTEGER DEFAULT 1)");
        db.execSQL("CREATE TABLE IF NOT EXISTS cards (kind TEXT, id TEXT, json TEXT, revision INTEGER, deleted_at TEXT, updated_at TEXT, dirty INTEGER DEFAULT 1, PRIMARY KEY(kind,id))");
        db.execSQL("CREATE TABLE IF NOT EXISTS card_overrides (kind TEXT, id TEXT, json TEXT, revision INTEGER, updated_at TEXT, PRIMARY KEY(kind,id))");
        db.execSQL("CREATE TABLE IF NOT EXISTS card_media (card_id TEXT, media_id TEXT, file TEXT, mime TEXT, bytes INTEGER, sha256 TEXT, PRIMARY KEY(card_id, media_id))");
        db.execSQL("CREATE TABLE IF NOT EXISTS favorites (id TEXT PRIMARY KEY, en_norm TEXT UNIQUE, json TEXT, created_at TEXT, dirty INTEGER DEFAULT 1)");
        db.execSQL("CREATE TABLE IF NOT EXISTS private_places (id TEXT PRIMARY KEY, json TEXT, revision INTEGER, updated_at TEXT, dirty INTEGER DEFAULT 1)");
        db.execSQL("CREATE TABLE IF NOT EXISTS place_records (place_id TEXT, record_id TEXT, json TEXT, revision INTEGER, updated_at TEXT, dirty INTEGER DEFAULT 1, PRIMARY KEY(place_id, record_id))");
        db.execSQL("CREATE TABLE IF NOT EXISTS practice_reports (report_id TEXT PRIMARY KEY, place_id TEXT, record_id TEXT, block_id TEXT, json TEXT, updated_at TEXT, dirty INTEGER DEFAULT 1)");
        db.execSQL("CREATE TABLE IF NOT EXISTS prefs (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT, updated_at TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS manual_drafts (draft_id TEXT PRIMARY KEY, slug TEXT, batch_id TEXT, raw_input TEXT, items_json TEXT, created_at TEXT, deleted_at TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS sync_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, action TEXT, entity TEXT, entity_id TEXT, detail TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // V1.7 起 schema 1 为起点；后续变更在此按版本增量迁移，不 drop 用户数据。
    }

    /* ============================== 人物 ============================== */

    public synchronized JSONObject peopleList() throws Exception {
        SQLiteDatabase db = getReadableDatabase();
        List<JSONObject> rows = new ArrayList<>();
        try (Cursor c = db.rawQuery("SELECT list_json, detail_json FROM people ORDER BY updated_at DESC", null)) {
            while (c.moveToNext()) {
                String detailRaw = c.getString(1);
                JSONObject detail = detailRaw == null ? null : new JSONObject(detailRaw);
                JSONObject item = detail == null ? new JSONObject() : summaryOf(detail);
                if (item.length() == 0 && c.getString(0) != null) item = new JSONObject(c.getString(0));
                rows.add(item);
            }
        }
        JSONArray people = new JSONArray();
        for (JSONObject row : rows) people.put(row);
        return new JSONObject().put("ok", true).put("people", people).put("source", "local");
    }

    public synchronized boolean personExists(String slug) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT 1 FROM people WHERE slug=? LIMIT 1", new String[]{slug})) {
            return c.moveToNext();
        }
    }

    public synchronized JSONObject personDetail(String slug) throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT detail_json FROM people WHERE slug=?", new String[]{slug})) {
            if (!c.moveToNext() || c.getString(0) == null) {
                throw new LocalHttpException(404, "PERSON_NOT_FOUND", "人物不存在");
            }
            return new JSONObject().put("ok", true).put("person", new JSONObject(c.getString(0)));
        }
    }

    public synchronized JSONObject personPrep(String slug) throws Exception {
        JSONObject person = personDetail(slug).getJSONObject("person");
        JSONArray confirmed = person.optJSONArray("confirmed");
        JSONArray items = new JSONArray();
        if (confirmed != null) {
            for (int i = confirmed.length() - 1; i >= 0 && items.length() < 3; i--) {
                String text = confirmed.optJSONObject(i) == null ? "" : confirmed.optJSONObject(i).optString("text", "");
                if (!text.isEmpty()) items.put(new JSONObject().put("en", "").put("zh", text).put("source", "local"));
            }
        }
        return new JSONObject().put("ok", true).put("items", items).put("empty", items.length() == 0);
    }

    public synchronized JSONObject createPerson(String slug, String name, String note) throws Exception {
        String s = slug == null ? "" : slug.trim();
        if (!s.matches("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$") || s.contains("..")) {
            throw new LocalHttpException(400, "INVALID_PERSON_SLUG", "人物标识不合法");
        }
        if (personExists(s)) {
            JSONObject existing = personDetail(s).getJSONObject("person");
            return new JSONObject().put("ok", true).put("created", false).put("existing", true).put("person", existing);
        }
        String now = now();
        JSONObject detail = new JSONObject()
                .put("slug", s)
                .put("name", name == null ? s : name.trim())
                .put("note", note == null ? "" : note.trim())
                .put("lastContact", JSONObject.NULL)
                .put("confirmed", new JSONArray())
                .put("manual", new JSONArray())
                .put("sessions", new JSONArray())
                .put("profileSections", new JSONArray())
                .put("createdAt", now)
                .put("updatedAt", now);
        writePerson(s, detail, now);
        return new JSONObject().put("ok", true).put("created", true).put("person", summaryOf(detail));
    }

    public synchronized JSONObject slugSuggest(String name) throws Exception {
        String base = latinBase(name);
        if (base.isEmpty()) base = "person-" + today() + "-" + hex(2);
        if (!personExists(base)) {
            return new JSONObject().put("ok", true).put("slug", base).put("available", true);
        }
        String alt = base;
        for (int i = 2; i < 100; i++) {
            alt = base + "-" + i;
            if (alt.length() > 48) alt = alt.substring(0, 46) + "-" + i;
            if (!personExists(alt)) break;
        }
        return new JSONObject().put("ok", true).put("slug", base).put("available", false)
                .put("alternative", alt);
    }

    public synchronized JSONObject revokeFact(String slug, String factId) throws Exception {
        JSONObject person = personDetail(slug).getJSONObject("person");
        JSONArray confirmed = person.optJSONArray("confirmed");
        if (confirmed == null) confirmed = new JSONArray();
        boolean removed = false;
        JSONArray next = new JSONArray();
        for (int i = 0; i < confirmed.length(); i++) {
            JSONObject row = confirmed.optJSONObject(i);
            if (row != null && factId.equals(row.optString("id", ""))) {
                removed = true;
                continue;
            }
            if (row != null) next.put(row);
        }
        if (!removed) return new JSONObject().put("ok", true).put("alreadyRemoved", true);
        person.put("confirmed", next);
        person.put("profileSections", sectionsFrom(next));
        touchPerson(slug, person);
        return new JSONObject().put("ok", true).put("removed", true).put("factId", factId);
    }

    public synchronized JSONObject saveManualDraft(String slug, String rawInput, String batchId) throws Exception {
        // 纯本地规则拆分：按空行优先，其次按句号/问号/感叹号；不做任何 AI 推断。
        String raw = rawInput == null ? "" : rawInput.trim();
        if (raw.isEmpty()) throw new LocalHttpException(400, "EMPTY_RAW_INPUT", "请先写一些内容");
        if (raw.length() > 12000) throw new LocalHttpException(413, "RAW_INPUT_TOO_LARGE", "内容太长，请分次补充");
        String draftId = "draft-" + hex(6);
        String batch = batchId == null || batchId.isEmpty() ? "batch-" + today() + "-" + hex(3) : batchId;
        JSONArray items = new JSONArray();
        String[] chunks = raw.split("\\n\\s*\\n|(?<=[。！？!?])\\s*");
        for (String chunk : chunks) {
            String text = chunk.trim();
            if (text.length() < 2) continue;
            JSONObject item = new JSONObject().put("text", text.substring(0, Math.min(text.length(), 300)))
                    .put("section", classifySection(text));
            items.put(item);
            if (items.length() >= 40) break;
        }
        JSONObject draft = new JSONObject().put("draftId", draftId).put("batchId", batch)
                .put("slug", slug).put("rawInput", raw).put("items", items).put("createdAt", now());
        ContentValues cv = new ContentValues();
        cv.put("draft_id", draftId);
        cv.put("slug", slug);
        cv.put("batch_id", batch);
        cv.put("raw_input", raw);
        cv.put("items_json", items.toString());
        cv.put("created_at", now());
        getWritableDatabase().insertWithOnConflict("manual_drafts", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        return new JSONObject().put("ok", true).put("draftId", draftId).put("batchId", batch)
                .put("items", items).put("segmentedBy", "local_rules");
    }

    public synchronized JSONObject confirmFacts(String slug, String draftId, JSONArray items) throws Exception {
        JSONObject person = personDetail(slug).getJSONObject("person");
        JSONArray confirmed = person.optJSONArray("confirmed");
        if (confirmed == null) confirmed = new JSONArray();
        int applied = 0;
        String now = now();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            String text = item.optString("text", "").trim();
            if (text.isEmpty()) continue;
            boolean duplicated = false;
            for (int j = 0; j < confirmed.length(); j++) {
                JSONObject row = confirmed.optJSONObject(j);
                if (row != null && text.equals(row.optString("text", ""))) { duplicated = true; break; }
            }
            if (duplicated) continue;
            confirmed.put(new JSONObject()
                    .put("id", hex3())
                    .put("text", text.substring(0, Math.min(text.length(), 300)))
                    .put("section", item.optString("section", classifySection(text)))
                    .put("source", "manual_text")
                    .put("draftId", draftId == null ? "" : draftId)
                    .put("createdAt", now));
            applied++;
        }
        person.put("confirmed", confirmed);
        person.put("profileSections", sectionsFrom(confirmed));
        touchPerson(slug, person);
        if (draftId != null && !draftId.isEmpty()) {
            ContentValues del = new ContentValues();
            del.put("deleted_at", now);
            getWritableDatabase().update("manual_drafts", del, "draft_id=?", new String[]{draftId});
        }
        return new JSONObject().put("ok", true).put("applied", applied).put("person", summaryOf(person));
    }

    /* ============================== 收藏 ============================== */

    public synchronized JSONObject listFavorites() throws Exception {
        JSONArray items = new JSONArray();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT json FROM favorites ORDER BY created_at DESC", null)) {
            while (c.moveToNext()) items.put(new JSONObject(c.getString(0)));
        }
        return new JSONObject().put("ok", true).put("items", items).put("total", items.length()).put("limit", 500);
    }

    public synchronized JSONObject addFavorite(JSONObject body) throws Exception {
        String en = body.optString("en", "").trim();
        if (en.isEmpty()) throw new LocalHttpException(400, "EMPTY_EN", "英文表达不能为空");
        if (en.length() > 300) throw new LocalHttpException(400, "EN_TOO_LONG", "英文表达过长");
        String norm = en.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
        JSONObject duplicate = findByNorm(norm);
        if (duplicate != null) {
            return new JSONObject().put("ok", true).put("duplicate", true).put("item", duplicate);
        }
        int count = 0;
        try (Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM favorites", null)) {
            if (c.moveToNext()) count = c.getInt(0);
        }
        if (count >= 500) throw new LocalHttpException(429, "FAVORITES_LIMIT", "收藏已达 500 条上限");
        String id = "fav-" + sha1(norm).substring(0, 10);
        JSONObject item = new JSONObject()
                .put("id", id).put("en", en).put("zh", body.optString("zh", ""))
                .put("source", body.optString("source", ""))
                .put("personSlug", body.optString("personSlug", ""))
                .put("createdAt", now());
        if (!body.optString("personSlug", "").isEmpty()) item.put("personSlug", body.optString("personSlug"));
        ContentValues cv = new ContentValues();
        cv.put("id", id);
        cv.put("en_norm", norm);
        cv.put("json", item.toString());
        cv.put("created_at", item.optString("createdAt"));
        getWritableDatabase().insertWithOnConflict("favorites", null, cv, SQLiteDatabase.CONFLICT_IGNORE);
        log("favorite.add", "favorites", id, null);
        return new JSONObject().put("ok", true).put("duplicate", false).put("item", item)
                .put("total", count + 1).put("limit", 500);
    }

    public synchronized JSONObject removeFavorite(String id) throws Exception {
        JSONObject existing = null;
        try (Cursor c = getReadableDatabase().rawQuery("SELECT json FROM favorites WHERE id=?", new String[]{id})) {
            if (c.moveToNext()) existing = new JSONObject(c.getString(0));
        }
        if (existing == null) throw new LocalHttpException(404, "FAVORITE_NOT_FOUND", "收藏不存在");
        getWritableDatabase().delete("favorites", "id=?", new String[]{id});
        log("favorite.remove", "favorites", id, null);
        return new JSONObject().put("ok", true).put("removed", true).put("item", existing);
    }

    private JSONObject findByNorm(String norm) throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT json FROM favorites WHERE en_norm=?", new String[]{norm})) {
            return c.moveToNext() ? new JSONObject(c.getString(0)) : null;
        }
    }

    /* ============================== 卡片 ============================== */

    public synchronized JSONObject listCards(String kind, boolean includeDeleted) throws Exception {
        assertKind(kind);
        JSONArray cards = new JSONArray();
        String where = includeDeleted ? "kind=?" : "kind=? AND deleted_at IS NULL";
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT json FROM cards WHERE " + where + " ORDER BY updated_at DESC", new String[]{kind})) {
            while (c.moveToNext()) cards.put(new JSONObject(c.getString(0)));
        }
        return new JSONObject().put("ok", true).put("kind", kind).put("count", cards.length()).put("cards", cards);
    }

    public synchronized JSONObject getCard(String kind, String id) throws Exception {
        JSONObject card = readCard(kind, id);
        if (card == null) throw new LocalHttpException(404, "CARD_NOT_FOUND", "卡片不存在");
        JSONObject override = readOverride(kind, id);
        return new JSONObject().put("ok", true).put("card", card)
                .put("override", override == null ? JSONObject.NULL : override);
    }

    public synchronized JSONObject createCard(JSONObject body) throws Exception {
        String kind = body.optString("kind", "");
        assertKind(kind);
        String base = body.optString("id", "");
        if (base.isEmpty()) {
            String seed = kind.equals("place") ? body.optString("cnName", body.optString("enName", body.optString("cn", "card")))
                    : body.optString("title", body.optString("cn", body.optString("en", "card")));
            base = (kind.equals("place") ? "pv-" : "") + slugify(seed);
        }
        if (!base.matches("^[a-z0-9][a-z0-9-]{0,63}$")) {
            base = slugify(base.isEmpty() ? "card" : base);
            if (base.isEmpty()) base = "card";
        }
        if (readCard(kind, base) != null || readTrashed(kind, base) != null) {
            if (!body.optString("id", "").isEmpty()) {
                throw new LocalHttpException(409, "CARD_EXISTS", "同 id 卡片已存在");
            }
            String stem = base.length() > 56 ? base.substring(0, 56) : base;
            int n = 2;
            while (readCard(kind, stem + "-" + n) != null || readTrashed(kind, stem + "-" + n) != null) n++;
            base = stem + "-" + n;
        }
        String now = now();
        JSONObject card = normalizeCard(kind, body, null, base, now);
        card.put("revision", 1);
        card.put("createdAt", now);
        card.put("updatedAt", now);
        writeCard(card);
        return new JSONObject().put("ok", true).put("card", card).put("realPlacesUntouched", true);
    }

    public synchronized JSONObject updateCard(String kind, String id, JSONObject body) throws Exception {
        JSONObject current = readCard(kind, id);
        if (current == null) throw new LocalHttpException(404, "CARD_NOT_FOUND", "卡片不存在");
        if (!body.has("revision") || body.isNull("revision")) {
            throw new LocalHttpException(400, "REVISION_REQUIRED", "修改卡片必须带当前 revision");
        }
        if (body.optInt("revision") != current.optInt("revision")) {
            JSONObject conflict = new JSONObject().put("ok", false)
                    .put("code", "REVISION_CONFLICT").put("error", "卡片已被其他窗口修改，请刷新后再改")
                    .put("currentRevision", current.optInt("revision"));
            throw new LocalHttpException(409, "REVISION_CONFLICT", conflict.optString("error"));
        }
        JSONObject patch = body.optJSONObject("patch");
        if (patch == null) patch = body;
        JSONObject next = normalizeCard(kind, patch, current, id, now());
        next.put("revision", current.optInt("revision") + 1);
        next.put("createdAt", current.optString("createdAt", now()));
        next.put("updatedAt", now());
        next.put("media", current.optJSONArray("media") == null ? new JSONArray() : current.optJSONArray("media"));
        next.put("coverMediaId", current.optString("coverMediaId", ""));
        next.put("deletedAt", JSONObject.NULL);
        writeCard(next);
        return new JSONObject().put("ok", true).put("card", next);
    }

    public synchronized JSONObject softDeleteCard(String kind, String id) throws Exception {
        JSONObject current = readCard(kind, id);
        if (current == null) throw new LocalHttpException(404, "CARD_NOT_FOUND", "卡片不存在");
        current.put("deletedAt", now());
        current.put("revision", current.optInt("revision") + 1);
        current.put("updatedAt", now());
        writeCard(current);
        return new JSONObject().put("ok", true).put("card", current).put("trashed", true);
    }

    public synchronized JSONObject restoreCard(String kind, String id) throws Exception {
        JSONObject trashed = readTrashed(kind, id);
        if (trashed == null) throw new LocalHttpException(404, "TRASH_NOT_FOUND", "回收站里没有这张卡片");
        if (readCard(kind, id) != null) {
            throw new LocalHttpException(409, "RESTORE_CONFLICT", "同 id 卡片已存在，未覆盖");
        }
        trashed.remove("deletedAt");
        trashed.put("deletedAt", JSONObject.NULL);
        trashed.put("revision", trashed.optInt("revision") + 1);
        trashed.put("updatedAt", now());
        writeCard(trashed);
        return new JSONObject().put("ok", true).put("card", trashed).put("restored", true);
    }

    public synchronized JSONObject addCardMedia(String kind, String id, String base64, String mime) throws Exception {
        JSONObject card = readCard(kind, id);
        if (card == null) throw new LocalHttpException(404, "CARD_NOT_FOUND", "卡片不存在");
        JSONArray media = card.optJSONArray("media");
        if (media == null) media = new JSONArray();
        if (media.length() >= 12) throw new LocalHttpException(429, "MEDIA_LIMIT", "每张卡片最多 12 张图片");
        final int maxBytes = 6 * 1024 * 1024;
        String data = base64 == null ? "" : base64.replaceAll("\\s+", "");
        if (data.isEmpty() || data.length() > Math.ceil(maxBytes * 4.0 / 3.0) + 64) {
            throw new LocalHttpException(400, "MEDIA_INVALID", "图片数据非法或过大");
        }
        byte[] bytes;
        try {
            bytes = android.util.Base64.decode(data, android.util.Base64.DEFAULT);
        } catch (Exception e) {
            throw new LocalHttpException(400, "MEDIA_INVALID", "图片数据不是合法 base64");
        }
        if (bytes.length > maxBytes) throw new LocalHttpException(413, "MEDIA_TOO_LARGE", "单张图片压缩后不得超过 6MB");
        String type = detectImage(bytes);
        if (type == null) throw new LocalHttpException(400, "MEDIA_TYPE_INVALID", "只接受 JPEG / PNG / WebP");
        String mediaId = "m" + hex(8);
        String file = mediaId + "." + type;
        File dir = new File(mediaRoot, card.optString("id", id));
        if (!dir.exists()) //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        File target = new File(dir, file);
        try (FileOutputStream out = new FileOutputStream(target)) {
            out.write(bytes);
            out.flush();
            out.getFD().sync();
        }
        ContentValues cv = new ContentValues();
        cv.put("card_id", card.optString("id", id));
        cv.put("media_id", mediaId);
        cv.put("file", file);
        cv.put("mime", mime == null || mime.isEmpty() ? ("image/" + ("jpg".equals(type) ? "jpeg" : type)) : mime);
        cv.put("bytes", bytes.length);
        cv.put("sha256", sha256(bytes));
        getWritableDatabase().insertWithOnConflict("card_media", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        media.put(new JSONObject().put("id", mediaId).put("file", file)
                .put("mime", cv.getAsString("mime")).put("bytes", bytes.length)
                .put("createdAt", now()));
        card.put("media", media);
        card.put("revision", card.optInt("revision") + 1);
        card.put("updatedAt", now());
        writeCard(card);
        return new JSONObject().put("ok", true).put("card", card)
                .put("media", new JSONObject().put("id", mediaId).put("file", file));
    }

    public synchronized JSONObject deleteCardMedia(String kind, String id, String mediaId) throws Exception {
        JSONObject card = readCard(kind, id);
        if (card == null) throw new LocalHttpException(404, "CARD_NOT_FOUND", "卡片不存在");
        JSONArray media = card.optJSONArray("media");
        JSONArray next = new JSONArray();
        String removedFile = "";
        if (media != null) {
            for (int i = 0; i < media.length(); i++) {
                JSONObject m = media.optJSONObject(i);
                if (m != null && mediaId.equals(m.optString("id", ""))) {
                    removedFile = m.optString("file", "");
                } else if (m != null) {
                    next.put(m);
                }
            }
        }
        card.put("media", next);
        if (mediaId.equals(card.optString("coverMediaId", ""))) card.put("coverMediaId", "");
        card.put("revision", card.optInt("revision") + 1);
        card.put("updatedAt", now());
        writeCard(card);
        if (!removedFile.isEmpty()) {
            File f = new File(new File(mediaRoot, card.optString("id", id)), removedFile);
            if (f.exists()) //noinspection ResultOfMethodCallIgnored
                f.delete();
        }
        getWritableDatabase().delete("card_media", "card_id=? AND media_id=?",
                new String[]{card.optString("id", id), mediaId});
        return new JSONObject().put("ok", true).put("card", card);
    }

    public synchronized JSONObject setCardCover(String kind, String id, String mediaId) throws Exception {
        JSONObject card = readCard(kind, id);
        if (card == null) throw new LocalHttpException(404, "CARD_NOT_FOUND", "卡片不存在");
        card.put("coverMediaId", mediaId == null ? "" : mediaId);
        card.put("revision", card.optInt("revision") + 1);
        card.put("updatedAt", now());
        writeCard(card);
        return new JSONObject().put("ok", true).put("card", card);
    }

    public synchronized JSONObject putOverride(String kind, String id, JSONObject patch) throws Exception {
        JSONObject current = readOverride(kind, id);
        int revision = current == null ? 0 : current.optInt("revision", 0) + 1;
        JSONObject next = current == null ? new JSONObject() : current;
        JSONObject values = next.optJSONObject("values");
        if (values == null) values = new JSONObject();
        if (patch != null) {
            Iterator<String> keys = patch.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                values.put(key, patch.opt(key));
            }
        }
        next.put("kind", kind).put("id", id).put("values", values)
                .put("revision", revision).put("updatedAt", now()).put("deletedAt", JSONObject.NULL);
        ContentValues cv = new ContentValues();
        cv.put("kind", kind);
        cv.put("id", id);
        cv.put("json", next.toString());
        cv.put("revision", revision);
        cv.put("updated_at", now());
        getWritableDatabase().insertWithOnConflict("card_overrides", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        return new JSONObject().put("ok", true).put("override", next);
    }

    public synchronized JSONObject getOverride(String kind, String id) throws Exception {
        JSONObject o = readOverride(kind, id);
        return new JSONObject().put("ok", true).put("override", o == null ? JSONObject.NULL : o);
    }

    public synchronized File cardMediaFile(String cardId, String file) {
        if (cardId == null || file == null) return null;
        if (!file.matches("^[A-Za-z0-9._-]{1,80}$") || file.contains("..")) return null;
        File f = new File(new File(mediaRoot, cardId), file);
        return f.exists() && f.isFile() ? f : null;
    }

    public synchronized String cardMediaMime(String cardId, String file) {
        File f = cardMediaFile(cardId, file);
        if (f == null) return null;
        String name = f.getName().toLowerCase(Locale.ROOT);
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }

    /* ============================== 私有地点 ============================== */

    public synchronized JSONObject listPrivatePlaces() throws Exception {
        JSONArray places = new JSONArray();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT json FROM private_places ORDER BY updated_at DESC", null)) {
            while (c.moveToNext()) places.put(new JSONObject(c.getString(0)));
        }
        return new JSONObject().put("ok", true).put("count", places.length()).put("places", places);
    }

    public synchronized JSONObject createPrivatePlace(JSONObject body) throws Exception {
        String id = body.optString("id", "");
        if (id.isEmpty()) id = "pv-" + slugify(body.optString("cnName", body.optString("name", "place")));
        if (readPrivatePlace(id) != null) throw new LocalHttpException(409, "PLACE_EXISTS", "同 id 私有地点已存在");
        JSONObject place = new JSONObject(body.toString());
        place.put("id", id);
        place.put("private", true);
        place.put("revision", 1);
        place.put("createdAt", now());
        place.put("updatedAt", now());
        writePrivatePlace(place);
        return new JSONObject().put("ok", true).put("place", place);
    }

    /* ============================== 地点记录 ============================== */

    public synchronized JSONObject placeDetail(String placeId) throws Exception {
        JSONObject place = readPrivatePlace(placeId);
        JSONArray records = new JSONArray();
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT json FROM place_records WHERE place_id=? ORDER BY updated_at DESC", new String[]{placeId})) {
            while (c.moveToNext()) records.put(applyPracticeCount(new JSONObject(c.getString(0))));
        }
        if (place == null) {
            place = publicPlace(placeId);
            if (place == null) throw new LocalHttpException(404, "PLACE_NOT_FOUND", "地点不存在");
        }
        JSONObject practice = practiceAggregate(placeId);
        return new JSONObject().put("ok", true).put("place", place).put("recordCount", records.length())
                .put("records", records).put("practice", practice)
                .put("originalReadOnly", true)
                .put("note", "原介绍只读；私有记录只在本机");
    }

    public synchronized JSONObject unassignedRecords() throws Exception {
        JSONArray records = new JSONArray();
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT json FROM place_records WHERE place_id=? ORDER BY updated_at DESC", new String[]{"unassigned"})) {
            while (c.moveToNext()) {
                JSONObject record = new JSONObject(c.getString(0));
                records.put(new JSONObject()
                        .put("recordId", record.optString("recordId"))
                        .put("revision", record.optInt("revision", 1))
                        .put("rawHtmlSafe", escapeHtml(record.optString("rawInput", "")))
                        .put("rawSha256", record.optString("rawSha256", ""))
                        .put("createdAt", record.optString("createdAt", ""))
                        .put("blocks", record.optJSONArray("blocks") == null ? new JSONArray() : record.optJSONArray("blocks")));
            }
        }
        return new JSONObject().put("ok", true).put("count", records.length()).put("records", records);
    }

    public synchronized JSONObject saveRecord(String placeId, JSONObject body) throws Exception {
        if (placeId == null || placeId.isEmpty()) throw new LocalHttpException(400, "PLACE_REQUIRED", "缺少地点");
        String rawInput = body.optString("rawInput", "");
        String source = body.optString("source", "manual_text");
        String rawSha = LocalSegments.sha256(rawInput);
        String existingId = body.optString("recordId", "");
        Integer expected = body.has("revision") && !body.isNull("revision") ? body.optInt("revision") : null;
        JSONObject existing = existingId.isEmpty() ? null : readRecord(placeId, existingId);
        if (existing != null) {
            if (expected == null || expected != existing.optInt("revision")) {
                JSONObject conflict = new JSONObject().put("ok", false).put("code", "REVISION_CONFLICT")
                        .put("error", "这条记录已被更新，请刷新后再改；你的原文已保留，不会覆盖原稿")
                        .put("currentRevision", existing.optInt("revision"));
                throw new LocalHttpException(409, "REVISION_CONFLICT", conflict.optString("error"));
            }
            if (rawSha.equals(existing.optString("rawSha256", "")) && !body.optBoolean("rebuildBlocks", false)) {
                return new JSONObject().put("ok", true).put("unchanged", true).put("record", existing)
                        .put("note", "原文没有变化，未新增版本");
            }
        }
        JSONArray blocks;
        JSONObject stats;
        String segmentedBy = "local_rules";
        if (body.optJSONArray("blocks") != null) {
            blocks = body.optJSONArray("blocks");
            stats = LocalSegments.validate(rawInput, blocks);
            if (!stats.optBoolean("reassembled") || stats.optInt("lostSentences") > 0) {
                throw new LocalHttpException(500, "SEGMENT_LOSS_DETECTED", "分段自检失败：复原原文不一致，已拒绝写入");
            }
        } else {
            LocalSegments.Result r = LocalSegments.segment(rawInput);
            blocks = r.blocks;
            stats = r.stats;
        }
        String at = now();
        int revision = existing == null ? 1 : existing.optInt("revision") + 1;
        String recordId = existing == null
                ? (existingId.isEmpty() ? "rec-" + today() + "-" + hex(3) : existingId)
                : existing.optString("recordId");
        JSONArray history = existing != null && existing.optJSONArray("changeHistory") != null
                ? existing.optJSONArray("changeHistory") : new JSONArray();
        history.put(new JSONObject().put("revision", revision).put("action", existing == null ? "create" : "update")
                .put("at", at).put("rawSha256", rawSha).put("blockCount", blocks.length()).put("stats", stats));
        JSONObject record = new JSONObject()
                .put("schema", 1)
                .put("placeId", placeId.equals("unassigned") ? JSONObject.NULL : numericOrString(placeId))
                .put("recordId", recordId)
                .put("rawInput", rawInput)
                .put("rawSha256", rawSha)
                .put("revision", revision)
                .put("source", source)
                .put("blocks", blocks)
                .put("createdAt", existing == null ? at : existing.optString("createdAt", at))
                .put("updatedAt", at)
                .put("changeHistory", trimArray(history, 50))
                .put("unassigned", placeId.equals("unassigned"))
                .put("segmentation", new JSONObject().put("by", segmentedBy).put("stats", stats));
        writeRecord(placeId, record);
        return new JSONObject().put("ok", true).put("created", existing == null)
                .put("revision", revision).put("record", applyPracticeCount(record))
                .put("rawHtmlSafe", escapeHtml(rawInput)).put("stats", stats)
                .put("warnings", new JSONArray());
    }

    public synchronized JSONObject matchPlace(String text) throws Exception {
        String raw = text == null ? "" : text.trim();
        if (raw.length() < 2) throw new LocalHttpException(400, "EMPTY_MATCH_TEXT", "请先填写地点名称或地址");
        JSONArray places = PublicPlaces.get(appContext);
        String needle = normalizeName(raw);
        JSONArray candidates = new JSONArray();
        for (int i = 0; i < places.length(); i++) {
            JSONObject place = places.optJSONObject(i);
            if (place == null) continue;
            int id = place.optInt("id", 0);
            if (String.valueOf(id).equals(raw.replaceAll("^(id|编号|地点)\\s*[:#]?\\s*", ""))) {
                candidates.put(new JSONObject().put("placeId", id).put("confidence", 1)
                        .put("reason", "exact-id").put("name", place.optString("name", "")));
                continue;
            }
            double hit = 0;
            String reason = "";
            String[] names = {place.optString("name", ""), place.optString("en_name", ""),
                    place.optString("location_cn", ""), place.optString("location_en", ""), place.optString("map_query", "")};
            for (String name : names) {
                String normalized = normalizeName(name);
                if (normalized.isEmpty()) continue;
                if (normalized.equals(needle)) { hit = 1; reason = "exact-name"; break; }
                if (needle.length() >= 2 && (normalized.contains(needle) || needle.contains(normalized))) {
                    hit = Math.max(hit, 0.8);
                    if (reason.isEmpty()) reason = "partial-name";
                }
            }
            if (hit > 0) {
                candidates.put(new JSONObject().put("placeId", id).put("confidence", hit)
                        .put("reason", reason).put("name", place.optString("name", "")));
            }
        }
        List<JSONObject> sorted = new ArrayList<>();
        for (int i = 0; i < candidates.length(); i++) sorted.add(candidates.optJSONObject(i));
        sorted.sort((a, b) -> {
            int cmp = Double.compare(b.optDouble("confidence", 0), a.optDouble("confidence", 0));
            return cmp != 0 ? cmp : Integer.compare(a.optInt("placeId"), b.optInt("placeId"));
        });
        JSONArray top = new JSONArray();
        for (int i = 0; i < Math.min(3, sorted.size()); i++) top.put(sorted.get(i));
        boolean resolved = top.length() == 1 && top.optJSONObject(0).optDouble("confidence", 0) >= 1;
        return new JSONObject().put("ok", true).put("resolved", resolved)
                .put("requiresConfirmation", true).put("source", "local")
                .put("candidates", top)
                .put("chosen", resolved ? top.optJSONObject(0) : JSONObject.NULL)
                .put("realPlacesUntouched", true)
                .put("note", resolved ? "本地精确命中；仍需你确认才绑定" : "匹配不明确：可人工从候选里选，或先存为未归属草稿");
    }

    public synchronized JSONObject savePractice(String placeId, String recordId, String blockId, JSONObject body) throws Exception {
        JSONObject record = readRecord(placeId, recordId);
        if (record == null) throw new LocalHttpException(404, "RECORD_NOT_FOUND", "记录不存在");
        String raw = body.optString("rawReport", "").trim();
        if (raw.length() < 4) throw new LocalHttpException(400, "REPORT_TOO_SHORT", "复盘内容太短，请粘贴 ChatGPT 的总结");
        if (!body.optBoolean("confirm", false)) throw new LocalHttpException(400, "CONFIRM_REQUIRED", "保存复盘需要显式确认");
        String reportId = "rep-" + today() + "-" + hex(4);
        String status = body.optInt("contentRevision", 0) == record.optInt("revision", 1) ? "confirmed" : "stale-version";
        JSONObject report = new JSONObject()
                .put("reportId", reportId)
                .put("placeId", numericOrString(placeId))
                .put("recordId", recordId)
                .put("blockId", blockId)
                .put("contentRevision", body.optInt("contentRevision", record.optInt("revision", 1)))
                .put("status", status)
                .put("rawReport", raw)
                .put("weakPhrases", body.optJSONArray("weakPhrases") == null ? new JSONArray() : body.optJSONArray("weakPhrases"))
                .put("result", body.optString("result", "review"))
                .put("practiceTime", body.optString("practiceTime", now()))
                .put("createdAt", now());
        ContentValues cv = new ContentValues();
        cv.put("report_id", reportId);
        cv.put("place_id", placeId);
        cv.put("record_id", recordId);
        cv.put("block_id", blockId);
        cv.put("json", report.toString());
        cv.put("updated_at", now());
        getWritableDatabase().insertWithOnConflict("practice_reports", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        log("practice.save", "practice_reports", reportId, status);
        return new JSONObject().put("ok", true).put("report", report).put("recordUntouched", true);
    }

    public synchronized JSONObject practiceWeak(String placeId) throws Exception {
        JSONArray reports = new JSONArray();
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT json FROM practice_reports WHERE place_id=? ORDER BY updated_at DESC LIMIT 50", new String[]{placeId})) {
            while (c.moveToNext()) reports.put(new JSONObject(c.getString(0)));
        }
        return new JSONObject().put("ok", true).put("reports", reports);
    }

    /* ============================== 偏好 / 档案 ============================== */

    public synchronized JSONObject getPrefs() throws Exception {
        JSONObject prefs = new JSONObject();
        String updatedAt = null;
        try (Cursor c = getReadableDatabase().rawQuery("SELECT k, v, updated_at FROM prefs", null)) {
            while (c.moveToNext()) {
                String key = c.getString(0);
                String raw = c.getString(1);
                Object value;
                if (raw == null || "null".equals(raw)) {
                    value = JSONObject.NULL;
                } else {
                    try {
                        value = new JSONObject(raw);
                    } catch (Exception notJson) {
                        // 兼容 0.9.2 早期把字符串直接 String.valueOf 存进去的记录。
                        value = raw;
                    }
                }
                prefs.put(key, value);
                String at = c.getString(2);
                if (at != null && (updatedAt == null || at.compareTo(updatedAt) > 0)) updatedAt = at;
            }
        }
        JSONObject out = new JSONObject().put("ok", true).put("prefs", prefs);
        if (updatedAt != null) out.put("updatedAt", updatedAt);
        return out;
    }

    public synchronized JSONObject putPrefs(JSONObject body) throws Exception {
        JSONObject current = getPrefs().getJSONObject("prefs");
        if (body.has("ttsVoice") && body.optString("ttsVoice").matches("^[A-Za-z0-9._-]{1,64}$")) {
            current.put("ttsVoice", body.optString("ttsVoice"));
        }
        if ("doubao".equals(body.optString("ttsEngine")) || "system".equals(body.optString("ttsEngine"))) {
            current.put("ttsEngine", body.optString("ttsEngine"));
        }
        String at = now();
        current.put("updatedAt", at);
        Iterator<String> keys = current.keys();
        SQLiteDatabase db = getWritableDatabase();
        while (keys.hasNext()) {
            String key = keys.next();
            ContentValues cv = new ContentValues();
            cv.put("k", key);
            Object value = current.opt(key);
            if (value == null) {
                cv.put("v", "null");
            } else if (value instanceof String) {
                cv.put("v", JSONObject.quote((String) value));
            } else {
                cv.put("v", String.valueOf(value));
            }
            cv.put("updated_at", at);
            db.insertWithOnConflict("prefs", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        }
        return new JSONObject().put("ok", true).put("prefs", current);
    }

    public synchronized JSONObject getProfile() throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT json FROM profile WHERE id=1", null)) {
            if (c.moveToNext() && c.getString(0) != null) {
                return new JSONObject().put("ok", true).put("profile", new JSONObject(c.getString(0)));
            }
        }
        return new JSONObject().put("ok", true).put("profile",
                new JSONObject().put("schema", 1).put("stories", new JSONArray())
                        .put("people", new JSONArray()).put("updatedAt", JSONObject.NULL));
    }

    public synchronized JSONObject putProfile(JSONObject body) throws Exception {
        if (!body.optBoolean("confirm", false)) {
            throw new LocalHttpException(400, "CONFIRM_REQUIRED", "写入本机档案需要用户显式确认");
        }
        JSONObject profile = new JSONObject(body.toString());
        profile.remove("confirm");
        profile.put("schema", 1);
        profile.put("updatedAt", now());
        ContentValues cv = new ContentValues();
        cv.put("id", 1);
        cv.put("json", profile.toString());
        cv.put("updated_at", profile.optString("updatedAt"));
        getWritableDatabase().insertWithOnConflict("profile", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        log("profile.put", "profile", "1", null);
        return new JSONObject().put("ok", true).put("updatedAt", profile.optString("updatedAt"))
                .put("stories", profile.optJSONArray("stories") == null ? 0 : profile.optJSONArray("stories").length())
                .put("people", profile.optJSONArray("people") == null ? 0 : profile.optJSONArray("people").length());
    }

    /* ============================== 备份 / 同步 ============================== */

    /** 列出本地卡片媒体（cardId, file），供备份打包。以文件系统为准，兼容早期未登记的迁移。 */
    public synchronized java.util.List<String[]> allCardMedia() {
        java.util.List<String[]> out = new ArrayList<>();
        java.util.HashSet<String> seen = new java.util.HashSet<>();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT card_id, file FROM card_media", null)) {
            while (c.moveToNext()) {
                String cardId = c.getString(0);
                String file = c.getString(1);
                if (cardId == null || file == null) continue;
                if (seen.add(cardId + "/" + file)) out.add(new String[]{cardId, file});
            }
        }
        File[] dirs = mediaRoot.listFiles();
        if (dirs != null) {
            for (File dir : dirs) {
                if (!dir.isDirectory()) continue;
                File[] files = dir.listFiles();
                if (files == null) continue;
                for (File file : files) {
                    if (!file.isFile()) continue;
                    String key = dir.getName() + "/" + file.getName();
                    if (seen.add(key)) out.add(new String[]{dir.getName(), file.getName()});
                }
            }
        }
        return out;
    }

    /** 备份恢复：把媒体字节写回私有目录并登记（覆盖同名文件是幂等的）。 */
    public synchronized void importMediaBytes(String cardId, String file, byte[] bytes, String mime) throws Exception {
        if (cardId == null || file == null) return;
        if (!cardId.matches("^[a-z0-9][a-z0-9-]{0,63}$")) return;
        if (!file.matches("^[A-Za-z0-9._-]{1,80}$") || file.contains("..")) return;
        if (bytes == null || bytes.length == 0) return;
        File dir = new File(mediaRoot, cardId);
        if (!dir.exists()) //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        File target = new File(dir, file);
        try (FileOutputStream out = new FileOutputStream(target)) {
            out.write(bytes);
            out.flush();
            out.getFD().sync();
        }
        String mediaId = file.replaceAll("\\.[^.]+$", "");
        ContentValues cv = new ContentValues();
        cv.put("card_id", cardId);
        cv.put("media_id", mediaId);
        cv.put("file", file);
        cv.put("mime", mime == null || mime.isEmpty() ? "image/jpeg" : mime);
        cv.put("bytes", bytes.length);
        cv.put("sha256", sha256(bytes));
        getWritableDatabase().insertWithOnConflict("card_media", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
    }

    /** 备份打包用的媒体真实路径（不要求文件存在）。 */
    public synchronized File mediaPath(String cardId, String file) {
        if (cardId == null || file == null) return null;
        if (!file.matches("^[A-Za-z0-9._-]{1,80}$") || file.contains("..")) return null;
        return new File(new File(mediaRoot, cardId), file);
    }

    /** 备份打包用的 App 私有目录（含 archive/exported 已授权会话原文）。 */
    public File appFilesDir() {
        return appContext.getFilesDir();
    }

    public synchronized JSONObject importMigrationIfPresent() {
        File dir = new File(appContext.getFilesDir(), "migration");
        File file = new File(dir, "backup.json");
        if (!file.exists() || !file.isFile()) return null;
        try {
            String raw = new String(java.nio.file.Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
            JSONObject root = new JSONObject(raw);
            JSONObject result = importBackup(root, false);
            File done = new File(dir, "backup.imported-" + System.currentTimeMillis() + ".json");
            if (!file.renameTo(done)) {
                // 改名失败也不能重复导入：写一个标记文件。
                try (FileOutputStream out = new FileOutputStream(new File(dir, "backup.imported.flag"))) {
                    out.write(result.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            log("migration.import", "backup", "device", result.optString("imported"));
            return result;
        } catch (Exception e) {
            android.util.Log.e("SocialMateLocal", "migration import failed: " + e.getMessage());
            JSONObject failed = new JSONObject();
            try {
                failed.put("ok", false).put("error", String.valueOf(e.getMessage()));
            } catch (Exception ignored) {}
            return failed;
        }
    }

    public synchronized JSONObject exportBackup() throws Exception {
        SQLiteDatabase db = getReadableDatabase();
        JSONObject root = new JSONObject();
        root.put("schema", 1);
        root.put("app", "SocialMate");
        root.put("exportedAt", now());
        root.put("people", readAllJson(db, "SELECT detail_json AS json FROM people WHERE detail_json IS NOT NULL"));
        root.put("cards", readAllJson(db, "SELECT json FROM cards"));
        root.put("overrides", readAllJson(db, "SELECT json FROM card_overrides"));
        root.put("favorites", readAllJson(db, "SELECT json FROM favorites"));
        root.put("privatePlaces", readAllJson(db, "SELECT json FROM private_places"));
        root.put("placeRecords", readAllJson(db, "SELECT json FROM place_records"));
        root.put("practice", readAllJson(db, "SELECT json FROM practice_reports"));
        root.put("prefs", getPrefs().getJSONObject("prefs"));
        root.put("profile", getProfile().getJSONObject("profile"));
        JSONArray media = new JSONArray();
        for (String[] pair : allCardMedia()) {
            File file = mediaPath(pair[0], pair[1]);
            if (file == null || !file.exists()) continue;
            String name = pair[1].toLowerCase(Locale.ROOT);
            String mime = name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg";
            JSONObject item = new JSONObject().put("cardId", pair[0])
                    .put("mediaId", pair[1].replaceAll("\\.[^.]+$", ""))
                    .put("file", pair[1]).put("mime", mime).put("bytes", file.length());
            try (java.io.InputStream in = new java.io.FileInputStream(file)) {
                item.put("sha256", sha256(readAll(in)));
            } catch (Exception ignored) {}
            media.put(item);
        }
        root.put("mediaIndex", media);
        root.put("counts", new JSONObject()
                .put("people", root.getJSONArray("people").length())
                .put("cards", root.getJSONArray("cards").length())
                .put("favorites", root.getJSONArray("favorites").length())
                .put("placeRecords", root.getJSONArray("placeRecords").length())
                .put("media", media.length()));
        return root;
    }

    public synchronized JSONObject importBackup(JSONObject root, Boolean overwrite) throws Exception {
        if (root == null || root.optInt("schema", 0) != 1 || !"SocialMate".equals(root.optString("app", ""))) {
            throw new LocalHttpException(400, "BACKUP_INVALID", "备份格式不正确");
        }
        boolean replace = overwrite != null && overwrite;
        JSONArray conflicts = new JSONArray();
        if (!replace) {
            JSONArray peopleRows = root.optJSONArray("people");
            if (peopleRows != null) {
                for (int i = 0; i < peopleRows.length(); i++) {
                    JSONObject p = peopleRows.optJSONObject(i);
                    if (p == null) continue;
                    String slug = p.optString("slug", "");
                    if (!slug.isEmpty() && personExists(slug)) conflicts.put("people:" + slug);
                }
            }
            JSONArray cardRows = root.optJSONArray("cards");
            if (cardRows != null) {
                for (int i = 0; i < cardRows.length(); i++) {
                    JSONObject c = cardRows.optJSONObject(i);
                    if (c == null) continue;
                    String kind = c.optString("kind", "");
                    String id = c.optString("id", "");
                    if (kind.matches("^(place|story|app)$") && !id.isEmpty() && readCard(kind, id) != null) {
                        conflicts.put(kind + ":" + id);
                    }
                }
            }
        }
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        int imported = 0;
        try {
            imported += importPeople(root.optJSONArray("people"), replace);
            imported += importCards(root.optJSONArray("cards"), replace);
            imported += importFavorites(root.optJSONArray("favorites"), replace);
            imported += importPrivatePlaces(root.optJSONArray("privatePlaces"), replace);
            imported += importPlaceRecords(root.optJSONArray("placeRecords"), replace);
            imported += importPractice(root.optJSONArray("practice"), replace);
            JSONObject prefs = root.optJSONObject("prefs");
            if (prefs != null) { putPrefs(prefs); imported++; }
            JSONObject profile = root.optJSONObject("profile");
            if (profile != null) {
                ContentValues cv = new ContentValues();
                cv.put("id", 1);
                cv.put("json", profile.toString());
                cv.put("updated_at", profile.optString("updatedAt", now()));
                db.insertWithOnConflict("profile", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
                imported++;
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        log("backup.import", "backup", "local", "count=" + imported + " conflicts=" + conflicts.length());
        return new JSONObject().put("ok", true).put("imported", imported)
                .put("overwrite", replace).put("conflicts", conflicts);
    }

    public synchronized JSONObject syncState() throws Exception {
        JSONArray pending = new JSONArray();
        String[] tables = {"people", "cards", "favorites", "private_places", "place_records", "practice_reports"};
        for (String table : tables) {
            int count = 0;
            try (Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM " + table + " WHERE dirty=1", null)) {
                if (c.moveToNext()) count = c.getInt(0);
            }
            if (count > 0) pending.put(new JSONObject().put("table", table).put("count", count));
        }
        return new JSONObject().put("ok", true).put("pending", pending).put("at", now());
    }

    /* ============================== 内部工具 ============================== */

    private int importPeople(JSONArray rows, boolean replace) throws Exception {
        if (rows == null) return 0;
        int n = 0;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject person = rows.optJSONObject(i);
            if (person == null || person.optString("slug", "").isEmpty()) continue;
            String slug = person.optString("slug");
            if (!replace && personExists(slug)) continue;
            writePerson(slug, person, now());
            n++;
        }
        return n;
    }

    private int importCards(JSONArray rows, boolean replace) throws Exception {
        if (rows == null) return 0;
        int n = 0;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject card = rows.optJSONObject(i);
            if (card == null) continue;
            String kind = card.optString("kind", "");
            String id = card.optString("id", "");
            if (!kind.matches("^(place|story|app)$") || id.isEmpty()) continue;
            if (!replace && readCard(kind, id) != null) continue;
            writeCard(card);
            n++;
        }
        return n;
    }

    private int importFavorites(JSONArray rows, boolean replace) throws Exception {
        if (rows == null) return 0;
        int n = 0;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject item = rows.optJSONObject(i);
            if (item == null || item.optString("id", "").isEmpty()) continue;
            String norm = item.optString("en", "").toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
            if (!replace && findByNorm(norm) != null) continue;
            ContentValues cv = new ContentValues();
            cv.put("id", item.optString("id"));
            cv.put("en_norm", norm);
            cv.put("json", item.toString());
            cv.put("created_at", item.optString("createdAt", now()));
            getWritableDatabase().insertWithOnConflict("favorites", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
            n++;
        }
        return n;
    }

    private int importPrivatePlaces(JSONArray rows, boolean replace) throws Exception {
        if (rows == null) return 0;
        int n = 0;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject place = rows.optJSONObject(i);
            if (place == null || place.optString("id", "").isEmpty()) continue;
            if (!replace && readPrivatePlace(place.optString("id")) != null) continue;
            writePrivatePlace(place);
            n++;
        }
        return n;
    }

    private int importPlaceRecords(JSONArray rows, boolean replace) throws Exception {
        if (rows == null) return 0;
        int n = 0;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject record = rows.optJSONObject(i);
            if (record == null || record.optString("recordId", "").isEmpty()) continue;
            String placeId = record.optBoolean("unassigned", false) ? "unassigned" : String.valueOf(record.opt("placeId"));
            if (!replace && readRecord(placeId, record.optString("recordId")) != null) continue;
            writeRecord(placeId, record);
            n++;
        }
        return n;
    }

    private int importPractice(JSONArray rows, boolean replace) throws Exception {
        if (rows == null) return 0;
        int n = 0;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject report = rows.optJSONObject(i);
            if (report == null || report.optString("reportId", "").isEmpty()) continue;
            ContentValues cv = new ContentValues();
            cv.put("report_id", report.optString("reportId"));
            cv.put("place_id", String.valueOf(report.opt("placeId")));
            cv.put("record_id", report.optString("recordId", ""));
            cv.put("block_id", report.optString("blockId", ""));
            cv.put("json", report.toString());
            cv.put("updated_at", report.optString("createdAt", now()));
            getWritableDatabase().insertWithOnConflict("practice_reports", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
            n++;
        }
        return n;
    }

    private JSONArray readAllJson(SQLiteDatabase db, String sql) throws Exception {
        JSONArray out = new JSONArray();
        try (Cursor c = db.rawQuery(sql, null)) {
            while (c.moveToNext()) {
                if (c.getString(0) != null) out.put(new JSONObject(c.getString(0)));
            }
        }
        return out;
    }

    private void writePerson(String slug, JSONObject detail, String at) {
        ContentValues cv = new ContentValues();
        cv.put("slug", slug);
        cv.put("list_json", summaryOfUnsafe(detail).toString());
        cv.put("detail_json", detail.toString());
        cv.put("created_at", detail.optString("createdAt", at));
        cv.put("updated_at", at);
        cv.put("dirty", 1);
        getWritableDatabase().insertWithOnConflict("people", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        log("person.write", "people", slug, null);
    }

    private void touchPerson(String slug, JSONObject detail) throws Exception {
        detail.put("updatedAt", now());
        writePerson(slug, detail, now());
    }

    private JSONObject summaryOf(JSONObject detail) {
        JSONObject out = summaryOfUnsafe(detail);
        return out == null ? new JSONObject() : out;
    }

    private JSONObject summaryOfUnsafe(JSONObject detail) {
        if (detail == null) return new JSONObject();
        JSONArray confirmed = detail.optJSONArray("confirmed");
        JSONObject out = new JSONObject();
        try {
            out.put("slug", detail.optString("slug", ""));
            out.put("name", detail.optString("name", detail.optString("slug", "")));
            out.put("lastContact", detail.opt("lastContact"));
            out.put("confirmedCount", confirmed == null ? 0 : confirmed.length());
            if (detail.has("note")) out.put("note", detail.optString("note", ""));
        } catch (Exception ignored) {}
        return out;
    }

    private JSONArray sectionsFrom(JSONArray confirmed) {
        JSONArray sections = new JSONArray();
        try {
            java.util.LinkedHashMap<String, JSONArray> grouped = new java.util.LinkedHashMap<>();
            for (int i = 0; i < confirmed.length(); i++) {
                JSONObject row = confirmed.optJSONObject(i);
                if (row == null) continue;
                String section = row.optString("section", "已确认偏好");
                JSONArray items = grouped.computeIfAbsent(section, k -> new JSONArray());
                items.put(new JSONObject().put("kind", "confirmed").put("text", row.optString("text", ""))
                        .put("factId", row.optString("id", "")));
            }
            for (java.util.Map.Entry<String, JSONArray> entry : grouped.entrySet()) {
                sections.put(new JSONObject().put("section", entry.getKey()).put("items", entry.getValue()));
            }
        } catch (Exception ignored) {}
        return sections;
    }

    private JSONObject readCard(String kind, String id) throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT json FROM cards WHERE kind=? AND id=? AND deleted_at IS NULL", new String[]{kind, id})) {
            return c.moveToNext() ? new JSONObject(c.getString(0)) : null;
        }
    }

    private JSONObject readTrashed(String kind, String id) throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT json FROM cards WHERE kind=? AND id=? AND deleted_at IS NOT NULL", new String[]{kind, id})) {
            return c.moveToNext() ? new JSONObject(c.getString(0)) : null;
        }
    }

    private void writeCard(JSONObject card) {
        ContentValues cv = new ContentValues();
        cv.put("kind", card.optString("kind"));
        cv.put("id", card.optString("id"));
        cv.put("json", card.toString());
        cv.put("revision", card.optInt("revision", 1));
        cv.put("deleted_at", card.isNull("deletedAt") ? null : card.optString("deletedAt", null));
        cv.put("updated_at", card.optString("updatedAt", now()));
        cv.put("dirty", 1);
        getWritableDatabase().insertWithOnConflict("cards", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        log("card.write", "cards", card.optString("kind") + "/" + card.optString("id"), null);
    }

    private JSONObject readOverride(String kind, String id) throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT json FROM card_overrides WHERE kind=? AND id=?", new String[]{kind, id})) {
            return c.moveToNext() ? new JSONObject(c.getString(0)) : null;
        }
    }

    private JSONObject readPrivatePlace(String id) throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT json FROM private_places WHERE id=?", new String[]{id})) {
            return c.moveToNext() ? new JSONObject(c.getString(0)) : null;
        }
    }

    private void writePrivatePlace(JSONObject place) {
        ContentValues cv = new ContentValues();
        cv.put("id", place.optString("id"));
        cv.put("json", place.toString());
        cv.put("revision", place.optInt("revision", 1));
        cv.put("updated_at", place.optString("updatedAt", now()));
        cv.put("dirty", 1);
        getWritableDatabase().insertWithOnConflict("private_places", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        log("place.write", "private_places", place.optString("id"), null);
    }

    private JSONObject readRecord(String placeId, String recordId) throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT json FROM place_records WHERE place_id=? AND record_id=?", new String[]{placeId, recordId})) {
            return c.moveToNext() ? new JSONObject(c.getString(0)) : null;
        }
    }

    private void writeRecord(String placeId, JSONObject record) {
        ContentValues cv = new ContentValues();
        cv.put("place_id", placeId);
        cv.put("record_id", record.optString("recordId"));
        cv.put("json", record.toString());
        cv.put("revision", record.optInt("revision", 1));
        cv.put("updated_at", record.optString("updatedAt", now()));
        cv.put("dirty", 1);
        getWritableDatabase().insertWithOnConflict("place_records", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
        log("record.write", "place_records", placeId + "/" + record.optString("recordId"), null);
    }

    private JSONObject applyPracticeCount(JSONObject record) throws Exception {
        JSONArray blocks = record.optJSONArray("blocks");
        if (blocks == null) return record;
        for (int i = 0; i < blocks.length(); i++) {
            JSONObject block = blocks.optJSONObject(i);
            if (block == null) continue;
            int count = 0;
            String latest = "";
            try (Cursor c = getReadableDatabase().rawQuery(
                    "SELECT json FROM practice_reports WHERE place_id=? AND record_id=? AND block_id=? ORDER BY updated_at DESC",
                    new String[]{String.valueOf(record.opt("placeId")), record.optString("recordId"), block.optString("blockId")})) {
                while (c.moveToNext()) {
                    JSONObject report = new JSONObject(c.getString(0));
                    count++;
                    if (latest.isEmpty()) latest = report.optString("practiceTime", "");
                }
            }
            block.put("practiceCount", count);
            if (!latest.isEmpty()) block.put("latestPracticeTime", latest);
            JSONArray weak = new JSONArray();
            try (Cursor c = getReadableDatabase().rawQuery(
                    "SELECT json FROM practice_reports WHERE place_id=? AND record_id=? AND block_id=? ORDER BY updated_at DESC LIMIT 5",
                    new String[]{String.valueOf(record.opt("placeId")), record.optString("recordId"), block.optString("blockId")})) {
                while (c.moveToNext()) {
                    JSONObject report = new JSONObject(c.getString(0));
                    JSONArray list = report.optJSONArray("weakPhrases");
                    if (list != null) for (int j = 0; j < list.length(); j++) weak.put(list.optString(j));
                }
            }
            block.put("weakPhrases", weak);
        }
        return record;
    }

    private JSONObject practiceAggregate(String placeId) throws Exception {
        JSONObject blocksOut = new JSONObject();
        JSONArray blocks = new JSONArray();
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT json FROM practice_reports WHERE place_id=? ORDER BY updated_at DESC", new String[]{placeId})) {
            while (c.moveToNext()) {
                JSONObject report = new JSONObject(c.getString(0));
                String blockId = report.optString("blockId", "");
                JSONArray list = blocksOut.optJSONArray(blockId);
                if (list == null) list = new JSONArray();
                list.put(new JSONObject().put("reportId", report.optString("reportId"))
                        .put("practiceTime", report.optString("practiceTime"))
                        .put("contentRevision", report.optInt("contentRevision", 1))
                        .put("status", report.optString("status"))
                        .put("excerpt", report.optString("rawReport", "").substring(0, Math.min(500, report.optString("rawReport", "").length()))));
                blocksOut.put(blockId, list);
            }
        }
        Iterator<String> keys = blocksOut.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            blocks.put(new JSONObject().put("blockId", key).put("reports", blocksOut.optJSONArray(key)));
        }
        return new JSONObject().put("blocks", blocks);
    }

    private JSONObject publicPlace(String placeId) throws Exception {
        JSONArray places = PublicPlaces.get(appContext);
        for (int i = 0; i < places.length(); i++) {
            JSONObject place = places.optJSONObject(i);
            if (place != null && String.valueOf(place.optInt("id", -1)).equals(placeId)) {
                return new JSONObject(place.toString()).put("private", false);
            }
        }
        return null;
    }

    private JSONObject normalizeCard(String kind, JSONObject raw, JSONObject base, String id, String stamp) throws Exception {
        JSONObject b = base == null ? new JSONObject() : base;
        JSONObject out = new JSONObject();
        out.put("id", id);
        out.put("kind", kind);
        out.put("schema", 1);
        out.put("private", true);
        out.put("revision", b.optInt("revision", 0));
        out.put("createdAt", b.optString("createdAt", stamp));
        out.put("updatedAt", stamp);
        out.put("deletedAt", JSONObject.NULL);
        out.put("cnName", clip(pick(raw, b, "cnName"), 80));
        out.put("enName", clip(pick(raw, b, "enName"), 120));
        out.put("title", clip(pick(raw, b, "title"), 80));
        out.put("cn", clip(pick(raw, b, "cn"), 20000));
        out.put("en", clip(pick(raw, b, "en"), 20000));
        out.put("city", clip(pick(raw, b, "city"), 40));
        out.put("category", clip(pick(raw, b, "category"), 40));
        out.put("cat", clip(pick(raw, b, "cat"), 40));
        out.put("tags", normalizeTags(raw.has("tags") ? raw.opt("tags") : b.opt("tags")));
        out.put("coverMediaId", b.optString("coverMediaId", ""));
        out.put("media", b.optJSONArray("media") == null ? new JSONArray() : b.optJSONArray("media"));
        out.put("source", clip(raw.optString("source", b.optString("source", "user")), 40));
        out.put("prompt", clip(pick(raw, b, "prompt"), 20000));
        out.put("status", clip(pick(raw, b, "status"), 80));
        return out;
    }

    private String pick(JSONObject raw, JSONObject base, String key) {
        if (raw != null && raw.has(key) && !raw.isNull(key)) return raw.optString(key, "");
        return base == null ? "" : base.optString(key, "");
    }

    private JSONArray normalizeTags(Object value) {
        JSONArray out = new JSONArray();
        if (value instanceof JSONArray) {
            JSONArray list = (JSONArray) value;
            for (int i = 0; i < list.length() && out.length() < 12; i++) {
                String s = list.optString(i, "").trim();
                if (!s.isEmpty()) out.put(s.substring(0, Math.min(40, s.length())));
            }
        } else if (value != null) {
            for (String s : String.valueOf(value).split("[,，、]")) {
                String t = s.trim();
                if (!t.isEmpty() && out.length() < 12) out.put(t.substring(0, Math.min(40, t.length())));
            }
        }
        return out;
    }

    private String clip(String value, int max) {
        String v = value == null ? "" : value;
        return v.length() > max ? v.substring(0, max) : v;
    }

    private static void assertKind(String kind) throws LocalHttpException {
        if (kind == null || !kind.matches("^(place|story|app)$")) {
            throw new LocalHttpException(400, "KIND_INVALID", "kind 只能是 place / story / app");
        }
    }

    private void log(String action, String entity, String entityId, String detail) {
        ContentValues cv = new ContentValues();
        cv.put("at", now());
        cv.put("action", action);
        cv.put("entity", entity);
        cv.put("entity_id", entityId);
        cv.put("detail", detail);
        getWritableDatabase().insert("sync_log", null, cv);
    }

    private static JSONArray trimArray(JSONArray array, int max) {
        if (array.length() <= max) return array;
        JSONArray out = new JSONArray();
        for (int i = array.length() - max; i < array.length(); i++) out.put(array.opt(i));
        return out;
    }

    private static Object numericOrString(String value) {
        try {
            return Integer.parseInt(value);
        } catch (Exception e) {
            return value;
        }
    }

    private static String now() {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(new Date());
    }

    private static String today() {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyyMMdd", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        return fmt.format(new Date());
    }

    private static String hex(int bytes) {
        byte[] buf = new byte[bytes];
        new SecureRandom().nextBytes(buf);
        StringBuilder sb = new StringBuilder();
        for (byte b : buf) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static String hex3() {
        return hex(4);
    }

    private static String latinBase(String name) {
        String v = name == null ? "" : name;
        StringBuilder out = new StringBuilder();
        for (char c : v.toLowerCase(Locale.ROOT).toCharArray()) {
            if (c >= 'a' && c <= 'z' || c >= '0' && c <= '9') out.append(c);
            else if (out.length() > 0 && out.charAt(out.length() - 1) != '-') out.append('-');
        }
        String s = out.toString().replaceAll("-+$", "");
        if (s.length() > 48) s = s.substring(0, 48).replaceAll("-+$", "");
        return s;
    }

    private static String slugify(String value) {
        String s = latinBase(value);
        return s.isEmpty() ? "card" : s;
    }

    private static String normalizeName(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    private static String classifySection(String text) {
        String v = text == null ? "" : text.toLowerCase(Locale.ROOT);
        if (v.matches(".*(cost|certificat|exam|study|work|job|shopee|tiktok|gmv|roi|sku|运营|成本|证书|考试|工作|上班|项目|学习|课程).*")) return "工作 / 学习";
        if (v.matches(".*(haidian|guoxing|hongcheng|haikou|hainan|海甸|国兴|红城湖|海口|海南|骑楼|万绿园).*")) return "海南生活";
        if (v.matches(".*(next month|tomorrow|saturday|sunday|plan|trip|travel|下个月|明天|周六|周日|计划|出差|旅行|请假).*")) return "对方近期计划";
        if (v.matches(".*(dive|diving|gym|fitness|coffee|run|running|hobby|潜水|健身|咖啡|跑步|爱好|喜欢).*")) return "兴趣";
        if (v.matches(".*(we both|both of us|一起|都住|都喜欢|共同).*")) return "共同点";
        return "已确认偏好";
    }

    private static String escapeHtml(String value) {
        return value == null ? "" : value.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }

    private static String detectImage(byte[] b) {
        if (b.length < 12) return null;
        if ((b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8) return "jpg";
        if ((b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return "png";
        if (b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "webp";
        return null;
    }

    private static String sha256(byte[] bytes) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(bytes);
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    private static String sha1(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] digest = md.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return hex(10);
        }
    }

    /** 115 公开地点：构建期复制进 assets，运行时只读。 */
    public static final class PublicPlaces {
        private static JSONArray cache;

        public static synchronized JSONArray get(Context context) throws Exception {
            if (cache != null) return cache;
            try (InputStream in = context.getAssets().open("seed/places-115.json")) {
                byte[] buf = readAll(in);
                cache = new JSONArray(new String(buf, StandardCharsets.UTF_8));
            } catch (Exception e) {
                cache = new JSONArray();
            }
            return cache;
        }
    }
}