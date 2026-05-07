import { NextResponse } from "next/server";

import { MemoryStashInput, readMemoryStash, saveMemoryStash } from "@/lib/memory-stash";
import { saveStorageEvent } from "@/lib/storage-adapters";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json(readMemoryStash(url.searchParams.get("projectId") ?? "default"));
}

export async function POST(request: Request) {
  if (!canUploadMemory(request)) {
    return NextResponse.json(
      {
        error:
          "Memory file upload is only enabled for local app URLs. Use server storage adapters for hosted deployments."
      },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as MemoryStashInput | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid memory stash request." }, { status: 400 });
  }

  const status = await saveMemoryStash(body);
  const storage = await saveStorageEvent({
    type: "memory_stash",
    projectId: status.projectId,
    payload: {
      mode: body.mode ?? "append",
      totalFiles: status.totalFiles,
      totalBytes: status.totalBytes,
      previewBytes: status.previewBytes,
      attachments: status.attachments.map((attachment) => ({
        name: attachment.name,
        relativePath: attachment.relativePath,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: attachment.createdAt
      }))
    }
  });

  return NextResponse.json({
    status,
    storage
  });
}

function canUploadMemory(request: Request) {
  if (process.env.MEMORY_STASH_UPLOAD_DISABLED === "true") {
    return false;
  }

  const host = request.headers.get("host") ?? "";
  const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (!isLocalHost && process.env.MEMORY_STASH_UPLOAD_ENABLED !== "true") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
