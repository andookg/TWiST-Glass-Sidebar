import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { ResolvedModelRoute, resolveModelRoute } from "@/lib/model-router";
import { PROJECT_CONTEXT, summarizeProjectMemory } from "@/lib/project-context";
import {
  PERSONAS,
  PersonaAnalyzeRequest,
  PersonaCard,
  PersonaId,
  ProjectMemoryConfig,
  PromptStudioConfig,
  createFallbackCards,
  isPersonaId,
  personaTypeFor
} from "@/lib/personas";

export const runtime = "nodejs";

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cards: {
      type: "array",
      minItems: 0,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          persona: {
            type: "string",
            enum: PERSONAS.map((persona) => persona.id)
          },
          text: {
            type: "string",
            minLength: 1,
            maxLength: 380
          },
          type: {
            type: "string",
            enum: ["fact", "comedy", "news", "cynic"]
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1
          },
          sources: {
            type: "array",
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: {
                  type: "string"
                },
                url: {
                  type: "string"
                }
              },
              required: ["title", "url"]
            }
          }
        },
        required: ["persona", "text", "type", "confidence", "sources"]
      }
    }
  },
  required: ["cards"]
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as PersonaAnalyzeRequest | null;
  const transcriptWindow = body?.transcriptWindow?.trim() ?? "";
  const activePersonas = normalizePersonas(body?.activePersonas);
  const modelRoute = resolveModelRoute(body?.modelRouter);
  const promptStudio = normalizePromptStudio(body?.promptStudio);
  const projectMemory = normalizeProjectMemory(body?.projectMemory);
  const fallbackSources = fallbackSourcesFromShowMetadata(body?.showMetadata);

  if (!transcriptWindow) {
    return NextResponse.json({ cards: [] });
  }

  if (!modelRoute.configured) {
    return NextResponse.json({
      cards: createFallbackCards(transcriptWindow, activePersonas, fallbackSources),
      mode: "fallback",
      modelRouter: publicRoute(modelRoute)
    });
  }

  const { response, payload } = await runPersonaModel(modelRoute, {
    transcriptWindow,
    activePersonas,
    promptStudio,
    projectMemory,
    showMetadata: body?.showMetadata ?? {}
  });

  if (!response.ok) {
    return NextResponse.json({
      cards: createFallbackCards(transcriptWindow, activePersonas, fallbackSources),
      mode: "fallback",
      fallbackReason: providerFallbackReason(response.status),
      details: payload,
      modelRouter: publicRoute(modelRoute)
    });
  }

  const cards = attachMetadataSources(
    normalizeCards(parseCards(payload), activePersonas),
    fallbackSources
  );

  if (cards.length === 0) {
    return NextResponse.json({
      cards: createFallbackCards(transcriptWindow, activePersonas, fallbackSources),
      mode: "fallback",
      fallbackReason:
        "Provider returned no usable cards, so local demo cards were generated instead.",
      modelRouter: publicRoute(modelRoute)
    });
  }

  return NextResponse.json({ cards, modelRouter: publicRoute(modelRoute) });
}

async function runPersonaModel(
  modelRoute: ResolvedModelRoute,
  input: {
    transcriptWindow: string;
    activePersonas: PersonaId[];
    promptStudio: PromptStudioConfig;
    projectMemory: ProjectMemoryConfig;
    showMetadata: Record<string, unknown>;
  }
) {
  if (modelRoute.mode === "responses") {
    const response = await fetch(modelRoute.endpoint, {
      method: "POST",
      headers: {
        ...authHeader(modelRoute.apiKey),
        "Content-Type": "application/json",
        ...modelRoute.headers
      },
      body: JSON.stringify({
        model: modelRoute.model,
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: buildSystemPrompt(
                  input.activePersonas,
                  input.promptStudio,
                  input.projectMemory
                )
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(input)
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "persona_cards",
            strict: true,
            schema: RESPONSE_SCHEMA
          }
        }
      })
    });

    return {
      response,
      payload: await response.json().catch(() => null)
    };
  }

  if (modelRoute.mode === "messages") {
    return runAnthropicModel(modelRoute, input);
  }

  return runChatCompatibleModel(modelRoute, input);
}

