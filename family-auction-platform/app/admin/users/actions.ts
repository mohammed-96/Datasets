"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export async function toggleUserStatusAction(userId: string) {
  const admin = await requireAdmin();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const newStatus = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
  await prisma.user.update({
    where: { id: userId },
    data: { status: newStatus, sessionVersion: { increment: 1 } },
  });

  await writeAudit({
    actorUserId: admin.id,
    action: newStatus === "ACTIVE" ? "user_enabled" : "user_disabled",
    entityType: "User",
    entityId: userId,
  });

  revalidatePath("/admin/users");
}
