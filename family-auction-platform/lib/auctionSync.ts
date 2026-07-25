import "server-only";
import { prisma } from "./prisma";
import { writeAudit } from "./audit";
import { emitAuctionEvent } from "./events";
import type { Auction } from "@/app/generated/prisma/client";

/**
 * Lazily transitions an auction between UPCOMING -> LIVE -> ENDED based on wall clock time.
 * There is no background scheduler in this deployment, so every read path calls this first
 * to guarantee the status/winner shown is never stale. The status-guarded updateMany makes
 * concurrent callers converge on a single winner write instead of racing.
 */
export async function syncAuctionStatus(auctionId: string): Promise<Auction | null> {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) return null;

  const now = new Date();

  if (auction.status === "UPCOMING" && now >= auction.startAt) {
    const res = await prisma.auction.updateMany({
      where: { id: auctionId, status: "UPCOMING" },
      data: { status: "LIVE" },
    });
    if (res.count > 0) {
      await writeAudit({ action: "auction_started", entityType: "Auction", entityId: auctionId });
    }
    return prisma.auction.findUnique({ where: { id: auctionId } });
  }

  if (auction.status === "LIVE" && now >= auction.endAt) {
    const topBid = await prisma.bid.findFirst({
      where: { auctionId, status: "ACTIVE" },
      orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
      include: { user: true },
    });

    const res = await prisma.auction.updateMany({
      where: { id: auctionId, status: "LIVE" },
      data: {
        status: "ENDED",
        winnerUserId: topBid?.userId ?? null,
        winningBid: topBid?.amount ?? null,
      },
    });

    if (res.count > 0) {
      await writeAudit({
        action: "auction_ended",
        entityType: "Auction",
        entityId: auctionId,
        details: { winnerUserId: topBid?.userId ?? null, winningBid: topBid?.amount ?? null },
      });
      emitAuctionEvent(auctionId, {
        type: "ended",
        winnerAlias: topBid?.user.alias ?? null,
        winningBid: topBid?.amount ?? null,
      });
    }
    return prisma.auction.findUnique({ where: { id: auctionId } });
  }

  return auction;
}

export async function syncManyAuctionStatuses(auctionIds: string[]): Promise<void> {
  await Promise.all(auctionIds.map((id) => syncAuctionStatus(id)));
}
