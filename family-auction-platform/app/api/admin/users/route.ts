import { NextRequest, NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { writeAudit } from "@/lib/audit";
import { userSchema } from "@/lib/validation";

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
  const parsed = userSchema.safeParse({
    realName: formData.get("realName"),
    phone: formData.get("phone"),
    alias: formData.get("alias"),
    pin: formData.get("pin"),
  });
  if (!parsed.success) {
    return fail(req, "/admin/users/new", parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
  }
  if (!parsed.data.pin || parsed.data.pin.length < 4) {
    return fail(req, "/admin/users/new", "الرقم السري يجب ألا يقل عن 4 أرقام");
  }

  const existingPhone = await prisma.user.findUnique({ where: { phone: parsed.data.phone } });
  if (existingPhone) return fail(req, "/admin/users/new", "رقم الجوال مستخدم بالفعل");

  const existingAlias = await prisma.user.findUnique({ where: { alias: parsed.data.alias } });
  if (existingAlias) return fail(req, "/admin/users/new", "المعرف المستعار مستخدم بالفعل");

  const user = await prisma.user.create({
    data: {
      realName: parsed.data.realName,
      phone: parsed.data.phone,
      alias: parsed.data.alias,
      passwordHash: await hashPassword(parsed.data.pin),
      role: "BIDDER",
      status: "ACTIVE",
    },
  });

  await writeAudit({
    actorUserId: admin.id,
    action: "user_created",
    entityType: "User",
    entityId: user.id,
    details: { alias: user.alias },
  });

  return NextResponse.redirect(new URL("/admin/users", req.url), 303);
}
