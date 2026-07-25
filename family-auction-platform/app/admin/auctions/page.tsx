import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { syncManyAuctionStatuses } from "@/lib/auctionSync";
import { formatCurrency, formatDateTime } from "@/lib/format";

const statusLabel: Record<string, string> = {
  DRAFT: "مسودة",
  UPCOMING: "قادم",
  LIVE: "قائم",
  ENDED: "منتهي",
  CANCELLED: "ملغي",
  SUSPENDED: "معلّق",
};

const statusColor: Record<string, string> = {
  DRAFT: "bg-neutral-100 text-neutral-500",
  UPCOMING: "bg-blue-100 text-blue-800",
  LIVE: "bg-emerald-100 text-emerald-800",
  ENDED: "bg-neutral-200 text-neutral-700",
  CANCELLED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-amber-100 text-amber-800",
};

export default async function AdminAuctionsPage() {
  const all = await prisma.auction.findMany({ select: { id: true, status: true } });
  await syncManyAuctionStatuses(
    all.filter((a) => a.status === "UPCOMING" || a.status === "LIVE").map((a) => a.id)
  );

  const auctions = await prisma.auction.findMany({
    orderBy: { createdAt: "desc" },
    include: { item: { select: { title: true } } },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-neutral-900">المزادات</h1>
        <Link href="/admin/auctions/new" className="rounded-xl bg-amber-700 px-4 py-2 font-bold text-white">
          + إنشاء مزاد
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="p-3 text-right font-medium">القطعة</th>
              <th className="p-3 text-right font-medium">الحالة</th>
              <th className="p-3 text-right font-medium">السعر الحالي</th>
              <th className="p-3 text-right font-medium">البداية</th>
              <th className="p-3 text-right font-medium">النهاية</th>
              <th className="p-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {auctions.map((a) => (
              <tr key={a.id} className="border-t border-neutral-100">
                <td className="p-3 font-bold">{a.item.title}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusColor[a.status]}`}>
                    {statusLabel[a.status]}
                  </span>
                </td>
                <td className="p-3">{formatCurrency(a.currentPrice)}</td>
                <td className="p-3 text-xs">{formatDateTime(a.startAt)}</td>
                <td className="p-3 text-xs">{formatDateTime(a.endAt)}</td>
                <td className="p-3">
                  <Link href={`/admin/auctions/${a.id}`} className="text-amber-700 hover:underline">
                    إدارة
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {auctions.length === 0 && <p className="mt-6 text-center text-neutral-400">لا توجد مزادات بعد</p>}
    </div>
  );
}
