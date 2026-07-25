import ItemForm from "@/components/ItemForm";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-neutral-900">إضافة قطعة جديدة</h1>
      <ItemForm action="/api/admin/items" error={error} />
    </div>
  );
}
