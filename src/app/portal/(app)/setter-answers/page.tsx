import { requirePermission } from "@/lib/firebase/session";
import { activeStaffNames } from "@/lib/firebase/users";
import { listCalls } from "@/lib/discovery/store";
import { Eyebrow } from "@/components/estimator/fields";
import SetterAnswers from "@/components/portal/setter-answers/SetterAnswers";

export const metadata = { title: "Setter Answers — DeCypher Portal" };

/**
 * Read on the server for first paint, then the tab takes over: edits save
 * through /api/portal/setter-answers/*, and Refresh re-pulls from the same
 * place. The call itself runs from Tax Strategy → Sales Discovery; this is
 * where its answers land.
 */
export default async function SetterAnswersPage() {
  const session = await requirePermission("setter-answers");
  const me = session.displayName.trim() || session.email;
  const [calls, advisors] = await Promise.all([
    listCalls(),
    activeStaffNames(me).catch((e) => {
      console.error("[setter-answers] couldn't list staff names:", e);
      return [me];
    }),
  ]);

  return (
    <>
      <Eyebrow>Inbox</Eyebrow>
      <h1 className="mt-4 font-display text-3xl font-semibold text-fog">Setter Answers</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Every discovery call as the creator answered it: how they found us, their entity and payroll, banking, last year’s
        taxes and this year’s income. What they said is locked; fill in the fit, the next step and the notes beside it. Calls
        run from Tax Strategy → Sales Discovery.
      </p>

      <div className="mt-7">
        <SetterAnswers
          initialCalls={calls}
          initialAdvisors={advisors}
          isAdmin={session.role === "admin"}
          canRunCalls={session.permissions.includes("tax-strategy")}
        />
      </div>
    </>
  );
}
