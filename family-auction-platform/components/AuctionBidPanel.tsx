"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { AuctionDetail } from "@/lib/types";
import Countdown from "./Countdown";

export default function AuctionBidPanel({
  auctionId,
  itemTitle,
  initialData,
  acceptedRules,
}: {
  auctionId: string;
  itemTitle: string;
  initialData: AuctionDetail;
  acceptedRules: boolean;
}) {
  const [data, setData] = useState<AuctionDetail>(initialData);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/auctions/${auctionId}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as AuctionDetail;
      if (mounted.current) setData(json);
    } catch {
      // network hiccup; SSE reconnect or the next poll tick will recover
    }
  }, [auctionId]);

  useEffect(() => {
    mounted.current = true;
    const source = new EventSource(`/api/auctions/${auctionId}/stream`);
    source.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data);
        if (event.type === "bid" || event.type === "extended" || event.type === "ended") {
          refetch();
          if (event.type === "extended") {
            setFlash("تم تمديد وقت المزاد بسبب مزايدة قريبة من الإغلاق");
            setTimeout(() => setFlash(null), 5000);
          }
        }
      } catch {
        // ignore malformed frame
      }
    };

    const poll = setInterval(refetch, 20000);
    return () => {
      mounted.current = false;
      source.close();
      clearInterval(poll);
    };
  }, [auctionId, refetch]);

  const submitBid = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/auctions/${auctionId}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: data.minNextBid }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "تعذر تسجيل المزايدة");
      } else {
        setConfirmOpen(false);
        await refetch();
      }
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      {flash && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          {flash}
        </p>
      )}

      {data.status === "LIVE" && (
        <>
          <p className="text-sm text-neutral-500">السعر الحالي</p>
          <p className="text-4xl font-extrabold text-neutral-900">
            {formatCurrency(data.currentPrice)}
          </p>

          {data.isTopBidder ? (
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              أنت أعلى مزايد حاليًا
            </p>
          ) : data.hasUserBid ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              تم تجاوز مزايدتك
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-between text-sm text-neutral-500">
            <span>ينتهي بعد</span>
            <span className="font-bold text-neutral-800">
              <Countdown target={data.endAt} />
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            ينتهي: {formatDateTime(new Date(data.endAt))}
          </p>

          {!acceptedRules ? (
            <Link
              href={`/rules?next=/auctions/${auctionId}`}
              className="mt-4 block w-full rounded-xl bg-neutral-800 px-4 py-3 text-center text-lg font-bold text-white"
            >
              الرجاء الموافقة على قواعد المزاد للمشاركة
            </Link>
          ) : data.isTopBidder ? (
            <button
              disabled
              className="mt-4 w-full rounded-xl bg-neutral-200 px-4 py-3 text-lg font-bold text-neutral-500"
            >
              أنت أعلى مزايد حاليًا
            </button>
          ) : (
            <button
              onClick={() => {
                setError(null);
                setConfirmOpen(true);
              }}
              className="mt-4 w-full rounded-xl bg-amber-700 px-4 py-3 text-lg font-bold text-white transition hover:bg-amber-800"
            >
              زايد بـ {formatCurrency(data.minNextBid)}
            </button>
          )}
        </>
      )}

      {data.status === "UPCOMING" && (
        <>
          <p className="text-sm text-neutral-500">سعر الافتتاح</p>
          <p className="text-3xl font-extrabold text-neutral-900">
            {formatCurrency(data.openingPrice)}
          </p>
          <p className="mt-4 text-sm text-neutral-500">
            يبدأ المزاد بعد <Countdown target={data.startAt} />
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            البداية: {formatDateTime(new Date(data.startAt))}
          </p>
        </>
      )}

      {data.status === "ENDED" && (
        <>
          {data.winnerAlias ? (
            data.isTopBidder ? (
              <div className="rounded-xl bg-emerald-50 p-4 text-center">
                <p className="text-lg font-extrabold text-emerald-800">
                  🎉 مبروك! رسا عليك المزاد
                </p>
                <p className="mt-2 text-sm text-emerald-700">{itemTitle}</p>
                <p className="mt-2 text-2xl font-extrabold text-emerald-900">
                  {formatCurrency(data.winningBid ?? data.currentPrice)}
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-neutral-100 p-4 text-center">
                <p className="text-lg font-bold text-neutral-700">انتهى المزاد</p>
                <p className="mt-1 text-sm text-neutral-500">السعر النهائي</p>
                <p className="text-2xl font-extrabold text-neutral-900">
                  {formatCurrency(data.winningBid ?? data.currentPrice)}
                </p>
                {data.hasUserBid && (
                  <p className="mt-2 text-sm text-red-600">لم ترسُ عليك هذه القطعة</p>
                )}
              </div>
            )
          ) : (
            <div className="rounded-xl bg-neutral-100 p-4 text-center">
              <p className="text-lg font-bold text-neutral-700">انتهى المزاد بدون فائز</p>
              <p className="mt-1 text-sm text-neutral-500">لم يشارك أحد بالمزايدة</p>
            </div>
          )}
        </>
      )}

      {(data.status === "CANCELLED" || data.status === "SUSPENDED") && (
        <div className="rounded-xl bg-amber-50 p-4 text-center">
          <p className="text-lg font-bold text-amber-800">
            {data.status === "SUSPENDED" ? "تم تعليق المزاد بواسطة مدير المزاد" : "تم إلغاء المزاد"}
          </p>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl">
            <h3 className="text-lg font-extrabold text-neutral-900">تأكيد المزايدة</h3>
            <p className="mt-2 text-sm text-neutral-600">أنت على وشك المزايدة بمبلغ:</p>
            <p className="mt-1 text-2xl font-extrabold text-amber-700">
              {formatCurrency(data.minNextBid)}
            </p>
            <p className="mt-1 text-sm text-neutral-600">على: {itemTitle}</p>

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="flex-1 rounded-xl border border-neutral-300 px-4 py-3 font-bold text-neutral-700"
              >
                إلغاء
              </button>
              <button
                onClick={submitBid}
                disabled={pending}
                className="flex-1 rounded-xl bg-amber-700 px-4 py-3 font-bold text-white disabled:opacity-60"
              >
                {pending ? "جاري التأكيد..." : "تأكيد المزايدة"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-neutral-100 pt-4">
        <h4 className="mb-2 text-sm font-bold text-neutral-700">سجل المزايدات</h4>
        {data.bids.length === 0 ? (
          <p className="text-sm text-neutral-400">لا توجد مزايدات بعد</p>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-neutral-100">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="p-2 text-right font-medium">المزايد</th>
                  <th className="p-2 text-right font-medium">المبلغ</th>
                  <th className="p-2 text-right font-medium">الوقت</th>
                </tr>
              </thead>
              <tbody>
                {data.bids.map((b, i) => (
                  <tr
                    key={i}
                    className={`border-t border-neutral-100 ${b.isMine ? "bg-amber-50" : ""}`}
                  >
                    <td className="p-2 font-bold">{b.alias}</td>
                    <td className="p-2">{formatCurrency(b.amount)}</td>
                    <td className="p-2 text-neutral-500" dir="ltr">
                      {new Date(b.createdAt).toLocaleTimeString("ar-SA", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
