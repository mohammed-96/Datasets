import IncrementPicker from "./IncrementPicker";

function toLocalInputValue(date?: Date | string) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AuctionForm({
  action,
  items,
  defaultValues,
  lockItem,
  error,
}: {
  action: string;
  items: { id: string; title: string }[];
  defaultValues?: {
    itemId?: string;
    openingPrice?: number;
    bidIncrement?: number;
    startAt?: Date;
    endAt?: Date;
    softCloseEnabled?: boolean;
    extensionMinutes?: number;
  };
  lockItem?: boolean;
  error?: string;
}) {
  return (
    <form
      action={action}
      method="POST"
      className="max-w-xl space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">القطعة *</label>
        {lockItem && <input type="hidden" name="itemId" value={defaultValues?.itemId} />}
        <select
          name={lockItem ? undefined : "itemId"}
          required
          disabled={lockItem}
          defaultValue={defaultValues?.itemId}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
        >
          <option value="">اختر القطعة</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">سعر الافتتاح (ريال) *</label>
        <input
          name="openingPrice"
          type="number"
          step="1"
          min="1"
          required
          defaultValue={defaultValues?.openingPrice}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">قيمة الزيادة *</label>
        <IncrementPicker defaultValue={defaultValues?.bidIncrement} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">بداية المزاد *</label>
          <input
            name="startAt"
            type="datetime-local"
            required
            defaultValue={toLocalInputValue(defaultValues?.startAt)}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">نهاية المزاد *</label>
          <input
            name="endAt"
            type="datetime-local"
            required
            defaultValue={toLocalInputValue(defaultValues?.endAt)}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-neutral-200 p-3">
        <div>
          <p className="font-bold text-neutral-700">تمديد المزاد التلقائي (Soft Close)</p>
          <p className="text-xs text-neutral-400">يمنع الفوز بمزايدة في آخر لحظة</p>
        </div>
        <input
          name="softCloseEnabled"
          type="checkbox"
          defaultChecked={defaultValues?.softCloseEnabled ?? true}
          className="h-5 w-5"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">مدة التمديد (دقائق)</label>
        <input
          name="extensionMinutes"
          type="number"
          min="1"
          defaultValue={defaultValues?.extensionMinutes ?? 2}
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
