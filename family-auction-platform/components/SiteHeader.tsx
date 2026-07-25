import Link from "next/link";
import { logoutAction } from "@/app/login/actions";

export default function SiteHeader({
  alias,
  isAdmin,
}: {
  alias: string;
  isAdmin: boolean;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-extrabold text-neutral-900">
          المزاد العائلي
        </Link>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link href="/admin" className="text-sm font-bold text-amber-700">
              لوحة الإدارة
            </Link>
          )}
          <Link href="/my-bids" className="text-sm text-neutral-600">
            مزايداتي
          </Link>
          <Link href="/favorites" className="text-sm text-neutral-600">
            المفضلة
          </Link>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-bold text-neutral-700">
            {alias}
          </span>
          <form action={logoutAction}>
            <button className="text-sm text-neutral-500 hover:text-red-600" type="submit">
              خروج
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
