import { NextResponse } from "next/server";

import { getRuntimeOpenAIConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";

export async function POST() {
  const { apiKey, transcribeModel } = getRuntimeOpenAIConfig();

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OpenAI API key is not set. Paste it in Model router key setup or add OPENAI_API_KEY to .env.local."
      },
      { status: 500 }
    );
  }

  const options = {
    includePrompt: true,
    includeTurnDetection: true,
    includeNoiseReduction: true,
    includeLogprobs: true
  };

  let lastStatus = 500;
  let lastPayload: unknown = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await createRealtimeSecret(
      apiKey,
      buildTranscriptionSession(transcribeModel, options)
    );
    const payload = await response.json().catch(() => null);

    if (response.ok) {
      return NextResponse.json(payload);
    }

    lastStatus = response.status;
    lastPayload = payload;

    const unsupportedField = unsupportedRealtimeField(payload);
    if (!unsupportedField) {
      break;
    }

    if (unsupportedField === "prompt") options.includePrompt = false;
    if (unsupportedField === "turn_detection") options.includeTurnDetection = false;
    if (unsupportedField === "noise_reduction") options.includeNoiseReduction = false;
    if (unsupportedField === "include") options.includeLogprobs = false;
  }

  return realtimeError(lastStatus, lastPayload);
}

function buildTranscriptionSession(
  transcribeModel: string,
  options: {
    includePrompt: boolean;
    includeTurnDetection: boolean;
    includeNoiseReduction: boolean;
    includeLogprobs: boolean;
  }
) {
  const transcription: Record<string, unknown> = {
    model: transcribeModel,
    language: "en"
  };

  if (options.includePrompt) {
    transcription.prompt =
      "Podcast, talk radio, panel conversation, live show commentary, names, numbers, news, jokes, and factual claims.";
  }

  const input: Record<string, unknown> = {
    transcription
  };

  if (options.includeNoiseReduction) {
    input.noise_reduction = {
      type: "far_field"
    };
  }

  if (options.includeTurnDetection) {
    input.turn_detection = {
      type: "server_vad",
      threshold: 0.45,
      prefix_padding_ms: 250,
      silence_duration_ms: 380
    };
  }

  const sessionConfig: Record<string, unknown> = {
    expires_after: {
      anchor: "created_at",
      seconds: 600
    },
    session: {
      type: "transcription",
      audio: {
        input
      }
    }
  };

  if (options.includeLogprobs) {
    sessionConfig.session = {
      ...(sessionConfig.session as Record<string, unknown>),
      include: ["item.input_audio_transcription.logprobs"]
    };
  }

  return sessionConfig;
}

function createRealtimeSecret(apiKey: string, sessionConfig: Record<string, unknown>) {
  return fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(sessionConfig)
  });
}

function unsupportedRealtimeField(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const error = "error" in payload ? (payload as { error?: unknown }).error : undefined;
  if (!error || typeof error !== "object") {
    return null;
  }

  const param = "param" in error ? String((error as { param?: unknown }).param ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const lowerMessage = message.toLowerCase();

  if (param.endsWith(".prompt") || lowerMessage.includes("prompt")) return "prompt";
  if (param.includes("turn_detection") || lowerMessage.includes("turn detection")) {
    return "turn_detection";
  }
  if (param.includes("noise_reduction") || lowerMessage.includes("noise reduction")) {
    return "noise_reduction";
  }
  if (param.includes("include") || lowerMessage.includes("logprobs")) return "include";

  return null;
}

function realtimeError(status: number, payload: unknown) {
  return NextResponse.json(
    {
      error: "Failed to create OpenAI Realtime client secret.",
      details: payload
    },
    { status }
  );
}
