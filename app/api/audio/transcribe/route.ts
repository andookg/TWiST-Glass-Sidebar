import { NextResponse } from "next/server";

import { getRuntimeOpenAIConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const { apiKey } = getRuntimeOpenAIConfig();

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OpenAI API key is not set. Paste it in Model router key setup or add OPENAI_API_KEY to .env.local."
      },
      { status: 500 }
    );
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
  }

  if (audio.size === 0) {
    return NextResponse.json({ text: "" });
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio chunk is too large." }, { status: 413 });
  }

  const upstream = new FormData();
  upstream.append("file", audio, audio.name || "fallback-audio.webm");
  upstream.append("model", process.env.OPENAI_FALLBACK_TRANSCRIBE_MODEL || "gpt-4o-transcribe");
  upstream.append("language", "en");
  upstream.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: upstream
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      {
        error: "Fallback audio transcription failed.",
        details: payload
      },
      { status: response.status }
    );
  }

  return NextResponse.json({
    text: typeof payload?.text === "string" ? payload.text.trim() : ""
  });
}
