import { fail, ok } from "@/lib/api";
import { readAdminSession } from "@/lib/auth";
import { sendOverdueMessage } from "@/lib/message-provider";
import { getSource } from "@/lib/store";
import type { PaymentStatus } from "@/lib/types";

const OVERDUE_MESSAGE_MIN_AGE_MS = 2 * 24 * 60 * 60 * 1000;
const NOTIFIABLE_STATUSES = new Set<PaymentStatus>([
  "cash_pending",
  "transfer_pending",
  "unpaid",
]);

export async function POST(request: Request) {
  const session = await readAdminSession();
  if (!session) return fail("관리자 인증이 필요합니다.", 401);

  const body = (await request.json()) as {
    force?: boolean;
    memberId?: string;
    phoneNumber?: string;
    purchaseId?: string;
  };

  if (!body.purchaseId) {
    return fail("purchaseId가 필요합니다.");
  }

  const source = getSource();
  const [member, dashboard, ledger] = await Promise.all([
    body.memberId ? source.getMember(body.memberId) : Promise.resolve(null),
    source.getDashboardSummary(),
    body.memberId ? source.getMemberLedger(body.memberId) : Promise.resolve({ purchases: [], pendingAmount: 0 }),
  ]);

  const purchase =
    dashboard.recentPurchases.find((item) => item.purchaseId === body.purchaseId) ||
    ledger.purchases.find((item) => item.purchaseId === body.purchaseId);
  if (!purchase) return fail("구매 대상을 찾지 못했습니다.", 404);
  if (purchase.buyerType === "member" && !member) return fail("멤버를 찾지 못했습니다.", 404);
  if (!NOTIFIABLE_STATUSES.has(purchase.paymentStatus)) {
    return fail("이미 완료되었거나 취소된 구매 건은 미납문자를 보낼 수 없습니다.");
  }

  const elapsedMs = Date.now() - Date.parse(purchase.timestamp);
  if (!body.force && elapsedMs < OVERDUE_MESSAGE_MIN_AGE_MS) {
    return fail("구매 후 2일 이상 지난 미납 건에만 문자를 보낼 수 있습니다.");
  }

  const phoneNumber = body.phoneNumber?.trim() || member?.phoneNumber?.trim() || purchase.externalBuyerPhone?.trim();
  if (!phoneNumber) {
    return fail("수신번호가 없습니다. 연락처를 먼저 입력해 주세요.");
  }

  const result = await sendOverdueMessage({
    memberName: member?.name ?? purchase.nameSnapshot,
    phoneNumber,
    itemSummary: purchase.itemSummary,
    totalAmount: purchase.totalAmount,
    paymentStatus: purchase.paymentStatus,
  });

  if (member && !member.phoneNumber && body.phoneNumber?.trim()) {
    await source.updateMember(member.memberId, { phoneNumber: body.phoneNumber.trim() });
  }

  return ok({
    ok: true,
    provider: result.provider,
    to: result.to,
  });
}
