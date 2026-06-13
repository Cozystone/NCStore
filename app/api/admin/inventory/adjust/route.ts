import { fail, ok } from "@/lib/api";
import { readAdminSession } from "@/lib/auth";
import { inventoryAdjustmentSchema } from "@/lib/schemas";
import { getSource } from "@/lib/store";

export async function POST(request: Request) {
  const session = await readAdminSession();
  if (!session) return fail("관리자 인증이 필요합니다.", 401);
  const body = await request.json();
  const parsed = inventoryAdjustmentSchema.safeParse(body);
  if (!parsed.success) return fail("재고 조정값이 올바르지 않습니다.");
  const adjustment = await getSource().adjustInventory({
    ...parsed.data,
    createdBy: "백준서",
  });
  return ok(adjustment, { status: 201 });
}
