const CATEGORIES = [
  { value: "", label: "بدون تصنيف" },
  { value: "GOLD", label: "ذهب" },
  { value: "DIAMOND", label: "ألماس" },
  { value: "WATCHES", label: "ساعات" },
  { value: "JEWELRY", label: "مجوهرات" },
  { value: "COLLECTIBLES", label: "مقتنيات" },
  { value: "OTHER", label: "أخرى" },
];

export default function ItemForm({
  action,
  defaultValues,
  error,
}: {
  action: string;
  defaultValues?: {
    title?: string;
    description?: string | null;
    weightGrams?: number | null;
    karat?: string | null;
    condition?: string | null;
    notes?: string | null;
    internalCode?: string | null;
    category?: string | null;
  };
  error?: string;
}) {
  return (
    <form
      action={action}
      method="POST"
      encType="multipart/form-data"
      className="max-w-xl space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">اسم القطعة *</label>
        <input
          name="title"
          required
          defaultValue={defaultValues?.title}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">الوصف</label>
        <textarea
          name="description"
          defaultValue={defaultValues?.description ?? ""}
          rows={3}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">الوزن (جرام)</label>
          <input
            name="weightGrams"
            type="number"
            step="0.01"
            defaultValue={defaultValues?.weightGrams ?? ""}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">العيار</label>
          <input
            name="karat"
            defaultValue={defaultValues?.karat ?? ""}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">الحالة</label>
          <input
            name="condition"
            defaultValue={defaultValues?.condition ?? ""}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">التصنيف</label>
          <select
            name="category"
            defaultValue={defaultValues?.category ?? ""}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">رقم داخلي للقطعة</label>
        <input
          name="internalCode"
          defaultValue={defaultValues?.internalCode ?? ""}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">ملاحظات</label>
        <textarea
          name="notes"
          defaultValue={defaultValues?.notes ?? ""}
          rows={2}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">إضافة صور</label>
        <input
          name="images"
          type="file"
          accept="image/*"
          multiple
          className="w-full rounded-xl border border-neutral-300 px-3 py-2"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        className="w-full rounded-xl bg-amber-700 px-4 py-3 font-bold text-white"
      >
        حفظ
      </button>
    </form>
  );
}
