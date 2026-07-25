import { requireUser } from "@/lib/auth";
import { getFavoritesData } from "@/lib/queries";
import SiteHeader from "@/components/SiteHeader";
import AuctionCard from "@/components/AuctionCard";

export default async function FavoritesPage() {
  const user = await requireUser();
  const items = await getFavoritesData(user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader alias={user.alias} isAdmin={user.role === "ADMIN"} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="mb-4 text-xl font-extrabold text-neutral-900">المفضلة</h1>
        {items.length === 0 ? (
          <p className="mt-10 text-center text-neutral-400">لم تقم بحفظ أي قطعة بعد</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
