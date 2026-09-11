import { notFound } from "next/navigation";
import RecapView from "@/components/recap/RecapView";
import { getRecapByToken } from "@/lib/tax-recap/store";

/**
 * A revoked recap 404s exactly like a bad token. The two are deliberately
 * indistinguishable from outside — "this link used to work" is information
 * about a client we'd rather not confirm to whoever is holding it.
 */
export default async function RecapPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const recap = await getRecapByToken(token);
  if (!recap || recap.revoked) notFound();
  return <RecapView recap={recap} />;
}
