import { AdminClient } from "@/components/admin-client";
import { readAdminSession } from "@/lib/auth";
import { getSource } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const source = getSource();
  const session = await readAdminSession();
  const [members, products, dashboard] = await Promise.all([
    source.listMembers(),
    source.listProducts(false),
    session ? source.getDashboardSummary() : Promise.resolve(undefined),
  ]);

  return (
    <AdminClient
      initialDashboard={dashboard}
      initialMembers={members}
      initialProducts={products}
      initiallyAuthed={Boolean(session)}
    />
  );
}
