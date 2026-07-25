import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const itemId = body?.itemId;
  if (typeof itemId !== "string") {
    return NextResponse.json({ error: "itemId مطلوب" }, { status: 400 });
  }

  const existing = await prisma.favorite.findUnique({
    where: { userId_itemId: { userId: user.id, itemId } },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return NextResponse.json({ favorited: false });
  }

  await prisma.favorite.create({ data: { userId: user.id, itemId } });
  return NextResponse.json({ favorited: true });
}
