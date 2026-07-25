import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 50;

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [total, logs] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { alias: true, realName: true } } },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-neutral-900">سجل العمليات (Audit Log)</h1>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="p-3 text-right font-medium">الوقت</th>
              <th className="p-3 text-right font-medium">العملية</th>
              <th className="p-3 text-right font-medium">نوع الكائن</th>
              <th className="p-3 text-right font-medium">المعرف</th>
              <th className="p-3 text-right font-medium">المنفذ</th>
              <th className="p-3 text-right font-medium">تفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-neutral-100 align-top">
                <td className="p-3 whitespace-nowrap text-xs">{formatDateTime(log.createdAt)}</td>
                <td className="p-3 font-bold">{log.action}</td>
                <td className="p-3">{log.entityType}</td>
                <td className="p-3 text-xs text-neutral-400">{log.entityId ?? "—"}</td>
                <td className="p-3">
                  {log.actor ? `${log.actor.realName} (${log.actor.alias})` : "النظام"}
                </td>
                <td className="p-3 max-w-xs truncate text-xs text-neutral-500">{log.details ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logs.length === 0 && <p className="mt-6 text-center text-neutral-400">لا توجد عمليات مسجلة</p>}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <Link href={`/admin/audit-log?page=${page - 1}`} className="text-amber-700 hover:underline">
              السابق
            </Link>
          )}
          <span className="text-neutral-500">
            صفحة {page} من {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/admin/audit-log?page=${page + 1}`} className="text-amber-700 hover:underline">
              التالي
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
