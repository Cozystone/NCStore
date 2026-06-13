import { RankingBoard } from "@/components/ranking-board";
import { getSource } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const rankings = await getSource().getRankings();
  return <RankingBoard rankings={rankings} />;
}
