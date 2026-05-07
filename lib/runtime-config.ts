import { existsSync, readFileSync } from "fs";
import { chmod, mkdir, rename, writeFile } from "fs/promises";
import path from "path";

import { OPENAI_REALTIME_DEFAULTS } from "@/lib/realtime-models";

export type RuntimeProviderId = "openai" | "openrouter" | "custom";

export type RuntimeSecrets = {
  version: 1;
  updatedAt?: string;
  openai?: {
    apiKey?: string;
    personaModel?: string;
    transcribeModel?: string;
    realtimeModel?: string;
    translationModel?: string;
  };
  openrouter?: {
    apiKey?: string;
    model?: string;
  };
  custom?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    headers?: string;
  };
};

export type RuntimeConfigInput = {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  headers?: string;
  transcribeModel?: string;
  realtimeModel?: string;
  translationModel?: string;
  clear?: boolean;
};

export type RuntimeConfigStatus = {
  keySetupEnabled: boolean;
  filePath: string;
  providers: Record<
    RuntimeProviderId,
    {
      configured: boolean;
      keyConfigured: boolean;
      source: "runtime" | "env" | "none";
      redacted: string;
      model: string;
      endpoint?: string;
      transcribeModel?: string;
      realtimeModel?: string;
      translationModel?: string;
    }
  >;
};

export function readRuntimeSecretsSync(): RuntimeSecrets {
  const filePath = runtimeSecretsPath();
  if (!existsSync(filePath)) {
    return { version: 1 };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as RuntimeSecrets;
    return normalizeRuntimeSecrets(parsed);
  } catch {
    return { version: 1 };
  }
}

export async function saveRuntimeProviderConfig(input: RuntimeConfigInput) {
  const provider = pickRuntimeProvider(input.provider);
  const current = readRuntimeSecretsSync();
  const next: RuntimeSecrets = {
    ...current,
    version: 1,
    updatedAt: new Date().toISOString()
  };

  if (provider === "openai") {
    next.openai = input.clear
      ? {
          personaModel: clean(input.model) || current.openai?.personaModel,
          transcribeModel: clean(input.transcribeModel) || current.openai?.transcribeModel,
          realtimeModel: clean(input.realtimeModel) || current.openai?.realtimeModel,
          translationModel: clean(input.translationModel) || current.openai?.translationModel
        }
      : {
          ...current.openai,
          apiKey: cleanSecret(input.apiKey) || current.openai?.apiKey,
          personaModel: clean(input.model) || current.openai?.personaModel,
          transcribeModel: clean(input.transcribeModel) || current.openai?.transcribeModel,
          realtimeModel: clean(input.realtimeModel) || current.openai?.realtimeModel,
          translationModel: clean(input.translationModel) || current.openai?.translationModel
        };
  }

  if (provider === "openrouter") {
    next.openrouter = input.clear
      ? {
          model: clean(input.model) || current.openrouter?.model
        }
      : {
          ...current.openrouter,
          apiKey: cleanSecret(input.apiKey) || current.openrouter?.apiKey,
          model: clean(input.model) || current.openrouter?.model
        };
  }

  if (provider === "custom") {
    next.custom = input.clear
      ? {
          baseUrl: clean(input.baseUrl) || current.custom?.baseUrl,
          model: clean(input.model) || current.custom?.model,
          headers: clean(input.headers) || current.custom?.headers
        }
      : {
          ...current.custom,
          apiKey: cleanSecret(input.apiKey) || current.custom?.apiKey,
          baseUrl: clean(input.baseUrl) || current.custom?.baseUrl,
          model: clean(input.model) || current.custom?.model,
          headers: clean(input.headers) || current.custom?.headers
        };
  }

  await writeRuntimeSecrets(next);
  return getRuntimeConfigStatus(next);
}

export function getRuntimeConfigStatus(
  secrets: RuntimeSecrets = readRuntimeSecretsSync()
): RuntimeConfigStatus {
  const openaiRuntimeKey = cleanSecret(secrets.openai?.apiKey);
  const openaiEnvKey = cleanSecret(process.env.OPENAI_API_KEY);
  const openrouterRuntimeKey = cleanSecret(secrets.openrouter?.apiKey);
  const openrouterEnvKey = cleanSecret(process.env.OPENROUTER_API_KEY);
  const customRuntimeKey = cleanSecret(secrets.custom?.apiKey);
  const customEnvKey = cleanSecret(
    process.env.AI_GATEWAY_API_KEY || process.env.CUSTOM_AI_API_KEY
  );

  return {
    keySetupEnabled: process.env.BROWSER_KEY_SETUP_DISABLED !== "true",
    filePath: ".data/runtime-secrets.json",
    providers: {
      openai: {
        configured: Boolean(openaiRuntimeKey || openaiEnvKey),
        keyConfigured: Boolean(openaiRuntimeKey || openaiEnvKey),
        source: sourceFor(openaiRuntimeKey, openaiEnvKey),
        redacted: redactSecret(openaiRuntimeKey || openaiEnvKey),
        model: secrets.openai?.personaModel || process.env.OPENAI_PERSONA_MODEL || "gpt-4o",
        endpoint: "https://api.openai.com/v1/responses",
        transcribeModel:
          secrets.openai?.transcribeModel ||
          process.env.OPENAI_TRANSCRIBE_MODEL ||
          OPENAI_REALTIME_DEFAULTS.transcribeModel,
        realtimeModel:
          secrets.openai?.realtimeModel ||
          process.env.OPENAI_REALTIME_MODEL ||
          OPENAI_REALTIME_DEFAULTS.realtimeModel,
        translationModel:
          secrets.openai?.translationModel ||
          process.env.OPENAI_REALTIME_TRANSLATE_MODEL ||
          OPENAI_REALTIME_DEFAULTS.translationModel
      },
      openrouter: {
        configured: Boolean(openrouterRuntimeKey || openrouterEnvKey),
        keyConfigured: Boolean(openrouterRuntimeKey || openrouterEnvKey),
        source: sourceFor(openrouterRuntimeKey, openrouterEnvKey),
        redacted: redactSecret(openrouterRuntimeKey || openrouterEnvKey),
        model: secrets.openrouter?.model || process.env.OPENROUTER_MODEL || "openrouter/auto",
        endpoint: "https://openrouter.ai/api/v1/chat/completions"
      },
      custom: {
        configured: Boolean(secrets.custom?.baseUrl || process.env.AI_GATEWAY_BASE_URL || process.env.CUSTOM_AI_BASE_URL),
        keyConfigured: Boolean(customRuntimeKey || customEnvKey),
        source: sourceFor(customRuntimeKey, customEnvKey),
        redacted: redactSecret(customRuntimeKey || customEnvKey),
        model:
          secrets.custom?.model ||
          process.env.AI_GATEWAY_MODEL ||
          process.env.CUSTOM_AI_MODEL ||
          "your-model",
        endpoint:
          secrets.custom?.baseUrl ||
          process.env.AI_GATEWAY_BASE_URL ||
          process.env.CUSTOM_AI_BASE_URL ||
          ""
      }
    }
  };
}

