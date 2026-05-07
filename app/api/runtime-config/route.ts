import { NextResponse } from "next/server";

import {
  RuntimeConfigInput,
  getRuntimeConfigStatus,
  isRuntimeProviderId,
  saveRuntimeProviderConfig
} from "@/lib/runtime-config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getRuntimeConfigStatus());
}

export async function POST(request: Request) {
  if (!canConfigureRuntimeSecrets(request)) {
    return NextResponse.json(
      {
        error:
          "Browser key setup is only enabled for local app URLs. Use environment variables for hosted deployments."
      },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as RuntimeConfigInput | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid key setup request." }, { status: 400 });
  }

  if (body.provider !== undefined && !isRuntimeProviderId(body.provider)) {
    return NextResponse.json(
      { error: "Unknown provider. Use 'openai', 'openrouter', or 'custom'." },
      { status: 400 }
    );
  }

  const hasAnySetupValue = Boolean(
    body.clear ||
      body.apiKey?.trim() ||
      body.model?.trim() ||
      body.baseUrl?.trim() ||
      body.headers?.trim() ||
      body.transcribeModel?.trim() ||
      body.realtimeModel?.trim() ||
      body.translationModel?.trim()
  );

  if (!hasAnySetupValue) {
    return NextResponse.json({ error: "Paste a key or configuration value first." }, { status: 400 });
  }

  const status = await saveRuntimeProviderConfig(body);
  return NextResponse.json({
    status,
    message: body.clear ? "Runtime key cleared." : "Runtime key setup saved."
  });
}

function canConfigureRuntimeSecrets(request: Request) {
  if (process.env.BROWSER_KEY_SETUP_DISABLED === "true") {
    return false;
  }

  const host = request.headers.get("host") ?? "";
  const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (!isLocalHost && process.env.BROWSER_KEY_SETUP_ENABLED !== "true") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
