import { NextResponse } from "next/server";

import { ClipSuggestionRequest, createClipSuggestions } from "@/lib/clips";
import { resolveModelRoute } from "@/lib/model-router";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ClipSuggestionRequest | null;
  const transcriptWindow = body?.transcriptWindow?.trim() ?? "";

  if (!transcriptWindow) {
    return NextResponse.json({ clips: [] });
  }

  const modelRoute = resolveModelRoute(body?.modelRouter);
  const clips = createClipSuggestions({
    transcriptWindow,
    personaCards: Array.isArray(body?.personaCards) ? body?.personaCards : [],
    promptStudio: body?.promptStudio,
    projectMemory: body?.projectMemory,
    modelRouter: body?.modelRouter
  });

  return NextResponse.json({
    clips,
    mode: "structured-heuristic",
    modelRouter: {
      provider: modelRoute.id,
      label: modelRoute.label,
      model: modelRoute.model,
      configured: modelRoute.configured,
      mode: modelRoute.mode
    }
  });
}
