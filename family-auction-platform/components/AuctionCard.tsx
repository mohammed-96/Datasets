import Link from "next/link";
import type { AuctionCard as AuctionCardData } from "@/lib/queries";
import { formatCurrency } from "@/lib/format";
import Countdown from "./Countdown";

const statusLabel: Record<string, string> = {
  LIVE: "قائم الآن",
  UPCOMING: "قادم",
  ENDED: "منتهي",
  CANCELLED: "ملغي",
  SUSPENDED: "معلّق",
  DRAFT: "مسودة",
};

const statusColor: Record<string, string> = {
  LIVE: "bg-emerald-100 text-emerald-800",
  UPCOMING: "bg-blue-100 text-blue-800",
  ENDED: "bg-neutral-200 text-neutral-700",
  CANCELLED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-amber-100 text-amber-800",
  DRAFT: "bg-neutral-100 text-neutral-500",
};

export default function AuctionCard({ auction }: { auction: AuctionCardData }) {
  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="block overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-square w-full bg-neutral-100">
        {auction.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={auction.imageUrl}
            alt={auction.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-400">
            لا توجد صورة
          </div>
        )}
        <span
          className={`absolute right-2 top-2 rounded-full px-2 py-1 text-xs font-bold ${statusColor[auction.status] ?? "bg-neutral-100"}`}
        >
          {statusLabel[auction.status] ?? auction.status}
        </span>
      </div>
      <div className="p-3">
        <h3 className="truncate font-bold text-neutral-900">{auction.title}</h3>

        {auction.status === "ENDED" ? (
          <>
            <p className="mt-1 text-xs text-neutral-500">السعر النهائي</p>
            <p className="text-lg font-extrabold text-neutral-900">
              {formatCurrency(auction.winningBid ?? auction.currentPrice)}
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-neutral-500">السعر الحالي</p>
            <p className="text-lg font-extrabold text-neutral-900">
              {formatCurrency(auction.currentPrice)}
            </p>
          </>
        )}

        {auction.status === "LIVE" && (
          <p className="mt-1 text-sm font-semibold text-amber-700">
            ⏱ <Countdown target={auction.endAt} />
          </p>
        )}
        {auction.status === "UPCOMING" && (
          <p className="mt-1 text-sm font-semibold text-blue-700">
            يبدأ خلال <Countdown target={auction.startAt} />
          </p>
        )}

        {auction.status === "LIVE" && auction.isTopBidder && (
          <p className="mt-1 text-xs font-bold text-emerald-700">أنت أعلى مزايد حاليًا</p>
        )}
      </div>
    </Link>
  );
}
