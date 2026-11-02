import ConsultButton from "@/components/ui/ConsultButton";

/**
 * The FAQ's call to action. `href` omitted = the site's consultation button
 * (Site Settings → Consultation), so FAQ bookings land wherever every other
 * "book a call" button on the site does.
 */
export default function FaqCta({
  text,
  label,
  href,
}: {
  text: string;
  label: string;
  href?: string;
}) {
  return (
    <aside className="relative my-14 overflow-hidden rounded-[20px] border border-edge bg-panel/70 bg-[radial-gradient(120%_140%_at_50%_0%,rgba(255,45,120,0.10),transparent_60%)] px-6 py-9 text-center sm:px-10">
      <p className="m-0 font-mono text-[11px] uppercase tracking-[0.22em] text-magenta">
        [ next step ]
      </p>
      <p className="mx-auto mb-0 mt-3 max-w-[38ch] font-display text-[clamp(19px,2.4vw,23px)] font-semibold leading-snug tracking-[-0.015em] text-fog [text-wrap:balance]">
        {text}
      </p>
      <div className="mt-7">
        <ConsultButton href={href}>{label}</ConsultButton>
      </div>
    </aside>
  );
}
