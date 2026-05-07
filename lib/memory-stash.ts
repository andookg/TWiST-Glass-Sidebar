import { existsSync, readFileSync } from "fs";
import { mkdir, rename, writeFile } from "fs/promises";
import path from "path";

export type MemoryAttachment = {
  id: string;
  name: string;
  relativePath: string;
  mimeType: string;
  size: number;
  modifiedAt?: number;
  preview: string;
  createdAt: string;
};

export type MemoryStashInput = {
  projectId?: string;
  mode?: "append" | "replace" | "clear";
  attachments?: MemoryAttachment[];
};

export type MemoryStashStatus = {
  projectId: string;
  filePath: string;
  attachments: MemoryAttachment[];
  totalFiles: number;
  totalBytes: number;
  previewBytes: number;
};

const MAX_ATTACHMENTS = 60;
const MAX_PREVIEW_CHARS = 12_000;

export function readMemoryStash(projectId = "default"): MemoryStashStatus {
  const safeProjectId = safeId(projectId);
  const filePath = memoryStashPath(safeProjectId);
  const attachments = existsSync(filePath)
    ? normalizeAttachments(safeJson(readFileSync(filePath, "utf8")))
    : [];

  return buildStatus(safeProjectId, attachments);
}

export async function saveMemoryStash(input: MemoryStashInput) {
  const safeProjectId = safeId(input.projectId);
  const current = input.mode === "replace" || input.mode === "clear"
    ? []
    : readMemoryStash(safeProjectId).attachments;
  const incoming = input.mode === "clear" ? [] : normalizeAttachments(input.attachments);
  const next = dedupeAttachments([...incoming, ...current]).slice(0, MAX_ATTACHMENTS);
  const filePath = memoryStashPath(safeProjectId);

  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify({ version: 1, attachments: next }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await rename(tempPath, filePath);

  return buildStatus(safeProjectId, next);
}

export function summarizeMemoryAttachments(attachments: MemoryAttachment[]) {
  if (attachments.length === 0) {
    return "";
  }

  return attachments
    .slice(0, 12)
    .map((attachment) => {
      const preview = attachment.preview
        ? ` Preview: ${attachment.preview.replace(/\s+/g, " ").slice(0, 360)}`
        : " Metadata only.";
      return `- ${attachment.relativePath} (${formatBytes(attachment.size)}).${preview}`;
    })
    .join("\n");
}

function buildStatus(projectId: string, attachments: MemoryAttachment[]): MemoryStashStatus {
  return {
    projectId,
    filePath: `.data/project-memory/${projectId}/memory-stash.json`,
    attachments,
    totalFiles: attachments.length,
    totalBytes: attachments.reduce((sum, attachment) => sum + attachment.size, 0),
    previewBytes: attachments.reduce((sum, attachment) => sum + attachment.preview.length, 0)
  };
}

function normalizeAttachments(value: unknown): MemoryAttachment[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { attachments?: unknown }).attachments)
      ? (value as { attachments: unknown[] }).attachments
      : [];

  return raw
    .map((item, index) => normalizeAttachment(item, index))
    .filter(Boolean) as MemoryAttachment[];
}

function normalizeAttachment(value: unknown, index: number) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<MemoryAttachment>;
  const name = clean(raw.name).slice(0, 180);
  const relativePath = clean(raw.relativePath || raw.name).slice(0, 500);
  if (!name || !relativePath) {
    return null;
  }

  return {
    id: clean(raw.id) || `memory-${Date.now()}-${index}`,
    name,
    relativePath,
    mimeType: clean(raw.mimeType || "unknown").slice(0, 120),
    size: clampNumber(raw.size, 0, 50_000_000),
    modifiedAt: typeof raw.modifiedAt === "number" ? raw.modifiedAt : undefined,
    preview: redactSensitiveText(clean(raw.preview).slice(0, MAX_PREVIEW_CHARS)),
    createdAt: clean(raw.createdAt) || new Date().toISOString()
  };
}

function dedupeAttachments(attachments: MemoryAttachment[]) {
  const seen = new Set<string>();
  const next: MemoryAttachment[] = [];

  for (const attachment of attachments) {
    const key = `${attachment.relativePath}:${attachment.size}:${attachment.modifiedAt ?? ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(attachment);
  }

  return next;
}

function memoryStashPath(projectId: string) {
  return path.join(process.cwd(), ".data", "project-memory", projectId, "memory-stash.json");
}

function safeId(value = "default") {
  return clean(value).replace(/[^a-z0-9_.-]/gi, "-").slice(0, 80) || "default";
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim() : "";
}

function clampNumber(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }

  return Math.min(max, Math.max(min, parsed));
}

function redactSensitiveText(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted-api-key]")
    .replace(/(api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[^'"\s]+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/g, "Bearer [redacted]");
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 102.4) / 10} KB`;
  }

  return `${Math.round(value / 1024 / 102.4) / 10} MB`;
}
