import { NextResponse } from "next/server";

import { PROJECT_CONTEXT } from "@/lib/project-context";
import { getStorageStatus } from "@/lib/storage-adapters";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    project: PROJECT_CONTEXT,
    storage: getStorageStatus()
  });
}
