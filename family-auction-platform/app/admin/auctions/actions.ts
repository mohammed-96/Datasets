"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { syncAuctionStatus } from "@/lib/auctionSync";
import { emitAuctionEvent } from "@/lib/events";

export async function publishAuctionAction(auctionId: string) {
  const admin = await requireAdmin();
  const auction = await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });
  if (auction.status !== "DRAFT") return;

  await prisma.auction.update({ where: { id: auctionId }, data: { status: "UPCOMING" } });
  await writeAudit({ actorUserId: admin.id, action: "auction_published", entityType: "Auction", entityId: auctionId });
  await syncAuctionStatus(auctionId);

  revalidatePath("/admin/auctions");
  revalidatePath(`/admin/auctions/${auctionId}`);
}

export async function cancelAuctionAction(auctionId: string) {
  const admin = await requireAdmin();
  const auction = await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });
  if (auction.status === "ENDED" || auction.status === "CANCELLED") return;

  await prisma.auction.update({ where: { id: auctionId }, data: { status: "CANCELLED" } });
  await writeAudit({ actorUserId: admin.id, action: "auction_cancelled", entityType: "Auction", entityId: auctionId });

  revalidatePath("/admin/auctions");
  revalidatePath(`/admin/auctions/${auctionId}`);
}

export async function suspendAuctionAction(auctionId: string, formData: FormData) {
  const admin = await requireAdmin();
  const auction = await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });
  if (auction.status !== "LIVE") return;

  const reason = String(formData.get("reason") || "").trim() || null;

  await prisma.auction.update({
    where: { id: auctionId },
    data: { status: "SUSPENDED", suspendedReason: reason },
  });
  await writeAudit({
    actorUserId: admin.id,
    action: "auction_suspended",
    entityType: "Auction",
    entityId: auctionId,
    details: reason ? { reason } : null,
  });

  emitAuctionEvent(auctionId, { type: "suspended" });

  revalidatePath("/admin/auctions");
  revalidatePath(`/admin/auctions/${auctionId}`);
}

export async function resumeAuctionAction(auctionId: string, formData: FormData) {
  const admin = await requireAdmin();
  const auction = await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });
  if (auction.status !== "SUSPENDED") return;

  const newEndAtRaw = String(formData.get("newEndAt") || "");
  const newEndAt = newEndAtRaw ? new Date(newEndAtRaw) : auction.endAt;
  const now = new Date();
  const newStatus = now >= auction.startAt ? "LIVE" : "UPCOMING";

  await prisma.auction.update({
    where: { id: auctionId },
    data: { status: newStatus, endAt: newEndAt, suspendedReason: null },
  });

  await writeAudit({
    actorUserId: admin.id,
    action: "auction_resumed",
    entityType: "Auction",
    entityId: auctionId,
    details: { newEndAt: newEndAt.toISOString() },
  });

  revalidatePath("/admin/auctions");
  revalidatePath(`/admin/auctions/${auctionId}`);
}
