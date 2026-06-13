import { fail, ok } from "@/lib/api";
import { readAdminSession } from "@/lib/auth";
import { getSource } from "@/lib/store";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readAdminSession();
  if (!session) return fail("관리자 인증이 필요합니다.", 401);
  const { id } = await context.params;
  const purchase = await getSource().cancelPurchase(id, "백준서");
  if (!purchase) return fail("구매 기록을 찾지 못했습니다.", 404);
  return ok(purchase);
}
