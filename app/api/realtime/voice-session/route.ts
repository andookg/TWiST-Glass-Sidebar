import { NextResponse } from "next/server";

import { getRuntimeOpenAIConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";

export async function POST() {
  const { apiKey, realtimeModel } = getRuntimeOpenAIConfig();

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OpenAI API key is not set. Paste it in Model router key setup or add OPENAI_API_KEY to .env.local."
      },
      { status: 500 }
    );
  }

  const sessionConfig = {
    expires_after: {
      anchor: "created_at",
      seconds: 600
    },
    session: {
      type: "realtime",
      model: realtimeModel,
      instructions:
        "You are a live podcast sidebar voice collaborator. Keep responses short, useful, producer-minded, and grounded in attached project memory.",
      audio: {
        output: {
          voice: process.env.OPENAI_REALTIME_VOICE ?? "marin"
        },
        input: {
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 650
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
        error: "Failed to create OpenAI Realtime voice client secret.",
        details: payload
      },
      { status: response.status }
    );
  }

  return NextResponse.json(payload);
}
