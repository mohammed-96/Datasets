"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";

export default function Countdown({
  target,
  endedLabel = "انتهى",
}: {
  target: string;
  endedLabel?: string;
}) {
  const [remaining, setRemaining] = useState(() => new Date(target).getTime() - Date.now());

  useEffect(() => {
    const targetMs = new Date(target).getTime();
    const tick = () => setRemaining(targetMs - Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [target]);

  if (remaining <= 0) {
    return <span>{endedLabel}</span>;
  }

  return <span dir="ltr">{formatDuration(remaining)}</span>;
}
