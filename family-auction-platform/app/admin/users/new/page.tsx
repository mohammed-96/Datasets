import UserForm from "@/components/UserForm";

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-neutral-900">إضافة مستخدم</h1>
      <UserForm action="/api/admin/users" error={error} />
    </div>
  );
}
