import { requireUser } from "@/lib/auth";
import { getMyBidsData } from "@/lib/myBids";
import SiteHeader from "@/components/SiteHeader";
import AuctionCard from "@/components/AuctionCard";
import type { AuctionCard as AuctionCardData } from "@/lib/queries";

function Section({ title, items }: { title: string; items: AuctionCardData[] }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-extrabold text-neutral-900">
        {title} <span className="text-sm font-normal text-neutral-400">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400">لا توجد قطع في هذا القسم</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((a) => (
            <AuctionCard key={a.id} auction={a} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function MyBidsPage() {
  const user = await requireUser();
  const data = await getMyBidsData(user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader alias={user.alias} isAdmin={user.role === "ADMIN"} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="mb-6 text-xl font-extrabold text-neutral-900">مزايداتي</h1>
        <Section title="أعلى مزايد حاليًا" items={data.leading} />
        <Section title="تم تجاوز مزايدتي" items={data.outbid} />
        <Section title="فزت بها" items={data.won} />
        <Section title="لم أفز" items={data.lost} />
      </main>
    </div>
  );
}
