import { NextRequest, NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { saveUploadedImage } from "@/lib/upload";
import { itemSchema } from "@/lib/validation";

const CATEGORY_VALUES = ["GOLD", "DIAMOND", "WATCHES", "JEWELRY", "COLLECTIBLES", "OTHER"] as const;

function parseCategory(value: FormDataEntryValue | null) {
  const str = String(value || "");
  return (CATEGORY_VALUES as readonly string[]).includes(str)
    ? (str as (typeof CATEGORY_VALUES)[number])
    : null;
}

function fail(req: NextRequest, path: string, message: string) {
  const url = new URL(path, req.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminForApi(req);
  if ("response" in auth) return auth.response;
  const { admin } = auth;

  const formData = await req.formData();

  const parsed = itemSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    weightGrams: formData.get("weightGrams") || undefined,
    karat: formData.get("karat") || undefined,
    condition: formData.get("condition") || undefined,
    notes: formData.get("notes") || undefined,
    internalCode: formData.get("internalCode") || undefined,
    category: parseCategory(formData.get("category")),
  });

  if (!parsed.success) {
    return fail(req, "/admin/items/new", parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
  }

  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const imageUrls = await Promise.all(files.map(saveUploadedImage));

  const item = await prisma.item.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      weightGrams: parsed.data.weightGrams ?? null,
      karat: parsed.data.karat || null,
      condition: parsed.data.condition || null,
      notes: parsed.data.notes || null,
      internalCode: parsed.data.internalCode || null,
      category: parsed.data.category ?? null,
      createdById: admin.id,
      images: { create: imageUrls.map((url, idx) => ({ url, sortOrder: idx })) },
    },
  });

  await writeAudit({
    actorUserId: admin.id,
    action: "item_created",
    entityType: "Item",
    entityId: item.id,
    details: { title: item.title },
  });

  return NextResponse.redirect(new URL("/admin/items", req.url), 303);
}
