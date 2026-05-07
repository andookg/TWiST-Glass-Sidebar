import { NextResponse } from "next/server";

import { CLIP_SUGGESTION_SCHEMA, REMOTION_PROPS_SCHEMA } from "@/lib/clips";
import { readMemoryStash, summarizeMemoryAttachments } from "@/lib/memory-stash";
import { getModelRouteSummaries } from "@/lib/model-router";
import { PERSONAS } from "@/lib/personas";
import { PROJECT_CONTEXT } from "@/lib/project-context";
import { getRuntimeConfigStatus, getRuntimeOpenAIConfig } from "@/lib/runtime-config";
import { getStorageStatus } from "@/lib/storage-adapters";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!canReadAgentBrief(request)) {
    return NextResponse.json(
      {
        error:
          "Agent brief is local-only by default. Set AGENT_BRIEF_PUBLIC=true for hosted read access."
      },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? "default";
  const memory = readMemoryStash(projectId);
  const openaiConfig = getRuntimeOpenAIConfig();
  const brief = {
    manifestVersion: "2026-05-agent-brief",
    generatedAt: new Date().toISOString(),
    simpleCore: true,
    project: PROJECT_CONTEXT,
    currentRuntime: {
      modelRoutes: getModelRouteSummaries(),
      runtimeKeys: getRuntimeConfigStatus(),
      storage: getStorageStatus(),
      openaiRealtime: {
        transcriptModel: openaiConfig.transcribeModel,
        voiceModel: openaiConfig.realtimeModel,
        translationModel: openaiConfig.translationModel,
        voiceSessionEndpoint: "/api/realtime/voice-session",
        translationSessionEndpoint: "/api/realtime/translate-session",
        transcriptionSessionEndpoint: "/api/realtime/session",
        note:
          "The live sidebar currently uses realtime transcription. Voice and translation sessions are exposed as ready endpoints for agents that want speech-to-speech or multilingual handoff."
      }
    },
    agentInstructions: [
      "Read this brief first.",
      "Use /api/project-context for static project capabilities.",
      "Use /api/memory/stash to inspect attached local memory metadata and previews.",
      "Use /api/clips/suggest to produce render-ready clip suggestions.",
      "Use /api/agent/clip-handoff to convert clip suggestions into Remotion render actions.",
      "Never ask the browser for secrets; use server-side routes and redacted status only."
    ],
    personas: PERSONAS.map((persona) => ({
      id: persona.id,
      role: persona.role,
      shortRole: persona.shortRole,
      prompt: persona.prompt
    })),
    memory: {
      projectId: memory.projectId,
      filePath: memory.filePath,
      totalFiles: memory.totalFiles,
      totalBytes: memory.totalBytes,
      attachedSummary: summarizeMemoryAttachments(memory.attachments),
      attachments: memory.attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        relativePath: attachment.relativePath,
        mimeType: attachment.mimeType,
        size: attachment.size,
        hasPreview: Boolean(attachment.preview),
        preview: attachment.preview.slice(0, 1200),
        createdAt: attachment.createdAt
      }))
    },
    publicEndpoints: {
      realtimeTranscriptionSession: "POST /api/realtime/session",
      realtimeVoiceSession: "POST /api/realtime/voice-session",
      realtimeTranslationSession: "POST /api/realtime/translate-session",
      personaAnalyze: "POST /api/personas/analyze",
      clipSuggest: "POST /api/clips/suggest",
      clipHandoff: "GET|POST /api/agent/clip-handoff",
      agentBrief: "GET /api/agent/brief",
      memoryStash: "GET|POST /api/memory/stash",
      runtimeConfig: "GET|POST /api/runtime-config",
      storageEvents: "POST /api/storage/events"
    },
    schemas: {
      clipSuggestion: CLIP_SUGGESTION_SCHEMA,
      remotionProps: REMOTION_PROPS_SCHEMA
    }
  };

  if (url.searchParams.get("format") === "md") {
    return new NextResponse(toMarkdown(brief), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8"
      }
    });
  }

  return NextResponse.json(brief);
}

function canReadAgentBrief(request: Request) {
  if (process.env.AGENT_BRIEF_PUBLIC === "true") {
    return true;
  }

  const host = request.headers.get("host") ?? "";
  const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function toMarkdown(brief: {
  generatedAt: string;
  project: typeof PROJECT_CONTEXT;
  publicEndpoints: Record<string, string>;
  agentInstructions: string[];
  memory: {
    totalFiles: number;
    totalBytes: number;
    attachedSummary: string;
  };
}) {
  return [
    `# ${brief.project.name} Agent Brief`,
    "",
    `Generated: ${brief.generatedAt}`,
    "",
    brief.project.purpose,
    "",
    "## Instructions",
    ...brief.agentInstructions.map((item) => `- ${item}`),
    "",
    "## Endpoints",
    ...Object.entries(brief.publicEndpoints).map(([name, endpoint]) => `- ${name}: \`${endpoint}\``),
    "",
    "## Attached Memory",
    `Files: ${brief.memory.totalFiles}`,
    `Bytes: ${brief.memory.totalBytes}`,
    brief.memory.attachedSummary || "No attached memory yet."
  ].join("\n");
}
