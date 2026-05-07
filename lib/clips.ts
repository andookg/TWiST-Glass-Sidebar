import type { ModelRouterSelection } from "@/lib/model-router";
import type { ProjectMemoryConfig } from "@/lib/project-context";
import type { PersonaCard, PromptStudioConfig } from "@/lib/personas";

export type ClipFormat = "vertical" | "square" | "horizontal";
export type ClipPriority = "high" | "medium" | "low";

export type ClipSuggestion = {
  id: string;
  title: string;
  hook: string;
  reason: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  format: ClipFormat;
  priority: ClipPriority;
  tags: string[];
  transcriptQuote: string;
  brollIdeas: string[];
  captionBeats: string[];
  sources: PersonaCard["sources"];
  remotion: {
    compositionId: "ClipSuggestion";
    propsPath: string;
    inputProps: RemotionClipProps;
    renderCommand: string;
  };
  botAction: {
    action: "render_clip";
    confidence: number;
    requiredAssets: string[];
    nextSteps: string[];
  };
  createdAt: string;
};

export type RemotionClipProps = {
  clipId: string;
  title: string;
  hook: string;
  transcriptQuote: string;
  reason: string;
  tags: string[];
  brollIdeas: string[];
  captionBeats: string[];
  priority: ClipPriority;
  sourceLabel: string;
  accent: string;
};

export type ClipSuggestionRequest = {
  transcriptWindow: string;
  personaCards?: PersonaCard[];
  modelRouter?: ModelRouterSelection;
  promptStudio?: PromptStudioConfig;
  projectMemory?: ProjectMemoryConfig;
};

export type ClipHandoffManifest = {
  manifestVersion: "2026-05-clip-handoff";
  createdAt: string;
  project: {
    name: string;
    projectId: string;
    dataPolicy?: string;
    preferredTools?: string;
    attachedMemory?: string;
  };
  entrypoints: {
    suggestClips: "/api/clips/suggest";
    handoff: "/api/agent/clip-handoff";
    remotionProject: "remotion-clips";
  };
  schema: {
    clipSuggestion: typeof CLIP_SUGGESTION_SCHEMA;
    remotionProps: typeof REMOTION_PROPS_SCHEMA;
  };
  clips: ClipSuggestion[];
  actions: Array<{
    type: "render_remotion_clip";
    clipId: string;
    compositionId: "ClipSuggestion";
    propsPath: string;
    inputProps: RemotionClipProps;
    command: string;
    outputHint: string;
  }>;
};

export const REMOTION_PROPS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    clipId: { type: "string" },
    title: { type: "string" },
    hook: { type: "string" },
    transcriptQuote: { type: "string" },
    reason: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    brollIdeas: { type: "array", items: { type: "string" } },
    captionBeats: { type: "array", items: { type: "string" } },
    priority: { type: "string", enum: ["high", "medium", "low"] },
    sourceLabel: { type: "string" },
    accent: { type: "string" }
  },
  required: [
    "clipId",
    "title",
    "hook",
    "transcriptQuote",
    "reason",
    "tags",
    "brollIdeas",
    "captionBeats",
    "priority",
    "sourceLabel",
    "accent"
  ]
} as const;

export const CLIP_SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    hook: { type: "string" },
    reason: { type: "string" },
    startSec: { type: "number" },
    endSec: { type: "number" },
    durationSec: { type: "number" },
    format: { type: "string", enum: ["vertical", "square", "horizontal"] },
    priority: { type: "string", enum: ["high", "medium", "low"] },
    tags: { type: "array", items: { type: "string" } },
    transcriptQuote: { type: "string" },
    brollIdeas: { type: "array", items: { type: "string" } },
    captionBeats: { type: "array", items: { type: "string" } },
    sources: { type: "array" },
    remotion: { type: "object" },
    botAction: { type: "object" },
    createdAt: { type: "string" }
  },
  required: [
    "id",
    "title",
    "hook",
    "reason",
    "startSec",
    "endSec",
    "durationSec",
    "format",
    "priority",
    "tags",
    "transcriptQuote",
    "brollIdeas",
    "captionBeats",
    "sources",
    "remotion",
    "botAction",
    "createdAt"
  ]
} as const;

const MAX_CLIPS = 4;
const DEFAULT_ACCENTS = ["#7fb8d8", "#9fc6aa", "#edbd76", "#eaa2ac"];

