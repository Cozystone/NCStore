import { fail, ok } from "@/lib/api";
import { adminCookieName, adminSessionMaxAgeSeconds, createAdminSessionToken } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { adminLoginSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = adminLoginSchema.safeParse(body);
  if (!parsed.success) return fail("비밀번호를 입력해 주세요.");
  if (parsed.data.password !== getEnv().adminPassword) return fail("비밀번호가 맞지 않습니다.", 401);

  const response = ok({ ok: true });
  response.cookies.set(adminCookieName(), createAdminSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: adminSessionMaxAgeSeconds(),
  });
  return response;
}
