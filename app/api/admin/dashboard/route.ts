import { fail, okNoStore, shouldForceRefresh } from "@/lib/api";
import { readAdminSession } from "@/lib/auth";
import { getSource } from "@/lib/store";

export async function GET(request: Request) {
  const session = await readAdminSession();
  if (!session) return fail("관리자 인증이 필요합니다.", 401);

  const source = getSource();
  if (shouldForceRefresh(request)) {
    await source.refreshSheetsState();
  }

  const [summary, members, products] = await Promise.all([
    source.getDashboardSummary(),
    source.listMembers(),
    source.listProducts(false),
  ]);

  return okNoStore({ ...summary, members, products });
}
