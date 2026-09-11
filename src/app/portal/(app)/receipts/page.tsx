import { redirect } from "next/navigation";

/**
 * The Receipt Analyzer placeholder lived here until the Tax Recap tool took
 * over its sidebar slot and permission key. Kept as a redirect so an old
 * bookmark still lands somewhere useful.
 */
export default function ReceiptsPage() {
  redirect("/portal/tax-recap");
}
