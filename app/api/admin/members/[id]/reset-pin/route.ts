import { fail, ok } from "@/lib/api";
import { readAdminSession } from "@/lib/auth";
import { resetPinSchema } from "@/lib/schemas";
import { getSource } from "@/lib/store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readAdminSession();
  if (!session) return fail("관리자 인증이 필요합니다.", 401);
  const body = await request.json();
  const parsed = resetPinSchema.safeParse(body);
  if (!parsed.success) return fail("PIN 형식이 올바르지 않습니다.");
  const { id } = await context.params;
  const member = await getSource().resetMemberPin(id, parsed.data.pin);
  if (!member) return fail("멤버를 찾지 못했습니다.", 404);
  return ok(member);
}
