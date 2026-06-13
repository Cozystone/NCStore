import { fail, ok } from "@/lib/api";
import { readAdminSession } from "@/lib/auth";
import { productSchema } from "@/lib/schemas";
import { getSource } from "@/lib/store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await readAdminSession();
  if (!session) return fail("관리자 인증이 필요합니다.", 401);
  const body = await request.json();
  const parsed = productSchema.partial().safeParse(body);
  if (!parsed.success) return fail("상품 수정값이 올바르지 않습니다.");
  const { id } = await context.params;
  const product = await getSource().updateProduct(id, parsed.data);
  if (!product) return fail("상품을 찾지 못했습니다.", 404);
  return ok(product);
}
