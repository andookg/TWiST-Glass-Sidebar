import { NextResponse } from "next/server";

import { getStorageStatus } from "@/lib/storage-adapters";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getStorageStatus());
}
