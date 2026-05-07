import { NextResponse } from "next/server";

import { saveStorageEvent } from "@/lib/storage-adapters";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid storage event." }, { status: 400 });
  }

  try {
    const result = await saveStorageEvent({
      type: String((body as { type?: unknown }).type ?? "project_memory"),
      projectId: String((body as { projectId?: unknown }).projectId ?? "default"),
      payload: (body as { payload?: unknown }).payload ?? {}
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Storage failed."
      },
      { status: 502 }
    );
  }
}
