import { fail, ok } from "@/lib/api";
import { readMemberSession } from "@/lib/auth";
import { getSource } from "@/lib/store";

export async function GET(request: Request) {
  const session = await readMemberSession();
  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("memberId");
  if (!session || session.role !== "member" || session.memberId !== memberId) {
    return fail("본인 확인이 필요합니다.", 401);
  }
  const ledger = await getSource().getMemberLedger(memberId);
  return ok(ledger);
}
