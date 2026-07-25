import { prisma } from "@/lib/prisma";
import AuctionForm from "@/components/AuctionForm";

export default async function NewAuctionPage({
  searchParams,
}: {
  searchParams: Promise<{ itemId?: string; error?: string }>;
}) {
  const { itemId, error } = await searchParams;
  const items = await prisma.item.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-neutral-900">إنشاء مزاد جديد</h1>
      <AuctionForm
        action="/api/admin/auctions"
        items={items}
        error={error}
        defaultValues={itemId ? { itemId } : undefined}
        lockItem={Boolean(itemId)}
      />
    </div>
  );
}
