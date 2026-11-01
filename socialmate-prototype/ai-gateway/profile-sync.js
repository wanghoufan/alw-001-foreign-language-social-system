/**
 * 本机档案同步（仅在同源 8791 服务下生效）。
 * 默认离线：数据只在浏览器 localStorage。
 * 用户点「同步到本机档案」并确认后，才把话题与人物写入 SocialMate-Data/Profile。
 */
(() => {
  if (typeof window === "undefined" || !window.__smProfile) return;
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  const label = () => document.getElementById("syncProfile");
  const setNote = (text) => {
    const button = label();
    if (!button) return;
    button.dataset.note = text;
    button.title = text;
  };

  async function pull() {
    let response;
    try {
      response = await fetch("/api/profile", { headers: { Accept: "application/json" } });
    } catch {
      return; // 离线或静态打开：保持纯本地
    }
    if (!response.ok) return;
    const body = await response.json().catch(() => null);
    const remote = body?.profile;
    if (!remote || !remote.updatedAt) return;

    const local = window.__smProfile.snapshot();
    const localAt = local.updatedAt || "";
    if (remote.updatedAt <= localAt) return;
    window.__smProfile.apply(remote);
    setNote("已从本机档案恢复（" + remote.updatedAt.slice(0, 16).replace("T", " ") + "）");
  }

  async function push() {
    const button = label();
    const snapshot = window.__smProfile.snapshot();
    const size = (snapshot.stories?.length || 0) + (snapshot.people?.length || 0);
    if (!size) {
      setNote("当前没有可同步的话题或人物");
      return;
    }
    if (!window.confirm(
      "将 " + snapshot.stories.length + " 条话题和 " + snapshot.people.length +
      " 个人物写入本机 SocialMate-Data/Profile？\n只保存在这台电脑，不上传云端、不进公开仓库。"
    )) return;

    if (button) { button.disabled = true; button.textContent = "正在同步…"; }
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...snapshot, confirm: true }),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) {
        const when = String(body.updatedAt || "").slice(0, 16).replace("T", " ");
        setNote("已保存到本机档案 · " + when);
        if (button) button.textContent = "已同步";
        setTimeout(() => { if (button) button.textContent = "同步到本机档案"; }, 1800);
      } else {
        setNote("同步失败：" + (body?.error || "服务未响应"));
        if (button) button.textContent = "同步到本机档案";
      }
    } catch {
      setNote("同步失败：连不上本机服务");
      if (button) button.textContent = "同步到本机档案";
    } finally {
      if (button) button.disabled = false;
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("#syncProfile")) {
      event.preventDefault();
      event.stopPropagation();
      push();
    }
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", pull, { once: true });
  } else {
    pull();
  }
})();