import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ItemForm from "@/components/ItemForm";
import { deleteItemImageAction } from "../actions";

export default async function EditItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const item = await prisma.item.findUnique({
    where: { id },
    include: { images: { orderBy: { sortOrder: "asc" } }, auctions: { orderBy: { createdAt: "desc" } } },
  });
  if (!item) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-neutral-900">تعديل قطعة: {item.title}</h1>
        <Link
          href={`/admin/auctions/new?itemId=${item.id}`}
          className="rounded-xl border border-amber-700 px-4 py-2 text-sm font-bold text-amber-700"
        >
          + إنشاء مزاد لهذه القطعة
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-bold text-neutral-700">الصور الحالية</h2>
          {item.images.length === 0 ? (
            <p className="mb-4 text-sm text-neutral-400">لا توجد صور بعد</p>
          ) : (
            <div className="mb-4 grid grid-cols-3 gap-2">
              {item.images.map((img) => (
                <div key={img.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt=""
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                  <form action={deleteItemImageAction.bind(null, img.id)}>
                    <button
                      type="submit"
                      className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                    >
                      ×
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {item.auctions.length > 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
              <h3 className="mb-2 font-bold text-neutral-700">المزادات المرتبطة</h3>
              <ul className="space-y-1">
                {item.auctions.map((a) => (
                  <li key={a.id}>
                    <Link href={`/admin/auctions/${a.id}`} className="text-amber-700 hover:underline">
                      {a.status} — {a.currentPrice} ريال
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <ItemForm
          action={`/api/admin/items/${item.id}`}
          error={error}
          defaultValues={{
            title: item.title,
            description: item.description,
            weightGrams: item.weightGrams,
            karat: item.karat,
            condition: item.condition,
            notes: item.notes,
            internalCode: item.internalCode,
            category: item.category,
          }}
        />
      </div>
    </div>
  );
}
