import { fail, ok } from "@/lib/api";
import { readAdminSession } from "@/lib/auth";
import { purchaseStatusSchema } from "@/lib/schemas";
import { getSource } from "@/lib/store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readAdminSession();
  if (!session) return fail("관리자 인증이 필요합니다.", 401);
  const body = await request.json();
  const parsed = purchaseStatusSchema.safeParse(body);
  if (!parsed.success) return fail("상태값이 올바르지 않습니다.");
  const { id } = await context.params;
  const purchase = await getSource().updatePurchaseStatus(id, parsed.data.paymentStatus, "백준서");
  if (!purchase) return fail("구매 기록을 찾지 못했습니다.", 404);
  return ok(purchase);
}
