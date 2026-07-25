import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";

const NAV = [
  { href: "/admin", label: "لوحة التحكم" },
  { href: "/admin/items", label: "القطع" },
  { href: "/admin/auctions", label: "المزادات" },
  { href: "/admin/users", label: "المستخدمون" },
  { href: "/admin/results", label: "النتائج" },
  { href: "/admin/audit-log", label: "سجل العمليات" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="text-lg font-extrabold text-neutral-900">
            لوحة إدارة المزاد العائلي
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-neutral-500">
              عرض الموقع
            </Link>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-bold text-neutral-700">
              {admin.alias}
            </span>
            <form action={logoutAction}>
              <button className="text-sm text-neutral-500 hover:text-red-600" type="submit">
                خروج
              </button>
            </form>
          </div>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold text-neutral-600 hover:bg-neutral-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
