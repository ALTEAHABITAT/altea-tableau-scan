import "dotenv/config";
import express from "express";
import multer from "multer";
import helmet from "helmet";
import OpenAI from "openai";
import crypto from "crypto";

const app = express();

// --- Config via variables d'environnement ---
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ACCESS_CODE = process.env.ACCESS_CODE || "ALTEA2026";
const MAX_REQUESTS_PER_DAY_PER_DEVICE = Number(process.env.MAX_REQUESTS_PER_DAY_PER_DEVICE || 30);

// IMPORTANT : la clé ne doit JAMAIS être côté client.
if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY manquante. Mets-la dans tes variables d'environnement.");
  process.exit(1);
}
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- Sécurité basique ---
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // pour servir icônes/manifest sans soucis
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

// --- Upload photos (3 max), 8MB chacune ---
const upload = multer({
  limits: { fileSize: 8 * 1024 * 1024 }
});

// --- Rate limit très simple (en mémoire) : par "device_id" + jour ---
const dailyCounter = new Map(); // key -> { date: "YYYY-MM-DD", count: number }

function todayISO() {
  const d = new Date();
  // format UTC date (suffisant ici)
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function bumpDaily(deviceId) {
  const key = deviceId || "unknown";
  const t = todayISO();
  const cur = dailyCounter.get(key);
  if (!cur || cur.date !== t) {
    dailyCounter.set(key, { date: t, count: 1 });
    return 1;
  }
  cur.count += 1;
  dailyCounter.set(key, cur);
  return cur.count;
}

function toDataUrl(file) {
  const b64 = file.buffer.toString("base64");
  return `data:${file.mimetype};base64,${b64}`;
}

function safeDeviceId(req) {
  // le front envoie device_id ; sinon fallback IP (moins fiable)
  const fromBody = req.body?.device_id || req.headers["x-device-id"];
  if (fromBody && typeof fromBody === "string" && fromBody.length <= 128) return fromBody;
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").toString().slice(0, 128);
}

// --- Route "health" (utile pour hébergeur) ---
app.get("/health", (_, res) => res.json({ ok: true }));

// --- Analyse IA ---
app.post(
  "/analyze",
  upload.fields([
    { name: "photo_global", maxCount: 1 },
    { name: "photo_zoom_haut", maxCount: 1 },
    { name: "photo_zoom_bas", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      // Auth simple
      const access_code = req.body?.access_code;
      if (!access_code || access_code !== ACCESS_CODE) {
        return res.status(401).json({ error: "Code d’accès invalide." });
      }

      // Limite par device
      const deviceId = safeDeviceId(req);
      const n = bumpDaily(deviceId);
      if (n > MAX_REQUESTS_PER_DAY_PER_DEVICE) {
        return res.status(429).json({
          error: `Limite atteinte (${MAX_REQUESTS_PER_DAY_PER_DEVICE}/jour).`
        });
      }

      const files = req.files || {};
      const g = files.photo_global?.[0];
      const h = files.photo_zoom_haut?.[0];
      const b = files.photo_zoom_bas?.[0];

      if (!g && !h && !b) {
        return res.status(400).json({ error: "Aucune photo reçue." });
      }

      // Prépare images
      const images = [];
      if (g) images.push({ label: "Vue globale du tableau", dataUrl: toDataUrl(g) });
      if (h) images.push({ label: "Zoom haut (rangées du haut)", dataUrl: toDataUrl(h) });
      if (b) images.push({ label: "Zoom bas (rangées du bas / borniers)", dataUrl: toDataUrl(b) });

      // Schéma JSON de sortie
      const schema = {
        name: "tableau_safety_report",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            danger_level: { type: "string", enum: ["OK", "A_VERIFIER", "DANGER", "DANGER_IMMEDIAT"] },
            summary: { type: "string" },
            reasons: { type: "array", items: { type: "string" } },
            what_to_do_now: { type: "array", items: { type: "string" } },
            what_to_check_next: { type: "array", items: { type: "string" } },
            questions_for_user: { type: "array", items: { type: "string" } },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          },
          required: [
            "danger_level",
            "summary",
            "reasons",
            "what_to_do_now",
            "what_to_check_next",
            "questions_for_user",
            "confidence"
          ]
        }
      };

      const SYSTEM = `
Tu es un assistant de sécurité électrique.
Tu analyses des PHOTOS d’un tableau électrique en France.
Objectif: repérer des DANGERS VISUELS plausibles et expliquer clairement pourquoi.
Tu ne certifies jamais la conformité NF C 15-100.
Si les photos ne permettent pas d'être sûr, tu dois choisir "A_VERIFIER" (pas d'invention).
Toujours inclure: "Couper le disjoncteur général avant toute intervention" et "faire intervenir un électricien qualifié".
Style: très simple, direct, utile pour des commerciaux sur le terrain.
`;

      const USER = `
Analyse ces photos et produis un rapport.
À repérer seulement si visible:
- cuivre apparent / fils dénudés
- traces de chauffe (noircissement, plastique fondu)
- trous ouverts / modules manquants / accès aux parties sous tension
- bricolage (dominos/wago en vrac, absence de capots, fils non maintenus)
- humidité évidente / condensation / coulures
- étiquetage absent (pas forcément dangereux, plutôt "à vérifier")
Important:
- Ne déduis pas des calibres/sections si illisible.
- Si tu vois quelque chose potentiellement dangereux mais incertain -> A_VERIFIER + demande photo plus nette.
- what_to_do_now doit contenir des actions immédiates, prudentes.
`;

      // Construit le contenu multimodal
      const content = [{ type: "input_text", text: USER }];
      for (const im of images) {
        content.push({ type: "input_text", text: `Image: ${im.label}` });
        content.push({ type: "input_image", image_url: im.dataUrl });
      }

      const response = await client.responses.create({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: SYSTEM },
          { role: "user", content }
        ],
        text: { format: { type: "json_schema", json_schema: schema } }
      });

      const report = JSON.parse(response.output_text);

      // Petite “empreinte” technique (sans données sensibles)
      report.request_id = crypto.randomUUID();
      report.remaining_today_estimate = Math.max(0, MAX_REQUESTS_PER_DAY_PER_DEVICE - n);

      res.json(report);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Erreur serveur pendant l’analyse." });
    }
  }
);

app.listen(PORT, () => {
  console.log(`✅ Serveur prêt : http://localhost:${PORT}`);
});

