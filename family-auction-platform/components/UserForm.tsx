export default function UserForm({
  action,
  defaultValues,
  isEdit,
  error,
}: {
  action: string;
  defaultValues?: { realName?: string; phone?: string; alias?: string };
  isEdit?: boolean;
  error?: string;
}) {
  return (
    <form
      action={action}
      method="POST"
      className="max-w-md space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">الاسم الحقيقي</label>
        <input
          name="realName"
          defaultValue={defaultValues?.realName}
          required
          className="w-full rounded-xl border border-neutral-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">رقم الجوال</label>
        <input
          name="phone"
          defaultValue={defaultValues?.phone}
          required
          dir="ltr"
          className="w-full rounded-xl border border-neutral-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">المعرف المستعار</label>
        <input
          name="alias"
          defaultValue={defaultValues?.alias}
          required
          placeholder="مزايد 07"
          className="w-full rounded-xl border border-neutral-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">
          {isEdit ? "رقم سري جديد (اختياري)" : "الرقم السري"}
        </label>
        <input
          name="pin"
          type="text"
          inputMode="numeric"
          dir="ltr"
          required={!isEdit}
          placeholder={isEdit ? "اتركه فارغًا للإبقاء عليه" : ""}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2"
        />
        {isEdit && (
          <p className="mt-1 text-xs text-neutral-400">
            تغيير الرقم السري سينهي جميع جلسات هذا المستخدم الحالية.
          </p>
        )}
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