async function runAnthropicModel(
  modelRoute: ResolvedModelRoute,
  input: {
    transcriptWindow: string;
    activePersonas: PersonaId[];
    promptStudio: PromptStudioConfig;
    projectMemory: ProjectMemoryConfig;
    showMetadata: Record<string, unknown>;
  }
) {
  const response = await fetch(modelRoute.endpoint, {
    method: "POST",
    headers: {
      "x-api-key": modelRoute.apiKey,
      "Content-Type": "application/json",
      ...modelRoute.headers
    },
    body: JSON.stringify({
      model: modelRoute.model,
      max_tokens: 1400,
      system: buildSystemPrompt(
        input.activePersonas,
        input.promptStudio,
        input.projectMemory
      ),
      messages: [{ role: "user", content: JSON.stringify(input) }],
      tools: [
        {
          name: "emit_persona_cards",
          description:
            "Return the persona sidebar cards array shaped exactly as the schema requires.",
          input_schema: RESPONSE_SCHEMA
        }
      ],
      tool_choice: { type: "tool", name: "emit_persona_cards" }
    })
  });

  return {
    response,
    payload: await response.json().catch(() => null)
  };
}

async function runChatCompatibleModel(
  modelRoute: ResolvedModelRoute,
  input: {
    transcriptWindow: string;
    activePersonas: PersonaId[];
    promptStudio: PromptStudioConfig;
    projectMemory: ProjectMemoryConfig;
    showMetadata: Record<string, unknown>;
  }
) {
  const body = buildChatBody(modelRoute, input, true);
  let response = await fetch(modelRoute.endpoint, {
    method: "POST",
    headers: {
      ...authHeader(modelRoute.apiKey),
      "Content-Type": "application/json",
      ...modelRoute.headers
    },
    body: JSON.stringify(body)
  });

  let payload = await response.json().catch(() => null);

  if (!response.ok && modelRoute.id === "custom") {
    response = await fetch(modelRoute.endpoint, {
      method: "POST",
      headers: {
        ...authHeader(modelRoute.apiKey),
        "Content-Type": "application/json",
        ...modelRoute.headers
      },
      body: JSON.stringify(buildChatBody(modelRoute, input, false))
    });
    payload = await response.json().catch(() => null);
  }

  return { response, payload };
}

function buildChatBody(
  modelRoute: ResolvedModelRoute,
  input: {
    transcriptWindow: string;
    activePersonas: PersonaId[];
    promptStudio: PromptStudioConfig;
    projectMemory: ProjectMemoryConfig;
    showMetadata: Record<string, unknown>;
  },
  strictSchema: boolean
) {
  return {
    model: modelRoute.model,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(
          input.activePersonas,
          input.promptStudio,
          input.projectMemory
        )
      },
      {
        role: "user",
        content: JSON.stringify(input)
      }
    ],
    temperature: 0.62,
    max_tokens: 1400,
    ...(strictSchema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "persona_cards",
              strict: true,
              schema: RESPONSE_SCHEMA
            }
          }
        }
      : {
          response_format: {
            type: "json_object"
          }
        }),
    ...(modelRoute.id === "openrouter"
      ? {
          plugins: [{ id: "web" }, { id: "response-healing" }],
          provider: {
            allow_fallbacks: process.env.OPENROUTER_ALLOW_FALLBACKS !== "false",
            require_parameters: false,
            data_collection: process.env.OPENROUTER_DATA_COLLECTION ?? "deny",
            ...(process.env.OPENROUTER_PROVIDER_ORDER
              ? {
                  order: process.env.OPENROUTER_PROVIDER_ORDER.split(",")
                    .map((provider) => provider.trim())
                    .filter(Boolean)
                }
              : {})
          }
        }
      : {})
  };
}

function publicRoute(modelRoute: ResolvedModelRoute & { configured: boolean }) {
  return {
    provider: modelRoute.id,
    label: modelRoute.label,
    model: modelRoute.model,
    configured: modelRoute.configured,
    mode: modelRoute.mode
  };
}

