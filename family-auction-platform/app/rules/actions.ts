"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export async function acceptRulesAction(formData: FormData) {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { acceptedRulesAt: new Date() },
  });
  await writeAudit({
    actorUserId: user.id,
    action: "rules_accepted",
    entityType: "User",
    entityId: user.id,
  });
  const next = formData.get("next");
  const dest = typeof next === "string" && next.startsWith("/") ? next : "/";
  redirect(dest);
}
