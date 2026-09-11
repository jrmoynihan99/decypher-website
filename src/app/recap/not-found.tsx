export default function RecapNotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6">
      <div className="max-w-[420px] text-center">
        <div className="font-mono text-[11px] uppercase tracking-[2.5px] text-magenta">
          DeCypher Financials
        </div>
        <h1 className="mt-4 font-display text-[28px] font-bold leading-tight text-fog">
          This recap link isn&rsquo;t active.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-mist">
          It may have been replaced with a newer one. Ask your accountant for the
          current link.
        </p>
      </div>
    </main>
  );
}
