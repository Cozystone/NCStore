import { fail, ok } from "@/lib/api";
import { purchaseSchema } from "@/lib/schemas";
import { getSource, StockError } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = purchaseSchema.safeParse(body);
  if (!parsed.success) return fail("구매 입력값이 올바르지 않습니다.");
  try {
    const result = await getSource().createPurchase(parsed.data);
    return ok(result);
  } catch (reason) {
    if (reason instanceof StockError) {
      return ok({ error: reason.message, shortages: reason.shortages }, { status: 409 });
    }
    return fail(reason instanceof Error ? reason.message : "구매 저장에 실패했습니다.", 500);
  }
}
