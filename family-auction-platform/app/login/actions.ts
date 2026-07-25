"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/auth";
import { checkLoginRateLimit, recordLoginFailure, clearLoginAttempts } from "@/lib/rateLimit";
import { loginSchema } from "@/lib/validation";

export type LoginState = { error?: string };

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    phone: formData.get("phone"),
    pin: formData.get("pin"),
  });
  if (!parsed.success) {
    return { error: "الرجاء إدخال رقم الجوال والرقم السري بشكل صحيح" };
  }
  const { phone, pin } = parsed.data;

  const rate = checkLoginRateLimit(phone);
  if (!rate.allowed) {
    const minutes = Math.ceil((rate.retryAfterMs ?? 0) / 60000);
    return { error: `عدد محاولات كبير، الرجاء المحاولة بعد ${minutes} دقيقة` };
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.status !== "ACTIVE") {
    recordLoginFailure(phone);
    return { error: "رقم الجوال أو الرقم السري غير صحيح" };
  }

  const valid = await verifyPassword(pin, user.passwordHash);
  if (!valid) {
    recordLoginFailure(phone);
    return { error: "رقم الجوال أو الرقم السري غير صحيح" };
  }

  clearLoginAttempts(phone);
  await createSession(user.id, user.sessionVersion);

  redirect(user.role === "ADMIN" ? "/admin" : "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
