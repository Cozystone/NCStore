import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api";
import { createMemberSessionToken, memberCookieName } from "@/lib/auth";
import { pinSchema } from "@/lib/schemas";
import { getSource } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = pinSchema.safeParse(body);
  if (!parsed.success) return fail("PIN 형식이 올바르지 않습니다.");

  const result = await getSource().verifyMemberPin(parsed.data.memberId, parsed.data.pin);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.reason === "not_found" ? 404 : 401 });
  }

  const response = ok(result);
  if (parsed.data.purpose === "ledger") {
    response.cookies.set(memberCookieName(), createMemberSessionToken(parsed.data.memberId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });
  }
  return response;
}
