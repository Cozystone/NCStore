import { AppShell, Card, Header } from "@/components/ui";
import { won } from "@/lib/utils";
import type { Rankings } from "@/lib/types";

type Props = {
  rankings: Rankings;
};

function medal(rank: number) {
  if (rank === 1) return "1";
  if (rank === 2) return "2";
  if (rank === 3) return "3";
  return String(rank);
}

export function RankingBoard({ rankings }: Props) {
  const topBuyer = rankings.buyers[0];
  const maxBuyerAmount = Math.max(1, ...rankings.buyers.map((entry) => entry.totalAmount));
  const maxProductAmount = Math.max(1, ...rankings.products.map((entry) => entry.totalAmount));

  return (
    <AppShell>
      <Header
        eyebrow="Snack Ranking"
        title="구매 랭킹"
        description="취소된 구매는 제외하고, 사람별 총 구매액과 인기 상품을 보기 좋게 보여줍니다."
      />

      {topBuyer ? (
        <section className="card-dark mb-4 p-5 text-center">
          <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Top Buyer</div>
          <div className="mt-3 text-4xl font-black tracking-[-0.04em]">{topBuyer.name}</div>
          <div className="mt-2 text-sm font-semibold text-zinc-300">
            총 {won(topBuyer.totalAmount)}원 · {topBuyer.purchaseCount}회 구매
          </div>
          {topBuyer.favoriteItem ? (
            <div className="mx-auto mt-4 max-w-sm border border-white/15 bg-white/10 px-4 py-3 text-sm font-black">
              최애 간식: {topBuyer.favoriteItem}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
        <Card className="text-center">
          <div className="brand-gradient mx-auto mb-3 h-1.5 w-16" />
          <h2 className="text-xl font-black text-zinc-950">사람별 구매 랭킹</h2>
          <div className="mt-4 space-y-3">
            {rankings.buyers.map((entry) => (
              <div className="border border-zinc-200 bg-white p-3" key={entry.buyerKey}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3 text-left">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-zinc-950 text-sm font-black text-white">
                      {medal(entry.rank)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-lg font-black text-zinc-950">{entry.name}</div>
                      <div className="text-xs font-bold text-zinc-400">
                        {entry.buyerType === "external" ? "외부인" : "NCS 멤버"} · {entry.purchaseCount}회
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-black text-zinc-950">{won(entry.totalAmount)}원</div>
                    <div className="text-xs font-semibold text-zinc-500">
                      {entry.favoriteItem ? `최애 ${entry.favoriteItem}` : "기록 누적 중"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-2 bg-zinc-100">
                  <div
                    className="h-full bg-zinc-950"
                    style={{ width: `${Math.max(8, (entry.totalAmount / maxBuyerAmount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {!rankings.buyers.length ? (
              <div className="border border-dashed border-zinc-300 p-8 text-sm font-semibold text-zinc-500">
                아직 구매 기록이 없습니다.
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="text-center">
          <div className="brand-gradient mx-auto mb-3 h-1.5 w-16" />
          <h2 className="text-xl font-black text-zinc-950">인기 상품</h2>
          <div className="mt-4 space-y-3">
            {rankings.products.map((entry) => (
              <div className="border border-zinc-200 bg-zinc-50 p-3 text-left" key={entry.productName}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">No. {entry.rank}</div>
                    <div className="mt-1 font-black text-zinc-950">{entry.productName}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-zinc-950">{entry.quantity}개</div>
                    <div className="text-xs font-bold text-zinc-500">{won(entry.totalAmount)}원</div>
                  </div>
                </div>
                <div className="mt-3 h-2 bg-white">
                  <div
                    className="h-full bg-cyan-500"
                    style={{ width: `${Math.max(8, (entry.totalAmount / maxProductAmount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {!rankings.products.length ? (
              <div className="border border-dashed border-zinc-300 p-8 text-sm font-semibold text-zinc-500">
                인기 상품 데이터가 아직 없습니다.
              </div>
            ) : null}
          </div>
        </Card>
      </section>
    </AppShell>
  );
}
