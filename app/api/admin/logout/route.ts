import { ok } from "@/lib/api";
import { adminCookieName } from "@/lib/auth";

export async function POST() {
  const response = ok({ ok: true });
  response.cookies.set(adminCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
