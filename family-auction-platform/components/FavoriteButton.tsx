"use client";

import { useState } from "react";

export default function FavoriteButton({
  itemId,
  initialFavorited,
}: {
  itemId: string;
  initialFavorited: boolean;
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    setPending(true);
    setFavorited((f) => !f);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (res.ok) {
        const json = await res.json();
        setFavorited(json.favorited);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-label="حفظ في المفضلة"
      className={`flex h-10 w-10 items-center justify-center rounded-full border text-xl transition ${
        favorited ? "border-red-300 bg-red-50 text-red-600" : "border-neutral-200 text-neutral-400"
      }`}
    >
      {favorited ? "♥" : "♡"}
    </button>
  );
}
