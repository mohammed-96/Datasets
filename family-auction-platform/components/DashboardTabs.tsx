"use client";

import { useState } from "react";
import type { AuctionCard as AuctionCardData } from "@/lib/queries";
import AuctionCard from "./AuctionCard";

type TabKey = "live" | "upcoming" | "ended" | "mine" | "won";

const TABS: { key: TabKey; label: string }[] = [
  { key: "live", label: "قائمة الآن" },
  { key: "upcoming", label: "القادمة" },
  { key: "ended", label: "المنتهية" },
  { key: "mine", label: "مزايداتي" },
  { key: "won", label: "فزت بها" },
];

export default function DashboardTabs({
  data,
}: {
  data: Record<TabKey, AuctionCardData[]>;
}) {
  const [active, setActive] = useState<TabKey>("live");
  const items = data[active];

  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
              active === tab.key
                ? "bg-amber-700 text-white"
                : "bg-white text-neutral-600 border border-neutral-200"
            }`}
          >
            {tab.label}
            <span className="mr-1 text-xs opacity-70">({data[tab.key].length})</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="mt-10 text-center text-neutral-400">لا توجد قطع في هذا القسم حاليًا</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((a) => (
            <AuctionCard key={a.id} auction={a} />
          ))}
        </div>
      )}
    </div>
  );
}
