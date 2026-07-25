import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import UserForm from "@/components/UserForm";

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();

  return (
    <div>
      <h1 className="mb-2 text-xl font-extrabold text-neutral-900">تعديل مستخدم</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {user.role === "ADMIN" ? "حساب مدير" : "حساب مزايد"} · تاريخ الإنشاء{" "}
        {user.createdAt.toLocaleDateString("ar-SA-u-ca-gregory")}
      </p>
      <UserForm
        action={`/api/admin/users/${user.id}`}
        isEdit
        error={error}
        defaultValues={{ realName: user.realName, phone: user.phone, alias: user.alias }}
      />
    </div>
  );
}
