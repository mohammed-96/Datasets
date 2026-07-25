import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import type { User } from "@/app/generated/prisma/client";

export async function requireAdminForApi(
  req: NextRequest
): Promise<{ admin: User } | { response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.redirect(new URL("/login", req.url), 303) };
  }
  if (user.role !== "ADMIN") {
    return { response: NextResponse.redirect(new URL("/", req.url), 303) };
  }
  return { admin: user };
}
