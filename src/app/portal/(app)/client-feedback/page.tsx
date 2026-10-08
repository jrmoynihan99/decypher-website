import { requirePermission } from "@/lib/firebase/session";
import { getSettings, listResponses, listTasks } from "@/lib/feedback/store";
import { Eyebrow } from "@/components/estimator/fields";
import ClientFeedback from "@/components/portal/feedback/ClientFeedback";

export const metadata = { title: "Client Feedback — DeCypher Portal" };

/**
 * Read on the server for first paint, then the tab takes over: edits save
 * through /api/portal/feedback/*, and Refresh re-pulls from the same place.
 * The survey itself is public, at /feedback; this is where its answers land.
 */
export default async function ClientFeedbackPage() {
  await requirePermission("client-feedback");
  const [responses, tasks, settings] = await Promise.all([listResponses(), listTasks(), getSettings()]);

  return (
    <>
      <Eyebrow>Inbox</Eyebrow>
      <h1 className="mt-4 font-display text-3xl font-semibold text-fog">Client Feedback</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        What clients say about onboarding, bookkeeping and tax, scored per team. Fill in who worked with each client and the
        scorecard follows; every unhappy answer opens a follow-up for that team. Survey links go out from TaxDome and the
        tax recap.
      </p>

      <div className="mt-7">
        <ClientFeedback initialResponses={responses} initialTasks={tasks} initialSettings={settings} />
      </div>
    </>
  );
}
