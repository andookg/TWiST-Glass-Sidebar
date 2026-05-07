#!/usr/bin/env node
// Generates an optional promo voiceover MP3.
// Reads the API key from OPENAI_API_KEY or the project's .data/runtime-secrets.json.

const fs = require("fs");
const path = require("path");
const https = require("https");

// Read API key from runtime secrets.
const secretsPath = path.join(__dirname, "..", "..", ".data", "runtime-secrets.json");
let apiKey = process.env.OPENAI_API_KEY || "";

if (!apiKey) {
  try {
    const secrets = JSON.parse(fs.readFileSync(secretsPath, "utf8"));
    apiKey = secrets?.openai?.apiKey || "";
  } catch {}
}

if (!apiKey) {
  console.error("No OPENAI_API_KEY found. Set it in .data/runtime-secrets.json or env.");
  process.exit(1);
}

// Voiceover script.
const script = `
Your podcast, live and intelligent.

TWiST Glass Sidebar listens to your browser audio in real time and routes every word to four specialized AI minds.

A fact checker that catches errors before you make them.

A comedy writer dropping lines on-air.

A news desk scanning what's breaking right now.

And a skeptical commentator keeping everything sharp.

All of this appears live in a glass interface designed for broadcast.

You can record the regular show stream, record the enhanced sidebar stream, and hand the best moments to Remotion.

The entire system is ready to activate with your own home base agent: connect it, extend it, and make it yours.

Once you download it, you can add, change, and customize everything: models, personas, prompts, storage, and UI, all on your terms.

Security is a priority. Keys never leave your server. No data stored without your permission. And the entire codebase is completely open source.

Run it locally. Own it fully. Ship it.
`.trim();

// Call OpenAI TTS.
const body = JSON.stringify({
  model: "tts-1-hd",
  voice: "onyx",
  speed: 0.92,
  input: script,
  response_format: "mp3",
});

const options = {
  hostname: "api.openai.com",
  path: "/v1/audio/speech",
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  },
};

const outPath = path.join(__dirname, "..", "public", "voiceover.mp3");
const fileStream = fs.createWriteStream(outPath);

console.log("Calling OpenAI TTS HD (voice: onyx)...");

const req = https.request(options, (res) => {
  if (res.statusCode !== 200) {
    let err = "";
    res.on("data", (chunk) => (err += chunk));
    res.on("end", () => {
      console.error("OpenAI TTS error:", res.statusCode, err);
      process.exit(1);
    });
    return;
  }

  res.pipe(fileStream);
  fileStream.on("finish", () => {
    const size = fs.statSync(outPath).size;
    console.log(`Voiceover saved: ${outPath} (${(size / 1024).toFixed(1)} KB)`);
  });
});

req.on("error", (e) => {
  console.error("Request error:", e.message);
  process.exit(1);
});

req.write(body);
req.end();
