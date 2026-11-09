import { NextResponse } from "next/server";
import { createVersion, listVersions } from "@/lib/persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  const versions = await listVersions();
  return NextResponse.json({ versions });
}

export async function POST(request: Request) {
  let body: { name?: string; note?: string; data?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "data is required" }, { status: 400 });
  }
  const version = await createVersion(
    (body.name || "Версия").slice(0, 120),
    (body.note ?? null) as string | null,
    body.data,
  );
  return NextResponse.json({ ok: true, version });
}
