import { NextResponse } from "next/server";

import { getModelRouteSummaries, pickDefaultProvider } from "@/lib/model-router";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    defaultProvider: pickDefaultProvider(),
    providers: getModelRouteSummaries()
  });
}
