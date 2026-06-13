import { SuggestionsClient } from "@/components/suggestions-client";
import { getSource } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SuggestionsPage() {
  const members = await getSource().listMembers();
  return <SuggestionsClient members={members} />;
}
