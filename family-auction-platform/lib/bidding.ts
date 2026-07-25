import "server-only";
import { prisma } from "./prisma";
import { writeAudit } from "./audit";
import { syncAuctionStatus } from "./auctionSync";
import { emitAuctionEvent } from "./events";

export class BidError extends Error {}

export function minNextBid(auction: { currentPrice: number; openingPrice: number; bidIncrement: number }, hasBids: boolean) {
  return hasBids ? auction.currentPrice + auction.bidIncrement : auction.openingPrice;
}

export async function placeBid(userId: string, auctionId: string, amount: number) {
  await syncAuctionStatus(auctionId);

  const outcome = await prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new BidError("المزاد غير موجود");

    const now = new Date();
    if (auction.status !== "LIVE") {
      throw new BidError("لا يمكن المزايدة، المزاد غير قائم حاليًا");
    }
    if (now < auction.startAt) throw new BidError("لم يبدأ المزاد بعد");
    if (now >= auction.endAt) throw new BidError("انتهى المزاد");

    const topBid = await tx.bid.findFirst({
      where: { auctionId, status: "ACTIVE" },
      orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
    });

    if (topBid && topBid.userId === userId) {
      throw new BidError("أنت بالفعل أعلى مزايد على هذه القطعة");
    }

    const minNext = minNextBid(auction, Boolean(topBid));
    if (amount < minNext) {
      throw new BidError(`يجب أن تكون المزايدة ${minNext} ريال على الأقل`);
    }

    let newEndAt = auction.endAt;
    let extended = false;
    if (auction.softCloseEnabled) {
      const extensionMs = auction.extensionMinutes * 60 * 1000;
      const msRemaining = auction.endAt.getTime() - now.getTime();
      if (msRemaining <= extensionMs) {
        newEndAt = new Date(now.getTime() + extensionMs);
        extended = true;
      }
    }

    const bid = await tx.bid.create({
      data: { auctionId, userId, amount, status: "ACTIVE" },
    });

    const updatedAuction = await tx.auction.update({
      where: { id: auctionId },
      data: { currentPrice: amount, endAt: newEndAt },
    });

    return { bid, auction: updatedAuction, extended };
  });

  await writeAudit({
    actorUserId: userId,
    action: "bid_placed",
    entityType: "Auction",
    entityId: auctionId,
    details: { amount, bidId: outcome.bid.id },
  });

  if (outcome.extended) {
    await writeAudit({
      actorUserId: userId,
      action: "auction_extended",
      entityType: "Auction",
      entityId: auctionId,
      details: { newEndAt: outcome.auction.endAt.toISOString() },
    });
  }

  const bidder = await prisma.user.findUnique({ where: { id: userId } });

  emitAuctionEvent(auctionId, {
    type: "bid",
    currentPrice: outcome.auction.currentPrice,
    endAt: outcome.auction.endAt.toISOString(),
    alias: bidder?.alias ?? "",
  });

  if (outcome.extended) {
    emitAuctionEvent(auctionId, { type: "extended", endAt: outcome.auction.endAt.toISOString() });
  }

  return outcome;
}
