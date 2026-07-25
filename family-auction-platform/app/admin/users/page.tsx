import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toggleUserStatusAction } from "./actions";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({ orderBy: [{ role: "asc" }, { alias: "asc" }] });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-neutral-900">المستخدمون</h1>
        <Link href="/admin/users/new" className="rounded-xl bg-amber-700 px-4 py-2 font-bold text-white">
          + إضافة مستخدم
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="p-3 text-right font-medium">المعرف المستعار</th>
              <th className="p-3 text-right font-medium">الاسم الحقيقي</th>
              <th className="p-3 text-right font-medium">الجوال</th>
              <th className="p-3 text-right font-medium">الدور</th>
              <th className="p-3 text-right font-medium">الحالة</th>
              <th className="p-3 text-right font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-neutral-100">
                <td className="p-3 font-bold">{u.alias}</td>
                <td className="p-3">{u.realName}</td>
                <td className="p-3" dir="ltr">
                  {u.phone}
                </td>
                <td className="p-3">{u.role === "ADMIN" ? "مدير" : "مزايد"}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${
                      u.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {u.status === "ACTIVE" ? "مفعل" : "معطل"}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/users/${u.id}`} className="text-amber-700 hover:underline">
                      تعديل
                    </Link>
                    {u.role !== "ADMIN" && (
                      <form action={toggleUserStatusAction.bind(null, u.id)}>
                        <button type="submit" className="text-neutral-500 hover:text-red-600">
                          {u.status === "ACTIVE" ? "تعطيل" : "تفعيل"}
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
