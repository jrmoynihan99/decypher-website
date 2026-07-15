import { requireAdmin } from "@/lib/firebase/session";
import { listStaff } from "@/lib/firebase/users";
import { Eyebrow } from "@/components/estimator/fields";
import StaffManager from "@/components/portal/StaffManager";

export default async function StaffPage() {
  const session = await requireAdmin();
  const staff = await listStaff();

  return (
    <>
      <Eyebrow>Admin</Eyebrow>
      <h1 className="mt-4 font-display text-3xl font-semibold text-fog">Staff</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Accounts are created here and nowhere else. New staff get a one-time link
        to set their own password — you never see it.
      </p>

      <StaffManager initialStaff={staff} currentUid={session.uid} />
    </>
  );
}
