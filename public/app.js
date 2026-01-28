(function () {
  const out = document.getElementById("out");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const resetBtn = document.getElementById("resetBtn");

  function esc(s){
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  if (!analyzeBtn) {
    document.body.insertAdjacentHTML("afterbegin", "<p style='padding:12px;color:#b00020;font-weight:800'>ERREUR: bouton analyzeBtn introuvable</p>");
    return;
  }

  analyzeBtn.addEventListener("click", async () => {
    out.innerHTML = "<p>Analyse…</p>";

    const access_code = (document.getElementById("accessCode").value || "").trim();
    const photo = document.getElementById("photo").files[0];

    if (!access_code) { out.innerHTML = "<p>Entre le code entreprise.</p>"; return; }
    if (!photo) { out.innerHTML = "<p>Ajoute une photo.</p>"; return; }

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
      out.innerHTML = `<pre>${esc(data.text || JSON.stringify(data, null, 2) || "")}</pre>`;
    } catch (e) {
      out.innerHTML = `<p style="color:#b00020;font-weight:800">Erreur réseau</p><pre>${esc(String(e))}</pre>`;
    }
  });

  resetBtn.addEventListener("click", () => {
    document.getElementById("accessCode").value = "";
    document.getElementById("photo").value = "";
    out.innerHTML = "";
  });

  console.log("✅ Front loaded: analyzeBtn handler attached");
})();
