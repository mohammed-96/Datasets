import "server-only";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "./prisma";
import { syncManyAuctionStatuses } from "./auctionSync";
import { minNextBid } from "./bidding";
import type { AuctionCard } from "./queries";

const select = {
  id: true,
  itemId: true,
  openingPrice: true,
  currentPrice: true,
  bidIncrement: true,
  startAt: true,
  endAt: true,
  status: true,
  winningBid: true,
  item: { select: { title: true, images: { orderBy: { sortOrder: "asc" as const }, take: 1 } } },
  winner: { select: { alias: true } },
  bids: {
    where: { status: "ACTIVE" as const },
    orderBy: { amount: "desc" as const },
    take: 1,
    select: { userId: true },
  },
} as const;

type AuctionWithRelations = Prisma.AuctionGetPayload<{ select: typeof select }>;

function toCard(a: AuctionWithRelations, userId: string): AuctionCard {
  return {
    id: a.id,
    itemId: a.itemId,
    title: a.item.title,
    imageUrl: a.item.images[0]?.url ?? null,
    openingPrice: a.openingPrice,
    currentPrice: a.currentPrice,
    minNextBid: minNextBid(a, a.bids.length > 0),
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    status: a.status,
    winnerAlias: a.winner?.alias ?? null,
    winningBid: a.winningBid,
    isTopBidder: Boolean(a.bids[0] && a.bids[0].userId === userId),
    isFavorited: false,
  };
}

export async function getMyBidsData(userId: string) {
  const auctionIds = (
    await prisma.bid.findMany({
      where: { userId, status: "ACTIVE" },
      select: { auctionId: true },
      distinct: ["auctionId"],
    })
  ).map((b) => b.auctionId);

  await syncManyAuctionStatuses(auctionIds);

  const auctions = await prisma.auction.findMany({
    where: { id: { in: auctionIds } },
    orderBy: { endAt: "desc" },
    select,
  });

  const cards = auctions.map((a) => toCard(a, userId));

  return {
    leading: cards.filter((c) => c.status === "LIVE" && c.isTopBidder),
    outbid: cards.filter((c) => c.status === "LIVE" && !c.isTopBidder),
    won: cards.filter((c) => c.status === "ENDED" && c.isTopBidder),
    lost: cards.filter((c) => c.status === "ENDED" && !c.isTopBidder),
  };
}
