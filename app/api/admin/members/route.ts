import { fail, ok } from "@/lib/api";
import { readAdminSession } from "@/lib/auth";
import { memberSchema } from "@/lib/schemas";
import { getSource } from "@/lib/store";

export async function POST(request: Request) {
  const session = await readAdminSession();
  if (!session) return fail("관리자 인증이 필요합니다.", 401);
  const body = await request.json();
  const parsed = memberSchema.safeParse(body);
  if (!parsed.success) return fail("멤버 입력값이 올바르지 않습니다.");
  const member = await getSource().createMember(parsed.data);
  return ok(member, { status: 201 });
}
