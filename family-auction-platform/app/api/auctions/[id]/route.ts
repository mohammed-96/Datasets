import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncAuctionStatus } from "@/lib/auctionSync";
import { minNextBid } from "@/lib/bidding";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  await syncAuctionStatus(id);

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      winner: { select: { alias: true } },
      bids: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { alias: true } } },
        take: 100,
      },
    },
  });

  if (!auction) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const topBid = auction.bids[0];
  const hasBids = auction.bids.length > 0;

  return NextResponse.json({
    id: auction.id,
    status: auction.status,
    openingPrice: auction.openingPrice,
    currentPrice: auction.currentPrice,
    bidIncrement: auction.bidIncrement,
    startAt: auction.startAt.toISOString(),
    endAt: auction.endAt.toISOString(),
    softCloseEnabled: auction.softCloseEnabled,
    extensionMinutes: auction.extensionMinutes,
    winnerAlias: auction.winner?.alias ?? null,
    winningBid: auction.winningBid,
    minNextBid: minNextBid(auction, hasBids),
    isTopBidder: Boolean(topBid && topBid.userId === user.id),
    hasUserBid: auction.bids.some((b) => b.userId === user.id),
    bids: auction.bids.map((b) => ({
      alias: b.user.alias,
      amount: b.amount,
      createdAt: b.createdAt.toISOString(),
      isMine: b.userId === user.id,
    })),
  });
}
