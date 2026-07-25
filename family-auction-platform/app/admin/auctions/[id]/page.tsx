import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { syncAuctionStatus } from "@/lib/auctionSync";
import { formatCurrency, formatDateTime } from "@/lib/format";
import AuctionForm from "@/components/AuctionForm";
import {
  publishAuctionAction,
  cancelAuctionAction,
  suspendAuctionAction,
  resumeAuctionAction,
} from "../actions";

const statusLabel: Record<string, string> = {
  DRAFT: "مسودة",
  UPCOMING: "قادم",
  LIVE: "قائم",
  ENDED: "منتهي",
  CANCELLED: "ملغي",
  SUSPENDED: "معلّق",
};

export default async function AdminAuctionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await syncAuctionStatus(id);

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      item: { select: { id: true, title: true } },
      winner: { select: { alias: true, realName: true } },
      bids: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { alias: true, realName: true } } },
      },
    },
  });
  if (!auction) notFound();

  const auditLogs = await prisma.auditLog.findMany({
    where: { entityType: "Auction", entityId: id },
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { alias: true } } },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-neutral-900">
            إدارة مزاد: {auction.item.title}
          </h1>
          <Link href={`/admin/items/${auction.item.id}`} className="text-sm text-amber-700 hover:underline">
            عرض القطعة
          </Link>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-bold text-neutral-700">
          {statusLabel[auction.status]}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {auction.status === "DRAFT" && (
            <form action={publishAuctionAction.bind(null, auction.id)}>
              <button className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white">
                نشر المزاد
              </button>
            </form>
          )}

          {(auction.status === "DRAFT" || auction.status === "UPCOMING") && (
            <AuctionForm
              action={`/api/admin/auctions/${auction.id}`}
              items={[{ id: auction.item.id, title: auction.item.title }]}
              lockItem
              error={error}
              defaultValues={{
                itemId: auction.item.id,
                openingPrice: auction.openingPrice,
                bidIncrement: auction.bidIncrement,
                startAt: auction.startAt,
                endAt: auction.endAt,
                softCloseEnabled: auction.softCloseEnabled,
                extensionMinutes: auction.extensionMinutes,
              }}
            />
          )}

          {auction.status === "LIVE" && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-500">السعر الحالي</p>
              <p className="text-2xl font-extrabold">{formatCurrency(auction.currentPrice)}</p>
              <p className="mt-2 text-sm text-neutral-500">
                ينتهي: {formatDateTime(auction.endAt)}
              </p>
              <form action={suspendAuctionAction.bind(null, auction.id)} className="mt-4 space-y-2">
                <label className="block text-sm font-bold text-neutral-700">
                  تعليق المزاد (عطل تقني)
                </label>
                <textarea
                  name="reason"
                  placeholder="سبب التعليق (اختياري)"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  rows={2}
                />
                <button className="w-full rounded-xl bg-amber-700 px-4 py-2 font-bold text-white">
                  تعليق المزاد
                </button>
              </form>
            </div>
          )}

          {auction.status === "SUSPENDED" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="font-bold text-amber-800">المزاد معلّق</p>
              {auction.suspendedReason && (
                <p className="mt-1 text-sm text-amber-700">السبب: {auction.suspendedReason}</p>
              )}
              <form action={resumeAuctionAction.bind(null, auction.id)} className="mt-4 space-y-2">
                <label className="block text-sm font-bold text-neutral-700">
                  موعد نهاية جديد (اختياري)
                </label>
                <input
                  type="datetime-local"
                  name="newEndAt"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                />
                <button className="w-full rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white">
                  استئناف المزاد
                </button>
              </form>
            </div>
          )}

          {auction.status === "ENDED" && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-500">الفائز</p>
              {auction.winner ? (
                <p className="text-lg font-extrabold">
                  {auction.winner.realName} ({auction.winner.alias})
                </p>
              ) : (
                <p className="text-lg font-bold text-neutral-500">بدون فائز</p>
              )}
              <p className="mt-2 text-sm text-neutral-500">المبلغ النهائي</p>
              <p className="text-2xl font-extrabold">{formatCurrency(auction.winningBid ?? 0)}</p>
            </div>
          )}

          {(auction.status === "UPCOMING" || auction.status === "LIVE" || auction.status === "DRAFT") && (
            <form action={cancelAuctionAction.bind(null, auction.id)}>
              <button className="w-full rounded-xl border border-red-300 px-4 py-2 font-bold text-red-700">
                إلغاء المزاد
              </button>
            </form>
          )}

          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-bold text-neutral-700">سجل عمليات هذا المزاد</h3>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-neutral-400">لا توجد عمليات</p>
            ) : (
              <ul className="space-y-1 text-xs text-neutral-500">
                {auditLogs.map((log) => (
                  <li key={log.id}>
                    {formatDateTime(log.createdAt)} — {log.action}
                    {log.actor ? ` — ${log.actor.alias}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-neutral-700">سجل المزايدات الكامل</h3>
          {auction.bids.length === 0 ? (
            <p className="text-sm text-neutral-400">لا توجد مزايدات بعد</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-neutral-500">
                <tr>
                  <th className="p-2 text-right font-medium">المزايد</th>
                  <th className="p-2 text-right font-medium">الاسم الحقيقي</th>
                  <th className="p-2 text-right font-medium">المبلغ</th>
                  <th className="p-2 text-right font-medium">الوقت</th>
                  <th className="p-2 text-right font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {auction.bids.map((b) => (
                  <tr key={b.id} className="border-t border-neutral-100">
                    <td className="p-2 font-bold">{b.user.alias}</td>
                    <td className="p-2">{b.user.realName}</td>
                    <td className="p-2">{formatCurrency(b.amount)}</td>
                    <td className="p-2 text-xs">{formatDateTime(b.createdAt)}</td>
                    <td className="p-2 text-xs">{b.status === "ACTIVE" ? "فعّالة" : "ملغاة"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
