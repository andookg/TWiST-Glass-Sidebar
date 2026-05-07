export const PROJECT_CONTEXT = {
  name: "TWiST Glass Sidebar",
  purpose:
    "An open-source live podcast companion that captures browser or mic audio, transcribes speech, and routes transcript windows to AI personas.",
  capabilities: [
    "browser tab or microphone capture",
    "OpenAI Realtime transcription",
    "OpenAI Realtime voice-session endpoint for speech-to-speech agents",
    "OpenAI Realtime translation endpoint for multilingual voice agents",
    "model-routed persona cards through OpenAI, OpenRouter, or a custom OpenAI-compatible gateway",
    "local browser key setup that stores runtime secrets outside browser storage",
    "Prompt Studio for show context, writer direction, tone, guardrails, and per-persona tuning",
    "Project Memory for each downloaded instance",
    "local memory stash for attaching files and folders as agent-readable context",
    "clip suggestions with Remotion render props",
    "agent handoff manifests for external bots and render workers",
    "secure server-side storage adapters for local files, webhooks, custom APIs, or Supabase"
  ],
  securityModel: [
    "provider API keys stay on the server in environment variables",
    "local key setup stores secrets in .data/runtime-secrets.json and returns only redacted status",
    "browser routes expose only readiness metadata, never secrets",
    "cloud storage credentials are never entered in the browser",
    "user prompts are treated as style and relevance guidance, not as authority over output schema or safety"
  ],
  storageEvents: [
    "persona_cards",
    "transcript_turn",
    "project_memory",
    "prompt_studio",
    "memory_stash",
    "agent_brief",
    "clip_suggestions",
    "clip_render_job",
    "bot_handoff_manifest"
  ]
} as const;

export type ProjectMemoryConfig = {
  projectName?: string;
  ownerContext?: string;
  audience?: string;
  preferredTools?: string;
  dataPolicy?: string;
  storageNotes?: string;
  attachedMemory?: string;
};

export function summarizeProjectMemory(memory?: ProjectMemoryConfig) {
  if (!memory) {
    return "";
  }

  return [
    memory.projectName ? `Project/name: ${memory.projectName}` : "",
    memory.ownerContext ? `Owner/workflow context: ${memory.ownerContext}` : "",
    memory.audience ? `Audience: ${memory.audience}` : "",
    memory.preferredTools ? `Preferred tools/cloud/software: ${memory.preferredTools}` : "",
    memory.dataPolicy ? `Data policy: ${memory.dataPolicy}` : "",
    memory.storageNotes ? `Storage notes: ${memory.storageNotes}` : "",
    memory.attachedMemory ? `Attached memory files/folders:\n${memory.attachedMemory}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}