export function getRuntimeOpenAIConfig() {
  const secrets = readRuntimeSecretsSync();
  return {
    apiKey: cleanSecret(secrets.openai?.apiKey) || cleanSecret(process.env.OPENAI_API_KEY),
    transcribeModel:
      secrets.openai?.transcribeModel ||
      process.env.OPENAI_TRANSCRIBE_MODEL ||
      OPENAI_REALTIME_DEFAULTS.transcribeModel,
    realtimeModel:
      secrets.openai?.realtimeModel ||
      process.env.OPENAI_REALTIME_MODEL ||
      OPENAI_REALTIME_DEFAULTS.realtimeModel,
    translationModel:
      secrets.openai?.translationModel ||
      process.env.OPENAI_REALTIME_TRANSLATE_MODEL ||
      OPENAI_REALTIME_DEFAULTS.translationModel
  };
}

export function isRuntimeProviderId(value?: string): value is RuntimeProviderId {
  return value === "openai" || value === "openrouter" || value === "custom";
}

export function pickRuntimeProvider(value?: string): RuntimeProviderId {
  return isRuntimeProviderId(value) ? value : "openai";
}

function normalizeRuntimeSecrets(value: RuntimeSecrets): RuntimeSecrets {
  return {
    version: 1,
    updatedAt: clean(value.updatedAt),
    openai: value.openai
      ? {
          apiKey: cleanSecret(value.openai.apiKey),
          personaModel: clean(value.openai.personaModel),
          transcribeModel: clean(value.openai.transcribeModel),
          realtimeModel: clean(value.openai.realtimeModel),
          translationModel: clean(value.openai.translationModel)
        }
      : undefined,
    openrouter: value.openrouter
      ? {
          apiKey: cleanSecret(value.openrouter.apiKey),
          model: clean(value.openrouter.model)
        }
      : undefined,
    custom: value.custom
      ? {
          apiKey: cleanSecret(value.custom.apiKey),
          baseUrl: clean(value.custom.baseUrl),
          model: clean(value.custom.model),
          headers: clean(value.custom.headers)
        }
      : undefined
  };
}

async function writeRuntimeSecrets(secrets: RuntimeSecrets) {
  const filePath = runtimeSecretsPath();
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(stripEmptyProviders(secrets), null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await rename(tempPath, filePath);
  await chmod(filePath, 0o600).catch(() => {});
}

function stripEmptyProviders(secrets: RuntimeSecrets): RuntimeSecrets {
  return Object.fromEntries(
    Object.entries(secrets).filter(([, value]) => {
      if (!value || typeof value !== "object") {
        return true;
      }

      return Object.values(value).some(Boolean);
    })
  ) as RuntimeSecrets;
}

function runtimeSecretsPath() {
  const configured = process.env.RUNTIME_SECRETS_PATH || ".data/runtime-secrets.json";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function sourceFor(runtime?: string, env?: string): "runtime" | "env" | "none" {
  if (runtime) {
    return "runtime";
  }

  return env ? "env" : "none";
}

function redactSecret(value?: string) {
  const cleanValue = cleanSecret(value);
  if (!cleanValue) {
    return "";
  }

  if (cleanValue.length <= 12) {
    return `${cleanValue.slice(0, 3)}...`;
  }

  return `${cleanValue.slice(0, 7)}...${cleanValue.slice(-4)}`;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function cleanSecret(value: unknown) {
  const cleanValue = clean(value);
  if (!cleanValue) {
    return "";
  }

  const normalized = cleanValue.toLowerCase();
  const placeholders = new Set([
    "sk-proj-your-key-here",
    "sk-or-your-key-here",
    "your-key-here",
    "your-webhook-secret",
    "your-custom-api-key",
    "your-service-role-key",
    "..."
  ]);

  if (placeholders.has(normalized) || normalized.includes("your-")) {
    return "";
  }

  return cleanValue;
}
