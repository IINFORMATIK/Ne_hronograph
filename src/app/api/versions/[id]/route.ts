import { NextResponse } from "next/server";
import { deleteVersion, getVersion } from "@/lib/persistence";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const version = await getVersion(Number(id));
  if (!version) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ data: version.data, version });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await deleteVersion(Number(id));
  return NextResponse.json({ ok: true });
}