export function createClipSuggestions(input: ClipSuggestionRequest): ClipSuggestion[] {
  const transcriptWindow = cleanText(input.transcriptWindow);
  if (!transcriptWindow) {
    return [];
  }

  const now = new Date().toISOString();
  const moments = scoreMoments(transcriptWindow).slice(0, MAX_CLIPS);
  const cards = input.personaCards?.filter(Boolean).slice(0, 12) ?? [];
  const projectName = cleanText(input.projectMemory?.projectName) || "TWiST Glass Sidebar";

  return moments.map((moment, index) => {
    const personaSignal = pickPersonaSignal(cards, moment.text);
    const priority = priorityFor(moment.score, index);
    const durationSec = clamp(18 + Math.round(moment.text.length / 34), 18, 54);
    const startSec = Math.max(0, index * 24);
    const endSec = startSec + durationSec;
    const tags = buildTags(moment.text, personaSignal?.card, input.promptStudio).slice(0, 6);
    const id = buildClipId(moment.text, index);
    const title = buildTitle(moment.text, personaSignal?.card);
    const hook = buildHook(moment.text, personaSignal?.card);
    const reason = buildReason(moment, personaSignal?.card);
    const captionBeats = buildCaptionBeats(moment.text, hook);
    const brollIdeas = buildBrollIdeas(moment.text, personaSignal?.card);
    const transcriptQuote = truncate(moment.text, 260);
    const accent = personaSignal?.accent ?? DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length];
    const propsPath = `.data/remotion-props/${id}.json`;
    const inputProps: RemotionClipProps = {
      clipId: id,
      title,
      hook,
      transcriptQuote,
      reason,
      tags,
      brollIdeas,
      captionBeats,
      priority,
      sourceLabel: projectName,
      accent
    };

    return {
      id,
      title,
      hook,
      reason,
      startSec,
      endSec,
      durationSec,
      format: "vertical",
      priority,
      tags,
      transcriptQuote,
      brollIdeas,
      captionBeats,
      sources: personaSignal?.card.sources ?? [],
      remotion: {
        compositionId: "ClipSuggestion",
        propsPath,
        inputProps,
        renderCommand: `cd remotion-clips && npx remotion render src/index.ts ClipSuggestion out/${id}.mp4 --props ../${propsPath} --duration ${durationSec * 30}`
      },
      botAction: {
        action: "render_clip",
        confidence: priority === "high" ? 0.88 : priority === "medium" ? 0.76 : 0.64,
        requiredAssets: [
          "source show audio or video segment",
          "transcript quote",
          "Remotion props JSON"
        ],
        nextSteps: [
          "write remotion.inputProps to the propsPath",
          "render the ClipSuggestion composition",
          "attach the rendered clip to the producer workflow"
        ]
      },
      createdAt: now
    };
  });
}

export function createClipHandoffManifest(input: {
  clips: ClipSuggestion[];
  projectMemory?: ProjectMemoryConfig & { projectId?: string };
}): ClipHandoffManifest {
  const projectName = cleanText(input.projectMemory?.projectName) || "TWiST Glass Sidebar";
  const projectId = cleanText(input.projectMemory?.projectId) || "default";

  return {
    manifestVersion: "2026-05-clip-handoff",
    createdAt: new Date().toISOString(),
    project: {
      name: projectName,
      projectId,
      dataPolicy: cleanText(input.projectMemory?.dataPolicy),
      preferredTools: cleanText(input.projectMemory?.preferredTools),
      attachedMemory: cleanText(input.projectMemory?.attachedMemory)
    },
    entrypoints: {
      suggestClips: "/api/clips/suggest",
      handoff: "/api/agent/clip-handoff",
      remotionProject: "remotion-clips"
    },
    schema: {
      clipSuggestion: CLIP_SUGGESTION_SCHEMA,
      remotionProps: REMOTION_PROPS_SCHEMA
    },
    clips: input.clips,
    actions: input.clips.map((clip) => ({
      type: "render_remotion_clip",
      clipId: clip.id,
      compositionId: clip.remotion.compositionId,
      propsPath: clip.remotion.propsPath,
      inputProps: clip.remotion.inputProps,
      command: clip.remotion.renderCommand,
      outputHint: `remotion-clips/out/${clip.id}.mp4`
    }))
  };
}

