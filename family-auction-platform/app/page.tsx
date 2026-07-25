import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/queries";
import SiteHeader from "@/components/SiteHeader";
import DashboardTabs from "@/components/DashboardTabs";

export default async function HomePage() {
  const user = await requireUser();
  const data = await getDashboardData(user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader alias={user.alias} isAdmin={user.role === "ADMIN"} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="mb-1 text-xl font-extrabold text-neutral-900">مرحبًا، {user.alias}</h1>
        <p className="mb-4 text-sm text-neutral-500">تصفح القطع وتابع مزايداتك</p>
        <DashboardTabs data={data} />
      </main>
    </div>
  );
}
