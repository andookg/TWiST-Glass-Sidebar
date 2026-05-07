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
          apiKey: clean(input.apiKey) || current.openai?.apiKey,
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
          apiKey: clean(input.apiKey) || current.openrouter?.apiKey,
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
          apiKey: clean(input.apiKey) || current.custom?.apiKey,
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
  return {
    keySetupEnabled: true,
    filePath: ".data/runtime-secrets.json",
    providers: {
      openai: {
        configured: Boolean(secrets.openai?.apiKey || process.env.OPENAI_API_KEY),
        keyConfigured: Boolean(secrets.openai?.apiKey || process.env.OPENAI_API_KEY),
        source: sourceFor(secrets.openai?.apiKey, process.env.OPENAI_API_KEY),
        redacted: redactSecret(secrets.openai?.apiKey ?? process.env.OPENAI_API_KEY),
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
        configured: Boolean(secrets.openrouter?.apiKey || process.env.OPENROUTER_API_KEY),
        keyConfigured: Boolean(secrets.openrouter?.apiKey || process.env.OPENROUTER_API_KEY),
        source: sourceFor(secrets.openrouter?.apiKey, process.env.OPENROUTER_API_KEY),
        redacted: redactSecret(secrets.openrouter?.apiKey ?? process.env.OPENROUTER_API_KEY),
        model: secrets.openrouter?.model || process.env.OPENROUTER_MODEL || "openrouter/auto",
        endpoint: "https://openrouter.ai/api/v1/chat/completions"
      },
      custom: {
        configured: Boolean(secrets.custom?.baseUrl || process.env.AI_GATEWAY_BASE_URL || process.env.CUSTOM_AI_BASE_URL),
        keyConfigured: Boolean(secrets.custom?.apiKey || process.env.AI_GATEWAY_API_KEY || process.env.CUSTOM_AI_API_KEY),
        source: sourceFor(
          secrets.custom?.apiKey,
          process.env.AI_GATEWAY_API_KEY || process.env.CUSTOM_AI_API_KEY
        ),
        redacted: redactSecret(
          secrets.custom?.apiKey ?? process.env.AI_GATEWAY_API_KEY ?? process.env.CUSTOM_AI_API_KEY
        ),
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
    apiKey: secrets.openai?.apiKey || process.env.OPENAI_API_KEY || "",
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
          apiKey: clean(value.openai.apiKey),
          personaModel: clean(value.openai.personaModel),
          transcribeModel: clean(value.openai.transcribeModel),
          realtimeModel: clean(value.openai.realtimeModel),
          translationModel: clean(value.openai.translationModel)
        }
      : undefined,
    openrouter: value.openrouter
      ? {
          apiKey: clean(value.openrouter.apiKey),
          model: clean(value.openrouter.model)
        }
      : undefined,
    custom: value.custom
      ? {
          apiKey: clean(value.custom.apiKey),
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
  const cleanValue = clean(value);
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
