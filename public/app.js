function getDeviceId() {
  const key = "altea_device_id";
  let v = localStorage.getItem(key);
  if (!v) {
    const rnd = (globalThis.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : (Math.random().toString(36).slice(2) + Date.now().toString(36));
    v = rnd;
    localStorage.setItem(key, v);
  }
  return v;
}

function esc(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function showInstallHint() {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    const el = document.getElementById("installHint");
    if (el) el.style.display = "block";
  }
}

async function registerSW() {
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("/sw.js"); } catch (e) {
      console.warn("SW register failed", e);
    }
  }
}

function renderReport(data) {
  const out = document.getElementById("out");
  const lvl = data.danger_level || "A_VERIFIER";

  const emergency =
    (lvl === "DANGER_IMMEDIAT")
      ? `<div style="margin:10px 0; padding:10px 12px; border-radius:12px; background:#b00020; color:#fff; font-weight:900;">
           ⚠️ URGENCE : coupez le disjoncteur général si possible en sécurité et appelez un électricien.
         </div>`
      : "";

  out.innerHTML = `
    ${emergency}
    <div>
      <span class="badge ${esc(lvl)}">${esc(lvl)}</span>
      <p style="margin:10px 0 0;"><b>${esc(data.summary || "")}</b></p>

      <p><b>Pourquoi :</b></p>
      <ul>${(data.reasons || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>

      <p><b>À faire maintenant :</b></p>
      <ul>${(data.what_to_do_now || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>

      <p><b>À vérifier ensuite :</b></p>
      <ul>${(data.what_to_check_next || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>

      <p><b>Questions :</b></p>
      <ul>${(data.questions_for_user || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>

      <p class="small">Confiance IA: ${Math.round((data.confidence || 0) * 100)}% · Restant aujourd’hui (estimation): ${esc(data.remaining_today_estimate ?? "?")}
      <br>Réf: ${esc(data.request_id || "")}</p>
    </div>
  `;
}

function attachHandlers() {
  const analyzeBtn =
    document.getElementById("analyserBtn") ||
    document.getElementById("analyzeBtn") ||
    document.getElementById("analyserBtn "); // au cas où (id avec espace accidentel)

  const resetBtn = document.getElementById("resetBtn");

  if (!analyzeBtn) console.error("Bouton Analyser introuvable (ID).");
  if (!resetBtn) console.error("Bouton Réinitialiser introuvable (ID).");

  if (analyzeBtn) {
    analyzeBtn.onclick = async () => {
      const out = document.getElementById("out");
      out.innerHTML = "<p>Analyse…</p>";

      const access_code = (document.getElementById("accessCode")?.value || "").trim();
      const photo_global = document.getElementById("photoGlobal")?.files?.[0];
      const photo_zoom_haut = document.getElementById("photoHaut")?.files?.[0];
      const photo_zoom_bas = document.getElementById("photoBas")?.files?.[0];

      if (!access_code) { out.innerHTML = "<p>Entre le code entreprise.</p>"; return; }
      if (!photo_global && !photo_zoom_haut && !photo_zoom_bas) {
        out.innerHTML = "<p>Ajoute au moins 1 photo (idéalement 3).</p>";
        return;
      }

      const fd = new FormData();
      fd.append("access_code", access_code);
      fd.append("device_id", getDeviceId());
      if (photo_global) fd.append("photo_global", photo_global);
      if (photo_zoom_haut) fd.append("photo_zoom_haut", photo_zoom_haut);
      if (photo_zoom_bas) fd.append("photo_zoom_bas", photo_zoom_bas);

      try {
        const r = await fetch("/analyze", { method: "POST", body: fd });
        const data = await r.json();
        if (!r.ok) {
          out.innerHTML = `<p>Erreur: ${esc(data.error || "inconnue")}</p>`;
          return;
        }
        renderReport(data);
      } catch (e) {
        console.error(e);
        out.innerHTML = "<p>Erreur réseau (fetch). Réessaye.</p>";
      }
    };
  }

  if (resetBtn) {
    resetBtn.onclick = () => {
      const ids = ["accessCode","photoGlobal","photoHaut","photoBas"];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === "file" || el.tagName === "INPUT") el.value = "";
      });
      const out = document.getElementById("out");
      if (out) out.innerHTML = "";
    };
  }
}

showInstallHint();
registerSW();
attachHandlers();


