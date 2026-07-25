"use client";

import { useState } from "react";

const PRESETS = [50, 100, 500, 1000];

export default function IncrementPicker({ defaultValue }: { defaultValue?: number }) {
  const [choice, setChoice] = useState<string>(
    defaultValue && PRESETS.includes(defaultValue) ? String(defaultValue) : "custom"
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setChoice(String(v))}
            className={`rounded-full px-3 py-1 text-sm font-bold ${
              choice === String(v) ? "bg-amber-700 text-white" : "border border-neutral-300 text-neutral-600"
            }`}
          >
            {v}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setChoice("custom")}
          className={`rounded-full px-3 py-1 text-sm font-bold ${
            choice === "custom" ? "bg-amber-700 text-white" : "border border-neutral-300 text-neutral-600"
          }`}
        >
          قيمة مخصصة
        </button>
      </div>
      <input
        key={choice}
        name="bidIncrement"
        type="number"
        step="1"
        min="1"
        required
        defaultValue={choice === "custom" ? (PRESETS.includes(defaultValue ?? -1) ? "" : defaultValue) : choice}
        readOnly={choice !== "custom"}
        className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2 read-only:bg-neutral-100"
      />
    </div>
  );
}
