import { notFound } from "next/navigation";
import RecapView from "@/components/recap/RecapView";
import { shareFor } from "@/lib/tax-recap/share";
import { getRecapByToken } from "@/lib/tax-recap/store";

/**
 * A revoked recap 404s exactly like a bad token. The two are deliberately
 * indistinguishable from outside — "this link used to work" is information
 * about a client we'd rather not confirm to whoever is holding it.
 */
export default async function RecapPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ open?: string }>;
}) {
  const { token } = await params;
  const { open } = await searchParams;
  const recap = await getRecapByToken(token);
  if (!recap || recap.revoked) notFound();
  // `?open` skips the seal (RecapGate): for checking numbers from the portal,
  // and for anyone printing the page. The client's link never carries it.
  return <RecapView recap={recap} sealed={open === undefined} share={await shareFor(recap)} />;
}
