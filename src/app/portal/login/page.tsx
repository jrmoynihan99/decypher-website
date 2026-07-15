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
    <main className="flex min-h-svh items-center justify-center px-5 py-16">
      <LoginForm next={safeNext} />
    </main>
  );
}
