import Link from "next/link";
import LoginForm from "@/components/portal/LoginForm";

/** Reading `next` here on the server (rather than useSearchParams in the form)
 *  keeps the client component out of a Suspense boundary. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Only ever bounce to a path on this site — an absolute URL here would turn
  // the login screen into an open redirect.
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/portal";

  return (
    <main className="relative flex min-h-svh items-center justify-center px-5 py-16">
      {/* The portal has no nav of its own, so this is the only way out of a
          login screen someone landed on by accident. */}
      <Link
        href="/"
        className="absolute left-5 top-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[1px] text-mist transition-colors duration-150 hover:border-mist hover:text-fog"
      >
        <span aria-hidden>←</span> Back to site
      </Link>

      <LoginForm next={safeNext} />
    </main>
  );
}
