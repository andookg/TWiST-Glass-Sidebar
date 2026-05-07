import { NextResponse } from "next/server";

import {
  CLIP_SUGGESTION_SCHEMA,
  ClipSuggestion,
  REMOTION_PROPS_SCHEMA,
  createClipHandoffManifest
} from "@/lib/clips";
import { saveStorageEvent } from "@/lib/storage-adapters";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    manifestVersion: "2026-05-clip-handoff",
    entrypoints: {
      suggestClips: "/api/clips/suggest",
      handoff: "/api/agent/clip-handoff",
      remotionProject: "remotion-clips"
    },
    acceptedActions: ["render_remotion_clip"],
    renderCommandPattern:
      "cd remotion-clips && npx remotion render src/index.ts ClipSuggestion out/<clip-id>.mp4 --props ../.data/remotion-props/<clip-id>.json --duration <seconds*30>",
    schema: {
      clipSuggestion: CLIP_SUGGESTION_SCHEMA,
      remotionProps: REMOTION_PROPS_SCHEMA
    }
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid clip handoff request." }, { status: 400 });
  }

  const clips = normalizeClips((body as { clips?: unknown }).clips);
  const projectMemory = (body as { projectMemory?: unknown }).projectMemory;
  const manifest = createClipHandoffManifest({
    clips,
    projectMemory:
      projectMemory && typeof projectMemory === "object"
        ? (projectMemory as Parameters<typeof createClipHandoffManifest>[0]["projectMemory"])
        : undefined
  });

  const storage = await saveStorageEvent({
    type: "bot_handoff_manifest",
    projectId: manifest.project.projectId,
    payload: manifest
  });

  return NextResponse.json({
    manifest,
    storage
  });
}

function normalizeClips(value: unknown): ClipSuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((clip): clip is ClipSuggestion => {
    if (!clip || typeof clip !== "object") {
      return false;
    }

    const candidate = clip as Partial<ClipSuggestion>;
    return Boolean(
      candidate.id &&
        candidate.title &&
        candidate.remotion?.compositionId === "ClipSuggestion" &&
        candidate.remotion.inputProps
    );
  });
}
