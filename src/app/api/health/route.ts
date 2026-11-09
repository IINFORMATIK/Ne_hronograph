import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    storage: hasDatabase ? "postgres" : "local",
    time: new Date().toISOString(),
  });
}
