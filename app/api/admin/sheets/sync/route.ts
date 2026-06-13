import { fail, ok } from "@/lib/api";
import { readAdminSession } from "@/lib/auth";
import { getSource } from "@/lib/store";

export async function POST() {
  const session = await readAdminSession();
  if (!session) return fail("관리자 인증이 필요합니다.", 401);

  const source = getSource();
  const result = await source.retrySyncQueue();
  const snapshot = await source.refreshSheetsState();
  return ok({ ...result, ...snapshot });
}
