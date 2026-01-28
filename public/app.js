(function () {
  const out = document.getElementById("out");
  const analyzeBtn = document.getElementById("analyzeBtn") || document.getElementById("analyserBtn");
  const resetBtn = document.getElementById("resetBtn");

  function esc(s){
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function parseTags(text) {
    const tags = {};
    const m = String(text || "").match(/TAGS:\s*([\s\S]*)$/i);
    if (!m) return tags;
    const lines = m[1].split("\n").map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const mm = line.match(/^([A-Z_]+)=(.+)$/);
      if (mm) tags[mm[1]] = mm[2].trim().toLowerCase();
    }
    return tags;
  }

  function scoreFromTags(tags) {
    let score = 100;

    if (tags.DIFFERENTIEL === "absent") score -= 40;
    if (tags.PROTECTIONS === "absent") score -= 30;

    if (tags.FILS_DENUDES === "yes") score -= 20;
    if (tags.TRACES_CHAUFFE === "yes") score -= 15;

    if (tags.CAPOT === "no") score -= 15;
    if (tags.CAPOT === "partial") score -= 8;

    if (tags.IDENTIFICATION === "absent") score -= 10;
    if (tags.IDENTIFICATION === "partial") score -= 5;

    if (tags.HUMIDITE_POUSSIERE === "yes") score -= 10;

    score = Math.max(0, Math.min(100, score));

    let level = "🟢";
    if (score < 40) level = "🔴";
    else if (score < 60) level = "🟠";
    else if (score < 80) level = "🟡";

    return { score, level };
  }

  function renderScore(res) {
    const score = res.score, level = res.level;
    let label = "Aspect visuel rassurant";
    if (score < 40) label = "Risque visuel élevé – intervention urgente";
    else if (score < 60) label = "Intervention recommandée";
    else if (score < 80) label = "Surveillance conseillée";

    return `
      <div style="margin-bottom:12px;">
        <div style="font-weight:900;font-size:18px;">Score visuel (NF C 15-100, indicatif) : ${score}/100 ${level}</div>
        <div style="margin-top:8px;background:#e9ecf5;border-radius:999px;height:14px;overflow:hidden;">
          <div style="height:14px;width:${score}%;background:#111;"></div>
        </div>
        <div style="margin-top:6px;color:#444;font-size:13px;">${label}</div>
      </div>
    `;
  }

  if (!analyzeBtn) {
    document.body.insertAdjacentHTML("afterbegin", "<p style='padding:12px;color:#b00020;font-weight:800'>ERREUR: bouton analyzeBtn/analyserBtn introuvable</p>");
    return;
  }

  analyzeBtn.addEventListener("click", async () => {
    out.innerHTML = "<p>Analyse…</p>";

    const access_code = (document.getElementById("accessCode")?.value || "").trim();
    const photo = document.getElementById("photo")?.files?.[0]
      || document.getElementById("photoGlobal")?.files?.[0]
      || document.getElementById("photoHaut")?.files?.[0]
      || document.getElementById("photoBas")?.files?.[0];

    if (!access_code) { out.innerHTML = "<p>Entre le code entreprise.</p>"; return; }
    if (!photo) { out.innerHTML = "<p>Ajoute au moins 1 photo.</p>"; return; }

    const fd = new FormData();
    fd.append("access_code", access_code);
    fd.append("photo", photo);

    try {
      const r = await fetch("/analyze", { method: "POST", body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        out.innerHTML = `<p style="color:#b00020;font-weight:800">Erreur ${r.status}:</p><pre>${esc(JSON.stringify(data, null, 2) || "")}</pre>`;
        return;
      }

      const text = data.text || "";
      const tags = parseTags(text);
      const hasTags = Object.keys(tags).length > 0;
      const sc = scoreFromTags(tags);

      out.innerHTML =
        (hasTags ? renderScore(sc) : `<p style="color:#b00020;font-weight:800">Pas de TAGS détectés → pas de score</p>`) +
        `<div style="font-size:13px;color:#333;margin-bottom:10px;">
           <b>Vérifs visuelles :</b><br>
           Différentiel: ${esc(tags.DIFFERENTIEL || "unknown")} ·
           Protections: ${esc(tags.PROTECTIONS || "unknown")} ·
           Capot: ${esc(tags.CAPOT || "unknown")} ·
           Fils dénudés: ${esc(tags.FILS_DENUDES || "unknown")}
         </div>` +
        `<pre>${esc(text)}</pre>`;
    } catch (e) {
      out.innerHTML = `<p style="color:#b00020;font-weight:800">Erreur réseau</p><pre>${esc(String(e))}</pre>`;
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      ["accessCode","photo","photoGlobal","photoHaut","photoBas"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      out.innerHTML = "";
    });
  }

  console.log("✅ Front loaded with scoring");
})();
