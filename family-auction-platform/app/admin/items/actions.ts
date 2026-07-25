"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export async function deleteItemImageAction(imageId: string) {
  const admin = await requireAdmin();
  const image = await prisma.itemImage.findUniqueOrThrow({ where: { id: imageId } });
  await prisma.itemImage.delete({ where: { id: imageId } });

  await writeAudit({
    actorUserId: admin.id,
    action: "item_image_removed",
    entityType: "Item",
    entityId: image.itemId,
  });

  revalidatePath(`/admin/items/${image.itemId}`);
}
