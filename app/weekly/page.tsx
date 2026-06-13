import { AppShell, Card, Header } from "@/components/ui";
import { getSource } from "@/lib/store";
import { formatDateTime, paymentStatusLabel, won } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WeeklyStatsPage() {
  const summary = await getSource().getDashboardSummary();
  const latestPurchaseTime = summary.recentPurchases[0] ? Date.parse(summary.recentPurchases[0].timestamp) : 0;
  const weekStart = latestPurchaseTime - 7 * 24 * 60 * 60 * 1000;
  const weeklyPurchases = summary.recentPurchases.filter(
    (purchase) => Date.parse(purchase.timestamp) >= weekStart,
  );
  const weeklyTotal = weeklyPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);

  return (
    <AppShell>
      <Header
        eyebrow="Weekly Stats"
        title="주간통계"
        description="최근 기록 기준으로 이번 주 매점 흐름을 빠르게 확인합니다."
      />

      <section className="grid gap-3 text-center sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-sm font-semibold text-slate-500">오늘 매출</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{won(summary.todayTotal)}</div>
        </Card>
        <Card>
          <div className="text-sm font-semibold text-slate-500">주간 기록</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{weeklyPurchases.length}건</div>
        </Card>
        <Card>
          <div className="text-sm font-semibold text-slate-500">주간 합계</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{won(weeklyTotal)}</div>
        </Card>
        <Card>
          <div className="text-sm font-semibold text-slate-500">미납 추정</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{won(summary.unpaidEstimate)}</div>
        </Card>
      </section>

      <section className="mt-4 grid gap-3 text-center sm:grid-cols-3">
        <Card>
          <div className="text-sm font-semibold text-slate-500">현금 대기</div>
          <div className="mt-1 text-2xl font-black text-slate-950">{summary.cashPendingCount}건</div>
          <div className="mt-1 text-sm font-bold text-slate-500">{won(summary.cashPendingAmount)}</div>
        </Card>
        <Card>
          <div className="text-sm font-semibold text-slate-500">계좌이체 대기</div>
          <div className="mt-1 text-2xl font-black text-slate-950">{summary.transferPendingCount}건</div>
          <div className="mt-1 text-sm font-bold text-slate-500">{won(summary.transferPendingAmount)}</div>
        </Card>
        <Card>
          <div className="text-sm font-semibold text-slate-500">동기화 대기</div>
          <div className="mt-1 text-2xl font-black text-slate-950">{summary.queuedSyncCount}건</div>
          <div className="mt-1 text-sm font-bold text-slate-500">Sheets 상태</div>
        </Card>
      </section>

      <Card className="mt-4">
        <h2 className="text-center text-xl font-black text-slate-950">최근 구매 기록</h2>
        <div className="mt-4 divide-y divide-slate-100 text-center">
          {summary.recentPurchases.slice(0, 10).map((purchase) => (
            <div className="grid gap-1 py-3 sm:grid-cols-[120px_1fr_120px_140px] sm:items-center" key={purchase.purchaseId}>
              <div className="text-sm font-semibold text-slate-500">{formatDateTime(purchase.timestamp)}</div>
              <div className="font-black text-slate-950">{purchase.nameSnapshot}</div>
              <div className="text-sm font-bold text-slate-600">{won(purchase.totalAmount)}</div>
              <div className="text-sm font-bold text-slate-500">{paymentStatusLabel(purchase.paymentStatus)}</div>
            </div>
          ))}
          {!summary.recentPurchases.length ? (
            <div className="py-8 text-sm font-semibold text-slate-500">아직 구매 기록이 없습니다.</div>
          ) : null}
        </div>
      </Card>
    </AppShell>
  );
}
