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

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminForApi(req);
  if ("response" in auth) return auth.response;
  const { admin } = auth;

  const { id: auctionId } = await ctx.params;
  const editPath = `/admin/auctions/${auctionId}`;

  const auction = await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });
  if (auction.status !== "DRAFT" && auction.status !== "UPCOMING") {
    return fail(req, editPath, "لا يمكن تعديل مزاد قائم أو منتهٍ");
  }

  const formData = await req.formData();
  const parsed = auctionSchema.safeParse({
    itemId: auction.itemId,
    openingPrice: formData.get("openingPrice"),
    bidIncrement: formData.get("bidIncrement"),
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
    softCloseEnabled: formData.get("softCloseEnabled") === "on",
    extensionMinutes: formData.get("extensionMinutes") || 2,
  });

  if (!parsed.success) {
    return fail(req, editPath, parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
  }

  const startAt = new Date(parsed.data.startAt);
  const endAt = new Date(parsed.data.endAt);

  await prisma.auction.update({
    where: { id: auctionId },
    data: {
      openingPrice: parsed.data.openingPrice,
      currentPrice: parsed.data.openingPrice,
      bidIncrement: parsed.data.bidIncrement,
      startAt,
      endAt,
      originalEndAt: endAt,
      softCloseEnabled: parsed.data.softCloseEnabled,
      extensionMinutes: parsed.data.extensionMinutes,
    },
  });

  await writeAudit({
    actorUserId: admin.id,
    action: "auction_edited",
    entityType: "Auction",
    entityId: auctionId,
  });

  return NextResponse.redirect(new URL(editPath, req.url), 303);
}
