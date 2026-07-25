import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";

export default async function AdminDashboardPage() {
  const [itemCount, live, upcoming, ended, bidCount, endedAuctions] = await Promise.all([
    prisma.item.count(),
    prisma.auction.count({ where: { status: "LIVE" } }),
    prisma.auction.count({ where: { status: "UPCOMING" } }),
    prisma.auction.count({ where: { status: "ENDED" } }),
    prisma.bid.count({ where: { status: "ACTIVE" } }),
    prisma.auction.findMany({ where: { status: "ENDED" }, select: { winningBid: true } }),
  ]);

  const totalEndedValue = endedAuctions.reduce((sum, a) => sum + (a.winningBid ?? 0), 0);

  const stats = [
    { label: "عدد القطع", value: itemCount, href: "/admin/items" },
    { label: "المزادات الحالية", value: live, href: "/admin/auctions" },
    { label: "المزادات القادمة", value: upcoming, href: "/admin/auctions" },
    { label: "المزادات المنتهية", value: ended, href: "/admin/results" },
    { label: "عدد المزايدات", value: bidCount, href: "/admin/audit-log" },
    { label: "إجمالي المزادات المنتهية", value: formatCurrency(totalEndedValue), href: "/admin/results" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-neutral-900">لوحة التحكم</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md"
          >
            <p className="text-sm text-neutral-500">{s.label}</p>
            <p className="mt-1 text-2xl font-extrabold text-neutral-900">{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/admin/items/new"
          className="rounded-xl bg-amber-700 px-4 py-2 font-bold text-white"
        >
          + إضافة قطعة جديدة
        </Link>
        <Link
          href="/admin/auctions/new"
          className="rounded-xl border border-amber-700 px-4 py-2 font-bold text-amber-700"
        >
          + إنشاء مزاد جديد
        </Link>
        <Link
          href="/admin/users/new"
          className="rounded-xl border border-neutral-300 px-4 py-2 font-bold text-neutral-700"
        >
          + إضافة مستخدم
        </Link>
      </div>
    </div>
  );
}
