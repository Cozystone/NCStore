import { LedgerClient } from "@/components/ledger-client";
import { getSource } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function MyLedgerBackupPage() {
  const members = await getSource().listMembers();
  return <LedgerClient members={members} />;
}