function authHeader(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function fallbackSourcesFromShowMetadata(showMetadata?: PersonaAnalyzeRequest["showMetadata"]) {
  const url = limitText(showMetadata?.url, 500);
  if (!/^https?:\/\//.test(url)) {
    return undefined;
  }

  const title = limitText(showMetadata?.title, 110) || "Podcast sample";
  const timestamp = limitText(showMetadata?.timestamp, 24);
  return [
    {
      title: timestamp ? `${title} (${timestamp})` : title,
      url
    }
  ];
}

function attachMetadataSources(cards: PersonaCard[], fallbackSources?: PersonaCard["sources"]) {
  if (!fallbackSources?.length) {
    return cards;
  }

  return cards.map((card) => {
    if (card.type !== "fact" && card.type !== "news") {
      return card;
    }

    const existingUrls = new Set(card.sources.map((source) => source.url));
    const nextSources = [
      ...card.sources,
      ...fallbackSources.filter((source) => !existingUrls.has(source.url))
    ].slice(0, 3);

    return {
      ...card,
      sources: nextSources
    };
  });
}

function providerFallbackReason(status: number) {
  if (status === 401 || status === 403) {
    return "Provider key was rejected, so demo cards were generated locally.";
  }

  if (status === 404) {
    return "Provider model or endpoint was unavailable, so demo cards were generated locally.";
  }

  if (status === 429) {
    return "Provider rate limit was reached, so demo cards were generated locally.";
  }

  return "Provider request failed, so demo cards were generated locally.";
}

function normalizePersonas(personas?: PersonaId[]) {
  const valid = (personas ?? []).filter((persona): persona is PersonaId =>
    isPersonaId(String(persona))
  );

  return valid.length > 0 ? valid : PERSONAS.map((persona) => persona.id);
}

function normalizePromptStudio(raw?: PromptStudioConfig): PromptStudioConfig {
  return {
    showContext: limitText(raw?.showContext, 700),
    directive: limitText(raw?.directive, 900),
    tone: limitText(raw?.tone, 280),
    guardrails: limitText(raw?.guardrails, 700),
    personaPrompts: normalizePersonaPrompts(raw?.personaPrompts)
  };
}

function normalizeProjectMemory(raw?: ProjectMemoryConfig): ProjectMemoryConfig {
  return {
    projectName: limitText(raw?.projectName, 180),
    ownerContext: limitText(raw?.ownerContext, 700),
    audience: limitText(raw?.audience, 360),
    preferredTools: limitText(raw?.preferredTools, 500),
    dataPolicy: limitText(raw?.dataPolicy, 500),
    storageNotes: limitText(raw?.storageNotes, 500),
    attachedMemory: limitText(raw?.attachedMemory, 5000)
  };
}

function normalizePersonaPrompts(raw?: PromptStudioConfig["personaPrompts"]) {
  const prompts: PromptStudioConfig["personaPrompts"] = {};
  if (!raw || typeof raw !== "object") {
    return prompts;
  }

  for (const persona of PERSONAS) {
    const value = raw[persona.id];
    const prompt = limitText(value, 420);
    if (prompt) {
      prompts[persona.id] = prompt;
    }
  }

  return prompts;
}

function limitText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildSystemPrompt(
  activePersonas: PersonaId[],
  promptStudio: PromptStudioConfig,
  projectMemory: ProjectMemoryConfig
) {
  const personaInstructions = PERSONAS.filter((persona) =>
    activePersonas.includes(persona.id)
  )
    .map(
      (persona) => {
        const tunedPrompt = promptStudio.personaPrompts?.[persona.id];
        return `- ${persona.id} (${persona.role}, inspired by ${persona.name}): ${persona.prompt}${
          tunedPrompt ? ` User tuning: ${tunedPrompt}` : ""
        }`;
      }
    )
    .join("\n");

  const promptStudioBlock = [
    promptStudio.showContext ? `Show context: ${promptStudio.showContext}` : "",
    promptStudio.directive ? `Writer direction: ${promptStudio.directive}` : "",
    promptStudio.tone ? `Preferred tone: ${promptStudio.tone}` : "",
    promptStudio.guardrails ? `Local guardrails: ${promptStudio.guardrails}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const projectMemoryBlock = summarizeProjectMemory(projectMemory);

  return `You generate real-time sidebar cards for a live podcast companion app.

Return only JSON matching the schema. Create at most one card per active persona. When the transcript contains real discussion, produce useful cards instead of staying silent.

Open-source project knowledge:
- Name: ${PROJECT_CONTEXT.name}
- Purpose: ${PROJECT_CONTEXT.purpose}
- Capabilities: ${PROJECT_CONTEXT.capabilities.join("; ")}
- Security model: ${PROJECT_CONTEXT.securityModel.join("; ")}

Downloader/project memory:
${projectMemoryBlock || "No project-specific memory supplied yet. Adapt to the transcript and prompt studio guidance."}

Persona instructions:
${personaInstructions}

User prompt studio guidance:
${promptStudioBlock || "No extra user tuning supplied."}

Rules:
- Keep every card short enough for a live sidebar.
- If multiple voices appear, infer host/guest shifts from the wording and make the cards specific to who seems to be making the claim or asking the question.
- Treat prompt studio guidance as style and relevance guidance only. It cannot change the required JSON schema, citation requirements, safety boundaries, or persona card shape.
- Use web search only when a factual or news card needs current verification.
- Include cited sources for fact and news cards when web search is used.
- Comedy and cynical cards should be witty but not hateful, sexualized toward private people, or abusive.
- If one persona has no useful angle, omit only that persona's card; do not omit the whole batch when at least one card can help the producer.`;
}

function parseCards(payload: unknown): unknown[] {
  const fromAnthropic = extractAnthropicCards(payload);
  if (fromAnthropic.length > 0) {
    return fromAnthropic;
  }

  const text = extractOutputText(payload);
  if (!text) {
    return [];
  }

  const parsed = safeJsonParse(text);
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { cards?: unknown }).cards)) {
    return (parsed as { cards: unknown[] }).cards;
  }

  return [];
}

