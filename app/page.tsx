import { KioskClient } from "@/components/kiosk-client";
import { getSource } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const source = getSource();
  const [members, products] = await Promise.all([source.listMembers(), source.listProducts(true)]);
  return <KioskClient members={members} products={products} />;
}
