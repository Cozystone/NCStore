import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { readSignedPayload, signPayload } from "@/lib/security";

type AdminSession = {
  role: "admin";
  issuedAt: string;
};

type MemberSession = {
  role: "member";
  memberId: string;
  issuedAt: string;
};

const ADMIN_COOKIE = "ncstore-admin-session";
const MEMBER_COOKIE = "ncstore-member-session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 5 * 60;

export function createAdminSessionToken() {
  return signPayload(
    {
      role: "admin",
      issuedAt: new Date().toISOString(),
    } satisfies AdminSession,
    getEnv().sessionSecret,
  );
}

export function createMemberSessionToken(memberId: string) {
  return signPayload(
    {
      role: "member",
      memberId,
      issuedAt: new Date().toISOString(),
    } satisfies MemberSession,
    getEnv().sessionSecret,
  );
}

export async function readAdminSession() {
  const store = await cookies();
  const session = readSignedPayload<AdminSession>(store.get(ADMIN_COOKIE)?.value, getEnv().sessionSecret);
  if (!session) return null;

  const issuedAt = new Date(session.issuedAt).getTime();
  const ageMs = Date.now() - issuedAt;
  if (!Number.isFinite(issuedAt) || ageMs < 0 || ageMs > ADMIN_SESSION_MAX_AGE_SECONDS * 1000) {
    return null;
  }

  return session;
}

export async function readMemberSession() {
  const store = await cookies();
  return readSignedPayload<MemberSession>(store.get(MEMBER_COOKIE)?.value, getEnv().sessionSecret);
}

export function adminCookieName() {
  return ADMIN_COOKIE;
}

export function adminSessionMaxAgeSeconds() {
  return ADMIN_SESSION_MAX_AGE_SECONDS;
}

export function memberCookieName() {
  return MEMBER_COOKIE;
}
