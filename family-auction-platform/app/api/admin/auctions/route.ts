import { NextRequest, NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { auctionSchema } from "@/lib/validation";

function fail(req: NextRequest, path: string, message: string) {
  const url = new URL(path, req.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminForApi(req);
  if ("response" in auth) return auth.response;
  const { admin } = auth;

  const formData = await req.formData();
  const itemId = String(formData.get("itemId") || "");
  const newPath = `/admin/auctions/new?itemId=${itemId}`;

  const parsed = auctionSchema.safeParse({
    itemId,
    openingPrice: formData.get("openingPrice"),
    bidIncrement: formData.get("bidIncrement"),
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
    softCloseEnabled: formData.get("softCloseEnabled") === "on",
    extensionMinutes: formData.get("extensionMinutes") || 2,
  });

  if (!parsed.success) {
    return fail(req, newPath, parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
  }

  const activeExisting = await prisma.auction.findFirst({
    where: { itemId: parsed.data.itemId, status: { in: ["DRAFT", "UPCOMING", "LIVE"] } },
  });
  if (activeExisting) {
    return fail(req, newPath, "توجد بالفعل مزاد نشط أو مسودة لهذه القطعة");
  }

  const startAt = new Date(parsed.data.startAt);
  const endAt = new Date(parsed.data.endAt);

  const auction = await prisma.auction.create({
    data: {
      itemId: parsed.data.itemId,
      openingPrice: parsed.data.openingPrice,
      currentPrice: parsed.data.openingPrice,
      bidIncrement: parsed.data.bidIncrement,
      startAt,
      endAt,
      originalEndAt: endAt,
      softCloseEnabled: parsed.data.softCloseEnabled,
      extensionMinutes: parsed.data.extensionMinutes,
      status: "DRAFT",
    },
  });

  await writeAudit({
    actorUserId: admin.id,
    action: "auction_created",
    entityType: "Auction",
    entityId: auction.id,
    details: { itemId: parsed.data.itemId },
  });

  return NextResponse.redirect(new URL(`/admin/auctions/${auction.id}`, req.url), 303);
}
