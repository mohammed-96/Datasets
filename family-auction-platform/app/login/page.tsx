import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-extrabold text-neutral-900">المزاد العائلي</h1>
          <p className="mt-2 text-sm text-neutral-500">منصة خاصة لإدارة مزادات العائلة</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-neutral-400">
          الحسابات تُنشأ مسبقًا بواسطة مدير المزاد فقط
        </p>
      </div>
    </main>
  );
}
