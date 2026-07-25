import "server-only";
import { prisma } from "./prisma";

export async function writeAudit(params: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | string | null;
}) {
  await prisma.auditLog.create({
    data: {
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      details:
        params.details == null
          ? null
          : typeof params.details === "string"
            ? params.details
            : JSON.stringify(params.details),
    },
  });
}
