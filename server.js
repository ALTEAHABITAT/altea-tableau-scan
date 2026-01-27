import "dotenv/config";
import express from "express";
import multer from "multer";
import helmet from "helmet";
import OpenAI from "openai";

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
app.use(express.static("public"));

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
            { type: "input_text", text: "Analyse cette photo de tableau électrique." },
            { type: "input_image", image_url: image }
          ]
        }
      ]
    });

    res.json({ text: response.output_text || "Aucune réponse IA." });
  } catch (e) {
    console.error("❌ analyze error:", e);
    res.status(500).json({ error: "Erreur serveur pendant l’analyse." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Serveur prêt : http://localhost:${PORT}`);
});
