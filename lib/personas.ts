import type { ClaimSignal } from "./claim-intelligence";

export const PERSONAS = [
  {
    id: "fact-checker",
    name: "Gary Dell'Abate",
    role: "Fact-checker",
    shortRole: "Facts",
    initials: "GD",
    color: "#7fb8d8",
    accent: "#e4eef5",
    prompt:
      "Monitor factual claims. Correct mistakes, add concise background data, and include citations when verification matters."
  },
  {
    id: "comedy-writer",
    name: "Jackie Martling",
    role: "Comedy Writer",
    shortRole: "Jokes",
    initials: "JM",
    color: "#edbd76",
    accent: "#fbefd8",
    prompt:
      "Generate one short joke, tag, or one-liner tied to the current discussion. Keep it punchy and safe."
  },
  {
    id: "news-update",
    name: "Robin Quivers",
    role: "News Update",
    shortRole: "News",
    initials: "RQ",
    color: "#eaa2ac",
    accent: "#f8e4e5",
    prompt:
      "Provide relevant recent news updates connected to the topic. Cite sources when using current information."
  },
  {
    id: "cynical-commentary",
    name: "Sidebar Troll",
    role: "Cynical Commentary",
    shortRole: "Cynic",
    initials: "CT",
    color: "#b8b0cd",
    accent: "#ece9f2",
    prompt:
      "Offer a chaotic, negative-cynical reaction. It can be sharp, but it must avoid hateful, abusive, or targeted harassment."
  }
] as const;

export type PersonaId = (typeof PERSONAS)[number]["id"];

export type PersonaCard = {
  id: string;
  persona: PersonaId;
  text: string;
  type: "fact" | "comedy" | "news" | "cynic";
  confidence: number;
  sources: Array<{
    title: string;
    url: string;
  }>;
  createdAt: string;
  transcriptRange: {
    start: string;
    end: string;
  };
};

export type PersonaAnalyzeRequest = {
  transcriptWindow: string;
  activePersonas: PersonaId[];
  modelRouter?: {
    provider?: string;
    model?: string;
  };
  promptStudio?: PromptStudioConfig;
  projectMemory?: ProjectMemoryConfig;
  showMetadata?: {
    title?: string;
    host?: string;
    episode?: string;
    url?: string;
    timestamp?: string;
  };
};

export type ProjectMemoryConfig = {
  projectName?: string;
  ownerContext?: string;
  audience?: string;
  preferredTools?: string;
  dataPolicy?: string;
  storageNotes?: string;
  attachedMemory?: string;
};

export type PromptStudioConfig = {
  showContext?: string;
  directive?: string;
  tone?: string;
  guardrails?: string;
  personaPrompts?: Partial<Record<PersonaId, string>>;
};

export function isPersonaId(value: string): value is PersonaId {
  return PERSONAS.some((persona) => persona.id === value);
}

export function getPersona(id: PersonaId) {
  return PERSONAS.find((persona) => persona.id === id) ?? PERSONAS[0];
}

export function personaTypeFor(id: PersonaId): PersonaCard["type"] {
  switch (id) {
    case "fact-checker":
      return "fact";
    case "comedy-writer":
      return "comedy";
    case "news-update":
      return "news";
    case "cynical-commentary":
      return "cynic";
  }
}

export function createFallbackCards(
  transcriptWindow: string,
  activePersonas: PersonaId[],
  fallbackSources?: PersonaCard["sources"],
  claimSignal?: ClaimSignal
): PersonaCard[] {
  const trimmed = transcriptWindow.trim();
  if (!trimmed) {
    return [];
  }

  const topic = summarizeTopic(trimmed);
  const now = new Date().toISOString();
  const start = new Date(Date.now() - 15_000).toISOString();
  const sources =
    fallbackSources && fallbackSources.length > 0
      ? fallbackSources
      : [
          {
            title: "Demo mode",
            url: "https://platform.openai.com/docs/guides/realtime-transcription"
          }
        ];

  return activePersonas.slice(0, 4).map((personaId, index) => {
    const type = personaTypeFor(personaId);
    const text = fallbackText(type, topic, claimSignal);

    return {
      id: `fallback-${personaId}-${Date.now()}-${index}`,
      persona: personaId,
      text,
      type,
      confidence: type === "comedy" || type === "cynic" ? 0.72 : 0.64,
      sources: type === "fact" || type === "news" ? sources : [],
      createdAt: now,
      transcriptRange: {
        start,
        end: now
      }
    };
  });
}

function summarizeTopic(transcriptWindow: string) {
  const clean = transcriptWindow
    .replace(/\s+/g, " ")
    .replace(/[^\w\s'-]/g, "")
    .trim();
  const words = clean.split(" ").filter(Boolean);
  return words.slice(Math.max(0, words.length - 14)).join(" ");
}

function fallbackText(type: PersonaCard["type"], topic: string, claimSignal?: ClaimSignal) {
  const entity = claimSignal?.primaryEntity || topic;
  const numbers = claimSignal?.keyNumbers.length ? ` (${claimSignal.keyNumbers.slice(0, 2).join(", ")})` : "";

  switch (type) {
    case "fact":
      if (claimSignal?.isLikelyClaim) {
        return `Fact-check cue: verify ${entity}${numbers} with a Tier 1 or Tier 2 source before the claim becomes the show's accepted version.`;
      }
      return `Fact-check cue: no strong named claim yet. Wait for a company, person, number, or dated assertion before checking.`;
    case "comedy":
      return `Tag: "${topic}" sounds like a meeting that should have been a two-second sound effect.`;
    case "news":
      if (claimSignal?.isLikelyClaim) {
        return `News cue: look for recent coverage on ${entity}${numbers}, cite it, and call out what the source does not confirm.`;
      }
      return `News cue: hold for a sharper topic or named entity before calling anything current.`;
    case "cynic":
      return `Cynic note: bold confidence detected around "${topic}"; reality may want a word.`;
  }
}
