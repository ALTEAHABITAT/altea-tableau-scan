const USER = `
IMPORTANT: Réponds en FR et termine OBLIGATOIREMENT par un bloc TAGS.
Ajoute la ligne PROMPT_VERSION=${PROMPT_VERSION} tout en haut de ta réponse.

TAGS:
DIFFERENTIEL=present|absent|unknown
PROTECTIONS=present|absent|unknown
FUSIBLES=present|absent|unknown
FILS_DENUDES=yes|no|unknown
TRACES_CHAUFFE=yes|no|unknown
CAPOT=yes|no|partial|unknown
IDENTIFICATION=present|partial|absent|unknown
`;

console.log("### RENDER CHECK — CODE FROM GITHUB IS LOADED ###");
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import helmet from "helmet";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROMPT_VERSION = "ALARMISTE_V3";

const app = express();
const PORT = process.env.PORT || 10000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ACCESS_CODE = process.env.ACCESS_CODE || "ALTEA2026";

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY manquante");
  process.exit(1);
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

app.use(helmet());
app.use(express.static(path.join(__dirname, "public")));
app.get("/app.js", (req, res) => res.sendFile(path.join(__dirname, "public", "app.js")));
const upload = multer({ limits: { fileSize: 8 * 1024 * 1024 } });

function toDataUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/analyze", upload.single("photo"), async (req, res) => {
  try {
    if ((req.body.access_code || "") !== ACCESS_CODE) {
      return res.status(401).json({ error: "Code d’accès invalide" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Ajoute une photo" });
    }

    const image = toDataUrl(req.file);

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: "Tu es un expert sécurité électrique en France. Tu analyses une PHOTO de tableau électrique et signales les risques VISUELS, pourquoi et quoi faire. Tu ne certifies jamais la conformité."
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: `PROMPT_VERSION=${PROMPT_VERSION}

${USER}`},
            { type: "input_image", image_url: image }
          ]
        }
      ]
    });

    res.json({ text: response.output_text || "Aucune réponse IA." });
  } catch (e) {
    console.error("❌ analyze error:", e);
    const msg = (e && (e.message || (e.error && e.error.message))) ? (e.message || e.error.message) : "Erreur serveur pendant l’analyse.";
    const code = (e && (e.code || (e.error && e.error.code))) ? (e.code || e.error.code) : null;

    if (code === "insufficient_quota" || (msg && msg.includes("exceeded your current quota"))) {
      return res.status(402).json({ error: "IA indisponible : quota OpenAI épuisé. Ajoute du crédit / vérifie la facturation." });
    }

    return res.status(500).json({ error: "Erreur serveur pendant l’analyse." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Serveur prêt : http://localhost:${PORT}`);
});
