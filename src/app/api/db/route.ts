import { NextResponse } from "next/server";
import { getAppState, putAppState } from "@/lib/persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  const row = await getAppState();
  return NextResponse.json({ data: row.data, rev: row.rev });
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const data = (body as { data?: unknown })?.data;
  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "data is required" }, { status: 400 });
  }
  const res = await putAppState(data);
  return NextResponse.json({ ok: true, rev: res.rev });
}
