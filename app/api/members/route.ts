import { getSource } from "@/lib/store";
import { okNoStore, shouldForceRefresh } from "@/lib/api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = getSource();

  if (shouldForceRefresh(request)) {
    await source.refreshSheetsState();
  }

  const members = await source.listMembers({
    type: searchParams.get("type"),
    cohort: searchParams.get("cohort"),
    grade: searchParams.get("grade"),
    q: searchParams.get("q"),
  });

  return okNoStore(members);
}
