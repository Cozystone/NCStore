import { fail, ok } from "@/lib/api";
import { readAdminSession } from "@/lib/auth";
import { productSchema } from "@/lib/schemas";
import { getSource } from "@/lib/store";

export async function POST(request: Request) {
  const session = await readAdminSession();
  if (!session) return fail("관리자 인증이 필요합니다.", 401);
  const body = await request.json();
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) return fail("상품 입력값이 올바르지 않습니다.");
  const product = await getSource().createProduct(parsed.data);
  return ok(product, { status: 201 });
}