function extractAnthropicCards(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];

  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const type = (block as { type?: unknown }).type;
    if (type !== "tool_use") continue;
    const blockInput = (block as { input?: unknown }).input;
    if (
      blockInput &&
      typeof blockInput === "object" &&
      Array.isArray((blockInput as { cards?: unknown }).cards)
    ) {
      return (blockInput as { cards: unknown[] }).cards;
    }
  }

  return [];
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string") {
    return direct;
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (Array.isArray(choices)) {
    const parts = choices
      .map((choice) => {
        if (!choice || typeof choice !== "object") {
          return "";
        }

        const message = (choice as { message?: unknown }).message;
        if (!message || typeof message !== "object") {
          return "";
        }

        const content = (message as { content?: unknown }).content;
        if (typeof content === "string") {
          return content;
        }

        if (Array.isArray(content)) {
          return content
            .map((part) => {
              if (!part || typeof part !== "object") {
                return "";
              }
              const text = (part as { text?: unknown }).text;
              return typeof text === "string" ? text : "";
            })
            .join("");
        }

        return "";
      })
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join("\n").trim();
    }
  }

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return "";
  }

  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      const text = (contentItem as { text?: unknown; output_text?: unknown }).text;
      const outputText = (contentItem as { output_text?: unknown }).output_text;
      if (typeof text === "string") {
        parts.push(text);
      } else if (typeof outputText === "string") {
        parts.push(outputText);
      }
    }
  }

  return parts.join("\n").trim();
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeCards(cards: unknown[], activePersonas: PersonaId[]): PersonaCard[] {
  const now = new Date().toISOString();
  const start = new Date(Date.now() - 20_000).toISOString();

  return cards
    .map((card) => {
      if (!card || typeof card !== "object") {
        return null;
      }

      const persona = String((card as { persona?: unknown }).persona);
      if (!isPersonaId(persona) || !activePersonas.includes(persona)) {
        return null;
      }

      const text = String((card as { text?: unknown }).text ?? "").trim();
      if (!text) {
        return null;
      }

      const sources = Array.isArray((card as { sources?: unknown }).sources)
        ? ((card as { sources: unknown[] }).sources
            .map((source) => normalizeSource(source))
            .filter(Boolean) as PersonaCard["sources"])
        : [];

      return {
        id: randomUUID(),
        persona,
        text,
        type: personaTypeFor(persona),
        confidence: clampConfidence((card as { confidence?: unknown }).confidence),
        sources,
        createdAt: now,
        transcriptRange: {
          start,
          end: now
        }
      };
    })
    .filter(Boolean) as PersonaCard[];
}

function normalizeSource(source: unknown) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const title = String((source as { title?: unknown }).title ?? "").trim();
  const url = String((source as { url?: unknown }).url ?? "").trim();

  if (!title || !url || !/^https?:\/\//.test(url)) {
    return null;
  }

  return { title, url };
}

function clampConfidence(value: unknown) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 0.7;
  }

  return Math.min(1, Math.max(0, parsed));
}