function scoreMoments(transcriptWindow: string) {
  const sentences = splitSentences(transcriptWindow);
  const chunks = sentences.length > 1 ? combineSentences(sentences) : [transcriptWindow];

  return chunks
    .map((text, index) => ({
      text,
      index,
      score: scoreMoment(text)
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function splitSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 18);
}

function combineSentences(sentences: string[]) {
  const chunks: string[] = [];
  for (let index = 0; index < sentences.length; index += 1) {
    const current = sentences[index];
    const next = sentences[index + 1] ?? "";
    const combined = next && `${current} ${next}`.length < 320 ? `${current} ${next}` : current;
    chunks.push(combined);
  }

  return chunks;
}

function scoreMoment(text: string) {
  const lower = text.toLowerCase();
  let score = 0.35;

  if (/\?/.test(text) || /\b(why|how|should|would|could|what if)\b/.test(lower)) score += 0.16;
  if (/\b(new|breaking|today|yesterday|launch|demo|bounty|competition)\b/.test(lower)) score += 0.16;
  if (/\b(claim|says|said|largest|first|best|worst|number|percent|million|billion)\b/.test(lower)) score += 0.15;
  if (/\b(joke|funny|wild|crazy|sound|clip|producer|agent|ai)\b/.test(lower)) score += 0.12;
  if (/\d/.test(text)) score += 0.08;
  if (text.length > 160 && text.length < 360) score += 0.08;

  return Math.min(0.99, score);
}

function priorityFor(score: number, index: number): ClipPriority {
  if (score >= 0.75 || index === 0) {
    return "high";
  }

  if (score >= 0.58) {
    return "medium";
  }

  return "low";
}

function pickPersonaSignal(cards: PersonaCard[], text: string) {
  if (cards.length === 0) {
    return null;
  }

  const lower = text.toLowerCase();
  const preferred = cards.find((card) => {
    if (card.type === "fact" || card.type === "news") {
      return /\b(claim|says|said|new|today|number|percent|million|billion)\b/.test(lower);
    }

    if (card.type === "comedy") {
      return /\b(joke|sound|clip|producer|demo|ai)\b/.test(lower);
    }

    return false;
  });

  const card = preferred ?? cards[0];
  return {
    card,
    accent:
      card.type === "fact"
        ? "#7fb8d8"
        : card.type === "comedy"
          ? "#edbd76"
          : card.type === "news"
            ? "#eaa2ac"
            : "#b8b0cd"
  };
}

function buildTitle(text: string, card?: PersonaCard) {
  if (card?.type === "news") {
    return titleCase(`News hook: ${extractNounPhrase(text)}`);
  }

  if (card?.type === "fact") {
    return titleCase(`Claim check: ${extractNounPhrase(text)}`);
  }

  return titleCase(extractNounPhrase(text));
}

function buildHook(text: string, card?: PersonaCard) {
  const clean = truncate(text, 120);
  if (card?.type === "comedy") {
    return `The line that gets clipped: ${clean}`;
  }

  if (/\?/.test(text)) {
    return `The question everyone will want answered: ${clean}`;
  }

  return clean;
}

function buildReason(moment: { text: string; score: number }, card?: PersonaCard) {
  if (card) {
    return truncate(`Persona signal: ${card.text}`, 210);
  }

  if (moment.score >= 0.75) {
    return "High-signal clip: strong claim, current hook, or question that can stand alone on social.";
  }

  return "Useful clip candidate: concise moment with enough context for captions and a producer note.";
}

function buildCaptionBeats(text: string, hook: string) {
  const sentences = splitSentences(text).slice(0, 3);
  const beats = sentences.length > 0 ? sentences : [hook];
  return beats.map((beat) => truncate(beat, 92));
}

function buildBrollIdeas(text: string, card?: PersonaCard) {
  const lower = text.toLowerCase();
  const ideas = ["live waveform with glass captions", "host reaction crop"];

  if (/\b(claim|number|percent|million|billion|population)\b/.test(lower) || card?.type === "fact") {
    ideas.push("claim-check lower third");
  }

  if (/\b(news|today|breaking|yesterday)\b/.test(lower) || card?.type === "news") {
    ideas.push("headline/source screenshot slot");
  }

  if (/\b(sound|joke|funny|clip)\b/.test(lower) || card?.type === "comedy") {
    ideas.push("quick punchline title card");
  }

  ideas.push("AI sidebar card overlay");
  return Array.from(new Set(ideas)).slice(0, 5);
}

function buildTags(
  text: string,
  card?: PersonaCard,
  promptStudio?: PromptStudioConfig
) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
  const tags = Array.from(new Set(words)).slice(0, 4);

  if (card?.type) {
    tags.unshift(card.type);
  }

  if (promptStudio?.showContext?.toLowerCase().includes("twist")) {
    tags.push("twist");
  }

  tags.push("clip");
  return Array.from(new Set(tags)).slice(0, 6);
}

function buildClipId(text: string, index: number) {
  const slug = extractNounPhrase(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 38);
  return `clip-${slug || "moment"}-${index + 1}`;
}

function extractNounPhrase(text: string) {
  const clean = cleanText(text).replace(/[.!?]+$/g, "");
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 8) {
    return clean;
  }

  const start = words.findIndex((word) => !STOP_WORDS.has(word.toLowerCase()));
  const phrase = words.slice(Math.max(0, start), Math.max(8, start + 8)).join(" ");
  return phrase || words.slice(0, 8).join(" ");
}

function titleCase(value: string) {
  return value
    .split(" ")
    .map((word) => {
      if (word.length <= 2 || /^[A-Z0-9]+$/.test(word)) {
        return word;
      }

      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function truncate(value: string, maxLength: number) {
  const clean = cleanText(value);
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength - 1).trim()}...`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "before",
  "being",
  "could",
  "every",
  "from",
  "have",
  "into",
  "just",
  "like",
  "more",
  "over",
  "should",
  "that",
  "their",
  "there",
  "this",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would"
]);
