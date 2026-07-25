import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime } from "@/lib/format";

export default async function AdminResultsPage() {
  const auctions = await prisma.auction.findMany({
    where: { status: "ENDED" },
    orderBy: { endAt: "desc" },
    include: {
      item: { select: { title: true } },
      winner: { select: { realName: true, alias: true } },
    },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-neutral-900">لوحة النتائج</h1>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="p-3 text-right font-medium">القطعة</th>
              <th className="p-3 text-right font-medium">الفائز</th>
              <th className="p-3 text-right font-medium">المعرف</th>
              <th className="p-3 text-right font-medium">المبلغ</th>
              <th className="p-3 text-right font-medium">تاريخ الإغلاق</th>
              <th className="p-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {auctions.map((a) => (
              <tr key={a.id} className="border-t border-neutral-100">
                <td className="p-3 font-bold">{a.item.title}</td>
                <td className="p-3">{a.winner?.realName ?? "—"}</td>
                <td className="p-3">{a.winner?.alias ?? "—"}</td>
                <td className="p-3">{formatCurrency(a.winningBid ?? 0)}</td>
                <td className="p-3 text-xs">{formatDateTime(a.endAt)}</td>
                <td className="p-3">
                  <Link href={`/admin/auctions/${a.id}`} className="text-amber-700 hover:underline">
                    سجل المزايدات
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {auctions.length === 0 && (
        <p className="mt-6 text-center text-neutral-400">لا توجد نتائج بعد</p>
      )}
    </div>
  );
}
