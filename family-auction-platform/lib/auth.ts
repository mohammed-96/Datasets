import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { SESSION_COOKIE_NAME } from "./authConstants";
import type { User } from "@/app/generated/prisma/client";

const secretValue = process.env.SESSION_SECRET;
if (!secretValue && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET must be set in production");
}
const encodedKey = new TextEncoder().encode(secretValue || "dev-only-insecure-secret-change-me");

const SESSION_DURATION_DAYS = 30;

type SessionPayload = {
  userId: string;
  sessionVersion: number;
};

export async function createSession(userId: string, sessionVersion: number) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ userId, sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(encodedKey);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || typeof payload.sessionVersion !== "number") {
      return null;
    }
    return { userId: payload.userId, sessionVersion: payload.sessionVersion };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || user.status !== "ACTIVE") return null;
  // A PIN change bumps sessionVersion, which invalidates every token minted before it.
  if (user.sessionVersion !== payload.sessionVersion) return null;

  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
