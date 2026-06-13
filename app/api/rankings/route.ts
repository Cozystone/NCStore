import { okNoStore, shouldForceRefresh } from "@/lib/api";
import { getSource } from "@/lib/store";

export async function GET(request: Request) {
  const source = getSource();
  if (shouldForceRefresh(request)) {
    await source.refreshSheetsState();
  }

  const rankings = await source.getRankings();
  return okNoStore(rankings);
}
