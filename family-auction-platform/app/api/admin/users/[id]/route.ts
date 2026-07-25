import { NextRequest, NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { writeAudit } from "@/lib/audit";

function fail(req: NextRequest, path: string, message: string) {
  const url = new URL(path, req.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminForApi(req);
  if ("response" in auth) return auth.response;
  const { admin } = auth;

  const { id: userId } = await ctx.params;
  const editPath = `/admin/users/${userId}`;

  const formData = await req.formData();
  const realName = String(formData.get("realName") || "").trim();
  const alias = String(formData.get("alias") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const pin = String(formData.get("pin") || "").trim();

  if (!realName || !alias || !phone) {
    return fail(req, editPath, "جميع الحقول الأساسية مطلوبة");
  }

  const conflictPhone = await prisma.user.findFirst({ where: { phone, NOT: { id: userId } } });
  if (conflictPhone) return fail(req, editPath, "رقم الجوال مستخدم من قبل مستخدم آخر");

  const conflictAlias = await prisma.user.findFirst({ where: { alias, NOT: { id: userId } } });
  if (conflictAlias) return fail(req, editPath, "المعرف المستعار مستخدم من قبل مستخدم آخر");

  const data: Record<string, unknown> = { realName, alias, phone };

  if (pin) {
    if (pin.length < 4) return fail(req, editPath, "الرقم السري يجب ألا يقل عن 4 أرقام");
    data.passwordHash = await hashPassword(pin);
    data.sessionVersion = { increment: 1 };
  }

  await prisma.user.update({ where: { id: userId }, data });

  await writeAudit({
    actorUserId: admin.id,
    action: pin ? "user_updated_pin_reset" : "user_updated",
    entityType: "User",
    entityId: userId,
  });

  return NextResponse.redirect(new URL("/admin/users", req.url), 303);
}
