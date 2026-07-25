import "server-only";
import { prisma } from "./prisma";
import { syncManyAuctionStatuses } from "./auctionSync";
import { minNextBid } from "./bidding";

const auctionListSelect = {
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

export type AuctionCard = {
  id: string;
  itemId: string;
  title: string;
  imageUrl: string | null;
  openingPrice: number;
  currentPrice: number;
  minNextBid: number;
  startAt: string;
  endAt: string;
  status: string;
  winnerAlias: string | null;
  winningBid: number | null;
  isTopBidder: boolean;
  isFavorited: boolean;
};

function toCard(
  auction: {
    id: string;
    itemId: string;
    openingPrice: number;
    currentPrice: number;
    bidIncrement: number;
    startAt: Date;
    endAt: Date;
    status: string;
    winningBid: number | null;
    item: { title: string; images: { url: string }[] };
    winner: { alias: string } | null;
    bids: { userId: string }[];
  },
  userId: string,
  favoritedItemIds: Set<string>
): AuctionCard {
  return {
    id: auction.id,
    itemId: auction.itemId,
    title: auction.item.title,
    imageUrl: auction.item.images[0]?.url ?? null,
    openingPrice: auction.openingPrice,
    currentPrice: auction.currentPrice,
    minNextBid: minNextBid(auction, auction.bids.length > 0),
    startAt: auction.startAt.toISOString(),
    endAt: auction.endAt.toISOString(),
    status: auction.status,
    winnerAlias: auction.winner?.alias ?? null,
    winningBid: auction.winningBid,
    isTopBidder: Boolean(auction.bids[0] && auction.bids[0].userId === userId),
    isFavorited: favoritedItemIds.has(auction.itemId),
  };
}

async function getFavoriteItemIds(userId: string): Promise<Set<string>> {
  const favs = await prisma.favorite.findMany({ where: { userId }, select: { itemId: true } });
  return new Set(favs.map((f) => f.itemId));
}

export async function getDashboardData(userId: string) {
  const candidateIds = (
    await prisma.auction.findMany({
      where: { status: { in: ["UPCOMING", "LIVE"] } },
      select: { id: true },
    })
  ).map((a) => a.id);
  await syncManyAuctionStatuses(candidateIds);

  const favoritedItemIds = await getFavoriteItemIds(userId);

  const [live, upcoming, ended, myBidAuctionIds, won] = await Promise.all([
    prisma.auction.findMany({
      where: { status: "LIVE" },
      orderBy: { endAt: "asc" },
      select: auctionListSelect,
    }),
    prisma.auction.findMany({
      where: { status: "UPCOMING" },
      orderBy: { startAt: "asc" },
      select: auctionListSelect,
    }),
    prisma.auction.findMany({
      where: { status: "ENDED" },
      orderBy: { endAt: "desc" },
      take: 30,
      select: auctionListSelect,
    }),
    prisma.bid.findMany({
      where: { userId, status: "ACTIVE" },
      select: { auctionId: true },
      distinct: ["auctionId"],
    }),
    prisma.auction.findMany({
      where: { status: "ENDED", winnerUserId: userId },
      orderBy: { endAt: "desc" },
      select: auctionListSelect,
    }),
  ]);

  const myAuctionIds = new Set(myBidAuctionIds.map((b) => b.auctionId));
  const mine = await prisma.auction.findMany({
    where: { id: { in: Array.from(myAuctionIds) } },
    orderBy: { endAt: "desc" },
    select: auctionListSelect,
  });

  return {
    live: live.map((a) => toCard(a, userId, favoritedItemIds)),
    upcoming: upcoming.map((a) => toCard(a, userId, favoritedItemIds)),
    ended: ended.map((a) => toCard(a, userId, favoritedItemIds)),
    mine: mine.map((a) => toCard(a, userId, favoritedItemIds)),
    won: won.map((a) => toCard(a, userId, favoritedItemIds)),
  };
}

export async function getFavoritesData(userId: string) {
  const favs = await prisma.favorite.findMany({
    where: { userId },
    select: { itemId: true },
  });
  const itemIds = favs.map((f) => f.itemId);
  if (itemIds.length === 0) return [];

  const auctions = await prisma.auction.findMany({
    where: { itemId: { in: itemIds } },
    orderBy: { createdAt: "desc" },
    select: auctionListSelect,
  });

  await syncManyAuctionStatuses(auctions.map((a) => a.id));
  const favoritedItemIds = new Set(itemIds);
  return auctions.map((a) => toCard(a, userId, favoritedItemIds));
}
