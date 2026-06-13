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
  return readSignedPayload<AdminSession>(store.get(ADMIN_COOKIE)?.value, getEnv().sessionSecret);
}

export async function readMemberSession() {
  const store = await cookies();
  return readSignedPayload<MemberSession>(store.get(MEMBER_COOKIE)?.value, getEnv().sessionSecret);
}

export function adminCookieName() {
  return ADMIN_COOKIE;
}

export function memberCookieName() {
  return MEMBER_COOKIE;
}
