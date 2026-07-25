import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncAuctionStatus } from "@/lib/auctionSync";
import { minNextBid } from "@/lib/bidding";
import ImageGallery from "@/components/ImageGallery";
import AuctionBidPanel from "@/components/AuctionBidPanel";
import FavoriteButton from "@/components/FavoriteButton";
import SiteHeader from "@/components/SiteHeader";
import type { AuctionDetail } from "@/lib/types";

const categoryLabel: Record<string, string> = {
  GOLD: "ذهب",
  DIAMOND: "ألماس",
  WATCHES: "ساعات",
  JEWELRY: "مجوهرات",
  COLLECTIBLES: "مقتنيات",
  OTHER: "أخرى",
};

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  await syncAuctionStatus(id);

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      item: { include: { images: { orderBy: { sortOrder: "asc" } } } },
      winner: { select: { alias: true } },
      bids: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { alias: true } } },
        take: 100,
      },
    },
  });

  if (!auction) notFound();

  const favorite = await prisma.favorite.findUnique({
    where: { userId_itemId: { userId: user.id, itemId: auction.itemId } },
  });

  const topBid = auction.bids[0];
  const hasBids = auction.bids.length > 0;

  const detail: AuctionDetail = {
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
  };

  const fields: { label: string; value: string | null | undefined }[] = [
    { label: "الوصف", value: auction.item.description },
    { label: "الوزن", value: auction.item.weightGrams ? `${auction.item.weightGrams} جرام` : null },
    { label: "العيار", value: auction.item.karat },
    { label: "الحالة", value: auction.item.condition },
    { label: "التصنيف", value: auction.item.category ? categoryLabel[auction.item.category] : null },
    { label: "ملاحظات", value: auction.item.notes },
  ].filter((f) => f.value);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader alias={user.alias} isAdmin={user.role === "ADMIN"} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Link href="/" className="mb-4 inline-block text-sm text-neutral-500">
          ← رجوع
        </Link>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-start justify-between gap-3">
              <h1 className="text-2xl font-extrabold text-neutral-900">{auction.item.title}</h1>
              <FavoriteButton itemId={auction.itemId} initialFavorited={Boolean(favorite)} />
            </div>
            <ImageGallery
              images={auction.item.images.map((img) => img.url)}
              alt={auction.item.title}
            />

            {fields.length > 0 && (
              <dl className="mt-4 space-y-2 rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
                {fields.map((f) => (
                  <div key={f.label} className="flex justify-between gap-4">
                    <dt className="shrink-0 font-bold text-neutral-500">{f.label}</dt>
                    <dd className="text-left text-neutral-800">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div>
            <AuctionBidPanel
              auctionId={auction.id}
              itemTitle={auction.item.title}
              initialData={detail}
              acceptedRules={Boolean(user.acceptedRulesAt)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
