import { getSource } from "@/lib/store";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const products = await getSource().listProducts(true, { forceRefresh: true });
  return ok(products, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
