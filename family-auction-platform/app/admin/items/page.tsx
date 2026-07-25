import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminItemsPage() {
  const items = await prisma.item.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      auctions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-neutral-900">القطع</h1>
        <Link href="/admin/items/new" className="rounded-xl bg-amber-700 px-4 py-2 font-bold text-white">
          + إضافة قطعة
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/admin/items/${item.id}`}
            className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
          >
            <div className="aspect-square w-full bg-neutral-100">
              {item.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.images[0].url} alt={item.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-neutral-400">
                  لا توجد صورة
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="truncate font-bold text-neutral-900">{item.title}</p>
              <p className="text-xs text-neutral-400">{item.internalCode ?? "—"}</p>
              <p className="mt-1 text-xs font-bold text-amber-700">
                {item.auctions[0] ? item.auctions[0].status : "لا يوجد مزاد"}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {items.length === 0 && <p className="text-center text-neutral-400">لا توجد قطع بعد</p>}
    </div>
  );
}
