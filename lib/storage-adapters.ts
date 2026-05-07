import { mkdir, appendFile } from "fs/promises";
import path from "path";

export type StorageProviderId = "none" | "local" | "webhook" | "supabase" | "custom";

export type StorageEventInput = {
  type: string;
  projectId?: string;
  payload: unknown;
};

export type StorageStatus = {
  provider: StorageProviderId;
  configured: boolean;
  destination: string;
  secureByDefault: boolean;
  capabilities: string[];
};

const ALLOWED_EVENTS = new Set([
  "persona_cards",
  "transcript_turn",
  "project_memory",
  "prompt_studio",
  "clip_suggestions",
  "clip_render_job",
  "bot_handoff_manifest",
  "memory_stash",
  "agent_brief"
]);

export function getStorageStatus(): StorageStatus {
  const provider = getStorageProvider();

  if (provider === "local") {
    return {
      provider,
      configured: true,
      destination: safeLocalPath(),
      secureByDefault: true,
      capabilities: ["jsonl append", "local-first", "no network"]
    };
  }

  if (provider === "webhook") {
    return {
      provider,
      configured: Boolean(process.env.DATA_STORAGE_WEBHOOK_URL),
      destination: redactUrl(process.env.DATA_STORAGE_WEBHOOK_URL),
      secureByDefault: true,
      capabilities: ["zapier/make/n8n", "custom webhooks", "bearer secret optional"]
    };
  }

  if (provider === "supabase") {
    return {
      provider,
      configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      destination: redactUrl(process.env.SUPABASE_URL),
      secureByDefault: true,
      capabilities: ["supabase rest", "server service role", "table insert"]
    };
  }

  if (provider === "custom") {
    return {
      provider,
      configured: Boolean(process.env.DATA_STORAGE_CUSTOM_URL),
      destination: redactUrl(process.env.DATA_STORAGE_CUSTOM_URL),
      secureByDefault: true,
      capabilities: ["any cloud api", "optional bearer key", "json post"]
    };
  }

  return {
    provider: "none",
    configured: false,
    destination: "not configured",
    secureByDefault: true,
    capabilities: ["demo mode", "browser localStorage only"]
  };
}

export async function saveStorageEvent(input: StorageEventInput) {
  const status = getStorageStatus();
  const event = sanitizeEvent(input);

  if (!status.configured || status.provider === "none") {
    return { saved: false, status };
  }

  if (status.provider === "local") {
    const filePath = resolveLocalPath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
    return { saved: true, status };
  }

  if (status.provider === "webhook") {
    await postJson(process.env.DATA_STORAGE_WEBHOOK_URL ?? "", event, {
      ...bearer(process.env.DATA_STORAGE_WEBHOOK_SECRET)
    });
    return { saved: true, status };
  }

  if (status.provider === "custom") {
    await postJson(process.env.DATA_STORAGE_CUSTOM_URL ?? "", event, {
      ...bearer(process.env.DATA_STORAGE_CUSTOM_API_KEY)
    });
    return { saved: true, status };
  }

  if (status.provider === "supabase") {
    const table = process.env.SUPABASE_TABLE ?? "twist_sidebar_events";
    await postJson(`${trimSlash(process.env.SUPABASE_URL ?? "")}/rest/v1/${table}`, {
      event_type: event.type,
      project_id: event.projectId,
      payload: event.payload,
      created_at: event.createdAt
    }, {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      Prefer: "return=minimal"
    });
    return { saved: true, status };
  }

  return { saved: false, status };
}

function getStorageProvider(): StorageProviderId {
  const provider = process.env.DATA_STORAGE_PROVIDER;
  if (
    provider === "local" ||
    provider === "webhook" ||
    provider === "supabase" ||
    provider === "custom"
  ) {
    return provider;
  }

  return "none";
}

function sanitizeEvent(input: StorageEventInput) {
  const type = ALLOWED_EVENTS.has(input.type) ? input.type : "project_memory";
  const projectId = String(input.projectId ?? "default").slice(0, 80);
  return {
    type,
    projectId,
    payload: limitPayload(input.payload),
    createdAt: new Date().toISOString()
  };
}

function limitPayload(payload: unknown) {
  const json = JSON.stringify(redactSecrets(payload ?? {}));
  if (json.length <= 60_000) {
    return JSON.parse(json);
  }

  return {
    truncated: true,
    preview: json.slice(0, 60_000)
  };
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/key|secret|token|password|authorization|credential/i.test(key)) {
        return [key, "[redacted]"];
      }

      return [key, redactSecrets(item)];
    })
  );
}

function safeLocalPath() {
  return process.env.DATA_STORAGE_LOCAL_PATH ?? ".data/sidebar-events.jsonl";
}

function resolveLocalPath() {
  const configured = safeLocalPath();
  if (path.isAbsolute(configured) && process.env.DATA_STORAGE_ALLOW_ABSOLUTE_PATH !== "true") {
    return path.join(process.cwd(), ".data/sidebar-events.jsonl");
  }

  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

async function postJson(url: string, payload: unknown, headers: Record<string, string>) {
  if (!url) {
    throw new Error("Storage destination URL is not configured.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Storage provider returned ${response.status}.`);
  }
}

function bearer(value?: string): Record<string, string> {
  return value ? { Authorization: `Bearer ${value}` } : {};
}

function trimSlash(value: string) {
  return value.replace(/\/$/, "");
}

function redactUrl(value?: string) {
  if (!value) {
    return "not configured";
  }

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "configured";
  }
}
