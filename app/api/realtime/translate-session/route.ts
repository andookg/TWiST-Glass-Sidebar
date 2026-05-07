import { NextResponse } from "next/server";

import { getRuntimeOpenAIConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { apiKey, translationModel } = getRuntimeOpenAIConfig();

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OpenAI API key is not set. Paste it in Model router key setup or add OPENAI_API_KEY to .env.local."
      },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { outputLanguage?: string; voice?: string }
    | null;
  const outputLanguage = cleanLanguage(body?.outputLanguage) || "English";
  const voice = cleanVoice(body?.voice) || process.env.OPENAI_REALTIME_VOICE || "marin";

  const sessionConfig = {
    expires_after: {
      anchor: "created_at",
      seconds: 600
    },
    session: {
      type: "realtime",
      model: translationModel,
      instructions: `Translate incoming speech into ${outputLanguage} in real time. Preserve meaning, names, numbers, and tone. Keep pace with the speaker.`,
      audio: {
        output: {
          voice
        },
        input: {
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500
          }
        }
      }
    }
  };

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(sessionConfig)
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      {
        error: "Failed to create OpenAI Realtime translation client secret.",
        details: payload
      },
      { status: response.status }
    );
  }

  return NextResponse.json(payload);
}

function cleanLanguage(value?: string) {
  if (!value) {
    return "";
  }
  return value.replace(/[^a-zA-Z\s-]/g, "").trim().slice(0, 40);
}

function cleanVoice(value?: string) {
  if (!value) {
    return "";
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "").trim().slice(0, 40);
}
