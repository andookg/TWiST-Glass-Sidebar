import { cleanSecret, readRuntimeSecretsSync } from "@/lib/runtime-config";

export type ModelProviderId = "openai" | "openrouter" | "custom";

export type ModelRouterSelection = {
  provider?: string;
  model?: string;
};

export type ModelRouteSummary = {
  id: ModelProviderId;
  label: string;
  configured: boolean;
  model: string;
  endpoint: string;
  mode: "responses" | "chat";
  accent: string;
  capabilities: string[];
};

export type ResolvedModelRoute = ModelRouteSummary & {
  apiKey: string;
  headers: Record<string, string>;
};

const PROVIDERS: Array<Pick<ModelRouteSummary, "id" | "label" | "mode" | "accent" | "capabilities">> = [
  {
    id: "openai",
    label: "OpenAI Responses",
    mode: "responses",
    accent: "#7fb8d8",
    capabilities: ["Realtime sibling", "web search", "schema cards"]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    mode: "chat",
    accent: "#9fc6aa",
    capabilities: ["multi-model", "provider routing", "web plugin"]
  },
  {
    id: "custom",
    label: "Custom Gateway",
    mode: "chat",
    accent: "#edbd76",
    capabilities: ["OpenAI-compatible", "self-hostable", "model override"]
  }
];

export function getModelRouteSummaries(): ModelRouteSummary[] {
  return PROVIDERS.map((provider) => {
    const resolved = resolveModelRoute({ provider: provider.id });
    return {
      id: provider.id,
      label: provider.label,
      configured: resolved.configured,
      model: resolved.model,
      endpoint: resolved.endpoint,
      mode: provider.mode,
      accent: provider.accent,
      capabilities: provider.capabilities
    };
  });
}

export function resolveModelRoute(
  selection: ModelRouterSelection = {}
): ResolvedModelRoute & { configured: boolean } {
  const runtimeSecrets = readRuntimeSecretsSync();
  const providerId = pickProvider(selection.provider);
  const provider = PROVIDERS.find((candidate) => candidate.id === providerId) ?? PROVIDERS[0];

  if (providerId === "openrouter") {
    const apiKey =
      cleanSecret(runtimeSecrets.openrouter?.apiKey) ||
      cleanSecret(process.env.OPENROUTER_API_KEY);
    return {
      ...provider,
      configured: Boolean(apiKey),
      apiKey,
      model:
        clean(selection.model) ||
        runtimeSecrets.openrouter?.model ||
        process.env.OPENROUTER_MODEL ||
        "openrouter/auto",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      headers: {
        ...optionalHeader("HTTP-Referer", process.env.OPENROUTER_SITE_URL),
        ...optionalHeader("X-Title", process.env.OPENROUTER_APP_TITLE ?? "TWiST Glass Sidebar")
      }
    };
  }

  if (providerId === "custom") {
    const apiKey =
      cleanSecret(runtimeSecrets.custom?.apiKey) ||
      cleanSecret(process.env.AI_GATEWAY_API_KEY) ||
      cleanSecret(process.env.CUSTOM_AI_API_KEY);
    const baseUrl =
      runtimeSecrets.custom?.baseUrl ||
      process.env.AI_GATEWAY_BASE_URL ||
      process.env.CUSTOM_AI_BASE_URL ||
      "";
    return {
      ...provider,
      configured: Boolean(baseUrl),
      apiKey,
      model:
        clean(selection.model) ||
        runtimeSecrets.custom?.model ||
        process.env.AI_GATEWAY_MODEL ||
        process.env.CUSTOM_AI_MODEL ||
        "your-model",
      endpoint: toChatCompletionsEndpoint(baseUrl),
      headers: parseCustomHeaders(
        runtimeSecrets.custom?.headers ?? process.env.AI_GATEWAY_HEADERS ?? process.env.CUSTOM_AI_HEADERS
      )
    };
  }

  const apiKey =
    cleanSecret(runtimeSecrets.openai?.apiKey) || cleanSecret(process.env.OPENAI_API_KEY);
  return {
    ...provider,
    configured: Boolean(apiKey),
    apiKey,
    model:
      clean(selection.model) ||
      runtimeSecrets.openai?.personaModel ||
      process.env.OPENAI_PERSONA_MODEL ||
      "gpt-4o",
    endpoint: "https://api.openai.com/v1/responses",
    headers: {}
  };
}

export function pickDefaultProvider() {
  return pickProvider();
}

function pickProvider(requested?: string): ModelProviderId {
  if (isProviderId(requested)) {
    return requested;
  }

  const runtimeSecrets = readRuntimeSecretsSync();

  if (isProviderId(process.env.PERSONA_PROVIDER)) {
    return process.env.PERSONA_PROVIDER;
  }

  if (cleanSecret(runtimeSecrets.openai?.apiKey) || cleanSecret(process.env.OPENAI_API_KEY)) {
    return "openai";
  }

  if (
    cleanSecret(runtimeSecrets.openrouter?.apiKey) ||
    cleanSecret(process.env.OPENROUTER_API_KEY)
  ) {
    return "openrouter";
  }

  if (
    (cleanSecret(runtimeSecrets.custom?.apiKey) ||
      cleanSecret(process.env.AI_GATEWAY_API_KEY) ||
      cleanSecret(process.env.CUSTOM_AI_API_KEY)) &&
    (runtimeSecrets.custom?.baseUrl ||
      process.env.AI_GATEWAY_BASE_URL ||
      process.env.CUSTOM_AI_BASE_URL)
  ) {
    return "custom";
  }

  return "openai";
}

function isProviderId(value?: string): value is ModelProviderId {
  return value === "openai" || value === "openrouter" || value === "custom";
}

function clean(value?: string) {
  return value?.trim() ?? "";
}

function optionalHeader(key: string, value?: string) {
  const trimmed = clean(value);
  return trimmed ? { [key]: trimmed } : {};
}

function toChatCompletionsEndpoint(baseUrl: string) {
  const trimmed = clean(baseUrl).replace(/\/$/, "");
  if (!trimmed) {
    return "";
  }

  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }

  return `${trimmed}/v1/chat/completions`;
}

function parseCustomHeaders(raw?: string) {
  const headers: Record<string, string> = {};
  if (!raw) {
    return headers;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && key.trim() && value.trim()) {
        headers[key] = value;
      }
    }
  } catch {
    return headers;
  }

  return headers;
}
